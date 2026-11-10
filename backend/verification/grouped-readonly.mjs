import {loadEnv} from 'vite';
import {writeFile} from 'node:fs/promises';
import {database} from '../server/database.mjs';
import {mountGroupedSuggestionRoutes} from '../server/grouped-suggestions.mjs';
for(const [k,v] of Object.entries(loadEnv('development',process.cwd(),'')))if(process.env[k]===undefined)process.env[k]=v;
const id='00000000-0000-4000-8000-000000000000',queries=[];let handler;
class HttpError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
mountGroupedSuggestionRoutes({get:(_path,fn)=>{handler=fn;}},{HttpError,result:()=>{},scoped:async(_req,_t,_e,_permission,fn)=>fn({query:async(sql,args)=>{queries.push([sql,args]);return {rows:queries.length===1?[{bank_dataset_id:id,book_dataset_id:id,bank_account_id:id,content_fingerprint:'0'.repeat(64),minor_units:2}]:[]};}})});
await handler({params:{tenantId:id,entityId:id,reconciliationId:id},principal:{id}}, {},error=>{throw error;});
const pool=database(process.env.APP_DATABASE_URL),c=await pool.connect(),checks=[];
try{await c.query('BEGIN READ ONLY');for(const [i,[sql,args]] of queries.entries()){await c.query(sql,args);checks.push({name:'scoped query '+(i+1),passed:true});}}
finally{await c.query('ROLLBACK');c.release();await pool.end();}
const evidence={checkedAt:new Date().toISOString(),scope:'Read-only SQL execution using application role and nonexistent scope; no accounts or movements created. Positive authenticated workflow not verified.',checks};
await writeFile(new URL('./grouped-readonly.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
