import {loadEnv} from 'vite';
import {writeFile} from 'node:fs/promises';
import {database} from '../server/database.mjs';
import {auditRows} from '../server/audit-routes.mjs';
for(const [k,v] of Object.entries(loadEnv('development',process.cwd(),'')))if(process.env[k]===undefined)process.env[k]=v;
let pool,c;const checks=[],id='00000000-0000-4000-8000-000000000000';
try{pool=database(process.env.APP_DATABASE_URL);c=await pool.connect();await c.query('BEGIN READ ONLY');
 for(const cursor of [null,{time:'2026-11-10T12:00:00.123456Z',id}]){await auditRows(c,id,[],{},51,cursor);checks.push({name:cursor?'cursor query':'first-page query',passed:true});}
}catch(error){checks.push({name:'application-role SQL verification',passed:false,code:/^[0-9A-Z]{5}$/.test(error.code??'')?error.code:'UNAVAILABLE'});process.exitCode=1;}
finally{if(c){await c.query('ROLLBACK').catch(()=>{});c.release();}await pool?.end();}
const evidence={checkedAt:new Date().toISOString(),scope:'Read-only application-role queries with nonexistent tenant; no users or audit events created. Positive authenticated exports remain unverified.',checks};
await writeFile(new URL('./audit-readonly.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
