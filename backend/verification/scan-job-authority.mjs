import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {database} from '../server/database.mjs';
const linked=JSON.parse(await readFile('.neon','utf8'));assert.equal(linked.branch,'codex-backend-completion');const env=parseEnv(await readFile('.env.local','utf8')),pool=database(env.DATABASE_URL_UNPOOLED),c=await pool.connect();
try{
 const fixture=(await c.query("SELECT j.tenant_id,j.entity_id,j.requested_by,j.input_references FROM mizan.processing_jobs j JOIN mizan.app_users u ON u.id=j.requested_by WHERE j.job_type='file_scan' AND u.email LIKE 'synthetic-scan-%@example.invalid' ORDER BY j.created_at DESC LIMIT 1")).rows[0];assert(fixture,'Run scan-jobs-api first');
 await c.query('BEGIN');const user=fixture.requested_by,id=randomUUID();assert.equal((await c.query("SELECT mizan.has_permission($1,$2,$3,'imports.manage') AS ok",[fixture.tenant_id,fixture.entity_id,user])).rows[0].ok,true);
 await c.query("UPDATE mizan.app_users SET status='suspended' WHERE id=$1",[user]);assert.equal((await c.query("SELECT mizan.has_permission($1,$2,$3,'imports.manage') AS ok",[fixture.tenant_id,fixture.entity_id,user])).rows[0].ok,false);
 await c.query("INSERT INTO mizan.processing_jobs(id,tenant_id,entity_id,job_type,idempotency_key,status,requested_by,input_references) VALUES($1,$2,$3,'file_scan',$4,'queued',$5,$6)",[id,fixture.tenant_id,fixture.entity_id,'rolled-back-authority:'+id,user,fixture.input_references]);
 assert.equal((await c.query("SELECT mizan_private.claim_scan_job('authority-rollback-probe') AS value")).rows[0].value,null);const job=(await c.query('SELECT status,error_code FROM mizan.processing_jobs WHERE id=$1',[id])).rows[0];assert.equal(job.status,'cancelled');assert.equal(job.error_code,'AUTHORITY_REVOKED_OR_CANCELLED');
 await c.query('ROLLBACK');assert.equal((await c.query('SELECT status FROM mizan.app_users WHERE id=$1',[user])).rows[0].status,'active');assert.equal((await c.query('SELECT count(*)::int AS n FROM mizan.processing_jobs WHERE id=$1',[id])).rows[0].n,0);
 await writeFile('verification/scan-job-authority.json',JSON.stringify({branch:linked.branch,passed:['Global suspension overrides retained tenant grants','Queued work from a suspended requester is cancelled before storage access','Controlled suspension/job fixture is completely rolled back'],errors:[],rolledBack:true,providerScanSimulated:false},null,2)+'\n');console.log('Scan authority: 3 transactional checks passed; fixture rolled back');
}finally{await c.query('ROLLBACK').catch(()=>{});c.release();await pool.end();}
