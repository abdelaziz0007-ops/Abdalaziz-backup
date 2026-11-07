import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {hash} from './financial-core.mjs';
import {decryptField, encryptField, rowContext} from './financial-storage.mjs';
import {bulk, insert} from './financial-routes.mjs';
import {previewMapping} from './parser/field-mapping.mjs';
import {stagedVersion, writeQuality} from './staged-imports.mjs';
import {assertPublishable, materializeImport} from './import-publication.mjs';
import {bankPublicationDetails, isBankImport} from './bank-publication.mjs';
import {bankAmount} from './bank-core.mjs';

const correctionSchema = z.object({
  rowId: z.uuid(), requestKey: z.uuid(), expectedVersion: z.number().int().min(0),
  reason: z.string().trim().min(8).max(500),
  change: z.object({field: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,40}$/), value: z.string().max(500)}).strict().optional(),
  excluded: z.boolean().optional(),
}).strict().refine(value => value.change || value.excluded !== undefined, {message: 'Provide a correction or an exclusion decision'});
const publicationSchema = z.object({
  qualityRunId: z.uuid(), confirmation: z.literal(true), balanceBasis: z.literal('period').optional(),
  reason: z.string().trim().min(8).max(500),
  bank: z.object({
    accountId: z.uuid(), opening: z.string().max(40), closing: z.string().max(40),
    signPolicy: z.literal('cash_increase_positive'),
  }).strict().optional(),
}).strict();

async function batchAccess(connection, tenant, entity, id, HttpError, lock = false) {
  const {rows: [batch]} = await connection.query(`
    SELECT b.id, b.status, b.data_type, b.period_id, f.original_name,
           p.status AS period_status, p.start_date::text, p.end_date::text, s.currency_code, c.minor_units,
           t.required_columns, t.column_mapping, t.header_row, t.worksheet_name, t.date_format, t.decimal_separator, t.thousands_separator
    FROM mizan.import_batches b
    JOIN mizan.source_files f ON (f.tenant_id,f.entity_id,f.id)=(b.tenant_id,b.entity_id,b.source_file_id)
    JOIN mizan.processing_jobs j ON (j.tenant_id,j.entity_id,j.id)=(f.tenant_id,f.entity_id,f.scan_job_id)
    JOIN mizan.import_templates t ON (t.tenant_id,t.entity_id,t.id)=(b.tenant_id,b.entity_id,b.template_id)
    JOIN mizan.accounting_periods p ON (p.tenant_id,p.entity_id,p.id)=(b.tenant_id,b.entity_id,b.period_id)
    JOIN mizan.entity_settings_versions s ON (s.tenant_id,s.entity_id,s.id)=(p.tenant_id,p.entity_id,p.settings_version_id)
    JOIN mizan.currencies c ON c.code=s.currency_code
    WHERE b.tenant_id=$1 AND b.entity_id=$2 AND b.id=$3 AND b.parser_version=$4
      AND f.deleted_at IS NULL AND f.scan_status='clean' AND f.scanned_at IS NOT NULL
      AND j.status='succeeded' AND j.job_type='file_scan' AND j.input_references->>'sourceId'=f.id::text
    ${lock ? 'FOR UPDATE OF b,p' : ''}
  `, [tenant, entity, id, stagedVersion]);
  if (!batch) throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Staged import not found in this scope');
  return batch;
}

async function rowsFor(connection, tenant, entity, batchId, limit, offset) {
  const {rows} = await connection.query(`
    SELECT r.id, r.row_number AS "rowNumber", r.original_values, x.version, x.derived_values,
           d.version AS disposition_version, d.disposition
    FROM mizan.source_rows r
    LEFT JOIN LATERAL (
      SELECT version,derived_values FROM mizan.row_transformations
      WHERE (tenant_id,entity_id,source_row_id)=(r.tenant_id,r.entity_id,r.id)
      ORDER BY version DESC LIMIT 1
    ) x ON true
    LEFT JOIN LATERAL (
      SELECT version,disposition FROM mizan.row_dispositions
      WHERE (tenant_id,entity_id,source_row_id)=(r.tenant_id,r.entity_id,r.id)
      ORDER BY version DESC LIMIT 1
    ) d ON true
    WHERE r.tenant_id=$1 AND r.entity_id=$2 AND r.import_batch_id=$3 ORDER BY r.row_number LIMIT $4 OFFSET $5
  `, [tenant, entity, batchId, limit, offset]);
  return rows.map(row => {
    const context = rowContext(tenant, entity, row.id);
    const original = JSON.parse(decryptField(row.original_values.sealed, context));
    const current = row.version ? JSON.parse(decryptField(row.derived_values.sealed, rowContext(tenant, entity, row.id, row.version))) : original;
    return {...current, id: row.id, rowNumber: row.rowNumber, version: row.version ?? 0,
      originalValues: original.values, dateSystem: original.dateSystem, issues: current.issues.filter(issue => issue.code !== 'POSSIBLE_DUPLICATE'),
      disposition: row.disposition, dispositionVersion: row.disposition_version};
  });
}

