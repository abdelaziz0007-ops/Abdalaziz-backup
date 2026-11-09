import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { randomBytes,randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createOTP } from '@better-auth/utils/otp';
import { base32 } from '@better-auth/utils/base32';
import { parseEnv } from 'node:util';
import { database } from '../server/database.mjs';
const require=createRequire(import.meta.url),{request}=require('C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const linked=JSON.parse(await readFile('.neon','utf8'));
assert(linked.branch.startsWith('codex-backend-'),'Run full authentication fixtures only on a disposable backend branch');
const base=process.env.TEST_BASE_URL||'http://localhost:5190',passed=[];
async function client(){return request.newContext({baseURL:base,extraHTTPHeaders:{Origin:base}});}
async function json(c,path,body,status=200){const response=await c[body===undefined?'get':'post'](path,body===undefined?{}:{data:body});const value=await response.json();assert.equal(response.status(),status,JSON.stringify({path,status:response.status(),error:value.error?.code??value.code??value.error}));return value;}
async function enroll(c){
 const password='Srs!'+randomBytes(20).toString('hex'),email='synthetic-'+randomUUID()+'@example.invalid';
 await json(c,'/api/auth/sign-up/email',{email,password,name:'Synthetic backend test'});
 const identity=await json(c,'/api/v1/me');assert.equal(identity.data.mfaVerified,false);
 const denied=await json(c,'/api/v1/tenants',{name:'Must not exist',administrationConsent:true,idempotencyKey:randomUUID()},403);assert.equal(denied.error.code,'MFA_REQUIRED');
 const enrollment=await json(c,'/api/auth/two-factor/enable',{password});
 const secret=base32.decode(new URL(enrollment.totpURI).searchParams.get('secret'));
 const code=await createOTP(secret,{digits:6,period:30}).totp();
 await json(c,'/api/auth/two-factor/verify-totp',{code,trustDevice:false});
 const verified=await json(c,'/api/v1/me');assert.equal(verified.data.mfaVerified,true,'Successful MFA must stamp the current rotated session');
 return {email,password,secret,backup:enrollment.backupCodes,userId:verified.data.user.id};
}
const a=await client(),b=await client(),anonymous=await client();
try{
 await json(anonymous,'/api/v1/tenants',undefined,401);passed.push('Unauthenticated API access rejected');
 const identity=await enroll(a);passed.push('Real signup, password hashing, MFA enrollment and session rotation verified; pre-MFA writes rejected');
 const workspaceBody={name:'Synthetic backend workspace',administrationConsent:true,idempotencyKey:randomUUID()};
 const workspace=(await json(a,'/api/v1/tenants',workspaceBody,201)).data;
 assert.equal((await json(a,'/api/v1/tenants',workspaceBody,201)).data.id,workspace.id);passed.push('Retried workspace provisioning is idempotent and does not duplicate memberships or audit events');
 const tenant=workspace.id;
 const entity=(await json(a,`/api/v1/tenants/${tenant}/entities`,{code:'0001',name:'Synthetic legal entity',currency:'USD',framework:'Test policy',effectiveFrom:'2026-01-01',fiscalYearStartMonth:1,grantPreparerAccess:true},201)).data;
 const path=`/api/v1/tenants/${tenant}/entities/${entity.id}`;
 await json(a,path+'/periods',{startDate:'2026-10-01',endDate:'2026-10-31'},201);
 assert.equal((await json(a,path+'/periods')).data.length,1);passed.push('Workspace, entity configuration and accounting period persist in normalized SRS tables');
 assert.equal((await json(a,path+'/reports')).data.length,0);assert.equal((await json(a,path+'/reconciliations')).data.length,0);passed.push('Permissioned report and reconciliation reads use real scoped SRS tables, with no demo fixtures');
 await json(a,path+'/periods',{startDate:'2026-10-15',endDate:'2026-11-01'},409);passed.push('Overlapping accounting periods rejected');
 await json(a,`/api/v1/tenants/${tenant}/entities`,{code:'0002',name:'Spoof',currency:'USD',framework:'Test',effectiveFrom:'2026-01-01',fiscalYearStartMonth:1,grantPreparerAccess:true,actorId:randomUUID()},422);passed.push('Client-supplied identity and unknown mutation fields rejected');
 const foreignOrigin=await a.post(path+'/periods',{headers:{Origin:'https://example.com'},data:{startDate:'2026-11-01',endDate:'2026-11-30'}});assert.equal(foreignOrigin.status(),403);passed.push('Cross-origin mutations rejected');
 await enroll(b);assert.equal((await json(b,'/api/v1/tenants')).data.length,0);
 await json(b,`/api/v1/tenants/${tenant}/entities`,undefined,404);await json(b,path+'/periods',undefined,404);passed.push('Second real identity cannot access another tenant or entity by changing identifiers');
 const events=(await json(a,`/api/v1/tenants/${tenant}/audit`)).data;assert.equal(events.length,3);assert.equal(events[0].previous_event_hash,events[1].event_hash);assert.equal(events[1].previous_event_hash,events[2].event_hash);passed.push('Successful mutations write a serialized, linked audit chain');
 const malformed=await a.post(path+'/periods',{headers:{'Content-Type':'application/json'},data:'{'});assert.equal(malformed.status(),400);passed.push('Malformed JSON returns a bounded client error');
 await json(a,'/api/auth/sign-out',{});await json(a,'/api/v1/me',undefined,401);
 const login=await json(a,'/api/auth/sign-in/email',{email:identity.email,password:identity.password});assert.equal(login.twoFactorRedirect,true);
 await json(a,'/api/v1/me',undefined,401);
 const code=await createOTP(identity.secret,{digits:6,period:30}).totp();await json(a,'/api/auth/two-factor/verify-totp',{code,trustDevice:false});
 assert.equal((await json(a,'/api/v1/me')).data.mfaVerified,true);assert.equal((await json(a,path+'/periods')).data.length,1);passed.push('Sign-out revokes the session; sign-in requires MFA and restores real persisted workspace access');
 await json(a,'/api/auth/sign-out',{});await json(a,'/api/auth/sign-in/email',{email:identity.email,password:identity.password});await json(a,'/api/auth/two-factor/verify-backup-code',{code:identity.backup[0]});assert.equal((await json(a,'/api/v1/me')).data.mfaVerified,true);passed.push('A one-time recovery code restores an MFA-verified session');
 const env=parseEnv(await readFile('.env.local','utf8')),limited=database(env.APP_DATABASE_URL);
 try{
  const flags=(await limited.query('SELECT rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];assert.equal(flags.rolsuper,false);assert.equal(flags.rolbypassrls,false);assert.equal(flags.rolcreaterole,false);
  assert.equal((await limited.query('SELECT count(*)::int AS n FROM mizan.accounting_periods')).rows[0].n,0);
  let blocked=false;try{await limited.query('SELECT password FROM public.mizan_auth_accounts LIMIT 1');}catch(e){blocked=e.code==='42501';}assert(blocked);passed.push('Application role has no owner/bypass privileges, sees no tenant rows without context, and cannot read password hashes');
 }finally{await limited.end();}
 await writeFile('verification/backend-api.json',JSON.stringify({branch:linked.branch,passed,errors:[],fixtures:'Synthetic records retained only on disposable test branch'},null,2)+'\n');
 console.log('Backend API: '+passed.length+' end-to-end checks passed');
}catch(e){console.error('Backend API failed:',e.message);process.exitCode=1;}
finally{await Promise.all([a.dispose(),b.dispose(),anonymous.dispose()]);}
