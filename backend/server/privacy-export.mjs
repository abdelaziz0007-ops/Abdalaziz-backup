import {createHash} from 'node:crypto';
import {z} from 'zod';
export const exportLimit=10000;
export const exportSections=[
 {name:'periods',table:'accounting_periods',fields:'id,start_date,end_date,status,settings_version_id'},
 {name:'settings',table:'entity_settings_versions',fields:'id,version,currency_code,fiscal_year_start_month,accounting_framework,effective_from'},
 {name:'outputs',table:'output_versions',fields:'id,output_type,period_id,currency_code,version,status,content_fingerprint,created_at',where:" AND output_type IN ('income_statement','financial_position','analysis')"},
 {name:'reportLines',table:'report_lines',fields:'id,output_version_id,line_item_id,currency_code,value::text AS value,value_state,display_order',where:" AND output_version_id IN (SELECT id FROM mizan.output_versions WHERE tenant_id=$1 AND entity_id=$2 AND output_type IN ('income_statement','financial_position','analysis'))"},
 {name:'lineItems',table:'report_line_items',fields:'id,name'},
 {name:'metrics',table:'metric_results',fields:'id,output_version_id,formula_version_id,value::text AS value,value_state,unavailable_reason',where:" AND output_version_id IN (SELECT id FROM mizan.output_versions WHERE tenant_id=$1 AND entity_id=$2 AND output_type='analysis')"},
 {name:'formulas',table:'formula_versions',fields:'id,formula_code,name,expression,unit'},
];
export function encodePrivacyExport({tenant,entity,requestId,generatedAt,sections}){
 for(const section of exportSections)if(!Array.isArray(sections[section.name])||sections[section.name].length>exportLimit)throw new Error('Incomplete or oversized export section');
 const payload={format:'mizan-structured-financial-export',version:1,tenantId:tenant,entityId:entity,requestId,generatedAt,
 coverage:{complete:false,included:exportSections.map(s=>s.name),excluded:['original_files','source_rows','import_datasets','bank_reconciliations','other_output_types','comments','identity_and_membership','provider_copies','indexes','backups'],note:'Partial export only. The privacy request remains partially completed.'},sections};
 const bytes=Buffer.from(JSON.stringify(payload,null,2)+'\n','utf8');
 if(bytes.length>20*1024*1024)throw new Error('Export exceeds 20 MiB');
 return {bytes,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export function mountPrivacyExportRoutes(router,{scoped,HttpError}){
 router.post('/tenants/:tenantId/entities/:entityId/data-lifecycle/:requestId/structured-export',async(req,res,next)=>{try{
  z.object({}).strict().parse(req.body);
  const {tenantId:t,entityId:e}=req.params,id=z.uuid().parse(req.params.requestId);
  const file=await scoped(req,t,e,'privacy.manage',async c=>{
   for(const code of ['reports.view','outputs.export'])if(!(await c.query('SELECT mizan.has_permission($1,$2,$3,$4) AS allowed',[t,e,req.principal.id,code])).rows[0].allowed)throw new HttpError(403,'EXPORT_PERMISSION_REQUIRED','Financial view and export permissions required');
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,42))',[e]);
   const request=(await c.query("SELECT id FROM mizan.data_lifecycle_requests WHERE tenant_id=$1 AND entity_id=$2 AND id=$3 AND request_type='export' AND status IN ('authorized','partially_completed')",[t,e,id])).rows[0];
   if(!request)throw new HttpError(404,'RESOURCE_NOT_FOUND','Authorized entity export request unavailable');
   const sections={};
   for(const section of exportSections){
    const rows=(await c.query('SELECT '+section.fields+' FROM mizan.'+section.table+' WHERE tenant_id=$1 AND entity_id=$2'+(section.where??'')+' ORDER BY id LIMIT $3',[t,e,exportLimit+1])).rows;
    if(rows.length>exportLimit)throw new HttpError(422,'PRIVACY_EXPORT_LIMIT','Export exceeds the supported limit; an asynchronous export is required');
    sections[section.name]=rows;
   }
   let file;try{file=encodePrivacyExport({tenant:t,entity:e,requestId:id,generatedAt:new Date().toISOString(),sections});}catch{throw new HttpError(422,'PRIVACY_EXPORT_LIMIT','Export exceeds the supported size');}
   await c.query('SELECT mizan_private.record_privacy_export($1,$2,$3,$4,$5,$6,$7)',[req.principal.id,req.principal.sessionId,t,e,id,file.sha256,req.requestId]);
   return file;
  },{fresh:true,snapshot:true});
  res.set('Cache-Control','no-store').set('X-Content-SHA256',file.sha256).attachment('mizan-partial-financial-export-'+id+'.json').type('application/json').send(file.bytes);
 }catch(e){next(e);}});
}
