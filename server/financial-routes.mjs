import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { calculateFinancials,classifications,coefficient,hash,money,parseTrialBalance } from './financial-core.mjs';
import { decryptField,rowContext,sourceStorage } from './financial-storage.mjs';
import { formatDec,parseDecimal,percentageVarianceDec,subDec } from '../src/lib/decimal.ts';

const input=z.object({periodId:z.uuid(),fileName:z.string().min(1).max(200).regex(/^[^/\\\u0000-\u001f]+\.csv$/i),csv:z.string().max(524288),basis:z.literal('period'),confirmation:z.literal(true)}).strict();
const algorithm='classified-tb-draft-v1';
const publishedAlgorithm='published-trial-balance-reports-v1';
const types={income_statement:['revenue','cost','gross_profit','operating_expenses','tax','net_profit'],financial_position:['assets','liabilities','equity','current_assets','current_liabilities','working_capital'],analysis:[]};
const reportInput=z.object({confirmation:z.literal(true)}).strict();

async function datasetOutputs(c,t,e,dataset){
  return (await c.query(`
    SELECT v.id,v.output_type,v.status FROM mizan.output_versions v JOIN mizan.output_datasets d
    ON (d.tenant_id,d.entity_id,d.output_version_id)=(v.tenant_id,v.entity_id,v.id)
    WHERE d.tenant_id=$1 AND d.entity_id=$2 AND d.dataset_id=$3 AND d.source_role='primary'
      AND v.output_type IN ('income_statement','financial_position','analysis') ORDER BY v.output_type
  `,[t,e,dataset])).rows;
}

function sourceValues(t,e,id,envelope,version){
  return JSON.parse(decryptField(envelope.sealed,rowContext(t,e,id,version))).values;
}

function evidenceValues(values){
  return {accountCode:values.accountCode,name:values.accountName,classification:values.classification,
    signedDebitBalance:values.closingBalance};
}

