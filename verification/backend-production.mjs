import assert from 'node:assert/strict';
import { readFile,readdir,writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { database } from '../server/database.mjs';
import { Files } from 'files-sdk';
import { neon } from 'files-sdk/neon';
const linked=JSON.parse(await readFile('.neon','utf8'));assert.equal(linked.branch,'production');
const env=parseEnv(await readFile('.env.local','utf8')),base=process.env.TEST_BASE_URL||'http://localhost:5174',passed=[];
for(const [key,value] of Object.entries(env))if(process.env[key]===undefined)process.env[key]=value;
const health=await fetch(base+'/api/v1/health');assert.equal(health.status,200);assert.equal((await health.json()).data.status,'ok');
const auth=await fetch(base+'/api/auth/ok');assert.equal(auth.status,200);passed.push('Real production-backed API and identity endpoints respond successfully');
for(const path of ['/api/v1/me','/api/v1/tenants'])assert.equal((await fetch(base+path)).status,401);passed.push('Production protected endpoints reject signed-out access');
const pool=database(env.APP_DATABASE_URL);
try{
 const role=(await pool.query('SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];assert(Object.values(role).every(v=>v===false));
 for(const table of ['accounting_periods','dataset_versions','trial_balance_rows','report_lines','metric_results','source_files','bank_accounts','bank_transactions','book_transactions','reconciliations','match_groups','match_group_members','allocations','match_decisions'])assert.equal((await pool.query(`SELECT count(*)::int AS n FROM mizan.${table}`)).rows[0].n,0);
 passed.push('Production application role is limited and RLS hides financial and bank rows without verified context');
 const index=(await pool.query("SELECT indisunique,indisvalid FROM pg_index WHERE indexrelid='mizan.match_decision_request_once'::regclass")).rows[0];assert(index?.indisunique&&index.indisvalid);
 const locked=(await pool.query("SELECT has_column_privilege(current_user,'mizan.output_versions','status','UPDATE') AS approve,has_column_privilege(current_user,'mizan.source_files','scan_status','UPDATE') AS scan")).rows[0];assert.equal(locked.approve,false);assert.equal(locked.scan,false);
 passed.push('Production decision request index is unique/valid; runtime cannot approve outputs or mark sources clean');
}finally{await pool.end();}
const files=new Files({adapter:neon({bucket:'financial-sources'})});
await files.list({prefix:'__mizan_read_only_probe__/'});
const anonymousStorage=await fetch(env.AWS_ENDPOINT_URL_S3+'/financial-sources/');assert([401,403].includes(anonymousStorage.status));
passed.push('Production private bucket accepts authenticated read-only listing and denies anonymous access');
let assets=0;
for(const name of await readdir('dist/assets')){
 if(!/\.(js|css)$/.test(name))continue;
 const text=await readFile('dist/assets/'+name,'utf8');
 for(const key of ['DATABASE_URL','DATABASE_URL_UNPOOLED','APP_DATABASE_URL','AUTH_DATABASE_URL','BETTER_AUTH_SECRET','SOURCE_ENCRYPTION_KEY','AWS_SECRET_ACCESS_KEY','AWS_ACCESS_KEY_ID'])assert(!env[key]||!text.includes(env[key]),'Server-only configuration leaked to built assets');assets++;
}
passed.push(`No database URLs or auth secret in ${assets} built JS/CSS assets`);
await writeFile('verification/backend-production.json',JSON.stringify({branch:linked.branch,passed,errors:[],readOnly:true,testAccountsSeeded:false},null,2)+'\n');
console.log('Backend production: '+passed.length+' read-only checks passed; no test accounts seeded');