function remap(row, batch, change, HttpError) {
  const column = batch.column_mapping.fields[change.field];
  if (!Object.hasOwn(batch.column_mapping.fields, change.field) || !column) {
    throw new HttpError(422, 'INVALID_MAPPING_FIELD', 'Only a mapped field can be corrected');
  }
  const cells = [...row.cells];
  while (cells.length < column) cells.push({text: '', kind: 'blank'});
  cells[column - 1] = {...cells[column - 1], text: change.value};
  const headers = [];
  for (const entry of batch.required_columns) headers[entry.column - 1] = {text: entry.header};
  const headerCells = Array.from(headers, item => item ?? {text: ''});
  const {rows: [mapped], issues} = previewMapping({
    dateSystem: row.dateSystem, parserVersion: stagedVersion,
    sheets: [{name: batch.worksheet_name, rowCount: 2, rows: [
      {rowNumber: batch.header_row, cells: headerCells},
      {rowNumber: row.rowNumber, cells},
    ]}],
  }, {
    sheetName: batch.worksheet_name, headerRow: batch.header_row, mapping: batch.column_mapping.fields,
    dataType: batch.data_type, requiredHeaders: batch.required_columns, dateFormat: batch.date_format,
    numberOptions: {precision: batch.minor_units, decimalSeparator: batch.decimal_separator, thousandsSeparator: batch.thousands_separator},
  });
  return {cells, values: mapped.values, issues};
}

