import {readFile,writeFile} from 'node:fs/promises';import {loadEnv} from 'vite';import {database} from '../server/database.mjs';
if(JSON.parse(await readFile('.neon','utf8')).branch!=='codex-backend-completion')throw Error('Development branch required');
const p=database(loadEnv('development',process.cwd(),'').DATABASE_URL_UNPOOLED),checks=[];
const tenant='10000000-0000-4000-8000-000000000001',plan='10000000-0000-4000-8000-000000000002',job='10000000-0000-4000-8000-000000000003';
try{const c=await p.connect();try{
 await c.query('BEGIN');
 // Transaction-local tables only: no application users or persistent test records.
 for(const table of ['subscriptions','plan_versions','processing_jobs'])await c.query('CREATE TEMP TABLE '+table+' (LIKE mizan.'+table+' INCLUDING DEFAULTS) ON COMMIT DROP');
 let sql=await readFile('migrations/035_billing_capacity.sql','utf8');sql=sql.slice(sql.indexOf('CREATE FUNCTION'),sql.indexOf('CREATE FUNCTION mizan_private.guard_scan_plan_capacity'));
 sql=sql.replaceAll('mizan_private.assert_scan_plan_capacity','pg_temp.assert_scan_plan_capacity').replaceAll('mizan.subscriptions','pg_temp.subscriptions').replaceAll('mizan.plan_versions','pg_temp.plan_versions').replaceAll('mizan.processing_jobs','pg_temp.processing_jobs');
 await c.query(sql);
 async function check(name,expected,exclude=null){await c.query('SAVEPOINT scenario');let code=null;try{await c.query('SELECT pg_temp.assert_scan_plan_capacity($1,$2,clock_timestamp())',[tenant,exclude]);}catch(e){code=e.code;}finally{await c.query('ROLLBACK TO SAVEPOINT scenario');await c.query('RELEASE SAVEPOINT scenario');}checks.push({name,passed:code===expected,code});}
 await check('no_subscription_beta',null);
 await c.query("INSERT INTO pg_temp.plan_versions(id,code,version,name,limits,published_at) VALUES($1,'isolated',1,'Isolated test',jsonb_build_object('scan_jobs_per_period',1),now())",[plan]);
 await c.query("INSERT INTO pg_temp.subscriptions(tenant_id,plan_version_id,status,current_period_start,current_period_end) VALUES($1,$2,'active',now()-interval '1 day',now()+interval '1 day')",[tenant,plan]);
 await check('available_capacity',null);
 await c.query("INSERT INTO pg_temp.processing_jobs(id,tenant_id,entity_id,job_type,idempotency_key,status,requested_by,input_references) VALUES($1,$2,$2,'file_scan','isolated','queued',$2,'{}')",[job,tenant]);
 await check('exhausted_capacity','P0043');await check('retry_not_double_counted',null,job);
 await c.query("UPDATE pg_temp.processing_jobs SET status='cancelled'");await check('cancellation_no_refund','P0043');
 await c.query("UPDATE pg_temp.subscriptions SET status='suspended'");await check('suspended_subscription','P0041');
 await c.query("UPDATE pg_temp.subscriptions SET status='active',current_period_end=now()-interval '1 hour'");await check('expired_subscription','P0041');
 await c.query("UPDATE pg_temp.subscriptions SET current_period_end=now()+interval '1 day'; UPDATE pg_temp.plan_versions SET limits='{}'");await check('missing_quota','P0042');
 await c.query("UPDATE pg_temp.plan_versions SET limits=jsonb_build_object('scan_jobs_per_period',0)");await check('zero_allowance','P0043');
 await c.query("UPDATE pg_temp.plan_versions SET published_at=NULL");await check('unpublished_plan','P0042');
 }finally{await c.query('ROLLBACK');c.release();}}catch(e){checks.push({name:'setup_or_query',passed:false,code:e.code??'ERROR',message:e.message});}finally{await p.end();}
const report={checkedAt:new Date().toISOString(),scope:'Quota function body exercised against transaction-local temporary tables; rolled back. No accounts or persistent application records created. Does not prove concurrency or real subscription acceptance.',checks};await writeFile('verification/billing-isolated.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(checks.some(c=>!c.passed))process.exitCode=1;
