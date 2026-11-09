import assert from 'node:assert/strict';
const origin=process.env.APP_ORIGIN;
if(!origin||new URL(origin).origin!==origin)throw Error('Set APP_ORIGIN to the deployed origin');
const checks=[];
for(const [path,status] of [['/healthz',200],['/api/v1/health',200],['/api/v1/me',401],['/api/v1/tenants/00000000-0000-4000-8000-000000000000/access',401],['/api/v1/tenants/00000000-0000-4000-8000-000000000000/notifications',401],['/',200]]){
 const r=await fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(20000)});
 assert.equal(r.status,status,path);assert.equal(r.headers.get('x-content-type-options'),'nosniff');
 if(origin.startsWith('https:'))assert.ok(r.headers.get('content-security-policy'));
 checks.push({path,status:r.status});
}
const rejected=await fetch(origin+'/api/auth/sign-in/email',{method:'POST',headers:{origin:'https://untrusted.invalid','content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)});
assert.equal(rejected.status,403);checks.push({check:'cross-site authentication rejected',status:403});
console.log(JSON.stringify({checkedAt:new Date().toISOString(),checks,noAccountsCreated:true},null,2));