export function mountStagedImportRoutes(router, {scoped, audit, result, HttpError}) {
  const root = '/tenants/:tenantId/entities/:entityId/staged-imports';
  router.get(root, async (req, res, next) => {
    try {
      const {tenantId: t, entityId: e} = req.params;
      result(req, res, await scoped(req, t, e, 'imports.manage', async connection => (await connection.query(`
        SELECT b.id, b.status, b.data_type, f.original_name, b.range_start::text, b.range_end::text
        FROM mizan.import_batches b JOIN mizan.source_files f ON (f.tenant_id,f.entity_id,f.id)=(b.tenant_id,b.entity_id,b.source_file_id)
        WHERE b.tenant_id=$1 AND b.entity_id=$2 AND b.parser_version=$3 AND f.deleted_at IS NULL
          AND f.scan_status='clean'
        ORDER BY b.created_at DESC LIMIT 50
      `, [t, e, stagedVersion])).rows));
    } catch (error) { next(error); }
  });
  router.get(root + '/:batchId', async (req, res, next) => {
    try {
      const {tenantId: t, entityId: e, batchId} = req.params;
      z.uuid().parse(batchId);
      const offset = z.coerce.number().int().min(0).max(5000).parse(req.query.offset ?? 0);
      result(req, res, await scoped(req, t, e, 'imports.manage', async connection => {
        await connection.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,42))', [e]);
        const batch = await batchAccess(connection, t, e, batchId, HttpError);
        const {rows: [quality]} = await connection.query(`
          SELECT q.id, records_read::int, accepted::int, rejected::int, excluded::int, totals_before, totals_after,
            EXISTS (SELECT 1 FROM mizan.quality_issues i WHERE
              (i.tenant_id,i.entity_id,i.quality_run_id)=(q.tenant_id,q.entity_id,q.id) AND severity='blocking') AS has_blockers
          FROM mizan.quality_runs q WHERE tenant_id=$1 AND entity_id=$2 AND import_batch_id=$3
          ORDER BY created_at DESC,q.id DESC LIMIT 1
        `, [t, e, batchId]);
        const {rows: issues} = await connection.query(`
          SELECT severity,code,message,evidence FROM mizan.quality_issues
          WHERE tenant_id=$1 AND entity_id=$2 AND quality_run_id=$3
          ORDER BY severity,created_at,id LIMIT 100
        `, [t, e, quality.id]);
        const rows = await rowsFor(connection, t, e, batchId, 25, offset);
        const bank = isBankImport(batch.data_type);
        const bankAccounts = bank ? (await connection.query(`
          SELECT id,label,identifier_last_four FROM mizan.bank_accounts
          WHERE tenant_id=$1 AND entity_id=$2 AND currency_code=$3 AND active
            AND mizan.has_permission($1,$2,$4,'imports.manage',id)
          ORDER BY label,id LIMIT 100
        `, [t, e, batch.currency_code, req.principal.id])).rows : [];
        return {
          id: batchId, currencyCode: batch.currency_code, editable: batch.status === 'needs_review' && batch.period_status === 'open',
          status: batch.status, dataType: batch.data_type, bankAccounts,
          publishable: batch.status === 'needs_review' && batch.period_status === 'open'
            && (!bank || quality.records_read <= 1000 && bankAccounts.length > 0) && quality.records_read > 0
            && quality.records_read === quality.accepted && !quality.has_blockers,
          fields: batch.required_columns.map(item => item.field), quality, issues,
          rows: rows.map(row => ({id: row.id, rowNumber: row.rowNumber, values: row.values,
            originalValues: row.originalValues, version: row.version, disposition: row.disposition})),
        };
      }));
    } catch (error) { next(error); }
  });
  router.post(root + '/:batchId/publish', async (req, res, next) => {
    try {
      const {tenantId: t, entityId: e, batchId} = req.params;
      z.uuid().parse(batchId);
      const data = publicationSchema.parse(req.body);
      result(req, res, await scoped(req, t, e, 'imports.manage', async connection => {
        await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1,42))', [e]);
        const batch = await batchAccess(connection, t, e, batchId, HttpError, true);
        const {rows: [quality]} = await connection.query(`
          SELECT id, content_fingerprint FROM mizan.quality_runs
          WHERE tenant_id=$1 AND entity_id=$2 AND import_batch_id=$3 ORDER BY created_at DESC,id DESC LIMIT 1
        `, [t, e, batchId]);
        if (!quality || quality.id !== data.qualityRunId) {
          throw new HttpError(409, 'IMPORT_VALIDATION_CHANGED', 'Reload the latest validation before publishing');
        }
        const bankImport = isBankImport(batch.data_type);
        if (bankImport !== Boolean(data.bank)) {
          throw new HttpError(422, 'BANK_BALANCES_REQUIRED', 'Bank publication requires a bank account and explicit balances');
        }
        if ((batch.data_type === 'trial_balance') !== (data.balanceBasis === 'period')) {
          throw new HttpError(422, 'IMPORT_BASIS_REQUIRED', 'Confirm period-specific balances for trial-balance publication');
        }
        if (batch.status === 'published') {
          const {rows: [existing]} = await connection.query(`
            SELECT id FROM mizan.dataset_versions WHERE tenant_id=$1 AND entity_id=$2 AND idempotency_key=$3 AND status='published'
          `, [t, e, hash('publish-staged:' + batchId)]);
          if (existing && bankImport) {
            bankAmount(data.bank.opening, batch.minor_units);
            bankAmount(data.bank.closing, batch.minor_units);
            const {rows: [same]} = await connection.query(`
              SELECT bank_account_id=$4 AND opening_balance=$5::numeric AND closing_balance=$6::numeric
                AND sign_policy=$7 AND mizan.has_permission($1,$2,$8,'imports.manage',bank_account_id) AS matches
              FROM mizan.published_bank_balances WHERE tenant_id=$1 AND entity_id=$2 AND id=$3
            `, [t,e,existing.id,data.bank.accountId,data.bank.opening,data.bank.closing,data.bank.signPolicy,req.principal.id]);
            if (!same?.matches) throw new HttpError(409, 'BANK_PUBLICATION_CHANGED', 'This batch was published with a different bank account or balances');
          }
          if (existing) return {datasetId: existing.id, reused: true};
        }
        if (batch.status !== 'needs_review' || batch.period_status !== 'open') {
          throw new HttpError(409, 'IMPORT_NOT_EDITABLE', 'Publication requires a review batch in an open period');
        }
        const rows = await rowsFor(connection, t, e, batchId, 5000, 0);
        assertPublishable(batch, rows, quality, HttpError);
        const scope = {tenant_id: t, entity_id: e};
        const bank = data.bank && await bankPublicationDetails(connection, {
          scope, batch, rows, bank:data.bank, actor:req.principal.id, HttpError,
        });
        const datasetId = await materializeImport(connection, {
          scope, batch, rows, quality, actor: req.principal.id, bank,
          session: req.principal.sessionId, basis: bank ? 'period' : data.balanceBasis ?? 'not_applicable', HttpError,
        });
        await audit(connection, req, t, e, 'import.published', 'dataset', datasetId, data.reason,
          {batchId, qualityRunId: quality.id, rows: rows.length, dataType: batch.data_type, bankAccountId:bank?.accountId ?? null});
        return {datasetId, reused: false};
      }, {fresh: true}));
    } catch (error) { next(error); }
  });
  router.post(root + '/:batchId/corrections', async (req, res, next) => {
    try {
      const {tenantId: t, entityId: e, batchId} = req.params;
      z.uuid().parse(batchId);
      const data = correctionSchema.parse(req.body);
      result(req, res, await scoped(req, t, e, 'imports.manage', async connection => {
        await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1,42))', [e]);
        const batch = await batchAccess(connection, t, e, batchId, HttpError, true);
        if (batch.status !== 'needs_review' || batch.period_status !== 'open') {
          throw new HttpError(409, 'IMPORT_NOT_EDITABLE', 'Corrections require a review batch in an open period');
        }
        const fingerprint = hash(JSON.stringify([batchId, data]));
        const {rows: [existing]} = await connection.query(`
          SELECT source_row_id,version,derived_values FROM mizan.row_transformations
          WHERE tenant_id=$1 AND entity_id=$2 AND id=$3
        `, [t, e, data.requestKey]);
        if (existing) {
          const value = JSON.parse(decryptField(existing.derived_values.sealed, rowContext(t, e, existing.source_row_id, existing.version)));
          if (value.fingerprint !== fingerprint) throw new HttpError(409, 'REQUEST_KEY_REUSED', 'The correction key belongs to another request');
          return {rowId: data.rowId, version: existing.version, reused: true};
        }
        const rows = await rowsFor(connection, t, e, batchId, 5000, 0);
        const row = rows.find(item => item.id === data.rowId);
        if (!row) throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Row not found in this import');
        if (row.version !== data.expectedVersion) throw new HttpError(409, 'ROW_VERSION_CHANGED', 'Reload the row before correcting it');
        if (data.change) Object.assign(row, remap(row, batch, data.change, HttpError));
        row.excluded = data.excluded ?? Boolean(row.excluded);
        const version = row.version + 1;
        const scope = {tenant_id: t, entity_id: e};
        const derived = {cells: row.cells, values: row.values, issues: row.issues, excluded: row.excluded, fingerprint};
        await insert(connection, 'row_transformations', {
          ...scope, id: data.requestKey, source_row_id: row.id, version,
          derived_values: JSON.stringify({sealed: encryptField(JSON.stringify(derived), rowContext(t, e, row.id, version))}),
          reason: data.reason, actor_id: req.principal.id,
        });
        const quality = await writeQuality(connection, scope, batchId, rows, batch.data_type, batch);
        const created_at = new Date().toISOString();
        const decisions = rows.flatMap(item => {
          const disposition = item.excluded ? 'excluded' : quality.blocked.has(item.rowNumber) ? 'rejected' : 'accepted';
          if (item.id !== row.id && disposition === item.disposition) return [];
          return [{...scope, id: randomUUID(), created_at, source_row_id: item.id,
            version: item.dispositionVersion + 1, disposition, actor_id: req.principal.id,
            reason: item.id === row.id ? data.reason : 'Revalidated after a related row correction'}];
        });
        for (let index = 0; index < decisions.length; index += 250) {
          await bulk(connection, 'row_dispositions', decisions.slice(index, index + 250));
        }
        await audit(connection, req, t, e, 'import.row_corrected', 'source_row', row.id, data.reason,
          {batchId, version, excluded: row.excluded, field: data.change?.field ?? null});
        return {rowId: row.id, version, reused: false};
      }, {fresh: true}));
    } catch (error) { next(error); }
  });
}
