import {z} from 'zod';
export const visible = `n.tenant_id=$1 AND n.recipient_id=$2 AND
 (n.output_version_id IS NULL OR EXISTS (
  SELECT 1 FROM mizan.output_versions o LEFT JOIN mizan.reconciliations r
   ON (r.tenant_id,r.entity_id,r.output_version_id)=(o.tenant_id,o.entity_id,o.id)
  WHERE (o.tenant_id,o.entity_id,o.id)=(n.tenant_id,n.entity_id,n.output_version_id)
   AND mizan.has_permission(n.tenant_id,n.entity_id,$2,'reports.view',r.bank_account_id)
 ))`;
export function mountNotificationRoutes(router,{scoped,result,HttpError}){
 router.get('/tenants/:tenantId/notifications',async(req,res,next)=>{
  try{const tenant=z.uuid().parse(req.params.tenantId),offset=z.coerce.number().int().min(0).max(10000).parse(req.query.offset??0);
   result(req,res,await scoped(req,tenant,null,null,async c=>{
    const rows=(await c.query('SELECT n.id,n.entity_id,n.output_version_id,n.safe_template_code,n.created_at,n.read_at FROM mizan.notifications n WHERE '+visible+' ORDER BY n.created_at DESC,n.id DESC LIMIT 51 OFFSET $3',[tenant,req.principal.id,offset])).rows;
    const count=(await c.query('SELECT count(*)::int AS count FROM mizan.notifications n WHERE '+visible+' AND n.read_at IS NULL',[tenant,req.principal.id])).rows[0].count;
    return {items:rows.slice(0,50),hasMore:rows.length>50,unread:count};
   }));
  }catch(e){next(e);}
 });
 router.post('/tenants/:tenantId/notifications/:notificationId/read',async(req,res,next)=>{
  try{const tenant=z.uuid().parse(req.params.tenantId),id=z.uuid().parse(req.params.notificationId);z.object({}).strict().parse(req.body);
   result(req,res,await scoped(req,tenant,null,null,async c=>{
    const row=(await c.query('SELECT n.id FROM mizan.notifications n WHERE '+visible+' AND n.id=$3',[tenant,req.principal.id,id])).rows[0];
    if(!row)throw new HttpError(404,'RESOURCE_NOT_FOUND','Notification unavailable');
    await c.query('UPDATE mizan.notifications SET read_at=coalesce(read_at,clock_timestamp()) WHERE tenant_id=$1 AND recipient_id=$2 AND id=$3',[tenant,req.principal.id,id]);return {id,read:true};
   }));
  }catch(e){next(e);}
 });
}
