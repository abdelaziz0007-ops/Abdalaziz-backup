export function mountBillingRoutes(router,{scoped,result}){
 router.get('/tenants/:tenantId/billing',async(req,res,next)=>{try{
  result(req,res,await scoped(req,req.params.tenantId,null,'billing.manage',async c=>(await c.query('SELECT mizan_private.billing_overview($1,$2,$3) AS value',[req.principal.id,req.principal.sessionId,req.params.tenantId])).rows[0].value,{fresh:true}));
 }catch(e){next(e);}});
}
export function billingCapacityError(error,HttpError){
 const messages={P0041:['SUBSCRIPTION_INACTIVE','Subscription is inactive or expired'],P0042:['PLAN_QUOTA_NOT_CONFIGURED','The published plan scan quota needs configuration'],P0043:['SCAN_QUOTA_EXHAUSTED','The scan job allowance for this billing period is exhausted']};
 const entry=messages[error.code];return entry?new HttpError(409,...entry):error;
}
