import {z} from 'zod';
const common={reason:z.string().trim().min(8).max(500),requestKey:z.uuid()};
export const retentionSchemas={
 hold:z.object({...common,authority:z.string().trim().min(4).max(500),reviewDueAt:z.iso.datetime({offset:true})}).strict(),
 release:z.object(common).strict(),
 policy:z.object({...common,code:z.string().regex(/^[a-z][a-z0-9_-]{2,39}$/),category:z.enum(['originals','derivatives','indexes','providers','audit']),retentionDays:z.number().int().min(0).max(36500),triggerEvent:z.enum(['created_at','service_terminated']),legalBasis:z.string().trim().min(8).max(1000)}).strict(),
};
export function mountRetentionRoutes(router,{scoped,result,HttpError}){
 const paths=['/tenants/:tenantId/retention','/tenants/:tenantId/entities/:entityId/retention'];
 const fail=(e,next)=>next(e.code==='P0002'?new HttpError(404,'RESOURCE_NOT_FOUND','Legal hold unavailable'):e);
 router.get(paths,async(req,res,next)=>{try{const {tenantId:t,entityId:e=null}=req.params;
  result(req,res,await scoped(req,t,e,'privacy.manage',async c=>(await c.query('SELECT mizan_private.retention_controls($1,$2,$3,$4) AS value',[req.principal.id,req.principal.sessionId,t,e])).rows[0].value,{fresh:true}));
 }catch(e){fail(e,next);}});
 for(const action of ['hold','release','policy'])router.post(paths.map(p=>p+(action==='release'?'/:holdId/release':'/'+action)),async(req,res,next)=>{try{
  const {tenantId:t,entityId:e=null}=req.params,{requestKey,...data}=retentionSchemas[action].parse(req.body),id=action==='release'?z.uuid().parse(req.params.holdId):null;
  result(req,res,await scoped(req,t,e,'privacy.manage',async c=>(await c.query('SELECT mizan_private.retention_action($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value',[req.principal.id,req.principal.sessionId,t,e,id,action,data,requestKey,req.requestId])).rows[0].value,{fresh:true}));
 }catch(e){fail(e,next);}});
}
