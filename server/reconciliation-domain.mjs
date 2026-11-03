import {hash} from './financial-core.mjs';
import {randomUUID} from 'node:crypto';
import {bulk} from './financial-routes.mjs';
export async function lockedReconciliation(c,req,t,e,id,HttpError){
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,42))',[e]);
 const rec=(await c.query(`SELECT r.*,r.cutoff_date::text AS cutoff_text,v.status AS output_status,v.content_fingerprint,p.status AS period_status,u.minor_units
 FROM mizan.reconciliations r JOIN mizan.output_versions v ON (v.tenant_id,v.entity_id,v.id)=(r.tenant_id,r.entity_id,r.output_version_id)
 JOIN mizan.accounting_periods p ON (p.tenant_id,p.entity_id,p.id)=(v.tenant_id,v.entity_id,v.period_id) JOIN mizan.currencies u ON u.code=r.currency_code
 WHERE r.tenant_id=$1 AND r.entity_id=$2 AND r.id=$3 AND mizan.has_permission($1,$2,$4,'outputs.prepare',r.bank_account_id) FOR UPDATE OF v,p`,[t,e,id,req.principal.id])).rows[0];
 if(!rec)throw new HttpError(404,'RESOURCE_NOT_FOUND','Reconciliation not found or preparation access is missing');return rec;
}
export function requireEditable(rec,HttpError){if(!['draft','rejected','withdrawn'].includes(rec.output_status)||rec.period_status!=='open')throw new HttpError(409,'OUTPUT_FROZEN','An editable draft and open period are required');}
export async function evolveReconciliation(c,t,e,rec,event){
 const fingerprint=hash(JSON.stringify({prior:rec.content_fingerprint,event}));
 await c.query('UPDATE mizan.output_versions SET content_fingerprint=$4 WHERE tenant_id=$1 AND entity_id=$2 AND id=$3',[t,e,rec.output_version_id,fingerprint]);
 const checks=(await c.query("SELECT code,severity,passed,message,evidence FROM mizan.validation_results WHERE tenant_id=$1 AND entity_id=$2 AND output_version_id=$3 AND validated_fingerprint=$4 AND code<>'residual'",[t,e,rec.output_version_id,rec.content_fingerprint])).rows;
 await bulk(c,'validation_results',[...checks,{code:'residual',severity:'blocking',passed:false,message:'Reconciliation requires recomputation and independent validation',evidence:{}}].map(v=>({id:randomUUID(),tenant_id:t,entity_id:e,created_at:new Date().toISOString(),output_version_id:rec.output_version_id,validated_fingerprint:fingerprint,...v})));
 return fingerprint;
}
