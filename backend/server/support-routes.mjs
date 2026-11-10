import {z} from 'zod';
const reason=z.string().trim().min(8).max(500),key=z.uuid();
export const supportSchemas={
 create:z.object({subject:z.string().trim().min(4).max(200),description:z.string().trim().min(10).max(4000),requestKey:key}).strict(),
 transition:z.object({status:z.enum(['in_progress','resolved','closed']),reason,requestKey:key}).strict(),
 grant:z.object({email:z.email().max(254),hours:z.number().int().min(1).max(24),reason,requestKey:key}).strict(),
 revoke:z.object({grantId:z.uuid(),reason,requestKey:key}).strict(),
 read:z.object({outputId:z.uuid().optional(),reason}).strict(),
};
export function mountSupportRoutes(router,{pool,scoped,result,requireMfa,HttpError}){
 const paths=['/tenants/:tenantId/support','/tenants/:tenantId/entities/:entityId/support'];
 const fail=(error,next)=>next(error.code==='P0002'?new HttpError(404,'RESOURCE_NOT_FOUND','Support record or recipient unavailable'):error);
 router.get(paths,async(req,res,next)=>{try{
  const {tenantId:t,entityId:e=null}=req.params;
  result(req,res,await scoped(req,t,e,null,async c=>{
   const tickets=(await c.query("SELECT id,subject,description,status,requested_by,created_at FROM mizan.support_requests WHERE tenant_id=$1 AND entity_id IS NOT DISTINCT FROM $2::uuid AND (requested_by=$3 OR mizan.has_permission($1,$2,$3,'support.authorize')) ORDER BY created_at DESC LIMIT 100",[t,e,req.principal.id])).rows;
   const grants=(await c.query("SELECT g.id,g.support_request_id,g.support_user_id,g.expires_at,g.revoked_at,g.reason FROM mizan.support_access_grants g JOIN mizan.support_requests r ON (r.tenant_id,r.id)=(g.tenant_id,g.support_request_id) WHERE r.tenant_id=$1 AND r.entity_id IS NOT DISTINCT FROM $2::uuid AND (r.requested_by=$3 OR mizan.has_permission($1,$2,$3,'support.authorize')) ORDER BY g.created_at DESC LIMIT 200",[t,e,req.principal.id])).rows;
   return {tickets,grants};
  }));
 }catch(e){fail(e,next);}});
 for(const action of ['create','transition','grant','revoke'])router.post(action==='create'?paths:paths.map(p=>p+'/:ticketId/'+action),async(req,res,next)=>{try{
  const {requestKey,...data}=supportSchemas[action].parse(req.body),{tenantId:t,entityId:e=null}=req.params,id=action==='create'?null:z.uuid().parse(req.params.ticketId);
  const saved=await scoped(req,t,e,null,async c=>(await c.query('SELECT mizan_private.support_action($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value',[req.principal.id,req.principal.sessionId,t,e,id,action,data,requestKey,req.requestId])).rows[0].value,{fresh:true});
  result(req,res,saved,action==='create'&&!saved.reused?201:200);
 }catch(e){fail(e,next);}});
 router.get('/support/grants',async(req,res,next)=>{try{requireMfa(req.principal,true);result(req,res,(await pool.query('SELECT mizan_private.support_grants_for_user($1,$2) AS value',[req.principal.id,req.principal.sessionId])).rows[0].value);}catch(e){fail(e,next);}});
 router.post('/support/grants/:grantId/outputs',async(req,res,next)=>{try{
  requireMfa(req.principal,true);const id=z.uuid().parse(req.params.grantId),data=supportSchemas.read.parse(req.body);
  result(req,res,(await pool.query('SELECT mizan_private.support_read_output($1,$2,$3,$4,$5,$6) AS value',[req.principal.id,req.principal.sessionId,id,data.outputId??null,data.reason,req.requestId])).rows[0].value);
 }catch(e){fail(e,next);}});
}
