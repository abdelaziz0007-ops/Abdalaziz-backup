import {bankAmount} from './bank-core.mjs';
import {money} from './financial-core.mjs';
export const groupedRule='same-date-reference-exact-remaining-v1';
export const groupedLimits=Object.freeze({rowsPerSide:1000,candidates:12,members:4,states:20000,results:100});
export function groupedSuggestions(bank,books,precision){
 const limits=groupedLimits,reasons=new Set(),suggestions=[];let states=0;
 const prepare=rows=>{if(rows.length>limits.rowsPerSide)reasons.add('row_limit');return rows.slice(0,limits.rowsPerSide).map(r=>({...r,units:bankAmount(r.remaining_amount,precision),signed:bankAmount(r.signed_amount,precision)})).filter(r=>r.units>0n&&r.signed!==0n&&r.reference_hash);};
 const sides={bank:prepare(bank),books:prepare(books)};
 const key=r=>JSON.stringify([r.posting_date,r.reference_hash,r.signed>0n]);
 const index=rows=>{const map=new Map();for(const r of rows){const k=key(r);if(!map.has(k))map.set(k,[]);map.get(k).push(r);}return map;};
 const indexes={bank:index(sides.bank),books:index(sides.books)};
 for(const side of ['bank','books'])for(const anchor of sides[side]){
  if(states>=limits.states||suggestions.length>=limits.results){reasons.add(states>=limits.states?'search_budget':'result_limit');break;}
  const other=side==='bank'?'books':'bank';let candidates=(indexes[other].get(key(anchor))??[]).filter(r=>r.units<anchor.units).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  if(candidates.length>limits.candidates){reasons.add('candidate_limit');candidates=candidates.slice(0,limits.candidates);}
  function visit(start,chosen,total){
   if(states>=limits.states){reasons.add('search_budget');return;}states++;
   if(total===anchor.units&&chosen.length>=2){
    if(suggestions.length>=limits.results){reasons.add('result_limit');return;}
    suggestions.push({kind:side==='bank'?'one_to_many':'many_to_one',anchorId:anchor.id,anchorSide:side,memberIds:chosen.map(r=>r.id),members:[{side,id:anchor.id,rowNumber:anchor.row_number,amount:money(anchor.units,precision)},...chosen.map(r=>({side:other,id:r.id,rowNumber:r.row_number,amount:money(r.units,precision)}))],postingDate:anchor.posting_date,total:money(total,precision),residual:money(0n,precision),requiresReview:true,pairs:chosen.map(r=>({bankTransactionId:side==='bank'?anchor.id:r.id,bookTransactionId:side==='bank'?r.id:anchor.id,amount:money(r.units,precision)}))});return;
   }
   if(total>=anchor.units)return;
   if(chosen.length===limits.members){if(start<candidates.length)reasons.add('group_size_limit');return;}
   for(let i=start;i<candidates.length;i++){
    if(states>=limits.states||suggestions.length>=limits.results){reasons.add(states>=limits.states?'search_budget':'result_limit');break;}
    if(total+candidates[i].units<=anchor.units)visit(i+1,[...chosen,candidates[i]],total+candidates[i].units);
   }
  }
  visit(0,[],0n);
 }
 return {rule:groupedRule,limits,states,searchComplete:reasons.size===0,unsearchedReasons:[...reasons].sort(),suggestions};
}

export function mountGroupedSuggestionRoutes(router,{scoped,result,HttpError}){
 router.get('/tenants/:tenantId/entities/:entityId/reconciliations/:reconciliationId/grouped-suggestions',async(req,res,next)=>{try{
  const {tenantId:t,entityId:e,reconciliationId:id}=req.params;
  if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))throw new HttpError(400,'INVALID_ID','Invalid reconciliation ID');
  result(req,res,await scoped(req,t,e,null,async c=>{
   const rec=(await c.query(`SELECT r.bank_dataset_id,r.book_dataset_id,r.bank_account_id,v.content_fingerprint,u.minor_units FROM mizan.reconciliations r JOIN mizan.output_versions v ON (v.tenant_id,v.entity_id,v.id)=(r.tenant_id,r.entity_id,r.output_version_id) JOIN mizan.currencies u ON u.code=r.currency_code WHERE r.tenant_id=$1 AND r.entity_id=$2 AND r.id=$3 AND mizan.has_permission($1,$2,$4,'reports.view',r.bank_account_id) AND mizan.has_permission($1,$2,$4,'outputs.prepare',r.bank_account_id)`,[t,e,id,req.principal.id])).rows[0];
   if(!rec)throw new HttpError(404,'RESOURCE_NOT_FOUND','Reconciliation unavailable');
   const sides={};
   for(const [side,table,column,dataset] of [['bank','bank_transactions','bank_transaction_id',rec.bank_dataset_id],['books','book_transactions','book_transaction_id',rec.book_dataset_id]]){
    sides[side]=(await c.query(`SELECT x.id,s.row_number,x.posting_date::text,x.signed_amount::text,x.reference_hash,(abs(x.signed_amount)-coalesce((SELECT sum(a.amount) FROM mizan.allocations a WHERE a.tenant_id=x.tenant_id AND a.entity_id=x.entity_id AND a.${column}=x.id AND a.reversed_at IS NULL),0))::text AS remaining_amount FROM mizan.${table} x JOIN mizan.source_rows s ON (s.tenant_id,s.entity_id,s.id)=(x.tenant_id,x.entity_id,x.source_row_id) WHERE x.tenant_id=$1 AND x.entity_id=$2 AND x.dataset_id=$3 AND x.bank_account_id=$4 ORDER BY x.id LIMIT $5`,[t,e,dataset,rec.bank_account_id,groupedLimits.rowsPerSide+1])).rows;
   }
   return {fingerprint:rec.content_fingerprint,...groupedSuggestions(sides.bank,sides.books,rec.minor_units)};
  },{snapshot:true}));
 }catch(error){next(error);}});
}
