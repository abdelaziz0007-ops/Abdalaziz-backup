import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {once} from 'node:events';
import express from 'express';
import {database} from '../server/database.mjs';
import {mountDataLifecycleRoutes} from '../server/data-lifecycle-routes.mjs';

const {branch}=JSON.parse(await readFile('.neon','utf8'));
assert.equal(branch,'codex-backend-completion');
const pool=database(parseEnv(await readFile('.env.local','utf8')).DATABASE_URL_UNPOOLED);
const c=await pool.connect();
const checks=[];
class HttpError extends Error {
  constructor(status,code,message){super(message);Object.assign(this,{status,code});}
}
let server;
try{
  await c.query('BEGIN');
  const {rows:[scope]}=await c.query(`
    SELECT e.tenant_id AS tenant,e.id AS entity,t.owner_user_id AS owner
    FROM mizan.legal_entities e JOIN mizan.tenants t ON t.id=e.tenant_id
    JOIN mizan.app_users u ON u.id=t.owner_user_id
    WHERE t.status='active' AND e.status='active' AND u.email LIKE 'synthetic-%@example.invalid'
    ORDER BY e.created_at DESC LIMIT 1
  `);
  assert(scope,'An isolated synthetic workspace is required');
  const {tenant,entity,owner}=scope;
  await c.query("SELECT set_config('mizan.tenant_id',$1,true),set_config('mizan.entity_ids',$2,true)",[tenant,entity]);
  async function person(privacy,minutes=0){
    const id=randomUUID(),sessionId=randomUUID(),member=randomUUID();
    await c.query(`
      INSERT INTO mizan.app_users(id,identity_provider,provider_subject,email,display_name,mfa_enabled)
      VALUES($1::uuid,'verification',$1::uuid::text,$1::uuid::text||'@example.invalid','Synthetic privacy fixture',true);
    `,[id]);
    await c.query("INSERT INTO mizan.memberships(id,tenant_id,user_id,status) VALUES($1,$2,$3,'active')",[member,tenant,id]);
    if(privacy)await c.query("INSERT INTO mizan.access_grants(tenant_id,membership_id,permission_code,entity_id,granted_by) VALUES($1,$2,'privacy.manage',$3,$4)",[tenant,member,entity,owner]);
    await c.query(`
      INSERT INTO mizan.user_sessions(id,user_id,provider_session_hash,authenticated_at,mfa_verified_at,expires_at)
      VALUES($1::uuid,$2,encode(sha256(convert_to($1::uuid::text,'UTF8')),'hex'),now()-make_interval(mins=>$3),
        now()-make_interval(mins=>$3),now()+interval '30 minutes')
    `,[sessionId,id,minutes]);
    return {id,sessionId};
  }
  const author=await person(true), reviewer=await person(true), outsider=await person(false), stale=await person(true,20);
  const app=express();
  app.use(express.json());
  const actors={author,reviewer,outsider,stale};
  mountDataLifecycleRoutes(app,{
    HttpError,
    result:(_req,res,data,status=200)=>res.status(status).json(data),
    scoped:async(req,t,e,permission,callback)=>{
      req.principal=actors[req.headers['x-fixture-actor']];
      req.requestId=randomUUID();
      if(t!==tenant||e&&e!==entity)throw new HttpError(404,'RESOURCE_NOT_FOUND','Out of scope');
      const {rows:[context]}=await c.query('SELECT mizan_private.workspace_context($1,$2) AS value',[req.principal.id,t]);
      if(e&&!context.value?.entityIds.includes(e))throw new HttpError(404,'RESOURCE_NOT_FOUND','Out of scope');
      const {rows:[access]}=await c.query('SELECT mizan.has_permission($1,$2,$3,$4) AS allowed',[t,e,req.principal.id,permission]);
      if(!access.allowed)throw new HttpError(403,'PERMISSION_DENIED','Privacy access required');
      await c.query('SAVEPOINT privacy_request');
      try{return await callback(c);}
      catch(error){await c.query('ROLLBACK TO SAVEPOINT privacy_request');throw error;}
      finally{await c.query('RELEASE SAVEPOINT privacy_request');}
    },
  });
  app.use((error,_req,res,_next)=>{
    const status=error.status??({'42501':403,'23514':422}[error.code]??500);
    if(status===500)console.error(error.message);
    res.status(status).json({code:error.code});
  });
  server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  const root='http://127.0.0.1:'+server.address().port+'/tenants/'+tenant;
  const path='/entities/'+entity+'/data-lifecycle';
  async function request(actor,endpoint,body,expected=200){
    const response=await fetch(root+endpoint,{method:body?'POST':'GET',headers:{'x-fixture-actor':actor,'content-type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{})});
    const value=await response.json();
    assert.equal(response.status,expected,JSON.stringify(value));
    return value;
  }
  const body={type:'delete',reason:'Synthetic test of a scoped deletion request',requestKey:randomUUID()};
  await request('outsider',path,body,404);
  await request('author','/data-lifecycle',body,403);
  await request('stale',path,body,403);
  const pending=await request('author',path,body,201);
  assert.equal(pending.status,'requested');
  assert.equal((await request('author',path,body)).id,pending.id);
  await request('author',path,{...body,type:'export'},422);
  checks.push('Privacy-only grant opens the entity, blocks workspace escalation and stale MFA, and deduplicates requests');
  const decisionPath=path+'/'+pending.id+'/decision';
  const decision={action:'authorize',reason:'Independent authority verified for this test scope',requestKey:randomUUID()};
  assert.equal((await request('author',decisionPath,decision,403)).code,'INDEPENDENT_DECISION_REQUIRED');
  assert.equal((await request('reviewer',decisionPath,decision)).status,'authorized');
  assert.equal((await request('reviewer',decisionPath,decision)).reused,true);
  await request('reviewer',decisionPath,{...decision,action:'reject',requestKey:randomUUID()},409);
  const listed=await request('reviewer',path);
  assert.equal(listed.find(item=>item.id===pending.id).decision_reason,decision.reason);
  const {rows:[evidence]}=await c.query(`
    SELECT r.authorized_by,r.completed_at,
      (SELECT count(*)::int FROM mizan.deletion_manifest d WHERE d.request_id=r.id) AS deleted_resources,
      (SELECT count(*)::int FROM mizan.audit_events a WHERE a.tenant_id=r.tenant_id AND a.object_id=r.id
        AND a.action IN ('privacy.requested','privacy.authorized')) AS audit_events
    FROM mizan.data_lifecycle_requests r WHERE r.id=$1
  `,[pending.id]);
  assert.deepEqual(evidence,{authorized_by:reviewer.id,completed_at:null,deleted_resources:0,audit_events:2});
  checks.push('Independent authorization is auditable and idempotent and does not execute deletion');
  const exported=await request('author',path,{...body,type:'export',requestKey:randomUUID()},201);
  assert.equal((await request('reviewer',path+'/'+exported.id+'/decision',{...decision,action:'reject',requestKey:randomUUID()})).status,'rejected');
  checks.push('Export requests can be independently rejected with the recorded reason');
  await c.query(`
    INSERT INTO mizan.access_grants(tenant_id,membership_id,permission_code,granted_by)
    SELECT tenant_id,id,'privacy.manage',$3 FROM mizan.memberships WHERE tenant_id=$1 AND user_id=$2
  `,[tenant,reviewer.id,owner]);
  const wholeWorkspace=await request('reviewer','/data-lifecycle',{...body,type:'export',requestKey:randomUUID()},201);
  assert((await request('reviewer','/data-lifecycle')).some(item=>item.id===wholeWorkspace.id));
  assert(!(await request('reviewer',path)).some(item=>item.id===wholeWorkspace.id));
  assert(!(await request('reviewer','/data-lifecycle')).some(item=>item.id===pending.id));
  checks.push('Workspace-wide and entity-specific requests are kept in separate scopes');
  await c.query('ROLLBACK');
  assert.equal((await c.query('SELECT count(*)::int AS n FROM mizan.data_lifecycle_requests WHERE id=$1',[pending.id])).rows[0].n,0);
  await writeFile('verification/data-lifecycle-api.json',JSON.stringify({branch,checks,rolledBack:true},null,2)+'\n');
  console.log('Data lifecycle: '+checks.length+' transactional checks passed');
}finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  await c.query('ROLLBACK').catch(()=>{});
  c.release();
  await pool.end();
}
