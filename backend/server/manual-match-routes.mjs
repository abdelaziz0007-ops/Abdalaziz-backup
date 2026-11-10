import {mountGroupedSuggestionRoutes} from './grouped-suggestions.mjs';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {hash} from './financial-core.mjs';
import {insert,bulk} from './financial-routes.mjs';
import {allocationPlan} from './allocation-plan.mjs';
import {lockedReconciliation,requireEditable,evolveReconciliation} from './reconciliation-domain.mjs';
const input=z.object({requestKey:z.uuid(),expectedFingerprint:z.string().regex(/^[0-9a-f]{64}$/),reason:z.string().trim().min(8).max(500),overrideReferenceConflict:z.boolean(),pairs:z.array(z.object({bankTransactionId:z.uuid(),bookTransactionId:z.uuid(),amount:z.string().max(40)}).strict()).min(1).max(100)}).strict();
export function mountManualMatchRoutes(router,{scoped,audit,result,HttpError}){
 mountGroupedSuggestionRoutes(router,{scoped,result,HttpError});
 router.post('/tenants/:tenantId/entities/:entityId/reconciliations/:reconciliationId/manual-matches',async(req,res,next)=>{
  try{const data=input.parse(req.body),{tenantId:t,entityId:e,reconciliationId:r}=req.params;z.uuid().parse(r);result(req,res,await scoped(req,t,e,null,async c=>{
   const rec=await lockedReconciliation(c,req,t,e,r,HttpError),requestHash=hash(JSON.stringify({actor:req.principal.id,reconciliationId:r,...data}));
   const prior=(await c.query("SELECT new_state FROM mizan.match_decisions WHERE tenant_id=$1 AND entity_id=$2 AND new_state ? 'requestKey' AND new_state->>'requestKey'=$3",[t,e,data.requestKey])).rows[0];
   if(prior){if(prior.new_state.requestHash!==requestHash)throw new HttpError(409,'REQUEST_KEY_CONFLICT','Request key was used for different content');return {...prior.new_state.response,reused:true};}
   requireEditable(rec,HttpError);if(rec.content_fingerprint!==data.expectedFingerprint)throw new HttpError(409,'STALE_MATCH','Reload the reconciliation before allocating');
   const bankIds=[...new Set(data.pairs.map(p=>p.bankTransactionId))],bookIds=[...new Set(data.pairs.map(p=>p.bookTransactionId))];
   const bank=(await c.query('SELECT id,source_row_id,signed_amount::text,reference_hash FROM mizan.bank_transactions WHERE tenant_id=$1 AND entity_id=$2 AND dataset_id=$3 AND bank_account_id=$4 AND id=ANY($5::uuid[]) ORDER BY id FOR UPDATE',[t,e,rec.bank_dataset_id,rec.bank_account_id,bankIds])).rows;
   const books=(await c.query('SELECT id,source_row_id,signed_amount::text,reference_hash FROM mizan.book_transactions WHERE tenant_id=$1 AND entity_id=$2 AND dataset_id=$3 AND bank_account_id=$4 AND id=ANY($5::uuid[]) ORDER BY id FOR UPDATE',[t,e,rec.book_dataset_id,rec.bank_account_id,bookIds])).rows;
   const active=(await c.query('SELECT bank_transaction_id,book_transaction_id,amount::text FROM mizan.allocations WHERE tenant_id=$1 AND entity_id=$2 AND reversed_at IS NULL AND (bank_transaction_id=ANY($3::uuid[]) OR book_transaction_id=ANY($4::uuid[]))',[t,e,bankIds,bookIds])).rows;
   const plan=allocationPlan(data.pairs,bank,books,active,rec.minor_units);
   if(plan.referenceConflict){const allowed=(await c.query("SELECT mizan.has_permission($1,$2,$3,'matches.override',$4) AS ok",[t,e,req.principal.id,rec.bank_account_id])).rows[0].ok;if(!data.overrideReferenceConflict||!allowed)throw new HttpError(403,'SUPERVISOR_OVERRIDE_REQUIRED','Conflicting references require an explicit authorized supervisor override');}
   const scope={tenant_id:t,entity_id:e},actor=req.principal.id,id=randomUUID(),now=new Date().toISOString();
   await insert(c,'match_groups',{...scope,id,reconciliation_id:r,bank_account_id:rec.bank_account_id,currency_code:rec.currency_code,match_kind:plan.kind,status:'suggested',automatic:false,unique_candidate:false,reference_conflict:plan.referenceConflict,idempotency_key:data.requestKey});
   await bulk(c,'match_group_members',[...bank.map(b=>({...scope,id:randomUUID(),created_at:now,match_group_id:id,bank_account_id:rec.bank_account_id,currency_code:rec.currency_code,bank_transaction_id:b.id,book_transaction_id:null,evidence:{manual:true,sourceRowId:b.source_row_id}})),...books.map(b=>({...scope,id:randomUUID(),created_at:now,match_group_id:id,bank_account_id:rec.bank_account_id,currency_code:rec.currency_code,bank_transaction_id:null,book_transaction_id:b.id,evidence:{manual:true,sourceRowId:b.source_row_id}}))]);
   await c.query("UPDATE mizan.match_groups SET status='confirmed',decided_by=$4,decided_at=$5,decision_reason=$6,supervisor_override_by=$7 WHERE tenant_id=$1 AND entity_id=$2 AND id=$3",[t,e,id,actor,now,data.reason,plan.referenceConflict?actor:null]);
   const allocationIds=[];for(const [index,p] of plan.pairs.entries()){const allocation=randomUUID();allocationIds.push(allocation);await insert(c,'allocations',{...scope,id:allocation,match_group_id:id,bank_account_id:rec.bank_account_id,currency_code:rec.currency_code,bank_transaction_id:p.bankTransactionId,book_transaction_id:p.bookTransactionId,amount:p.amount,allocated_by:actor,idempotency_key:data.requestKey+':'+index});}
   const response={groupId:id,status:'confirmed',kind:plan.kind,decisionVersion:1,allocationIds,reused:false},fingerprint=await evolveReconciliation(c,t,e,rec,{requestHash,response});
   await insert(c,'match_decisions',{...scope,id:randomUUID(),created_at:now,match_group_id:id,actor_id:actor,action:'manual_confirm',reason:data.reason,previous_state:JSON.stringify({fingerprint:rec.content_fingerprint}),new_state:JSON.stringify({requestKey:data.requestKey,requestHash,response,fingerprint,sequence:1})});
   await audit(c,req,t,e,'match.manual_confirm','match_group',id,data.reason,{reconciliationId:r,kind:plan.kind,allocations:plan.pairs.length,referenceOverride:plan.referenceConflict});return {...response,fingerprint};
  },{fresh:true}));}catch(error){next(error);}
 });
}
