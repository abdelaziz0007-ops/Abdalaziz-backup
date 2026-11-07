import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {hash} from './financial-core.mjs';
import {decryptField, encryptField} from './financial-storage.mjs';
import {bulk, insert} from './financial-routes.mjs';
import {previewMapping} from './parser/field-mapping.mjs';
import {rowContext, stagedVersion, writeQuality} from './staged-imports.mjs';

const correctionSchema = z.object({
  rowId: z.uuid(), requestKey: z.uuid(), expectedVersion: z.number().int().min(0),
  reason: z.string().trim().min(8).max(500),
  change: z.object({field: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,40}$/), value: z.string().max(500)}).strict().optional(),
  excluded: z.boolean().optional(),
}).strict().refine(value => value.change || value.excluded !== undefined, {message: 'Provide a correction or an exclusion decision'});

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
          SELECT id, records_read::int, accepted::int, rejected::int, excluded::int, totals_before, totals_after
          FROM mizan.quality_runs WHERE tenant_id=$1 AND entity_id=$2 AND import_batch_id=$3
          ORDER BY created_at DESC,id DESC LIMIT 1
        `, [t, e, batchId]);
        const {rows: issues} = await connection.query(`
          SELECT severity,code,message,evidence FROM mizan.quality_issues
          WHERE tenant_id=$1 AND entity_id=$2 AND quality_run_id=$3
          ORDER BY severity,created_at,id LIMIT 100
        `, [t, e, quality.id]);
        const rows = await rowsFor(connection, t, e, batchId, 25, offset);
        return {
          id: batchId, currencyCode: batch.currency_code, editable: batch.status === 'needs_review' && batch.period_status === 'open',
          fields: batch.required_columns.map(item => item.field), quality, issues,
          rows: rows.map(row => ({id: row.id, rowNumber: row.rowNumber, values: row.values,
            originalValues: row.originalValues, version: row.version, disposition: row.disposition})),
        };
      }));
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
