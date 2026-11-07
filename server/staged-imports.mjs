import {randomUUID} from 'node:crypto';
import {hash} from './financial-core.mjs';
import {encryptField, rowContext} from './financial-storage.mjs';
import {bulk, insert} from './financial-routes.mjs';
import {checkImportRows} from './import-quality.mjs';

export const stagedVersion = 'staged-tabular-v1';

export async function writeQuality(connection, scope, batchId, rows, dataType, period) {
  const quality = checkImportRows(rows, dataType, period);
  const runId = randomUUID();
  await connection.query(`
    INSERT INTO mizan.quality_runs
      (id,tenant_id,entity_id,import_batch_id,rule_version,content_fingerprint,records_read,accepted,rejected,
       excluded,totals_before,totals_after,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,clock_timestamp())
  `, [runId, scope.tenant_id, scope.entity_id, batchId, stagedVersion,
    hash(JSON.stringify(rows.map(row => [row.id, row.values, Boolean(row.excluded)]))),
    quality.recordsRead, quality.accepted, quality.rejected, quality.excluded, quality.totalsBefore, quality.totalsAfter]);
  const byNumber = new Map(rows.map(row => [row.rowNumber, row.id]));
  const created_at = new Date().toISOString();
  for (let offset = 0; offset < quality.issues.length; offset += 250) {
    await bulk(connection, 'quality_issues', quality.issues.slice(offset, offset + 250).map(issue => ({
      ...scope, id: randomUUID(), created_at, quality_run_id: runId, source_row_id: byNumber.get(issue.rowNumber) ?? null,
      severity: issue.severity, code: issue.code, message: issue.message,
      evidence: {field: issue.field ?? null, rowNumber: issue.rowNumber ?? null},
    })));
  }
  return quality;
}

export async function stageImport(connection, {tenantId, entityId, sourceId, digest, templateId, mapping, parsed, period, actorId, HttpError}) {
  if (period.status !== 'open') throw new HttpError(409, 'PERIOD_NOT_OPEN', 'Import requires an open period');
  if (!parsed.completeSourcePreview || !parsed.rows.length || parsed.rows.length > 5000) {
    throw new HttpError(422, 'IMPORT_INCOMPLETE', 'A complete worksheet within the staging limits is required');
  }
  const scope = {tenant_id: tenantId, entity_id: entityId};
  const key = hash(JSON.stringify([stagedVersion, sourceId, digest, templateId, mapping.periodId]));
  const {rows: [existing]} = await connection.query(`
    SELECT id FROM mizan.import_batches WHERE tenant_id=$1 AND entity_id=$2 AND idempotency_key=$3
  `, [tenantId, entityId, key]);
  if (existing) return {batchId: existing.id, reused: true};

  const batchId = randomUUID();
  const issuesByRow = new Map();
  for (const issue of parsed.issues) {
    const items = issuesByRow.get(issue.rowNumber) ?? [];
    items.push(issue);
    issuesByRow.set(issue.rowNumber, items);
  }
  const rows = parsed.rows.map(row => ({...row, id: randomUUID(), issues: issuesByRow.get(row.rowNumber) ?? []}));
  await insert(connection, 'import_batches', {
    ...scope, id: batchId, source_file_id: sourceId, template_id: templateId, period_id: mapping.periodId,
    parser_version: stagedVersion, data_type: mapping.dataType, balance_basis: null,
    range_start: period.start_date, range_end: period.end_date, idempotency_key: key,
    status: 'needs_review', complete_dataset: false,
  });
  const created_at = new Date().toISOString();
  for (let offset = 0; offset < rows.length; offset += 250) {
    await bulk(connection, 'source_rows', rows.slice(offset, offset + 250).map(row => {
      const original = {cells: row.cells, startLine: row.startLine, dateSystem: parsed.dateSystem, values: row.values, issues: row.issues};
      return {...scope, id: row.id, created_at, import_batch_id: batchId, worksheet: mapping.sheetName,
        row_number: row.rowNumber, row_fingerprint: hash(JSON.stringify([mapping.sheetName, row.rowNumber, row.cells])),
        original_values: {sealed: encryptField(JSON.stringify(original), rowContext(tenantId, entityId, row.id))}};
    }));
  }
  const quality = await writeQuality(connection, scope, batchId, rows, mapping.dataType, period);
  for (let offset = 0; offset < rows.length; offset += 250) {
    await bulk(connection, 'row_dispositions', rows.slice(offset, offset + 250).map(row => {
      const rejected = quality.blocked.has(row.rowNumber);
      return {...scope, id: randomUUID(), created_at, source_row_id: row.id, version: 1,
        disposition: rejected ? 'rejected' : 'accepted',
        reason: rejected ? 'Blocking validation issue' : 'Validated for draft review', actor_id: actorId};
    }));
  }
  return {batchId, reused: false, recordsRead: rows.length, blocking: quality.blocking};
}
