import {z} from 'zod';
import {coefficient,money} from './financial-core.mjs';
import {bankAmount} from './bank-core.mjs';
const rules={
 gross_margin:{expression:'(revenue - cost) / revenue * 100',inputs:['revenue','cost']},
 net_margin:{expression:'net_profit / revenue * 100',inputs:['net_profit','revenue']},
 current_ratio:{expression:'current_assets / current_liabilities',inputs:['current_assets','current_liabilities']},
 debt_to_assets:{expression:'liabilities / assets * 100',inputs:['liabilities','assets']},
};
function units(text,precision){
 if(typeof text!=='string'||!(/^-?\d+(\.\d+)?$/).test(text))throw Error('Invalid exact amount');
 const canonical=text.includes('.')?text.replace(/0+$/,'').replace(/\.$/,''):text;
 return bankAmount(canonical,precision);
}
export function metricEvidence(metric,rows,precision){
 const code=metric.formula_code?.replace('classified-tb-draft-v1:',''),rule=rules[code];
 const common={metric:{id:metric.id,name:metric.name,value:metric.value,state:metric.value_state,unit:metric.unit,expression:metric.expression,formulaVersion:metric.formula_version},basis:'saved_trial_balance',transactionDetailAvailable:false};
 if(!rule||metric.formula_code!=='classified-tb-draft-v1:'+code||metric.formula_version!==1||metric.expression!==rule.expression)
  return {...common,available:false,reason:'unsupported_formula_version',components:[]};
 if(rows.length>5000)throw Error('METRIC_EVIDENCE_LIMIT');
 // The route reads only the dataset and mapping frozen on the selected output version.
 if(rows.some(r=>r.weight!=='1'&&!/^1\.0+$/.test(r.weight??'')))
  return {...common,available:false,reason:'unsupported_mapping_weights',components:[]};
 const classes=['asset.current','asset.noncurrent','asset.contra','liability.current','liability.noncurrent','equity','income','expense.cost','expense.operating','expense.tax'];
 if(rows.some(r=>!classes.includes(r.classification)))return {...common,available:false,reason:'incomplete_mapping',components:[]};
 const withheld=rows.filter(r=>r.deleted_at||r.scan_status!=='clean').length;
 const unique=new Set(rows.map(r=>r.balance_row_id));
 if(unique.size!==rows.length)return {...common,available:false,reason:'ambiguous_mapping',components:[]};
 const components=rule.inputs.map(input=>{
  const contributions=[];let sum=0n;
  for(const row of rows){
   const factor=coefficient(input,row.classification);if(!factor)continue;
   if(row.deleted_at||row.scan_status!=='clean')continue;
   const amount=units(row.closing_balance,precision)*BigInt(factor);sum+=amount;
   contributions.push({accountId:row.account_id,accountCode:row.account_code,sourceRowId:row.source_row_id,rowNumber:row.row_number,sourceSha256:row.sha256,contribution:money(amount,precision)});
  }
  const saved=metric.input_references?.totals?.[input],validSaved=typeof saved==='string';
  return {code:input,savedTotal:validSaved?saved:null,recomputedTotal:withheld?null:money(sum,precision),matchesSavedTotal:withheld||!validSaved?null:sum===units(saved,precision),rows:contributions};
 });
 return {...common,available:true,withheldRows:withheld,complete:withheld===0&&components.every(c=>c.matchesSavedTotal===true),components};
}
export function mountMetricEvidenceRoutes(router,{scoped,result,HttpError}){
 router.get('/tenants/:tenantId/entities/:entityId/reports/:reportId/metrics/:metricId/sources',async(req,res,next)=>{try{
  const {tenantId:t,entityId:e,reportId,metricId}=req.params;z.uuid().parse(reportId);z.uuid().parse(metricId);
  result(req,res,await scoped(req,t,e,'reports.view',async c=>{
   const metric=(await c.query(`SELECT m.id,m.value::text,m.value_state,m.input_references,f.formula_code,f.name,f.expression,f.unit,f.version AS formula_version,v.mapping_version_id,k.minor_units
   FROM mizan.metric_results m JOIN mizan.formula_versions f ON (f.tenant_id,f.entity_id,f.id)=(m.tenant_id,m.entity_id,m.formula_version_id)
   JOIN mizan.output_versions v ON (v.tenant_id,v.entity_id,v.id)=(m.tenant_id,m.entity_id,m.output_version_id)
   JOIN mizan.currencies k ON k.code=v.currency_code
   WHERE m.tenant_id=$1 AND m.entity_id=$2 AND m.output_version_id=$3 AND m.id=$4 AND v.output_type='analysis'`,[t,e,reportId,metricId])).rows[0];
   if(!metric)throw new HttpError(404,'RESOURCE_NOT_FOUND','Metric unavailable');
   const datasetId=z.uuid().safeParse(metric.input_references?.datasetId);
   if(!datasetId.success)return {available:false,reason:'missing_dataset_reference',components:[]};
   const rows=(await c.query(`SELECT b.id AS balance_row_id,b.account_id,a.code AS account_code,b.source_row_id,b.closing_balance::text,
   i.name AS classification,am.weight::text,s.row_number,f.sha256,f.scan_status,f.deleted_at
   FROM mizan.trial_balance_rows b JOIN mizan.output_datasets d
    ON (d.tenant_id,d.entity_id,d.dataset_id)=(b.tenant_id,b.entity_id,b.dataset_id) AND d.output_version_id=$3 AND d.source_role='primary'
   JOIN mizan.accounts a ON (a.tenant_id,a.entity_id,a.id)=(b.tenant_id,b.entity_id,b.account_id)
   LEFT JOIN mizan.account_mappings am ON (am.tenant_id,am.entity_id,am.account_id)=(b.tenant_id,b.entity_id,b.account_id) AND am.mapping_version_id=$5
   LEFT JOIN mizan.report_line_items i ON (i.tenant_id,i.entity_id,i.id)=(am.tenant_id,am.entity_id,am.line_item_id)
   JOIN mizan.source_rows s ON (s.tenant_id,s.entity_id,s.id)=(b.tenant_id,b.entity_id,b.source_row_id)
   JOIN mizan.import_batches ib ON (ib.tenant_id,ib.entity_id,ib.id)=(s.tenant_id,s.entity_id,s.import_batch_id)
   JOIN mizan.source_files f ON (f.tenant_id,f.entity_id,f.id)=(ib.tenant_id,ib.entity_id,ib.source_file_id)
   WHERE b.tenant_id=$1 AND b.entity_id=$2 AND b.dataset_id=$4 ORDER BY b.id LIMIT 5001`,[t,e,reportId,datasetId.data,metric.mapping_version_id])).rows;
   if(rows.length>5000)throw new HttpError(422,'METRIC_EVIDENCE_LIMIT','Metric evidence exceeds the supported row limit');
   if(!rows.length)return {available:false,reason:'no_source_rows',components:[]};
   return metricEvidence(metric,rows,metric.minor_units);
  },{snapshot:true}));
 }catch(error){next(error);}});
}
