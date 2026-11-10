import {describe,it,expect} from 'vitest';
import {billingCapacityError,mountBillingRoutes} from './billing-routes.mjs';
class HttpError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
describe('billing boundary',()=>{
 it.each([['P0041','SUBSCRIPTION_INACTIVE'],['P0042','PLAN_QUOTA_NOT_CONFIGURED'],['P0043','SCAN_QUOTA_EXHAUSTED']])('maps %s without exposing database details',(sql,code)=>{const e=billingCapacityError({code:sql,message:'private database detail'},HttpError);expect(e.status).toBe(409);expect(e.code).toBe(code);expect(e.message).not.toContain('private database detail');});
 it('preserves unrelated failures for normal error handling',()=>{const e=new Error('offline');expect(billingCapacityError(e,HttpError)).toBe(e);});
 it('requires workspace billing permission and recent MFA before querying',async()=>{
  let route;const failure=new Error('permission denied');let queried=false,resultCalled=false;
  mountBillingRoutes({get(_path,handler){route=handler;}},{scoped:async(req,tenant,entity,permission,callback,options)=>{expect(tenant).toBe('workspace');expect(entity).toBeNull();expect(permission).toBe('billing.manage');expect(options.fresh).toBe(true);throw failure;},result(){resultCalled=true;}});
  let caught;await route({params:{tenantId:'workspace'},principal:{id:'actor',sessionId:'session'}},{},e=>{caught=e;});expect(caught).toBe(failure);expect(resultCalled).toBe(false);
 });
});