// Only static, code-owned table/column identifiers enter this helper; values are parameters.
export async function insert(c,table,record){
  const columns=Object.keys(record),values=Object.values(record);
  await c.query(`INSERT INTO mizan.${table}(${columns.join(',')}) VALUES(${columns.map((_,i)=>'$'+(i+1)).join(',')})`,values);
  return record.id;
}
export async function bulk(c,table,records){
  if(!records.length)return;
  const columns=Object.keys(records[0]);
  await c.query(`INSERT INTO mizan.${table}(${columns.join(',')}) SELECT ${columns.join(',')} FROM jsonb_populate_recordset(NULL::mizan.${table},$1::jsonb)`,[JSON.stringify(records)]);
}
async function createFinancialDrafts(c,{
  scope,actor,period,rows,calculated,dataset,fingerprint,calculationVersion=algorithm,complete=false,publishMapping,
}){
  const {tenant_id:t,entity_id:e}=scope;
  const mapping=randomUUID(),now=new Date().toISOString();
  await insert(c,'mapping_versions',{...scope,id:mapping,version:1,created_by:actor,content_fingerprint:hash(JSON.stringify(rows.map(r=>[r.code,r.classification]))),status:'draft'});
  const lineDefinitions=[...new Set([...rows.map(r=>r.classification),...Object.values(types).flat()])];
  // Definitions have algorithm-versioned codes; no mutable report label is trusted for historical inputs.
  const wanted=lineDefinitions.map(code=>`${algorithm}:${code}`);
  const known=(await c.query('SELECT id,code FROM mizan.report_line_items WHERE tenant_id=$1 AND entity_id=$2 AND code=ANY($3::text[])',[t,e,wanted])).rows;
  const items=new Map(known.map(item=>[item.code.slice(algorithm.length+1),item.id]));
  await bulk(c,'report_line_items',lineDefinitions.filter(code=>!items.has(code)).map((code,index)=>{const id=randomUUID();items.set(code,id);return {...scope,id,created_at:now,code:`${algorithm}:${code}`,name:code,statement_type:'classified_trial_balance',display_order:index};}));
  await bulk(c,'account_mappings',rows.map(r=>({...scope,id:randomUUID(),created_at:now,mapping_version_id:mapping,account_id:r.accountId,line_item_id:items.get(r.classification),weight:'1'})));
  if (publishMapping) await publishMapping(mapping);
  const formulas=[];
  for(const metric of calculated.metrics){const code=algorithm+':'+metric.code;let f=(await c.query('SELECT id FROM mizan.formula_versions WHERE tenant_id=$1 AND entity_id=$2 AND formula_code=$3 AND version=1',[t,e,code])).rows[0];if(!f){f={id:randomUUID()};await insert(c,'formula_versions',{...scope,id:f.id,formula_code:code,version:1,name:metric.name,expression:metric.expression,required_inputs:JSON.stringify({basis:'Explicit period-specific balances; no automatic YTD conversion'}),unit:metric.unit,limitations:'Positive denominator required; no comparatives or cash-flow derivation'});}formulas.push({...metric,id:f.id});}
  for(const [type,lines] of Object.entries(types)){
    const id=randomUUID(),outputFingerprint=hash(fingerprint+':'+type);
    const prev=(await c.query('SELECT id,logical_output_id,version,status FROM mizan.output_versions WHERE tenant_id=$1 AND entity_id=$2 AND period_id=$3 AND output_type=$4 ORDER BY version DESC,created_at DESC LIMIT 1',[t,e,period.id,type])).rows[0];
    await insert(c,'output_versions',{...scope,id,logical_output_id:prev?.logical_output_id??randomUUID(),version:(prev?.version??0)+1,predecessor_id:prev?.status==='approved_locked'?prev.id:null,reopen_reason:prev?.status==='approved_locked'?'New source import; earlier approved output retained':null,output_type:type,period_id:period.id,currency_code:period.currency_code,settings_version_id:period.settings_version_id,mapping_version_id:mapping,preparer_id:actor,content_fingerprint:outputFingerprint,status:'draft'});
    await insert(c,'output_datasets',{...scope,id:randomUUID(),output_version_id:id,dataset_id:dataset,source_role:'primary'});
    const reportLines=lines.map((line,index)=>({...scope,id:randomUUID(),created_at:now,output_version_id:id,line_item_id:items.get(line),currency_code:period.currency_code,value:calculated.values[line],value_state:'available',display_order:index}));
    await bulk(c,'report_lines',reportLines);
    const contributions=reportLines.flatMap((line,index)=>rows.filter(r=>coefficient(lines[index],r.classification)!==0).map(r=>({...scope,id:randomUUID(),created_at:now,report_line_id:line.id,source_row_id:r.sourceId,transformation_id:r.transformationId??null,account_id:r.accountId,contribution:money(r.units*BigInt(coefficient(lines[index],r.classification)),period.minor_units)})));
    for(let offset=0;offset<contributions.length;offset+=1000){
      await bulk(c,'report_line_sources',contributions.slice(offset,offset+1000));
    }
    if(type==='analysis')await bulk(c,'metric_results',formulas.map(f=>({...scope,id:randomUUID(),created_at:now,output_version_id:id,formula_version_id:f.id,value:f.value,value_state:f.value===null?'missing':'available',unavailable_reason:f.value===null?f.reason??'Denominator is zero or negative':null,input_references:{datasetId:dataset,sourceRows:rows.map(r=>r.sourceId),totals:calculated.values,algorithm:calculationVersion}})));
    await bulk(c,'validation_results',[
      {code:'scope',passed:true,message:'Authenticated entity and currency scope'},
      {code:'balance',passed:calculated.balanced,message:'Signed trial balance and financial position reconcile'},
      {code:'mapping',passed:true,message:'Every account has one explicit classification'},
      {code:'completeness',passed:complete,message:complete?'Complete and published period trial balance':'Draft dataset; source inspection and independent completeness review are pending'},
      {code:'malware_scan',passed:complete,message:complete?'Successful scan recorded for the published source':'Source quarantined; antivirus scanning is not configured'},
    ].map(v=>({...scope,id:randomUUID(),created_at:now,output_version_id:id,validated_fingerprint:outputFingerprint,severity:'blocking',evidence:{datasetId:dataset,algorithm:calculationVersion},...v})));
  }
}

