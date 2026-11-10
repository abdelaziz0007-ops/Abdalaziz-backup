import {loadEnv} from 'vite';
import {writeFile} from 'node:fs/promises';
import {database} from '../server/database.mjs';
import {exportSections} from '../server/privacy-export.mjs';
const p=database(loadEnv('development',process.cwd(),'').APP_DATABASE_URL),checks=[];
try{
 const c=await p.connect();try{
 for(const [name,sql] of [
 ['retention_controls','SELECT mizan_private.retention_controls(NULL,NULL,NULL,NULL)'],
 ['retention_action',"SELECT mizan_private.retention_action(NULL,NULL,NULL,NULL,NULL,'hold','{}'::jsonb,NULL,NULL)"],
 ['record_privacy_export',"SELECT mizan_private.record_privacy_export(NULL,NULL,NULL,NULL,NULL,repeat('a',64),NULL)"]
 ]){await c.query('BEGIN READ ONLY');let code=null;try{await c.query(sql);}catch(e){code=e.code;}finally{await c.query('ROLLBACK');}checks.push({name,passed:code==='42501',code});}
 await c.query('BEGIN READ ONLY');
 try{for(const s of exportSections){await c.query('SELECT '+s.fields+' FROM mizan.'+s.table+' WHERE tenant_id=$1 AND entity_id=$2'+(s.where??'')+' ORDER BY id LIMIT $3',[null,null,1]);checks.push({name:'export_columns_'+s.name,passed:true});}}finally{await c.query('ROLLBACK');}
 }finally{c.release();}
}catch(e){checks.push({name:'connection_or_query',passed:false,code:e.code??'ERROR'});}finally{await p.end();}
const report={checkedAt:new Date().toISOString(),scope:'Read-only schema and missing-session checks; no accounts created and no positive acceptance flows executed',checks};
await writeFile('verification/retention-export-readonly.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(checks.some(c=>!c.passed))process.exitCode=1;
