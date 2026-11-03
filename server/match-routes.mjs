import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {hash,money} from './financial-core.mjs';
import {bankAmount} from './bank-core.mjs';
import {insert,bulk} from './financial-routes.mjs';

const request=z.object({requestKey:z.uuid(),expectedVersion:z.number().int().min(0),reason:z.string().trim().min(8).max(500)}).strict();
const editable=['draft','rejected','withdrawn'];
export function mountMatchRoutes(router,{scoped,audit,result,HttpError}){
 const base='/tenants/:tenantId/entities/:entityId/reconciliations/:reconciliationId/matches/:groupId/:action';
 router.post(base,async(req,res,next)=>{
  try{
   const data=request.parse(req.body),action=z.enum(['confirm','unmatch','reject']).parse(req.params.action),{tenantId:t,entityId:e,reconciliationId:r,groupId:g}=req.params;z.uuid().parse(r);z.uuid().parse(g);
   const value=await scoped(req,t,e,null,async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,42))',[e]);
    const rec=(await c.query(`SELECT r.id,r.bank_account_id,r.output_version_id,r.bank_dataset_id,r.book_dataset_id,r.currency_code,v.status,v.content_fingerprint,p.status AS period_status,u.minor_units
      FROM mizan.reconciliations r JOIN mizan.output_versions v ON (v.tenant_id,v.entity_id,v.id)=(r.tenant_id,r.entity_id,r.output_version_id)
      JOIN mizan.accounting_periods p ON (p.tenant_id,p.entity_id,p.id)=(v.tenant_id,v.entity_id,v.period_id) JOIN mizan.currencies u ON u.code=r.currency_code
      WHERE r.tenant_id=$1 AND r.entity_id=$2 AND r.id=$3 AND mizan.has_permission($1,$2,$4,'outputs.prepare',r.bank_account_id) FOR UPDATE OF v,p`,[t,e,r,req.principal.id])).rows[0];
    if(!rec)throw new HttpError(404,'RESOURCE_NOT_FOUND','Reconciliation not found or preparation permission is missing');
    const group=(await c.query('SELECT id,status,match_kind,unique_candidate,reference_conflict,automatic FROM mizan.match_groups WHERE tenant_id=$1 AND entity_id=$2 AND reconciliation_id=$3 AND id=$4 FOR UPDATE',[t,e,r,g])).rows[0];if(!group)throw new HttpError(404,'RESOURCE_NOT_FOUND','Match group not found');
    const requestHash=hash(JSON.stringify({action,groupId:g,reconciliationId:r,actor:req.principal.id,...data}));
    const previous=(await c.query("SELECT new_state FROM mizan.match_decisions WHERE tenant_id=$1 AND entity_id=$2 AND new_state->>'requestKey'=$3",[t,e,data.requestKey])).rows[0];
    if(previous){if(previous.new_state.requestHash!==requestHash)throw new HttpError(409,'REQUEST_KEY_CONFLICT','This request key was used for a different decision');return {...previous.new_state.response,reused:true};}
    if(!editable.includes(rec.status)||rec.period_status!=='open')throw new HttpError(409,'OUTPUT_FROZEN','Only editable drafts in an open period can change matches');
    const version=(await c.query('SELECT count(*)::int AS n FROM mizan.match_decisions WHERE tenant_id=$1 AND entity_id=$2 AND match_group_id=$3',[t,e,g])).rows[0].n;
    if(data.expectedVersion!==version)throw new HttpError(409,'STALE_MATCH','This match changed; reload its current decision before continuing');
    const scope={tenant_id:t,entity_id:e},actor=req.principal.id,now=new Date().toISOString();let allocationId=null;
    if(action==='confirm'){
     if(!['suggested','unmatched'].includes(group.status)||!group.unique_candidate||group.reference_conflict||group.automatic||group.match_kind!=='one_to_one')throw new HttpError(409,'MATCH_NOT_UNIQUE','Only an unambiguous exact one-to-one suggestion can be confirmed here');
     const members=(await c.query('SELECT bank_transaction_id,book_transaction_id FROM mizan.match_group_members WHERE tenant_id=$1 AND entity_id=$2 AND match_group_id=$3',[t,e,g])).rows;
     const banks=members.filter(m=>m.bank_transaction_id),books=members.filter(m=>m.book_transaction_id);if(banks.length!==1||books.length!==1)throw new HttpError(409,'MATCH_NOT_UNIQUE','Expected exactly one bank and one book movement');
     const bank=(await c.query('SELECT id,signed_amount::text,posting_date::text,reference_hash FROM mizan.bank_transactions WHERE tenant_id=$1 AND entity_id=$2 AND dataset_id=$3 AND id=$4 AND bank_account_id=$5 FOR UPDATE',[t,e,rec.bank_dataset_id,banks[0].bank_transaction_id,rec.bank_account_id])).rows[0];
     const book=(await c.query('SELECT id,signed_amount::text,posting_date::text,reference_hash FROM mizan.book_transactions WHERE tenant_id=$1 AND entity_id=$2 AND dataset_id=$3 AND id=$4 AND bank_account_id=$5 FOR UPDATE',[t,e,rec.book_dataset_id,books[0].book_transaction_id,rec.bank_account_id])).rows[0];
     if(!bank||!book||!bank.reference_hash||bank.reference_hash!==book.reference_hash||bank.posting_date!==book.posting_date||bankAmount(bank.signed_amount,rec.minor_units)!==bankAmount(book.signed_amount,rec.minor_units))throw new HttpError(409,'MATCH_EVIDENCE_CHANGED','The exact signed amount, date or reference does not agree');
     const used=(await c.query('SELECT coalesce(sum(amount) FILTER(WHERE bank_transaction_id=$3),0)::text AS bank_used,coalesce(sum(amount) FILTER(WHERE book_transaction_id=$4),0)::text AS book_used FROM mizan.allocations WHERE tenant_id=$1 AND entity_id=$2 AND reversed_at IS NULL AND (bank_transaction_id=$3 OR book_transaction_id=$4)',[t,e,bank.id,book.id])).rows[0];
     if(bankAmount(used.bank_used,rec.minor_units)!==0n||bankAmount(used.book_used,rec.minor_units)!==0n)throw new HttpError(409,'MOVEMENT_ALREADY_ALLOCATED','A movement already has an active allocation');
     await c.query("UPDATE mizan.match_groups SET status='confirmed',decided_by=$4,decided_at=$5,decision_reason=$6 WHERE tenant_id=$1 AND entity_id=$2 AND id=$3",[t,e,g,actor,now,data.reason]);
     const signed=bankAmount(bank.signed_amount,rec.minor_units);allocationId=randomUUID();
     await insert(c,'allocations',{...scope,id:allocationId,match_group_id:g,bank_account_id:rec.bank_account_id,currency_code:rec.currency_code,bank_transaction_id:bank.id,book_transaction_id:book.id,amount:money(signed<0n?-signed:signed,rec.minor_units),allocated_by:actor,idempotency_key:data.requestKey});
    }else if(action==='reject'){
     if(!['suggested','ambiguous','unmatched'].includes(group.status))throw new HttpError(409,'MATCH_NOT_REJECTABLE','Only an unapplied suggestion can be rejected');
     await c.query("UPDATE mizan.match_groups SET status='rejected',decided_by=$4,decided_at=$5,decision_reason=$6 WHERE tenant_id=$1 AND entity_id=$2 AND id=$3",[t,e,g,actor,now,data.reason]);
    }else{
     if(group.status!=='confirmed')throw new HttpError(409,'MATCH_NOT_CONFIRMED','Only a confirmed match can be unmatched');
     const reversed=await c.query('UPDATE mizan.allocations SET reversed_at=$4,reversed_by=$5,reversal_reason=$6 WHERE tenant_id=$1 AND entity_id=$2 AND match_group_id=$3 AND reversed_at IS NULL RETURNING id',[t,e,g,now,actor,data.reason]);
     if(!reversed.rows.length)throw new HttpError(409,'ALLOCATION_MISSING','The confirmed match has no active allocation');
     await c.query("UPDATE mizan.match_groups SET status='unmatched',decided_by=$4,decided_at=$5,decision_reason=$6 WHERE tenant_id=$1 AND entity_id=$2 AND id=$3",[t,e,g,actor,now,data.reason]);
    }
    const response={groupId:g,status:action==='confirm'?'confirmed':action==='reject'?'rejected':'unmatched',decisionVersion:version+1,allocationId,reused:false};
    const fingerprint=hash(JSON.stringify({prior:rec.content_fingerprint,requestHash,response}));
    await c.query('UPDATE mizan.output_versions SET content_fingerprint=$4 WHERE tenant_id=$1 AND entity_id=$2 AND id=$3',[t,e,rec.output_version_id,fingerprint]);
    await insert(c,'match_decisions',{...scope,id:randomUUID(),created_at:now,match_group_id:g,actor_id:actor,action,reason:data.reason,previous_state:JSON.stringify({status:group.status,decisionVersion:version,fingerprint:rec.content_fingerprint}),new_state:JSON.stringify({requestKey:data.requestKey,requestHash,response,fingerprint,sequence:version+1})});
    const checks=(await c.query("SELECT code,severity,passed,message,evidence FROM mizan.validation_results WHERE tenant_id=$1 AND entity_id=$2 AND output_version_id=$3 AND validated_fingerprint=$4 AND code<>'residual'",[t,e,rec.output_version_id,rec.content_fingerprint])).rows;
    await bulk(c,'validation_results',[...checks,{code:'residual',severity:'blocking',passed:false,message:'Matching decisions are draft; reconciling items, completeness and independent review are still required',evidence:{decisionVersion:version+1}}].map(v=>({...scope,id:randomUUID(),created_at:now,output_version_id:rec.output_version_id,validated_fingerprint:fingerprint,...v})));
    await audit(c,req,t,e,'match.'+action,'match_group',g,data.reason,{reconciliationId:r,bankAccountId:rec.bank_account_id,decisionVersion:version+1,allocationId});return response;
   },{fresh:true});result(req,res,value);
  }catch(error){next(error);}
 });
}