export function mountFinancialRoutes(router,{scoped,audit,result,HttpError}){
  const base='/tenants/:tenantId/entities/:entityId';
  const storage=sourceStorage();
  const notFound=()=>new HttpError(404,'RESOURCE_NOT_FOUND','Financial record not found');
  router.get(base+'/datasets',async(req,res,next)=>{
    try{const {tenantId:t,entityId:e}=req.params;
      const status=z.literal('published').optional().parse(req.query.status)??null;
      result(req,res,await scoped(req,t,e,'reports.view',async c=>(await c.query(`SELECT d.id,d.period_id,d.currency_code,d.version,d.status,d.created_at,count(r.id)::int AS account_count
      FROM mizan.dataset_versions d LEFT JOIN mizan.trial_balance_rows r ON (r.tenant_id,r.entity_id,r.dataset_id)=(d.tenant_id,d.entity_id,d.id)
      WHERE d.tenant_id=$1 AND d.entity_id=$2 AND d.data_type='trial_balance'
        AND ($3::text IS NULL OR (d.status=$3 AND d.complete_dataset))
      GROUP BY d.id ORDER BY d.created_at DESC,d.id LIMIT 50`,[t,e,status])).rows));}catch(error){next(error);}
  });
  router.post(base+'/datasets/:datasetId/reports',async(req,res,next)=>{
    try{
      reportInput.parse(req.body);
      const {tenantId:t,entityId:e,datasetId}=req.params;
      z.uuid().parse(datasetId);
      const value=await scoped(req,t,e,'outputs.prepare',async c=>{
        const {id:actor,sessionId}=req.principal;
        const {rows:[permission]}=await c.query("SELECT mizan.has_permission($1,$2,$3,'reports.view') AS allowed",[t,e,actor]);
        if(!permission.allowed)throw new HttpError(403,'PERMISSION_DENIED','Report view permission is required');
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,42))',[e]);
        const {rows:[dataset]}=await c.query(`
          SELECT d.content_fingerprint,p.id,p.status,p.settings_version_id,d.currency_code,k.minor_units
          FROM mizan.dataset_versions d JOIN mizan.accounting_periods p
            ON (p.tenant_id,p.entity_id,p.id)=(d.tenant_id,d.entity_id,d.period_id)
          JOIN mizan.currencies k ON k.code=d.currency_code
          WHERE (d.tenant_id,d.entity_id,d.id)=($1,$2,$3)
            AND d.data_type='trial_balance' AND d.status='published' AND d.complete_dataset
          FOR UPDATE OF p
        `,[t,e,datasetId]);
        if(!dataset)throw notFound();
        const outputs=await datasetOutputs(c,t,e,datasetId);
        if(outputs.length){
          if(new Set(outputs.map(o=>o.output_type)).size!==3 || outputs.length!==3){
            throw new HttpError(409,'REPORT_SET_CONFLICT','The dataset has a conflicting report set');
          }
          return {datasetId,reused:true,outputs};
        }
        if(dataset.status!=='open')throw new HttpError(409,'PERIOD_NOT_OPEN','Use an open accounting period');
        const {rowCount:locked}=await c.query(`
          SELECT 1 FROM mizan.output_versions WHERE tenant_id=$1 AND entity_id=$2 AND period_id=$3
            AND status='approved_locked' AND output_type IN ('income_statement','financial_position','analysis') LIMIT 1
        `,[t,e,dataset.id]);
        if(locked)throw new HttpError(409,'REOPEN_REQUIRED','This period has approved financial outputs and requires a separate reopening');
        const {rows:typed}=await c.query(`
          SELECT a.id AS account_id,a.code,a.account_type,s.id AS source_id,s.original_values,
            x.id AS transformation_id,x.version,x.derived_values,trunc(r.closing_balance,$4)::text AS closing
          FROM mizan.trial_balance_rows r
          JOIN mizan.accounts a ON (a.tenant_id,a.entity_id,a.id)=(r.tenant_id,r.entity_id,r.account_id)
          JOIN mizan.source_rows s ON (s.tenant_id,s.entity_id,s.id)=(r.tenant_id,r.entity_id,r.source_row_id)
          LEFT JOIN LATERAL (
            SELECT id,version,derived_values FROM mizan.row_transformations
            WHERE (tenant_id,entity_id,source_row_id)=(s.tenant_id,s.entity_id,s.id)
            ORDER BY version DESC LIMIT 1
          ) x ON true
          WHERE (r.tenant_id,r.entity_id,r.dataset_id)=($1,$2,$3) ORDER BY s.row_number
        `,[t,e,datasetId,dataset.minor_units]);
        const invalid=()=>new HttpError(409,'REPORT_SOURCE_INVALID','Published trial balance is inconsistent with its source');
        const rows=typed.map(row=>{
          const values=sourceValues(t,e,row.source_id,row.derived_values??row.original_values,row.version??0);
          const {accountCode,classification,closingBalance}=values;
          if(accountCode!==row.code || !classifications.includes(classification) || classification.split('.')[0]!==row.account_type
             || closingBalance!==row.closing)throw invalid();
          return {code:row.code,classification,units:parseDecimal(row.closing,dataset.minor_units).units,
            accountId:row.account_id,sourceId:row.source_id,transformationId:row.transformation_id};
        });
        if(!rows.length || rows.reduce((sum,row)=>sum+row.units,0n)!==0n)throw invalid();
        const calculated=calculateFinancials(rows,dataset.minor_units);
        if(!calculated.balanced)throw invalid();
        const fingerprint=hash(JSON.stringify([publishedAlgorithm,datasetId,dataset.content_fingerprint,dataset.settings_version_id]));
        await createFinancialDrafts(c,{scope:{tenant_id:t,entity_id:e},actor,period:dataset,rows,calculated,
          dataset:datasetId,fingerprint,complete:true,calculationVersion:publishedAlgorithm,
          publishMapping:mapping=>c.query('SELECT mizan_private.publish_trial_balance_mapping($1,$2,$3,$4,$5,$6)',
            [actor,sessionId,t,e,datasetId,mapping]),
        });
        await audit(c,req,t,e,'financial_reports.generated','dataset',datasetId,
          'Drafts from a published period trial balance with confirmed period earnings basis',{rows:rows.length,algorithm:publishedAlgorithm});
        return {datasetId,reused:false,outputs:await datasetOutputs(c,t,e,datasetId)};
      },{fresh:true});
      result(req,res,value,value.reused?200:201);
    }catch(error){next(error);}
  });
  router.post(base+'/imports/trial-balance',async(req,res,next)=>{
    try{
      const data=input.parse(req.body),{tenantId:t,entityId:e}=req.params;
      const value=await scoped(req,t,e,'imports.manage',async c=>{
        if(!(await c.query("SELECT mizan.has_permission($1,$2,$3,'outputs.prepare') AS ok",[t,e,req.principal.id])).rows[0].ok)throw new HttpError(403,'PERMISSION_DENIED','Financial preparation permission is required');
        if(!storage)throw new HttpError(503,'SOURCE_STORAGE_UNAVAILABLE','Private source storage is not configured');
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,42))',[e]);
        const scope={tenant_id:t,entity_id:e},actor=req.principal.id;
        const period=(await c.query(`SELECT p.id,p.status,p.settings_version_id,p.start_date::text,p.end_date::text,s.currency_code,s.effective_from::text,c.minor_units
          FROM mizan.accounting_periods p JOIN mizan.entity_settings_versions s ON (s.tenant_id,s.entity_id,s.id)=(p.tenant_id,p.entity_id,p.settings_version_id)
          JOIN mizan.currencies c ON c.code=s.currency_code WHERE p.tenant_id=$1 AND p.entity_id=$2 AND p.id=$3`,[t,e,data.periodId])).rows[0];
        if(!period)throw notFound();
        if(period.status!=='open')throw new HttpError(409,'PERIOD_NOT_OPEN','Import requires an open accounting period');
        if(period.effective_from>period.start_date)throw new HttpError(422,'SETTINGS_NOT_EFFECTIVE','Entity settings must be effective before the period starts');
        const rows=parseTrialBalance(data.csv,period.minor_units),calculated=calculateFinancials(rows,period.minor_units);
        const digest=hash(Buffer.from(data.csv,'utf8')),idempotency=hash(algorithm+':'+period.id+':'+digest);
        const prior=(await c.query('SELECT id FROM mizan.dataset_versions WHERE tenant_id=$1 AND entity_id=$2 AND idempotency_key=$3',[t,e,idempotency])).rows[0];
        async function response(id,reused){return {datasetId:id,reused,outputs:await datasetOutputs(c,t,e,id)};}
        if(prior)return response(prior.id,true);
        const fingerprint=hash(JSON.stringify({algorithm,period:period.id,settings:period.settings_version_id,digest}));
        let source=(await c.query('SELECT id,deleted_at,scan_status FROM mizan.source_files WHERE tenant_id=$1 AND entity_id=$2 AND sha256=$3',[t,e,digest])).rows[0];
        if(source&&(source.deleted_at||['infected','rejected'].includes(source.scan_status)))throw new HttpError(409,'SOURCE_UNAVAILABLE','This source cannot be reused');
        if(!source){
          source={id:randomUUID()};const key=`${t}/${e}/${source.id}.mzn`;
          await storage.put(key,Buffer.from(data.csv,'utf8'));
          await storage.verify(key,digest);
          await insert(c,'source_files',{...scope,id:source.id,sha256:digest,original_name:data.fileName,media_type:'text/csv',byte_size:Buffer.byteLength(data.csv,'utf8'),object_key:key,object_version:'1',encryption_key_reference:'source-v1',uploaded_by:actor,scan_status:'quarantined'});
        }
        const template=randomUUID(),batch=randomUUID(),dataset=randomUUID(),quality=randomUUID();
        await insert(c,'import_templates',{...scope,id:template,version:1,name:algorithm,required_columns:JSON.stringify(['accountCode','name','classification','signedDebitBalance']),column_mapping:JSON.stringify({account:'accountCode',amount:'signedDebitBalance'}),header_row:1,worksheet_name:'CSV',date_format:'ISO-8601',decimal_separator:'.',created_by:actor});
        await insert(c,'import_batches',{...scope,id:batch,source_file_id:source.id,template_id:template,period_id:period.id,parser_version:algorithm,data_type:'trial_balance',balance_basis:'period',range_start:period.start_date,range_end:period.end_date,idempotency_key:idempotency,status:'needs_review',complete_dataset:false});
        const previous=(await c.query("SELECT id,logical_dataset_id,version FROM mizan.dataset_versions WHERE tenant_id=$1 AND entity_id=$2 AND period_id=$3 AND data_type='trial_balance' ORDER BY version DESC,created_at DESC LIMIT 1",[t,e,period.id])).rows[0];
        await insert(c,'dataset_versions',{...scope,id:dataset,logical_dataset_id:previous?.logical_dataset_id??randomUUID(),version:(previous?.version??0)+1,predecessor_id:previous?.id??null,period_id:period.id,currency_code:period.currency_code,data_type:'trial_balance',content_fingerprint:fingerprint,status:'draft',complete_dataset:false,idempotency_key:idempotency});
        await insert(c,'dataset_imports',{...scope,id:randomUUID(),dataset_id:dataset,import_batch_id:batch});
        const now=new Date().toISOString();
        const existing=(await c.query('SELECT id,code,account_type FROM mizan.accounts WHERE tenant_id=$1 AND entity_id=$2 AND code=ANY($3::text[])',[t,e,rows.map(r=>r.code)])).rows;
        const accounts=new Map(existing.map(a=>[a.code,a]));
        const fresh=[];
        for(const row of rows){const type=row.classification.split('.')[0],account=accounts.get(row.code);if(account&&account.account_type!==type)throw new HttpError(409,'ACCOUNT_TYPE_CONFLICT','An existing account has a different account type');if(!account){const a={...scope,id:randomUUID(),created_at:now,code:row.code,name:row.name,account_type:type,active:true};accounts.set(row.code,a);fresh.push(a);}row.accountId=accounts.get(row.code).id;row.sourceId=randomUUID();}
        await bulk(c,'accounts',fresh);
        await bulk(c,'source_rows',rows.map(r=>({...scope,id:r.sourceId,created_at:now,import_batch_id:batch,worksheet:'CSV',row_number:r.rowNumber,original_values:{accountCode:r.code,name:r.name,classification:r.classification,signedDebitBalance:r.amount},row_fingerprint:hash(JSON.stringify([r.code,r.name,r.classification,r.amount]))})));
        await bulk(c,'row_dispositions',rows.map(r=>({...scope,id:randomUUID(),created_at:now,source_row_id:r.sourceId,version:1,disposition:'accepted',reason:'Structurally valid typed row; source remains quarantined',signed_effect:r.amount,actor_id:actor})));
        await bulk(c,'trial_balance_rows',rows.map(r=>({...scope,id:randomUUID(),created_at:now,dataset_id:dataset,source_row_id:r.sourceId,account_id:r.accountId,currency_code:period.currency_code,balance_type:'period',closing_balance:r.amount})));
        await insert(c,'quality_runs',{...scope,id:quality,import_batch_id:batch,rule_version:algorithm,content_fingerprint:fingerprint,records_read:rows.length,accepted:rows.length,rejected:0,excluded:0,totals_before:JSON.stringify({signedBalance:'0'}),totals_after:JSON.stringify({signedBalance:'0'})});
        await insert(c,'quality_issues',{...scope,id:randomUUID(),quality_run_id:quality,severity:'blocking',code:'MALWARE_SCAN_PENDING',message:'Structural CSV validation passed; antivirus scanning is not configured. Source remains quarantined.'});
        await createFinancialDrafts(c,{scope,actor,period,rows,calculated,dataset,fingerprint});
        await audit(c,req,t,e,'trial_balance.imported','dataset',dataset,'Explicit period-specific classified CSV; draft outputs only',{rows:rows.length,sourceId:source.id,sha256:digest,algorithm});
        return response(dataset,false);
      });result(req,res,value,201);
    }catch(error){next(error);}
  });
  router.get(base+'/reports/:reportId',async(req,res,next)=>{
    try{
      z.uuid().parse(req.params.reportId);const {tenantId:t,entityId:e,reportId:id}=req.params;
      result(req,res,await scoped(req,t,e,'reports.view',async c=>{
        const report=(await c.query("SELECT v.id,v.output_type,v.version,v.status,v.currency_code,v.period_id,v.content_fingerprint,p.start_date::text,p.end_date::text FROM mizan.output_versions v JOIN mizan.accounting_periods p ON (p.tenant_id,p.entity_id,p.id)=(v.tenant_id,v.entity_id,v.period_id) WHERE v.tenant_id=$1 AND v.entity_id=$2 AND v.id=$3 AND v.output_type IN ('analysis','income_statement','financial_position')",[t,e,id])).rows[0];if(!report)throw notFound();
        const args=[t,e,id];
        const lines=(await c.query('SELECT r.id,i.name AS code,r.value::text,r.value_state FROM mizan.report_lines r JOIN mizan.report_line_items i ON (i.tenant_id,i.entity_id,i.id)=(r.tenant_id,r.entity_id,r.line_item_id) WHERE r.tenant_id=$1 AND r.entity_id=$2 AND r.output_version_id=$3 ORDER BY r.display_order',args)).rows;
        const metrics=(await c.query('SELECT r.id,f.name,f.unit,f.expression,r.value::text,r.value_state,r.unavailable_reason,r.input_references FROM mizan.metric_results r JOIN mizan.formula_versions f ON (f.tenant_id,f.entity_id,f.id)=(r.tenant_id,r.entity_id,r.formula_version_id) WHERE r.tenant_id=$1 AND r.entity_id=$2 AND r.output_version_id=$3 ORDER BY f.formula_code',args)).rows;
        const checks=(await c.query('SELECT code,passed,message,evidence FROM mizan.validation_results WHERE tenant_id=$1 AND entity_id=$2 AND output_version_id=$3 AND validated_fingerprint=$4 ORDER BY code',[...args,report.content_fingerprint])).rows;
        const comparable=report.output_type!=='analysis'&&checks.some(check=>check.code==='completeness'&&check.passed&&check.evidence.algorithm===publishedAlgorithm);
        return {...report,lines,metrics,comparable,validations:checks.map(({code,passed,message})=>({code,passed,message}))};
      }));
    }catch(error){next(error);}
  });
  router.get(base+'/reports/:reportId/comparisons',async(req,res,next)=>{
    try{
      const {tenantId:t,entityId:e,reportId}=req.params;
      z.uuid().parse(reportId);
      const baselineId=z.uuid().optional().parse(req.query.baselineId)??null;
      const comparison=await scoped(req,t,e,'reports.view',async c=>{
        const {rows}=await c.query(`
          WITH eligible AS (
            SELECT v.id,v.output_type,v.version,v.status,v.currency_code,v.content_fingerprint,v.settings_version_id,
              p.start_date,p.end_date,k.minor_units,age((p.end_date+1)::timestamp,p.start_date::timestamp) AS duration
            FROM mizan.output_versions v JOIN mizan.accounting_periods p
              ON (p.tenant_id,p.entity_id,p.id)=(v.tenant_id,v.entity_id,v.period_id)
            JOIN mizan.currencies k ON k.code=v.currency_code
            WHERE v.tenant_id=$1 AND v.entity_id=$2 AND v.output_type IN ('income_statement','financial_position')
              AND EXISTS(SELECT 1 FROM mizan.validation_results q
                WHERE (q.tenant_id,q.entity_id,q.output_version_id,q.validated_fingerprint)=(v.tenant_id,v.entity_id,v.id,v.content_fingerprint)
                  AND q.code='completeness' AND q.passed AND q.evidence->>'algorithm'=$5)
          ), current_version AS (SELECT * FROM eligible WHERE id=$3)
          SELECT r.id,r.output_type,r.version,r.status,r.currency_code,r.content_fingerprint,r.settings_version_id,
                 r.start_date::text,r.end_date::text,r.minor_units,r.id=$3 AS is_current
          FROM eligible r CROSS JOIN current_version s WHERE r.id=$3 OR (
             r.output_type=s.output_type AND r.currency_code=s.currency_code AND r.settings_version_id=s.settings_version_id
             AND r.end_date<s.start_date AND extract(year FROM r.duration)=extract(year FROM s.duration)
             AND extract(month FROM r.duration)=extract(month FROM s.duration)
             AND extract(day FROM r.duration)=extract(day FROM s.duration)
             AND ($4::uuid IS NULL OR r.id=$4))
          ORDER BY is_current DESC,r.end_date DESC,r.version DESC,r.id LIMIT 51
        `,[t,e,reportId,baselineId,publishedAlgorithm]);
        const [current,...baselines]=rows;
        if(!current)throw notFound();
        const publicVersion=({is_current,minor_units,...version})=>version;
        if(!baselineId)return baselines.map(publicVersion);
        const [baseline]=baselines;
        if(!baseline)throw new HttpError(422,'INCOMPATIBLE_COMPARISON','Choose an earlier period of matching duration, report type, settings and currency');
        const {rows:lines}=await c.query(`
          SELECT r.output_version_id,i.name AS code,trunc(r.value,$5)::text AS value
          FROM mizan.report_lines r JOIN mizan.report_line_items i
            ON (i.tenant_id,i.entity_id,i.id)=(r.tenant_id,r.entity_id,r.line_item_id)
          WHERE r.tenant_id=$1 AND r.entity_id=$2 AND r.output_version_id IN ($3,$4)
            AND r.value_state='available' ORDER BY r.display_order,r.id
        `,[t,e,reportId,baselineId,current.minor_units]);
        const byVersion=id=>new Map(lines.filter(line=>line.output_version_id===id).map(line=>[line.code,line.value]));
        const currentLines=byVersion(reportId), baselineLines=byVersion(baselineId);
        return {entityId:e,current:publicVersion(current),baseline:publicVersion(baseline),calculationPolicy:publishedAlgorithm,
          lines:types[current.output_type].map(code=>{
            const value=currentLines.get(code)??null,baseValue=baselineLines.get(code)??null;
            const [amount,reference]=[value,baseValue].map(v=>v===null?null:parseDecimal(v,current.minor_units));
            return {code,current:value,baseline:baseValue,
              variance:amount&&reference?formatDec(subDec(amount,reference),current.minor_units):null,
              percent:amount&&reference?percentageVarianceDec(amount,reference):null,
              unavailableReason:!amount||!reference?'missing_value':reference.units===0n?'zero_baseline':null,
            };
          }),
        };
      });
      result(req,res,comparison);
    }catch(error){next(error);}
  });
  router.get(base+'/reports/:reportId/lines/:lineId/sources',async(req,res,next)=>{
    try{const {tenantId:t,entityId:e,reportId:id,lineId}=req.params;z.uuid().parse(id);z.uuid().parse(lineId);result(req,res,await scoped(req,t,e,'reports.view',async c=>(await c.query(`SELECT s.id,s.row_number,s.original_values,l.contribution::text,b.id AS import_id,f.sha256,f.original_name,f.scan_status,
        f.deleted_at,x.id AS transformation_id,x.version,x.derived_values
      FROM mizan.report_line_sources l JOIN mizan.report_lines r ON (r.tenant_id,r.entity_id,r.id)=(l.tenant_id,l.entity_id,l.report_line_id)
      JOIN mizan.source_rows s ON (s.tenant_id,s.entity_id,s.id)=(l.tenant_id,l.entity_id,l.source_row_id)
      JOIN mizan.import_batches b ON (b.tenant_id,b.entity_id,b.id)=(s.tenant_id,s.entity_id,s.import_batch_id)
      JOIN mizan.source_files f ON (f.tenant_id,f.entity_id,f.id)=(b.tenant_id,b.entity_id,b.source_file_id)
      LEFT JOIN mizan.row_transformations x ON (x.tenant_id,x.entity_id,x.source_row_id,x.id)=(l.tenant_id,l.entity_id,l.source_row_id,l.transformation_id)
      WHERE r.tenant_id=$1 AND r.entity_id=$2 AND r.output_version_id=$3 AND r.id=$4 ORDER BY s.row_number,s.id LIMIT 5000`,[t,e,id,lineId])).rows.map(row=>{
        const {original_values,derived_values,version,deleted_at,...visible}=row;
        if(deleted_at || ['infected','rejected'].includes(row.scan_status))return {...visible,original_values:null};
        if(!original_values.sealed)return {...visible,original_values};
        if(row.scan_status!=='clean')return {...visible,original_values:null};
        return {...visible,original_values:evidenceValues(sourceValues(t,e,row.id,original_values,0)),
          effective_values:derived_values?evidenceValues(sourceValues(t,e,row.id,derived_values,version)):null};
      })));}catch(error){next(error);}
  });
}
