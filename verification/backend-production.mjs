import assert from 'node:assert/strict';
import { readFile,readdir,writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { database } from '../server/database.mjs';
const linked=JSON.parse(await readFile('.neon','utf8'));assert.equal(linked.branch,'production');
const env=parseEnv(await readFile('.env.local','utf8')),base=process.env.TEST_BASE_URL||'http://localhost:5174',passed=[];
const health=await fetch(base+'/api/v1/health');assert.equal(health.status,200);assert.equal((await health.json()).data.status,'ok');
const auth=await fetch(base+'/api/auth/ok');assert.equal(auth.status,200);passed.push('Real production-backed API and identity endpoints respond successfully');
for(const path of ['/api/v1/me','/api/v1/tenants'])assert.equal((await fetch(base+path)).status,401);passed.push('Production protected endpoints reject signed-out access');
const pool=database(env.APP_DATABASE_URL);
try{
 const role=(await pool.query('SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];assert(Object.values(role).every(v=>v===false));
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM mizan.accounting_periods')).rows[0].n,0);
 passed.push('Production application role is limited and RLS hides all periods without verified context');
}finally{await pool.end();}
let assets=0;
for(const name of await readdir('dist/assets')){
 if(!/\.(js|css)$/.test(name))continue;
 const text=await readFile('dist/assets/'+name,'utf8');
 for(const key of ['DATABASE_URL','DATABASE_URL_UNPOOLED','APP_DATABASE_URL','AUTH_DATABASE_URL','BETTER_AUTH_SECRET'])assert(!env[key]||!text.includes(env[key]),'Server-only configuration leaked to built assets');assets++;
}
passed.push(`No database URLs or auth secret in ${assets} built JS/CSS assets`);
await writeFile('verification/backend-production.json',JSON.stringify({branch:linked.branch,passed,errors:[],readOnly:true,testAccountsSeeded:false},null,2)+'\n');
console.log('Backend production: '+passed.length+' read-only checks passed; no test accounts seeded');
