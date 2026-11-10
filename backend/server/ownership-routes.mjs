import {z} from 'zod';
const common={reason:z.string().trim().min(8).max(500),requestKey:z.uuid()};
export const ownershipSchemas={propose:z.object({...common,email:z.email().max(254)}).strict(),accept:z.object({...common,administrationConsent:z.literal(true)}).strict(),cancel:z.object(common).strict()};
export function mountOwnershipRoutes(router,{scoped,result,HttpError}){
 const base='/tenants/:tenantId/ownership';
 const fail=(error,next)=>next(error.code==='P0002'?new HttpError(404,'RESOURCE_NOT_FOUND','Ownership record or recipient unavailable'):error);
 router.get(base,async(req,res,next)=>{try{result(req,res,await scoped(req,req.params.tenantId,null,null,async c=>(await c.query('SELECT mizan_private.ownership_status($1,$2,$3) AS value',[req.principal.id,req.principal.sessionId,req.params.tenantId])).rows[0].value,{fresh:true}));}catch(e){fail(e,next);}});
 for(const action of ['propose','accept','cancel'])router.post(base+(action==='propose'?'/propose':'/:transferId/'+action),async(req,res,next)=>{try{
  const data=ownershipSchemas[action].parse(req.body),id=action==='propose'?null:z.uuid().parse(req.params.transferId);
  result(req,res,await scoped(req,req.params.tenantId,null,null,async c=>(await c.query('SELECT mizan_private.ownership_action($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS value',[req.principal.id,req.principal.sessionId,req.params.tenantId,id,action,data.email??null,data.reason,data.administrationConsent??false,data.requestKey,req.requestId])).rows[0].value,{fresh:true}));
 }catch(e){fail(e,next);}});
}
