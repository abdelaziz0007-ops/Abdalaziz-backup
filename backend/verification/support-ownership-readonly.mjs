import {loadEnv} from 'vite';
import {writeFile} from 'node:fs/promises';
import {database} from '../server/database.mjs';
const env=loadEnv('development',process.cwd(),'');
const pool=database(env.APP_DATABASE_URL);
const checks=[];
try {
 const c=await pool.connect();
 try {
  for(const [name,sql] of [
   ['support_grants','SELECT mizan_private.support_grants_for_user(NULL,NULL)'],
   ['support_read',"SELECT mizan_private.support_read_output(NULL,NULL,NULL,NULL,'Investigation purpose',NULL)"],
   ['ownership_status','SELECT mizan_private.ownership_status(NULL,NULL,NULL)'],
   ['ownership_action',"SELECT mizan_private.ownership_action(NULL,NULL,NULL,NULL,'accept',NULL,'Ownership transfer',true,NULL,NULL)"]
  ]) {
   await c.query('BEGIN READ ONLY');
   let code=null;
   try{await c.query(sql);}catch(e){code=e.code;}finally{await c.query('ROLLBACK');}
   checks.push({name,rejected:code==='42501',code});
  }
 } finally {c.release();}
 const report={checkedAt:new Date().toISOString(),scope:'Missing-session denial only; no accounts created or successful user workflows exercised',checks};
 await writeFile('verification/support-ownership-readonly.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
 if(checks.some(c=>!c.rejected))process.exitCode=1;
}catch(e){const report={checkedAt:new Date().toISOString(),passed:false,code:e.code??'CONNECTION_FAILED',checks};await writeFile('verification/support-ownership-readonly.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));process.exitCode=1;}finally{await pool.end();}
