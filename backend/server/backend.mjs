import {mountPrivacyExportRoutes} from './privacy-export.mjs';
import {mountRetentionRoutes} from './retention-routes.mjs';
import {mountOwnershipRoutes} from './ownership-routes.mjs';
import {mountSupportRoutes} from './support-routes.mjs';
import {mountNotificationRoutes} from './notification-routes.mjs';
import express from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { mountFinancialRoutes } from './financial-routes.mjs';
import { FinancialInputError } from './financial-core.mjs';
import { mountBankRoutes } from './bank-routes.mjs';
import { mountMatchRoutes } from './match-routes.mjs';
import { mountManualMatchRoutes } from './manual-match-routes.mjs';
import { mountAdministrationRoutes } from './administration-routes.mjs';
import { mountReviewRoutes } from './review-routes.mjs';
import { mountReconcilingItemRoutes } from './reconciling-item-routes.mjs';
import { mountSourceJobRoutes } from './source-job-routes.mjs';
import { mountAuditRoutes } from './audit-routes.mjs';
import { mountOutputExportRoutes } from './output-export-routes.mjs';
import { mountOutputCommentRoutes } from './output-comment-routes.mjs';
import { mountPeriodRoutes } from './period-routes.mjs';
import { mountDataLifecycleRoutes } from './data-lifecycle-routes.mjs';

