import {z} from 'zod';

const request=z.object({reason:z.string().trim().min(8).max(500),requestKey:z.uuid()}).strict();

export function mountPeriodRoutes(router,{scoped,result,HttpError}){
  const base='/tenants/:tenantId/entities/:entityId/periods';
  router.get(base,async(req,res,next)=>{
    try{
      const {tenantId:t,entityId:e}=req.params;
      const periods=await scoped(req,t,e,null,async c=>(await c.query(`
        SELECT p.id,p.start_date::text,p.end_date::text,p.status,p.version,p.predecessor_id,p.reopen_reason,p.locked_at,
          NOT EXISTS(SELECT 1 FROM mizan.accounting_periods n
            WHERE (n.tenant_id,n.entity_id,n.logical_period_id)=(p.tenant_id,p.entity_id,p.logical_period_id)
              AND n.version>p.version) AS is_latest,
          mizan.has_permission($1,$2,$3,'entities.manage') AS can_manage
        FROM mizan.accounting_periods p WHERE p.tenant_id=$1 AND p.entity_id=$2
        ORDER BY p.start_date DESC,p.version DESC,p.id LIMIT 100
      `,[t,e,req.principal.id])).rows);
      result(req,res,periods);
    }catch(error){next(error);}
  });
  router.post(base+'/:periodId/:action',async(req,res,next)=>{
    try{
      const {tenantId:t,entityId:e,periodId}=req.params;
      z.uuid().parse(periodId);
      const action=z.enum(['lock','reopen']).parse(req.params.action);
      const data=request.parse(req.body);
      const saved=await scoped(req,t,e,'entities.manage',async c=>(await c.query(`
        SELECT mizan_private.change_accounting_period($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value
      `,[req.principal.id,req.principal.sessionId,t,e,periodId,action,data.reason,data.requestKey,req.requestId])).rows[0].value,
      {fresh:true});
      result(req,res,saved,action==='reopen'&&!saved.reused?201:200);
    }catch(error){
      if(error.code==='P0002')return next(new HttpError(404,'RESOURCE_NOT_FOUND','Accounting period is unavailable'));
      if(error.code==='40001')return next(new HttpError(409,'PERIOD_STATE_CONFLICT',error.message));
      next(error);
    }
  });
}
