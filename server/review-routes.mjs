import {z} from 'zod';
const uuid=z.uuid(),fingerprint=z.string().regex(/^[0-9a-f]{64}$/),reason=z.string().trim().min(8).max(500);
export function mountReviewRoutes(router,{scoped,result,HttpError}){
 const base='/tenants/:tenantId/entities/:entityId/outputs/:outputId/review';
 router.get('/tenants/:tenantId/entities/:entityId/outputs',async(req,res,next)=>{
  try{const {tenantId:t,entityId:e}=req.params;result(req,res,await scoped(req,t,e,null,async c=>(await c.query(`SELECT v.id,v.output_type,v.status,v.version,v.currency_code,v.period_id,v.preparer_id,p.start_date::text,p.end_date::text,r.id AS reconciliation_id FROM mizan.output_versions v JOIN mizan.accounting_periods p ON (p.tenant_id,p.entity_id,p.id)=(v.tenant_id,v.entity_id,v.period_id) LEFT JOIN mizan.reconciliations r ON (r.tenant_id,r.entity_id,r.output_version_id)=(v.tenant_id,v.entity_id,v.id) WHERE v.tenant_id=$1 AND v.entity_id=$2 AND mizan.has_permission($1,$2,$3,'reports.view',r.bank_account_id) ORDER BY v.created_at DESC,v.version DESC LIMIT 100`,[t,e,req.principal.id])).rows));}catch(e){next(e);}
 });
 router.get(base,async(req,res,next)=>{
  try{const {tenantId:t,entityId:e,outputId:o}=req.params;uuid.parse(o);result(req,res,await scoped(req,t,e,null,async c=>{
   const output=(await c.query(`SELECT v.id,v.preparer_id,v.output_type,v.status,v.version,v.period_id,v.predecessor_id,v.reopen_reason,v.content_fingerprint,p.status AS period_status,r.bank_account_id,r.bank_dataset_id,r.book_dataset_id,mizan.has_permission($1,$2,$4,'outputs.prepare',r.bank_account_id) AS can_prepare,mizan.has_permission($1,$2,$4,'outputs.approve',r.bank_account_id) AS can_approve,mizan.has_permission($1,$2,$4,'outputs.export',r.bank_account_id) AS can_export,mizan.has_permission($1,$2,$4,'outputs.reopen',r.bank_account_id) AS can_reopen FROM mizan.output_versions v JOIN mizan.accounting_periods p ON (p.tenant_id,p.entity_id,p.id)=(v.tenant_id,v.entity_id,v.period_id) LEFT JOIN mizan.reconciliations r ON (r.tenant_id,r.entity_id,r.output_version_id)=(v.tenant_id,v.entity_id,v.id) WHERE v.tenant_id=$1 AND v.entity_id=$2 AND v.id=$3 AND mizan.has_permission($1,$2,$4,'reports.view',r.bank_account_id)`,[t,e,o,req.principal.id])).rows[0];if(!output)throw new HttpError(404,'RESOURCE_NOT_FOUND','Output unavailable');
   const checks=(await c.query('SELECT code,severity,passed,message FROM mizan.validation_results WHERE tenant_id=$1 AND entity_id=$2 AND output_version_id=$3 AND validated_fingerprint=$4 ORDER BY code',[t,e,o,output.content_fingerprint])).rows;
   const submissions=(await c.query('SELECT id,reviewer_id,submitted_by,content_fingerprint,withdrawn_at,withdrawal_reason,created_at FROM mizan.review_submissions WHERE tenant_id=$1 AND entity_id=$2 AND output_version_id=$3 ORDER BY created_at DESC LIMIT 100',[t,e,o])).rows;
   const decisions=(await c.query('SELECT id,submission_id,actor_id,decision,reason,reviewed_fingerprint,created_at FROM mizan.review_decisions WHERE tenant_id=$1 AND entity_id=$2 AND output_version_id=$3 ORDER BY created_at DESC LIMIT 100',[t,e,o])).rows;
   let reviewers=[];if(output.can_prepare)reviewers=(await c.query('SELECT mizan_private.reviewer_directory($1,$2,$3,$4,$5) AS value',[req.principal.id,req.principal.sessionId,t,e,output.bank_account_id])).rows[0].value;
   let changes=output.predecessor_id&&output.output_type!=='reconciliation'?(await c.query(`
     WITH facts AS (
       SELECT l.output_version_id,'line:'||i.code AS key,i.name AS label,l.value,l.currency_code AS unit
       FROM mizan.report_lines l JOIN mizan.report_line_items i ON (i.tenant_id,i.entity_id,i.id)=(l.tenant_id,l.entity_id,l.line_item_id)
       WHERE l.tenant_id=$1 AND l.entity_id=$2 AND l.output_version_id IN ($3,$4)
       UNION ALL
       SELECT m.output_version_id,'metric:'||f.formula_code,f.name,m.value,f.unit
       FROM mizan.metric_results m JOIN mizan.formula_versions f ON (f.tenant_id,f.entity_id,f.id)=(m.tenant_id,m.entity_id,m.formula_version_id)
       WHERE m.tenant_id=$1 AND m.entity_id=$2 AND m.output_version_id IN ($3,$4)
     ), old_values AS (SELECT * FROM facts WHERE output_version_id=$4), new_values AS (SELECT * FROM facts WHERE output_version_id=$3)
     SELECT key,coalesce(n.label,o.label) AS label,o.value::text AS previous,n.value::text AS current,
       (n.value-o.value)::text AS difference,coalesce(n.unit,o.unit) AS unit
     FROM new_values n FULL JOIN old_values o USING(key)
     WHERE n.value IS DISTINCT FROM o.value OR n.key IS NULL OR o.key IS NULL ORDER BY key
   `,[t,e,o,output.predecessor_id])).rows:[];
   if(output.predecessor_id&&output.output_type==='reconciliation'){
     changes=(await c.query(`
       SELECT facts.key,facts.key AS label,facts.previous::text,facts.current::text,
         (facts.current-facts.previous)::text AS difference,n.currency_code AS unit
       FROM mizan.reconciliations n JOIN mizan.reconciliations p ON (p.tenant_id,p.entity_id,p.output_version_id)=(n.tenant_id,n.entity_id,$4)
       CROSS JOIN LATERAL (VALUES
         ('bank_opening',p.bank_opening_balance,n.bank_opening_balance),('books_opening',p.book_opening_balance,n.book_opening_balance),
         ('bank_closing',p.bank_closing_balance,n.bank_closing_balance),('books_closing',p.book_closing_balance,n.book_closing_balance)
       ) facts(key,previous,current)
       WHERE (n.tenant_id,n.entity_id,n.output_version_id)=($1,$2,$3) AND facts.previous IS DISTINCT FROM facts.current
     `,[t,e,o,output.predecessor_id])).rows;
   }
   const required=['scope','completeness','balance','mapping'];return {output,checks,submissions,decisions,reviewers,changes,approvalEligible:required.every(code=>checks.some(c=>c.code===code&&c.passed))&&!checks.some(c=>c.severity==='blocking'&&!c.passed)};
  },{fresh:true}));}catch(e){next(e);}
 });
 router.post(base+'/:action',async(req,res,next)=>{
  try{const {tenantId:t,entityId:e,outputId:o}=req.params;uuid.parse(o);const action=z.enum(['submit','withdraw','approve','reject','request_changes']).parse(req.params.action),common={requestKey:uuid,expectedFingerprint:fingerprint,reason};
   const data=(action==='submit'?z.object({...common,reviewerId:uuid}).strict():z.object({...common,submissionId:uuid}).strict()).parse(req.body);
   const value=await scoped(req,t,e,null,async c=>(await c.query('SELECT mizan_private.review_action($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) AS value',[req.principal.id,req.principal.sessionId,t,e,o,action,data.reviewerId??null,data.submissionId??null,data.expectedFingerprint,data.reason,data.requestKey,req.requestId])).rows[0].value,{fresh:true});result(req,res,value);
  }catch(e){next(e.code==='P0002'?new HttpError(404,'RESOURCE_NOT_FOUND','Review record unavailable'):e.code==='40001'?e.message==='Review stage or period is frozen'?new HttpError(409,'OUTPUT_FROZEN','The review stage or accounting period is locked'):new HttpError(409,'STALE_OUTPUT','The reviewed fingerprint changed'):e);}
 });
}