class HttpError extends Error {
  constructor(status,code,message){super(message);this.status=status;this.code=code;}
}
const uuid=z.uuid(),name=z.string().trim().min(2).max(200);
const schemas={
  workspace:z.object({name,administrationConsent:z.literal(true),idempotencyKey:uuid}).strict(),
  entity:z.object({code:z.string().trim().min(1).max(50),name,currency:z.string().regex(/^[A-Z]{3}$/),framework:z.string().trim().min(2).max(200),effectiveFrom:z.iso.date(),fiscalYearStartMonth:z.number().int().min(1).max(12),grantPreparerAccess:z.boolean()}).strict(),
  period:z.object({startDate:z.iso.date(),endDate:z.iso.date()}).strict().refine(v=>v.endDate>=v.startDate,{message:'Period end must follow start'}),
};
const requireMfa=(principal,fresh=false)=>{
  if(!principal.mfaEnabled||!principal.mfaVerifiedAt||fresh&&Date.now()-Date.parse(principal.mfaVerifiedAt)>15*60*1000)
    throw new HttpError(403,'MFA_REQUIRED',fresh?'Verify a recent authenticator code before this action':'Enable and verify two-factor authentication first');
};
export function backendRouter({pool,auth,dataRegion,origin}){
  const router=express.Router();
  router.use((req,res,next)=>{req.requestId=randomUUID();res.setHeader('X-Request-ID',req.requestId);res.setHeader('Cache-Control','no-store');next();});
  const result=(req,res,data,status=200)=>res.status(status).json({data,requestId:req.requestId});
  router.get('/health',async(req,res)=>{
    try{await pool.query('SELECT 1');result(req,res,{status:'ok',database:'connected',apiVersion:'v1'});}
    catch{res.status(503).json({error:{code:'DATABASE_UNAVAILABLE',message:'Database temporarily unavailable'},requestId:req.requestId});}
  });
  // Authentication is always verified against the actual session store, not demo personas.
  router.use(async(req,_res,next)=>{
    try{
      const session=await auth.api.getSession({headers:fromNodeHeaders(req.headers)});
      if(!session?.user||!session?.session)throw new HttpError(401,'AUTHENTICATION_REQUIRED','Sign in to continue');
      if(process.env.APP_PROFILE==='production'&&!session.user.emailVerified)throw new HttpError(403,'EMAIL_VERIFICATION_REQUIRED','Verify your email before accessing the workspace');
      req.principal=(await pool.query('SELECT mizan_private.sync_identity_session($1,$2) AS value',[session.user.id,session.session.id])).rows[0].value;
      next();
    }catch(error){next(error);}
  });
  // Every state-changing JSON API request needs a browser-origin proof.
  router.use((req,_res,next)=>{
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin!==(origin||`${req.protocol}://${req.headers.host}`))
      return next(new HttpError(403,'ORIGIN_REJECTED','Same-origin requests are required'));
    next();
  });
  router.use(express.json({limit:'1mb'}));
  async function scoped(req,tenantId,entityId,permission,run,{fresh=false,snapshot=false}={}){
    uuid.parse(tenantId);if(entityId)uuid.parse(entityId);requireMfa(req.principal,fresh);
    const c=await pool.connect();
    try{
      await c.query(snapshot?'BEGIN ISOLATION LEVEL REPEATABLE READ':'BEGIN');
      await c.query("SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='3s'");
      const context=(await c.query('SELECT mizan_private.workspace_context($1,$2) AS value',[req.principal.id,tenantId])).rows[0].value;
      if(!context||entityId&&!context.entityIds.includes(entityId))throw new HttpError(404,'RESOURCE_NOT_FOUND','Workspace or entity not found');
      await c.query("SELECT set_config('mizan.user_id',$1,true),set_config('mizan.tenant_id',$2,true),set_config('mizan.entity_ids',$3,true)",[req.principal.id,tenantId,context.entityIds.join(',')]);
      if(permission){
        const allowed=(await c.query('SELECT mizan.has_permission($1,$2,$3,$4) AS allowed',[tenantId,entityId??null,req.principal.id,permission])).rows[0].allowed;
        if(!allowed)throw new HttpError(403,'PERMISSION_DENIED','This action is not granted');
      }
      const value=await run(c,context);await c.query('COMMIT');return value;
    }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
  }
  const audit=(c,req,tenant,entity,action,type,id,reason,metadata={})=>c.query('SELECT mizan_private.append_audit($1,$2,$3,$4,$5,$6,$7,$8,$9)',[tenant,entity,req.principal.id,action,type,id,reason,req.requestId,metadata]);
  router.get('/me',(req,res)=>result(req,res,{user:{id:req.principal.id,name:req.principal.name,email:req.principal.email},mfaEnabled:req.principal.mfaEnabled,mfaVerified:Boolean(req.principal.mfaVerifiedAt),mfaVerifiedAt:req.principal.mfaVerifiedAt}));
  router.get('/reference/currencies',async(req,res,next)=>{try{result(req,res,(await pool.query('SELECT code,name,minor_units FROM mizan.currencies ORDER BY code')).rows);}catch(e){next(e);}});
  router.get('/tenants',async(req,res,next)=>{
    try{result(req,res,(await pool.query('SELECT mizan_private.workspaces_for_user($1) AS value',[req.principal.id])).rows[0].value);}catch(e){next(e);}
  });
  router.post('/tenants',async(req,res,next)=>{
    try{
      const data=schemas.workspace.parse(req.body);requireMfa(req.principal,true);
      const value=(await pool.query('SELECT mizan_private.create_workspace_once($1,$2,$3,$4,$5,$6,$7) AS id',[req.principal.id,req.principal.sessionId,data.name,dataRegion,data.administrationConsent,req.requestId,data.idempotencyKey])).rows[0];
      result(req,res,value,201);
    }catch(e){next(e);}
  });
  // Effective permissions are computed by the same database policy used by writes.
  router.get('/tenants/:tenantId/access',async(req,res,next)=>{
    try{
      const tenant=uuid.parse(req.params.tenantId),entity=req.query.entityId?uuid.parse(req.query.entityId):null;
      result(req,res,await scoped(req,tenant,entity,null,async c=>{
        const permissions=(await c.query('SELECT code FROM mizan.permissions WHERE mizan.has_permission($1,$2,$3,code) ORDER BY code',[tenant,entity,req.principal.id])).rows.map(row=>row.code);
        const bankPermissions=entity?(await c.query('SELECT b.id AS bank_account_id,p.code FROM mizan.bank_accounts b CROSS JOIN mizan.permissions p WHERE b.tenant_id=$1 AND b.entity_id=$2 AND mizan.has_permission($1,$2,$3,p.code,b.id) ORDER BY b.id,p.code',[tenant,entity,req.principal.id])).rows:[];
        return {tenantId:tenant,entityId:entity,permissions,bankPermissions};
      }));
    }catch(e){next(e);}
  });
  router.get('/tenants/:tenantId/entities',async(req,res,next)=>{
    try{result(req,res,await scoped(req,req.params.tenantId,null,null,async(c,context)=>(await c.query('SELECT e.id,e.code,e.legal_name AS name,e.status FROM mizan.legal_entities e WHERE e.tenant_id=$1 AND e.id=ANY($2::uuid[]) ORDER BY e.created_at LIMIT 100',[req.params.tenantId,context.entityIds])).rows));}catch(e){next(e);}
  });
  router.post('/tenants/:tenantId/entities',async(req,res,next)=>{
    try{
      const data=schemas.entity.parse(req.body),tenant=req.params.tenantId;
      const value=await scoped(req,tenant,null,'entities.manage',async(c,context)=>{
        if(data.grantPreparerAccess&&!(await c.query("SELECT mizan.has_permission($1,NULL,$2,'members.manage') AS allowed",[tenant,req.principal.id])).rows[0].allowed)throw new HttpError(403,'PERMISSION_DENIED','Member administration is required to grant preparation access');
        const entity=(await c.query('INSERT INTO mizan.legal_entities(tenant_id,code,legal_name) VALUES($1,$2,$3) RETURNING id,code,legal_name AS name',[tenant,data.code,data.name])).rows[0];
        await c.query("SELECT set_config('mizan.entity_ids',$1,true)",[[...context.entityIds,entity.id].join(',')]);
        await c.query(`INSERT INTO mizan.entity_settings_versions(tenant_id,entity_id,version,currency_code,fiscal_year_start_month,calendar,accounting_framework,effective_from,created_by,change_reason)
          VALUES($1,$2,1,$3,$4,'gregorian',$5,$6,$7,'Initial explicit entity configuration')`,[tenant,entity.id,data.currency,data.fiscalYearStartMonth,data.framework,data.effectiveFrom,req.principal.id]);
        if(data.grantPreparerAccess)await c.query("INSERT INTO mizan.membership_roles(tenant_id,membership_id,role_code,entity_id,granted_by) VALUES($1,$2,'preparer',$3,$4)",[tenant,context.membershipId,entity.id,req.principal.id]);
        await audit(c,req,tenant,entity.id,'entity.created','entity',entity.id,'Explicit entity and preparation-scope enrollment',{preparerGrant:data.grantPreparerAccess,currency:data.currency});
        return entity;
      },{fresh:true});result(req,res,value,201);
    }catch(e){next(e);}
  });
  router.get('/tenants/:tenantId/entities/:entityId/settings',async(req,res,next)=>{
    try{result(req,res,await scoped(req,req.params.tenantId,req.params.entityId,null,async c=>(await c.query('SELECT id,version,currency_code,fiscal_year_start_month,accounting_framework,effective_from FROM mizan.entity_settings_versions WHERE tenant_id=$1 AND entity_id=$2 ORDER BY version DESC LIMIT 1',[req.params.tenantId,req.params.entityId])).rows[0]??null));}catch(e){next(e);}
  });
  router.get('/tenants/:tenantId/entities/:entityId/reports',async(req,res,next)=>{
    try{result(req,res,await scoped(req,req.params.tenantId,req.params.entityId,'reports.view',async c=>(await c.query("SELECT id,output_type,period_id,currency_code,version,status,created_at FROM mizan.output_versions WHERE tenant_id=$1 AND entity_id=$2 AND output_type<>'reconciliation' ORDER BY created_at DESC LIMIT 50",[req.params.tenantId,req.params.entityId])).rows));}catch(e){next(e);}
  });
  router.get('/tenants/:tenantId/entities/:entityId/reconciliations',async(req,res,next)=>{
    try{result(req,res,await scoped(req,req.params.tenantId,req.params.entityId,null,async c=>(await c.query(`SELECT r.id,r.bank_account_id,r.currency_code,r.cutoff_date::text,v.version,v.status
      FROM mizan.reconciliations r JOIN mizan.output_versions v ON (v.tenant_id,v.entity_id,v.id)=(r.tenant_id,r.entity_id,r.output_version_id)
      WHERE r.tenant_id=$1 AND r.entity_id=$2 AND mizan.has_permission($1,$2,$3,'reports.view',r.bank_account_id) ORDER BY r.created_at DESC LIMIT 50`,[req.params.tenantId,req.params.entityId,req.principal.id])).rows));}catch(e){next(e);}
  });
  router.post('/tenants/:tenantId/entities/:entityId/periods',async(req,res,next)=>{
    try{
      const data=schemas.period.parse(req.body),tenant=req.params.tenantId,entity=req.params.entityId;
      const value=await scoped(req,tenant,entity,'entities.manage',async c=>{
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,42))',[entity]);
        if((await c.query("SELECT 1 FROM mizan.accounting_periods WHERE tenant_id=$1 AND entity_id=$2 AND status<>'superseded' AND start_date<=$4::date AND end_date>=$3::date LIMIT 1",[tenant,entity,data.startDate,data.endDate])).rows.length)throw new HttpError(409,'PERIOD_OVERLAP','The date range overlaps an existing accounting period');
        const settings=(await c.query('SELECT id FROM mizan.entity_settings_versions WHERE tenant_id=$1 AND entity_id=$2 ORDER BY version DESC LIMIT 1',[tenant,entity])).rows[0];
        const period=(await c.query('INSERT INTO mizan.accounting_periods(tenant_id,entity_id,version,settings_version_id,start_date,end_date,created_by) VALUES($1,$2,1,$3,$4,$5,$6) RETURNING id,start_date::text,end_date::text,status,version',[tenant,entity,settings.id,data.startDate,data.endDate,req.principal.id])).rows[0];
        await audit(c,req,tenant,entity,'period.created','period',period.id,'New accounting period');return period;
      },{fresh:true});result(req,res,value,201);
    }catch(e){next(e);}
  });
  mountOwnershipRoutes(router,{scoped,result,HttpError});
  mountSupportRoutes(router,{pool,scoped,result,requireMfa,HttpError});
  mountNotificationRoutes(router,{scoped,result,HttpError});
  mountPeriodRoutes(router,{scoped,result,HttpError});
  mountPrivacyExportRoutes(router,{scoped,HttpError});
  mountRetentionRoutes(router,{scoped,result,HttpError});
  mountDataLifecycleRoutes(router,{scoped,result,HttpError});
  mountAuditRoutes(router,{scoped,audit,result,HttpError});
  mountOutputExportRoutes(router,{scoped,audit,HttpError});
  mountOutputCommentRoutes(router,{scoped,result,audit,HttpError});
  mountFinancialRoutes(router,{scoped,audit,result,HttpError});
  mountBankRoutes(router,{scoped,audit,result,HttpError});
  mountMatchRoutes(router,{scoped,audit,result,HttpError});
  mountManualMatchRoutes(router,{scoped,audit,result,HttpError});
  mountAdministrationRoutes(router,{pool,scoped,result,HttpError});
  mountReviewRoutes(router,{scoped,result,HttpError});
  mountReconcilingItemRoutes(router,{scoped,audit,result,HttpError});
  mountSourceJobRoutes(router,{scoped,audit,result,HttpError});
  router.use((_req,_res,next)=>next(new HttpError(404,'ROUTE_NOT_FOUND','API route not found')));
  router.use((error,req,res,_next)=>{
    const code=error instanceof z.ZodError?'INVALID_INPUT':error.code;
    const status=error instanceof z.ZodError?422:error.status??({'23505':409,'23503':422,'23514':422,'42501':403,'P0002':401,'P0401':401,'40001':409,'55000':409,'55P03':409,'57014':503}[code]??500);
    const known=error instanceof HttpError||error instanceof FinancialInputError;
    if(code==='42501'&&!known){const object=/permission denied for (?:table|schema|function) ([a-zA-Z0-9_]+)/.exec(error.message)?.[1];if(object)console.error('Runtime privilege missing',{requestId:req.requestId,object});}
    const message=known?error.message:error instanceof z.ZodError?'Check the submitted fields':status===409?'The resource conflicts with an existing record':status===422?'The submitted data violates a database constraint':status===403?'Access denied':status===401?'Sign in again':'The request could not be completed';
    if(status>=500)console.error('Backend request failed',{requestId:req.requestId,code:typeof code==='string'?code:'INTERNAL_ERROR'});
    res.status(status).json({error:{code:known?code:status===500?'INTERNAL_ERROR':code??'REQUEST_FAILED',message,...(error instanceof z.ZodError?{fields:error.issues.map(i=>({path:i.path.join('.'),message:i.message}))}: {})},requestId:req.requestId});
  });
  return router;
}
