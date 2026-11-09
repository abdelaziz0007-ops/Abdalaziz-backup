import {createHmac,createHash} from 'node:crypto';
import {z} from 'zod';
const uuid=z.uuid(),reason=z.string().trim().min(8).max(500),key=z.uuid();
const grant=z.object({permissionCode:z.string().min(1).max(100),entityId:uuid.nullable(),bankAccountId:uuid.nullable()}).strict().refine(g=>!g.bankAccountId||Boolean(g.entityId),{message:'A bank scope requires an entity'});
const invitation=z.object({email:z.email().max(254),expiresInHours:z.number().int().min(1).max(168),grants:z.array(grant).min(1).max(30),reason,requestKey:key}).strict().refine(v=>new Set(v.grants.map(g=>JSON.stringify(g))).size===v.grants.length,{message:'Duplicate invitation grants'});
const digest=v=>createHash('sha256').update(v).digest('hex');
export function mountAdministrationRoutes(router,{pool,scoped,result,HttpError}){
 const args=req=>[req.principal.id,req.principal.sessionId];
 const unavailable=e=>e.code==='P0002'?new HttpError(404,'RESOURCE_NOT_FOUND','Administration record unavailable'):e;
 router.get('/reference/permissions',async(req,res,next)=>{try{result(req,res,(await pool.query('SELECT code,description FROM mizan.permissions ORDER BY code')).rows);}catch(e){next(e);}});
 router.post('/tenants/:tenantId/invitations',async(req,res,next)=>{
  try{const data=invitation.parse(req.body),t=uuid.parse(req.params.tenantId),secret=process.env.SOURCE_ENCRYPTION_KEY;data.email=data.email.toLowerCase();if(!secret)throw new HttpError(503,'INVITATIONS_UNAVAILABLE','Invitation keys are not configured');
   const token=createHmac('sha256',secret).update(JSON.stringify(['invitation-token-v1',req.principal.id,t,data])).digest('hex');
   const value=await scoped(req,t,null,null,async c=>(await c.query('SELECT mizan_private.create_invitation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS value',[...args(req),t,data.email,data.expiresInHours,JSON.stringify(data.grants),digest(token),data.reason,data.requestKey,req.requestId])).rows[0].value,{fresh:true});
   result(req,res,{...value,acceptUrl:(process.env.APP_ORIGIN??'')+'/#/invitation/'+token,delivery:'manual_link_email_not_configured'},201);
  }catch(e){next(unavailable(e));}
 });
 router.post('/invitations/accept',async(req,res,next)=>{
  try{const data=z.object({token:z.string().regex(/^[0-9a-f]{64}$/)}).strict().parse(req.body);const value=(await pool.query('SELECT mizan_private.accept_invitation($1,$2,$3,$4) AS value',[...args(req),digest(data.token),req.requestId])).rows[0].value;if(!value)throw new HttpError(404,'INVITATION_UNAVAILABLE','Invitation is invalid, expired, already used or unavailable to this account');result(req,res,value);}catch(e){next(unavailable(e));}
 });
 router.post('/tenants/:tenantId/invitations/:invitationId/revoke',async(req,res,next)=>{
  try{const t=uuid.parse(req.params.tenantId),id=uuid.parse(req.params.invitationId),data=z.object({reason,requestKey:key}).strict().parse(req.body);result(req,res,await scoped(req,t,null,null,async c=>(await c.query('SELECT mizan_private.revoke_invitation($1,$2,$3,$4,$5,$6,$7) AS value',[...args(req),t,id,data.reason,data.requestKey,req.requestId])).rows[0].value,{fresh:true}));}catch(e){next(unavailable(e));}
 });
 router.post('/tenants/:tenantId/access/:kind/:grantId/revoke',async(req,res,next)=>{
  try{const t=uuid.parse(req.params.tenantId),id=uuid.parse(req.params.grantId),kind=z.enum(['grant','role']).parse(req.params.kind),data=z.object({reason,requestKey:key}).strict().parse(req.body);result(req,res,await scoped(req,t,null,null,async c=>(await c.query('SELECT mizan_private.revoke_scoped_access($1,$2,$3,$4,$5,$6,$7,$8) AS value',[...args(req),t,kind,id,data.reason,data.requestKey,req.requestId])).rows[0].value,{fresh:true}));}catch(e){next(unavailable(e));}
 });
 router.get('/tenants/:tenantId/members',async(req,res,next)=>{
  try{const t=uuid.parse(req.params.tenantId),entity=req.query.entityId?uuid.parse(req.query.entityId):null,bank=req.query.bankAccountId?uuid.parse(req.query.bankAccountId):null;if(bank&&!entity)throw new HttpError(422,'INVALID_SCOPE','Bank scope requires an entity');result(req,res,await scoped(req,t,entity,null,async c=>(await c.query('SELECT mizan_private.member_directory($1,$2,$3,$4,$5) AS value',[...args(req),t,entity,bank])).rows[0].value,{fresh:true}));}catch(e){next(unavailable(e));}
 });
 router.post('/tenants/:tenantId/members/:memberId/revoke',async(req,res,next)=>{
  try{const t=uuid.parse(req.params.tenantId),member=uuid.parse(req.params.memberId),data=z.object({reason,requestKey:key}).strict().parse(req.body);result(req,res,await scoped(req,t,null,'members.manage',async c=>(await c.query('SELECT mizan_private.revoke_membership($1,$2,$3,$4,$5,$6,$7) AS value',[...args(req),t,member,data.reason,data.requestKey,req.requestId])).rows[0].value,{fresh:true}));}catch(e){next(unavailable(e));}
 });
 router.post('/tenants/:tenantId/members/:memberId/restore',async(req,res,next)=>{
  try{const t=uuid.parse(req.params.tenantId),member=uuid.parse(req.params.memberId),data=z.object({reason,requestKey:key}).strict().parse(req.body);result(req,res,await scoped(req,t,null,'members.manage',async c=>(await c.query('SELECT mizan_private.restore_membership($1,$2,$3,$4,$5,$6,$7) AS value',[...args(req),t,member,data.reason,data.requestKey,req.requestId])).rows[0].value,{fresh:true}));}catch(e){next(unavailable(e));}
 });
 router.get('/tenants/:tenantId/members/:memberId/access',async(req,res,next)=>{
  try{const t=uuid.parse(req.params.tenantId),id=uuid.parse(req.params.memberId);result(req,res,await scoped(req,t,null,null,async c=>{
   const member=(await c.query('SELECT user_id FROM mizan.memberships WHERE tenant_id=$1 AND id=$2',[t,id])).rows[0];if(!member)throw new HttpError(404,'RESOURCE_NOT_FOUND','Membership unavailable');
   const grants=(await c.query("SELECT id,permission_code,entity_id,bank_account_id,expires_at,revoked_at FROM mizan.access_grants WHERE tenant_id=$1 AND membership_id=$2 AND ($3::uuid=$4::uuid OR mizan.has_permission($1,entity_id,$3::uuid,'members.manage',bank_account_id)) ORDER BY created_at LIMIT 500",[t,id,req.principal.id,member.user_id])).rows;
   const roles=(await c.query("SELECT id,role_code,entity_id,bank_account_id,revoked_at FROM mizan.membership_roles WHERE tenant_id=$1 AND membership_id=$2 AND ($3::uuid=$4::uuid OR mizan.has_permission($1,entity_id,$3::uuid,'members.manage',bank_account_id)) ORDER BY created_at LIMIT 100",[t,id,req.principal.id,member.user_id])).rows;
   if(member.user_id!==req.principal.id&&!grants.length&&!roles.length)throw new HttpError(404,'RESOURCE_NOT_FOUND','Membership unavailable');return {grants,roles};
  },{fresh:true}));}catch(e){next(unavailable(e));}
 });
}
