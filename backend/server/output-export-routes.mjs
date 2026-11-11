import {z} from 'zod';
import {hash} from './financial-core.mjs';
import {outputPdf,outputWorkbook} from './output-export-format.mjs';

const request=z.object({format:z.enum(['pdf','xlsx']),
  expectedFingerprint:z.string().regex(/^[a-f0-9]{64}$/),expectedStatus:z.string().min(1).max(32)}).strict();
const mime={pdf:'application/pdf',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
const titles={revenue:'Revenue',cost:'Cost of revenue',gross_profit:'Gross profit',operating_expenses:'Operating expenses',
  tax:'Tax',net_profit:'Net profit',assets:'Assets',liabilities:'Liabilities',equity:'Equity including period earnings',
  current_assets:'Current assets',current_liabilities:'Current liabilities',working_capital:'Working capital'};

export async function readExportRows(c,t,e,output){
  const args=[t,e,output.id];
  if(output.output_type==='reconciliation'){
    const {rows:[r]}=await c.query(`
      SELECT (r.bank_opening_balance)::text AS bank_opening,(r.book_opening_balance)::text AS books_opening,
        (r.bank_closing_balance)::text AS bank_closing,(r.book_closing_balance)::text AS books_closing,
        (r.bank_closing_balance+a.bank)::text AS bank_adjusted,(r.book_closing_balance+a.books)::text AS books_adjusted,
        (r.bank_closing_balance+a.bank-r.book_closing_balance-a.books)::text AS residual
      FROM mizan.reconciliations r CROSS JOIN LATERAL (
        SELECT coalesce(sum(i.signed_amount) FILTER(WHERE i.effect_side='bank'),0) AS bank,
          coalesce(sum(i.signed_amount) FILTER(WHERE i.effect_side='books'),0) AS books
        FROM mizan.reconciliation_items x JOIN mizan.reconciling_items i
          ON (i.tenant_id,i.entity_id,i.id)=(x.tenant_id,x.entity_id,x.item_id)
        WHERE (x.tenant_id,x.entity_id,x.reconciliation_id)=(r.tenant_id,r.entity_id,r.id) AND x.status='outstanding'
      ) a WHERE (r.tenant_id,r.entity_id,r.output_version_id)=($1,$2,$3)
    `,args);
    return [
      ['Bank opening balance',r.bank_opening],['Books opening balance',r.books_opening],
      ['Bank closing balance',r.bank_closing],['Books closing balance',r.books_closing],
      ['Adjusted bank balance',r.bank_adjusted],['Adjusted books balance',r.books_adjusted],['Residual difference',r.residual],
    ].map(([label,value])=>({label,value,unit:output.currency_code,state:'available'}));
  }
  if(output.output_type==='analysis'){
    return (await c.query(`
      SELECT f.name AS label,m.value::text AS value,m.value_state AS state,f.unit,
        concat_ws(' | ',f.expression,m.unavailable_reason) AS note
      FROM mizan.metric_results m JOIN mizan.formula_versions f
        ON (f.tenant_id,f.entity_id,f.id)=(m.tenant_id,m.entity_id,m.formula_version_id)
      WHERE (m.tenant_id,m.entity_id,m.output_version_id)=($1,$2,$3) ORDER BY f.formula_code,m.id LIMIT 10001
    `,args.slice(0,3))).rows;
  }
  return (await c.query(`
    SELECT i.name AS code,l.value::text AS value,l.value_state AS state,l.unavailable_reason AS note,l.currency_code AS unit
    FROM mizan.report_lines l JOIN mizan.report_line_items i
      ON (i.tenant_id,i.entity_id,i.id)=(l.tenant_id,l.entity_id,l.line_item_id)
    WHERE (l.tenant_id,l.entity_id,l.output_version_id)=($1,$2,$3) ORDER BY l.display_order,l.id LIMIT 10001
  `,args)).rows.map(({code,...row})=>({...row,label:titles[code]??code}));
}

export function mountOutputExportRoutes(router,{scoped,audit,HttpError}){
  router.post('/tenants/:tenantId/entities/:entityId/outputs/:outputId/export',async(req,res,next)=>{
    try{
      const {tenantId:t,entityId:e,outputId}=req.params;
      z.uuid().parse(outputId);
      const {format,expectedFingerprint,expectedStatus}=request.parse(req.body);
      const file=await scoped(req,t,e,null,async c=>{
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,42))',[e]);
        const {rows:[output]}=await c.query(`
          SELECT v.id,v.entity_id,v.output_type,v.version,v.status,v.content_fingerprint,v.currency_code,
            p.start_date::text,p.end_date::text,a.legal_name,k.minor_units,
            mizan.has_permission($1,$2,$4,'outputs.export',r.bank_account_id) AS can_export
          FROM mizan.output_versions v JOIN mizan.accounting_periods p
            ON (p.tenant_id,p.entity_id,p.id)=(v.tenant_id,v.entity_id,v.period_id)
          JOIN mizan.legal_entities a ON (a.tenant_id,a.id)=(v.tenant_id,v.entity_id)
          JOIN mizan.currencies k ON k.code=v.currency_code
          LEFT JOIN mizan.reconciliations r ON (r.tenant_id,r.entity_id,r.output_version_id)=(v.tenant_id,v.entity_id,v.id)
          WHERE (v.tenant_id,v.entity_id,v.id)=($1,$2,$3)
            AND v.output_type IN ('income_statement','financial_position','analysis','reconciliation')
            AND (v.output_type<>'reconciliation' OR r.id IS NOT NULL)
            AND mizan.has_permission($1,$2,$4,'reports.view',r.bank_account_id)
        `,[t,e,outputId,req.principal.id]);
        if(!output)throw new HttpError(404,'RESOURCE_NOT_FOUND','Output version is unavailable');
        if(!output.can_export)throw new HttpError(403,'EXPORT_PERMISSION_REQUIRED','Export permission is required for this version');
        if(output.content_fingerprint!==expectedFingerprint||output.status!==expectedStatus){
          throw new HttpError(409,'STALE_OUTPUT','Reload the current version and status before exporting');
        }
        const snapshot={...output,generatedAt:new Date().toISOString()};
        const rows=await readExportRows(c,t,e,snapshot);
        const bytes=await (format==='pdf'?outputPdf:outputWorkbook)(snapshot,rows);
        const sha256=hash(bytes);
        await audit(c,req,t,e,'output.exported','output',output.id,'Downloaded an exact saved output version',
          {format,version:output.version,status:output.status,fingerprint:output.content_fingerprint,sha256});
        return {bytes,sha256,filename:`mizan-${output.output_type}-v${output.version}-${output.id}.${format}`};
      },{fresh:true,snapshot:true});
      res.set('Cache-Control','no-store').set('X-Content-SHA256',file.sha256).attachment(file.filename).type(mime[format]).send(file.bytes);
    }catch(error){next(error);}
  });
}
