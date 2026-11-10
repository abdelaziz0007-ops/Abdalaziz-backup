import {loadEnv} from 'vite';import {writeFile} from 'node:fs/promises';import {database} from '../server/database.mjs';
const p=database(loadEnv('development',process.cwd(),'').APP_DATABASE_URL),checks=[];
try{const c=await p.connect();try{
 for(const [name,sql] of [['billing_overview','SELECT mizan_private.billing_overview(NULL,NULL,NULL)'],['upload_capacity','SELECT mizan_private.scan_capacity_for_upload(NULL,NULL,NULL,NULL)']]){
 await c.query('BEGIN READ ONLY');let code=null;try{await c.query(sql);}catch(e){code=e.code;}finally{await c.query('ROLLBACK');}checks.push({name,passed:code==='42501',code});}
 const {rows}=await c.query("SELECT p.proname,NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS private FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='mizan_private' AND p.proname=ANY($1::text[])",[['billing_overview','scan_capacity_for_upload','assert_scan_plan_capacity','guard_scan_plan_capacity']]);
 checks.push({name:'no_public_execute',passed:rows.length===4&&rows.every(r=>r.private)});
 const trigger=(await c.query("SELECT 1 FROM pg_trigger WHERE tgname='scan_plan_capacity' AND tgenabled='O'")).rowCount;checks.push({name:'quota_trigger_enabled',passed:trigger===1});
 }finally{c.release();}}catch(e){checks.push({name:'connection_or_query',passed:false,code:e.code??'ERROR'});}finally{await p.end();}
const report={checkedAt:new Date().toISOString(),scope:'Read-only denial and privilege checks only; no accounts, subscriptions or invoices created. Paid flows and concurrent quota acceptance untested.',checks};await writeFile('verification/billing-readonly.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(checks.some(c=>!c.passed))process.exitCode=1;
