import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {hash,money} from './financial-core.mjs';
import {bankAmount} from './bank-core.mjs';
import {insert,bulk} from './financial-routes.mjs';
import {lockedReconciliation,requireEditable,evolveReconciliation} from './reconciliation-domain.mjs';
import {reconciliationStatement} from './reconciliation-statement.mjs';
const common={requestKey:z.uuid(),expectedFingerprint:z.string().regex(/^[0-9a-f]{64}$/),reason:z.string().trim().min(8).max(500)};
const create=z.object({...common,itemType:z.enum(['deposit_in_transit','outstanding_payment','bank_fee','interest_income','bank_error','book_error','other']),originDate:z.iso.date(),signedAmount:z.string().max(40),effectSide:z.enum(['bank','books','none']),ownerId:z.uuid(),sourceRowId:z.uuid().nullable(),description:z.string().trim().min(8).max(1000),evidenceSourceFileIds:z.array(z.uuid()).min(1).max(10)}).strict();
const state=z.object({...common,status:z.enum(['cleared','excluded']),clearanceSourceRowId:z.uuid().nullable()}).strict();
const carry=z.object({...common,itemId:z.uuid(),fromReconciliationId:z.uuid()}).strict();
const proposal=z.object({...common,itemId:z.uuid(),description:z.string().trim().min(8).max(1000),lines:z.array(z.object({accountId:z.uuid(),debit:z.string().max(40),credit:z.string().max(40)}).strict()).min(2).max(20)}).strict();
const abs=n=>n<0n?-n:n;
export function mountReconcilingItemRoutes(router,{scoped,audit,result,HttpError}){
 const base='/tenants/:tenantId/entities/:entityId/reconciliations/:reconciliationId';
 const unavailable=()=>new HttpError(404,'RESOURCE_NOT_FOUND','Reconciliation item or supporting source is unavailable in this scope');
 async function mutation(req,data,action,run){
  const {tenantId:t,entityId:e,reconciliationId:r}=req.params;z.uuid().parse(r);
  return scoped(req,t,e,null,async c=>{
   const rec=await lockedReconciliation(c,req,t,e,r,HttpError),requestHash=hash(JSON.stringify({actor:req.principal.id,action,path:req.path,data}));
   const prior=(await c.query("SELECT redacted_metadata FROM mizan.audit_events WHERE tenant_id=$1 AND entity_id=$2 AND redacted_metadata->>'itemRequestKey'=$3 ORDER BY created_at LIMIT 1",[t,e,data.requestKey])).rows[0]?.redacted_metadata;
   if(prior){if(prior.requestHash!==requestHash)throw new HttpError(409,'REQUEST_KEY_CONFLICT','Request key was used for other content');return {...prior.response,reused:true};}
   requireEditable(rec,HttpError);if(rec.content_fingerprint!==data.expectedFingerprint)throw new HttpError(409,'STALE_OUTPUT','Reload the reconciliation before changing it');
   const response=await run(c,rec,{tenant_id:t,entity_id:e});
   const fingerprint=await evolveReconciliation(c,t,e,rec,{requestHash,action,response});
   const value={...response,fingerprint,reused:false};
   await audit(c,req,t,e,action,'reconciliation',r,data.reason,{itemRequestKey:data.requestKey,requestHash,response:value});return value;
  },{fresh:true});
 }
 async function sourceRow(c,t,e,rec,id){
  const row=(await c.query(`SELECT id,source_row_id,signed_amount::text,posting_date::text,'bank' AS side FROM mizan.bank_transactions WHERE tenant_id=$1 AND entity_id=$2 AND dataset_id=$3 AND source_row_id=$5
   UNION ALL SELECT id,source_row_id,signed_amount::text,posting_date::text,'books' AS side FROM mizan.book_transactions WHERE tenant_id=$1 AND entity_id=$2 AND dataset_id=$4 AND source_row_id=$5`,[t,e,rec.bank_dataset_id,rec.book_dataset_id,id])).rows[0];
  if(!row)throw unavailable();return row;
 }
 router.post(base+'/items',async(req,res,next)=>{
  try{const data=create.parse(req.body);result(req,res,await mutation(req,data,'reconciliation.item_created',async(c,rec,scope)=>{
   const {tenant_id:t,entity_id:e}=scope,amount=bankAmount(data.signedAmount,rec.minor_units);if(amount===0n||data.originDate>rec.cutoff_text)throw new HttpError(422,'INVALID_ITEM','A nonzero amount and origination no later than cutoff are required');
   const owner=(await c.query("SELECT mizan.has_permission($1,$2,$3,'reports.view',$4) OR mizan.has_permission($1,$2,$3,'outputs.prepare',$4) AS ok",[t,e,data.ownerId,rec.bank_account_id])).rows[0].ok;if(!owner)throw unavailable();
   const ids=[...new Set(data.evidenceSourceFileIds)];if(ids.length!==data.evidenceSourceFileIds.length)throw new HttpError(422,'DUPLICATE_EVIDENCE','Evidence files must be distinct');
   const evidence=(await c.query(`SELECT f.id FROM mizan.source_files f WHERE f.tenant_id=$1 AND f.entity_id=$2 AND f.id=ANY($3::uuid[]) AND f.deleted_at IS NULL AND f.scan_status NOT IN ('infected','rejected') AND
    (f.uploaded_by=$4 OR EXISTS(SELECT 1 FROM mizan.import_batches b JOIN mizan.dataset_imports d ON (d.tenant_id,d.entity_id,d.import_batch_id)=(b.tenant_id,b.entity_id,b.id) WHERE b.tenant_id=f.tenant_id AND b.entity_id=f.entity_id AND b.source_file_id=f.id AND d.dataset_id=ANY($5::uuid[])))`,[t,e,ids,req.principal.id,[rec.bank_dataset_id,rec.book_dataset_id]])).rows;if(evidence.length!==ids.length)throw unavailable();
   if(data.sourceRowId){
    const row=await sourceRow(c,t,e,rec,data.sourceRowId),used=(await c.query('SELECT amount::text FROM mizan.allocations WHERE tenant_id=$1 AND entity_id=$2 AND reversed_at IS NULL AND (bank_transaction_id=$3 OR book_transaction_id=$3)',[t,e,row.id])).rows.reduce((n,a)=>n+bankAmount(a.amount,rec.minor_units),0n),original=bankAmount(row.signed_amount,rec.minor_units);
    if((original<0n)!==(amount<0n)||abs(amount)>abs(original)-used)throw new HttpError(409,'ITEM_CAPACITY_CONFLICT','An item cannot reuse matched capacity or reverse its supporting movement sign');
    if((await c.query('SELECT 1 FROM mizan.reconciling_items WHERE tenant_id=$1 AND entity_id=$2 AND source_row_id=$3 LIMIT 1',[t,e,data.sourceRowId])).rowCount)throw new HttpError(409,'SOURCE_ALREADY_CLASSIFIED','Carry forward the existing item instead of duplicating its source');
   }
   const id=randomUUID();await insert(c,'reconciling_items',{...scope,id,origin_reconciliation_id:rec.id,bank_account_id:rec.bank_account_id,currency_code:rec.currency_code,item_type:data.itemType,origin_date:data.originDate,signed_amount:money(amount,rec.minor_units),effect_side:data.effectSide,owner_id:data.ownerId,source_row_id:data.sourceRowId,description:data.description});
   await insert(c,'reconciliation_items',{...scope,id:randomUUID(),reconciliation_id:rec.id,item_id:id,bank_account_id:rec.bank_account_id,currency_code:rec.currency_code,status:'outstanding'});
   for(const source of ids)await insert(c,'attachments',{...scope,id:randomUUID(),source_file_id:source,item_id:id,attached_by:req.principal.id});return {itemId:id,status:'outstanding'};
  }),201);}catch(error){next(error);}
 });
 router.post(base+'/items/:itemId/state',async(req,res,next)=>{
  try{z.uuid().parse(req.params.itemId);const data=state.parse(req.body);result(req,res,await mutation(req,data,'reconciliation.item_decided',async(c,rec,scope)=>{
   const {tenant_id:t,entity_id:e}=scope,id=req.params.itemId,item=(await c.query('SELECT x.id,x.status,i.signed_amount::text,i.source_row_id,i.effect_side,i.origin_date::text FROM mizan.reconciliation_items x JOIN mizan.reconciling_items i ON (i.tenant_id,i.entity_id,i.id)=(x.tenant_id,x.entity_id,x.item_id) WHERE x.tenant_id=$1 AND x.entity_id=$2 AND x.reconciliation_id=$3 AND x.item_id=$4',[t,e,rec.id,id])).rows[0];if(!item)throw unavailable();if(item.status!=='outstanding')throw new HttpError(409,'ITEM_ALREADY_DECIDED','This item has already been cleared or excluded');
   if(data.status==='cleared'){
    if(!data.clearanceSourceRowId)throw new HttpError(422,'CLEARANCE_SOURCE_REQUIRED','Clearing requires an explicit movement in the current sources');
    const row=await sourceRow(c,t,e,rec,data.clearanceSourceRowId);if(row.source_row_id===item.source_row_id||row.posting_date<item.origin_date||(item.effect_side!=='none'&&row.side!==item.effect_side))throw new HttpError(422,'CLEARANCE_SOURCE_INVALID','Clearance requires a distinct current movement on the adjustment side, no earlier than origination');if(bankAmount(row.signed_amount,rec.minor_units)!==bankAmount(item.signed_amount,rec.minor_units))throw new HttpError(422,'CLEARANCE_AMOUNT_CONFLICT','Clearance source amount and sign must match the item');
    const reused=(await c.query("SELECT 1 FROM mizan.reconciliation_items WHERE tenant_id=$1 AND entity_id=$2 AND clearance_source_row_id=$3 AND status='cleared'",[t,e,data.clearanceSourceRowId])).rowCount;if(reused)throw new HttpError(409,'CLEARANCE_SOURCE_REUSED','Clearance movement was already used');
   }else if(data.clearanceSourceRowId)throw new HttpError(422,'INVALID_CLEARANCE','Excluded items cannot claim a clearance source');
   await c.query('UPDATE mizan.reconciliation_items SET status=$5,clearance_source_row_id=$6,decision_reason=$7 WHERE tenant_id=$1 AND entity_id=$2 AND reconciliation_id=$3 AND item_id=$4',[t,e,rec.id,id,data.status,data.clearanceSourceRowId,data.reason]);return {itemId:id,status:data.status};
  }));}catch(error){next(error);}
 });
 router.post(base+'/items/carry-forward',async(req,res,next)=>{
  try{const data=carry.parse(req.body);result(req,res,await mutation(req,data,'reconciliation.item_carried',async(c,rec,scope)=>{
   const {tenant_id:t,entity_id:e}=scope,prior=(await c.query(`SELECT r.id FROM mizan.reconciliations r JOIN mizan.output_versions v ON (v.tenant_id,v.entity_id,v.id)=(r.tenant_id,r.entity_id,r.output_version_id) JOIN mizan.reconciliation_items x ON (x.tenant_id,x.entity_id,x.reconciliation_id)=(r.tenant_id,r.entity_id,r.id) WHERE r.tenant_id=$1 AND r.entity_id=$2 AND r.id=$3 AND x.item_id=$4 AND x.status='outstanding' AND v.status='approved_locked' AND r.bank_account_id=$5 AND r.currency_code=$6 AND r.cutoff_date<$7`,[t,e,data.fromReconciliationId,data.itemId,rec.bank_account_id,rec.currency_code,rec.cutoff_date])).rows[0];if(!prior)throw unavailable();
   if((await c.query('SELECT 1 FROM mizan.reconciliation_items WHERE tenant_id=$1 AND entity_id=$2 AND reconciliation_id=$3 AND item_id=$4',[t,e,rec.id,data.itemId])).rowCount)throw new HttpError(409,'ITEM_ALREADY_INCLUDED','Item is already included in this reconciliation');
   await insert(c,'reconciliation_items',{...scope,id:randomUUID(),reconciliation_id:rec.id,item_id:data.itemId,bank_account_id:rec.bank_account_id,currency_code:rec.currency_code,status:'outstanding',carried_from_reconciliation_id:prior.id});return {itemId:data.itemId,status:'outstanding',carriedFrom:prior.id};
  }),201);}catch(error){next(error);}
 });
 router.post(base+'/proposed-entries',async(req,res,next)=>{
  try{const data=proposal.parse(req.body);result(req,res,await mutation(req,data,'reconciliation.entry_proposed',async(c,rec,scope)=>{
   const {tenant_id:t,entity_id:e}=scope,item=(await c.query("SELECT i.signed_amount::text,i.effect_side,x.status FROM mizan.reconciling_items i JOIN mizan.reconciliation_items x ON (x.tenant_id,x.entity_id,x.item_id)=(i.tenant_id,i.entity_id,i.id) WHERE x.tenant_id=$1 AND x.entity_id=$2 AND x.reconciliation_id=$3 AND x.item_id=$4",[t,e,rec.id,data.itemId])).rows[0];if(!item)throw unavailable();if(item.effect_side!=='books'||item.status!=='outstanding')throw new HttpError(422,'ENTRY_ITEM_INVALID','A proposed entry requires an outstanding books adjustment');
   const accounts=[...new Set(data.lines.map(l=>l.accountId))],available=(await c.query('SELECT id FROM mizan.accounts WHERE tenant_id=$1 AND entity_id=$2 AND id=ANY($3::uuid[])',[t,e,accounts])).rows;if(available.length!==accounts.length)throw unavailable();
   const bankLedger=(await c.query('SELECT ledger_account_id FROM mizan.bank_accounts WHERE tenant_id=$1 AND entity_id=$2 AND id=$3',[t,e,rec.bank_account_id])).rows[0].ledger_account_id;
   let balance=0n,cash=0n;const lines=data.lines.map(l=>{const debit=bankAmount(l.debit,rec.minor_units),credit=bankAmount(l.credit,rec.minor_units);if(debit<0n||credit<0n||(debit===0n)===(credit===0n))throw new HttpError(422,'ENTRY_LINE_INVALID','Each line must contain either a positive debit or a positive credit');balance+=debit-credit;if(l.accountId===bankLedger)cash+=debit-credit;return {account_id:l.accountId,debit:money(debit,rec.minor_units),credit:money(credit,rec.minor_units)};});
   if(balance!==0n||cash!==bankAmount(item.signed_amount,rec.minor_units))throw new HttpError(422,'ENTRY_UNBALANCED','Debits must equal credits and the bank ledger effect must equal the item');
   if((await c.query('SELECT 1 FROM mizan.proposed_entries WHERE tenant_id=$1 AND entity_id=$2 AND reconciliation_id=$3 AND item_id=$4',[t,e,rec.id,data.itemId])).rowCount)throw new HttpError(409,'ENTRY_ALREADY_EXISTS','A proposed entry already exists for this item');
   const id=randomUUID();await insert(c,'proposed_entries',{...scope,id,reconciliation_id:rec.id,item_id:data.itemId,description:data.description,status:'proposed',created_by:req.principal.id});await bulk(c,'proposed_entry_lines',lines.map(l=>({...scope,id:randomUUID(),created_at:new Date().toISOString(),proposed_entry_id:id,currency_code:rec.currency_code,...l})));return {entryId:id,status:'proposed',posted:false};
  }),201);}catch(error){next(error);}
 });
 router.get(base+'/statement',async(req,res,next)=>{
  try{const {tenantId:t,entityId:e,reconciliationId:r}=req.params;z.uuid().parse(r);result(req,res,await scoped(req,t,e,null,async c=>{
   const rec=(await c.query(`SELECT r.*,r.cutoff_date::text AS cutoff,v.content_fingerprint,v.status,v.version,u.minor_units FROM mizan.reconciliations r JOIN mizan.output_versions v ON (v.tenant_id,v.entity_id,v.id)=(r.tenant_id,r.entity_id,r.output_version_id) JOIN mizan.currencies u ON u.code=r.currency_code WHERE r.tenant_id=$1 AND r.entity_id=$2 AND r.id=$3 AND mizan.has_permission($1,$2,$4,'reports.view',r.bank_account_id)`,[t,e,r,req.principal.id])).rows[0];if(!rec)throw unavailable();
   const items=(await c.query(`SELECT i.id,i.item_type,i.origin_date::text,i.signed_amount::text,i.effect_side,i.owner_id,i.source_row_id,i.description,x.status,x.carried_from_reconciliation_id,x.clearance_source_row_id,x.decision_reason,
    (SELECT count(*)::int FROM mizan.attachments a JOIN mizan.source_files f ON (f.tenant_id,f.entity_id,f.id)=(a.tenant_id,a.entity_id,a.source_file_id) WHERE a.tenant_id=i.tenant_id AND a.entity_id=i.entity_id AND a.item_id=i.id AND f.scan_status='clean' AND f.deleted_at IS NULL) AS clean_evidence_count
    FROM mizan.reconciliation_items x JOIN mizan.reconciling_items i ON (i.tenant_id,i.entity_id,i.id)=(x.tenant_id,x.entity_id,x.item_id) WHERE x.tenant_id=$1 AND x.entity_id=$2 AND x.reconciliation_id=$3 ORDER BY i.origin_date,i.id`,[t,e,r])).rows;
   const transactions={};for(const [side,table,dataset] of [['bank','bank_transactions',rec.bank_dataset_id],['books','book_transactions',rec.book_dataset_id]])transactions[side]=(await c.query(`SELECT id,signed_amount::text FROM mizan.${table} WHERE tenant_id=$1 AND entity_id=$2 AND dataset_id=$3`,[t,e,dataset])).rows;
   const allocations=(await c.query('SELECT bank_transaction_id,book_transaction_id,amount::text,reversed_at FROM mizan.allocations WHERE tenant_id=$1 AND entity_id=$2 AND reversed_at IS NULL AND (bank_transaction_id=ANY($3::uuid[]) OR book_transaction_id=ANY($4::uuid[]))',[t,e,transactions.bank.map(x=>x.id),transactions.books.map(x=>x.id)])).rows;
   const entries=(await c.query(`SELECT p.id,p.item_id,p.description,p.status,p.recorded_ledger_entry_id,jsonb_agg(jsonb_build_object('account_id',l.account_id,'debit',l.debit::text,'credit',l.credit::text,'currency_code',l.currency_code) ORDER BY l.id) AS lines FROM mizan.proposed_entries p JOIN mizan.proposed_entry_lines l ON (l.tenant_id,l.entity_id,l.proposed_entry_id)=(p.tenant_id,p.entity_id,p.id) WHERE p.tenant_id=$1 AND p.entity_id=$2 AND p.reconciliation_id=$3 GROUP BY p.id ORDER BY p.created_at`,[t,e,r])).rows;
   return {reconciliation_id:r,currency_code:rec.currency_code,status:rec.status,version:rec.version,content_fingerprint:rec.content_fingerprint,cutoff_date:rec.cutoff,bank_closing_balance:rec.bank_closing_balance,book_closing_balance:rec.book_closing_balance,...reconciliationStatement({...rec,cutoff_date:rec.cutoff},items,transactions,allocations,rec.minor_units),proposed_entries:entries};
  }));}catch(error){next(error);}
 });
}
