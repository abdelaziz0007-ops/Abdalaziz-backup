import {z} from 'zod';

const request=z.object({type:z.enum(['export','delete']),reason:z.string().trim().min(8).max(500),requestKey:z.uuid()}).strict();
const decision=z.object({action:z.enum(['authorize','reject']),reason:z.string().trim().min(8).max(500),requestKey:z.uuid()}).strict();

export function mountDataLifecycleRoutes(router,{scoped,result,HttpError}){
  const paths=['/tenants/:tenantId/data-lifecycle','/tenants/:tenantId/entities/:entityId/data-lifecycle'];
  router.get(paths,async(req,res,next)=>{
    try{
      const {tenantId:tenant,entityId:entity=null}=req.params;
      const requests=await scoped(req,tenant,entity,'privacy.manage',async c=>(await c.query(`
        SELECT id,request_type,status,requested_by,created_at,reason,decision_reason,decided_at
        FROM mizan.data_lifecycle_requests WHERE tenant_id=$1 AND entity_id IS NOT DISTINCT FROM $2::uuid
        ORDER BY created_at DESC,id DESC LIMIT 100
      `,[tenant,entity])).rows);
      result(req,res,requests);
    }catch(error){next(error);}
  });
  async function change(req,res,next,isDecision){
    try{
      const {tenantId:tenant,entityId:entity=null}=req.params;
      const id=isDecision?z.uuid().parse(req.params.requestId):null;
      const data=(isDecision?decision:request).parse(req.body);
      const action=isDecision?data.action:data.type;
      const saved=await scoped(req,tenant,entity,'privacy.manage',async c=>(await c.query(`
        SELECT mizan_private.change_lifecycle_request($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value
      `,[req.principal.id,req.principal.sessionId,tenant,entity,id,action,data.reason,data.requestKey,req.requestId])).rows[0].value,
      {fresh:true});
      result(req,res,saved,isDecision||saved.reused?200:201);
    }catch(error){
      if(error.code==='P0002')return next(new HttpError(404,'RESOURCE_NOT_FOUND','Data lifecycle request is unavailable'));
      if(error.code==='40001')return next(new HttpError(409,'PRIVACY_DECISION_CONFLICT',error.message));
      if(error.code==='42501'&&error.message==='A second authorized administrator must decide the request'){
        return next(new HttpError(403,'INDEPENDENT_DECISION_REQUIRED',error.message));
      }
      next(error);
    }
  }
  router.post(paths,(req,res,next)=>change(req,res,next,false));
  router.post(paths.map(path=>path+'/:requestId/decision'),(req,res,next)=>change(req,res,next,true));
}
