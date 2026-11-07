import {z} from 'zod';
import {hash} from './financial-core.mjs';
import {bankAmount, suggestBankMatches} from './bank-core.mjs';
import {decryptField} from './financial-storage.mjs';
import {createBankDraft} from './reconciliation-create.mjs';

const pair = z.object({bankDatasetId:z.uuid(), bookDatasetId:z.uuid(), confirmation:z.literal(true)}).strict();
const algorithm = 'published-bank-pair-v1';
const availableDatasets = `
  SELECT d.id,d.version,d.period_id,d.data_type,d.currency_code,d.content_fingerprint,
         p.start_date::text,p.end_date::text,p.settings_version_id,p.status AS period_status,c.minor_units,
         b.bank_account_id,a.label AS bank_label,
         trunc(b.opening_balance,c.minor_units)::text AS opening,trunc(b.closing_balance,c.minor_units)::text AS closing,
         b.sign_policy
  FROM mizan.published_bank_balances b
  JOIN mizan.dataset_versions d ON (d.tenant_id,d.entity_id,d.id)=(b.tenant_id,b.entity_id,b.id)
  JOIN mizan.accounting_periods p ON (p.tenant_id,p.entity_id,p.id)=(d.tenant_id,d.entity_id,d.period_id)
  JOIN mizan.currencies c ON c.code=d.currency_code
  JOIN mizan.bank_accounts a ON (a.tenant_id,a.entity_id,a.id)=(b.tenant_id,b.entity_id,b.bank_account_id)
  WHERE d.tenant_id=$1 AND d.entity_id=$2 AND d.status='published' AND d.complete_dataset AND a.active
    AND mizan.has_permission($1,$2,$3,'reports.view',b.bank_account_id)
    AND mizan.has_permission($1,$2,$3,'outputs.prepare',b.bank_account_id)
    AND EXISTS (
      SELECT 1 FROM mizan.dataset_imports x
      JOIN mizan.import_batches i ON (i.tenant_id,i.entity_id,i.id)=(x.tenant_id,x.entity_id,x.import_batch_id)
      JOIN mizan.source_files f ON (f.tenant_id,f.entity_id,f.id)=(i.tenant_id,i.entity_id,i.source_file_id)
      JOIN mizan.processing_jobs j ON (j.tenant_id,j.entity_id,j.id)=(f.tenant_id,f.entity_id,f.scan_job_id)
      WHERE (x.tenant_id,x.entity_id,x.dataset_id)=(d.tenant_id,d.entity_id,d.id)
        AND i.status='published' AND f.deleted_at IS NULL AND f.scan_status='clean' AND f.scanned_at IS NOT NULL
        AND j.status='succeeded' AND j.job_type='file_scan' AND j.input_references->>'sourceId'=f.id::text
    )
`;

async function matchRows(connection, tenant, entity, dataset, table) {
  const {rows} = await connection.query(`
    SELECT t.id AS "transactionId",t.source_row_id AS "sourceId",t.posting_date::text AS date,
           trunc(t.signed_amount,$4)::text AS amount,t.reference_ciphertext
    FROM mizan.${table} t
    JOIN mizan.source_rows s ON (s.tenant_id,s.entity_id,s.id)=(t.tenant_id,t.entity_id,t.source_row_id)
    WHERE t.tenant_id=$1 AND t.entity_id=$2 AND t.dataset_id=$3 ORDER BY s.row_number
  `, [tenant,entity,dataset.id,dataset.minor_units]);
  const context = `${tenant}:${entity}:${dataset.bank_account_id}:transaction`;
  return rows.map(({reference_ciphertext,...row})=>({...row, units:bankAmount(row.amount,dataset.minor_units),
    reference:reference_ciphertext ? decryptField(reference_ciphertext,context) : ''}));
}

export function mountPublishedBankRoutes(router, {scoped,audit,result,HttpError}) {
  const base = '/tenants/:tenantId/entities/:entityId';
  router.get(base+'/published-bank-datasets', async (req,res,next) => {
    try {
      const {tenantId:t,entityId:e}=req.params;
      const datasets=await scoped(req,t,e,null,async connection => (await connection.query(
        availableDatasets+" AND p.status='open' ORDER BY d.created_at DESC,d.id LIMIT 100",
        [t,e,req.principal.id],
      )).rows.map(({content_fingerprint,settings_version_id,minor_units,...data})=>data));
      result(req,res,datasets);
    } catch(error) {next(error);}
  });
  router.post(base+'/reconciliations/from-published', async (req,res,next) => {
    try {
      const {tenantId:t,entityId:e}=req.params;
      const data=pair.parse(req.body);
      const draft=await scoped(req,t,e,null,async connection => {
        await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1,42))',[e]);
        const {rows: selected}=await connection.query(availableDatasets+' AND d.id=ANY($4::uuid[]) FOR UPDATE OF p',
          [t,e,req.principal.id,[data.bankDatasetId,data.bookDatasetId]]);
        const bank=selected.find(dataset=>dataset.id===data.bankDatasetId && dataset.data_type==='bank_statement');
        const books=selected.find(dataset=>dataset.id===data.bookDatasetId && dataset.data_type==='bank_ledger');
        if (!bank || !books) throw new HttpError(404,'RESOURCE_NOT_FOUND','Both published bank sources must be available in this scope');
        if (bank.bank_account_id!==books.bank_account_id || bank.currency_code!==books.currency_code || bank.period_id!==books.period_id
            || bank.sign_policy!==books.sign_policy) {
          throw new HttpError(422,'BANK_PAIR_SCOPE_MISMATCH','Both sources must use the same bank account, currency, period and sign convention');
        }
        const {rows:[prior]}=await connection.query(`
          SELECT id,output_version_id FROM mizan.reconciliations
          WHERE tenant_id=$1 AND entity_id=$2 AND bank_dataset_id=$3 AND book_dataset_id=$4
          ORDER BY created_at DESC LIMIT 1
        `,[t,e,bank.id,books.id]);
        if (prior) return {...prior,reused:true};
        if (bank.period_status!=='open') throw new HttpError(409,'PERIOD_NOT_OPEN','Use an open accounting period');
        const bankRows=await matchRows(connection,t,e,bank,'bank_transactions');
        const bookRows=await matchRows(connection,t,e,books,'book_transactions');
        const suggestions=suggestBankMatches(bankRows,bookRows);
        const fingerprint=hash(JSON.stringify([algorithm,bank.id,bank.content_fingerprint,books.id,books.content_fingerprint]));
        const saved=await createBankDraft(connection,{
          scope:{tenant_id:t,entity_id:e},actor:req.principal.id,
          bank:{id:bank.bank_account_id,currency_code:bank.currency_code},
          period:{id:bank.period_id,settings_version_id:bank.settings_version_id,cutoff:bank.end_date,minor_units:bank.minor_units},
          sides:{
            bank:{datasetId:bank.id,opening:bank.opening,closing:bank.closing,signPolicy:bank.sign_policy},
            books:{datasetId:books.id,opening:books.opening,closing:books.closing,signPolicy:books.sign_policy},
          },suggestions,fingerprint,algorithm,complete:true,
        });
        await audit(connection,req,t,e,'reconciliation.imported','reconciliation',saved.id,
          'Draft from published and validated bank datasets',{bankDatasetId:bank.id,bookDatasetId:books.id,suggestions:suggestions.length});
        return saved;
      },{fresh:true});
      result(req,res,draft,draft.reused?200:201);
    } catch(error) {next(error);}
  });
}
