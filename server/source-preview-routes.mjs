import {z} from 'zod';
import {previewConfigured, runIsolatedPreview} from './parser/isolated-preview.mjs';
import {hash} from './financial-core.mjs';

const mappingSchema = z.object({
  periodId: z.uuid(),
  sheetName: z.string().min(1).max(100),
  headerRow: z.number().int().min(1).max(100),
  dataType: z.enum(['trial_balance', 'general_ledger', 'bank_statement', 'bank_ledger']),
  mapping: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,40}$/), z.number().int().min(1).max(256)),
  decimalSeparator: z.enum(['.', ',']).default('.'),
  thousandsSeparator: z.enum(['.', ',', ' ']).nullable().default(null),
  dateFormat: z.enum(['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'excel_serial']).default('YYYY-MM-DD'),
}).strict().refine(value => value.decimalSeparator !== value.thousandsSeparator, {
  message: 'Choose distinct decimal and thousands separators',
});
const requestSchema = z.object({
  delimiter: z.enum([',', ';', '\t']).default(','),
  previewRows: z.number().int().min(1).max(200).default(50),
  mapping: mappingSchema.optional(),
  template: z.object({id: z.uuid(), periodId: z.uuid()}).strict().optional(),
  saveTemplate: z.object({
    requestKey: z.uuid(), name: z.string().trim().min(1).max(120),
    predecessorId: z.uuid().nullable().default(null),
  }).strict().optional(),
}).strict().refine(value => !(value.template && value.mapping) && (!value.saveTemplate || value.mapping), {
  message: 'Use either a saved template or explicit column mapping. Saving requires explicit mapping.',
});
const formats = new Map([
  ['text/csv', 'csv'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
]);
const templateKind = 'mapped-preview-v1';

async function saveTemplate(connection, {tenantId, entityId, actorId, draft, mapping, delimiter,
  format, headers, HttpError}) {
  const serializedHeaders = JSON.stringify(headers);
  if (!Array.isArray(headers) || !headers.length || Buffer.byteLength(serializedHeaders) > 8192) {
    throw new HttpError(422, 'TEMPLATE_HEADER_LIMIT', 'Mapped column headers exceed the template limit');
  }
  await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1,42))', [entityId]);
  const fingerprint = hash(JSON.stringify([draft.name, draft.predecessorId, format, delimiter, mapping, headers]));
  const {rows: [existing]} = await connection.query(`
    SELECT id, name, version, column_mapping->>'requestFingerprint' AS fingerprint
    FROM mizan.import_templates WHERE tenant_id=$1 AND entity_id=$2 AND id=$3
  `, [tenantId, entityId, draft.requestKey]);
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      throw new HttpError(409, 'REQUEST_KEY_REUSED', 'This save key already belongs to another template request');
    }
    return {id: existing.id, name: existing.name, version: existing.version, reused: true};
  }

  let logicalId = draft.requestKey;
  let version = 1;
  if (draft.predecessorId) {
    const {rows: [previous]} = await connection.query(`
      SELECT id, logical_template_id, version, column_mapping
      FROM mizan.import_templates
      WHERE tenant_id=$1 AND entity_id=$2 AND id=$3 AND column_mapping->>'kind'=$4
    `, [tenantId, entityId, draft.predecessorId, templateKind]);
    if (!previous) throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Previous template version not found');
    if (previous.column_mapping.sourceFormat !== format || previous.column_mapping.dataType !== mapping.dataType) {
      throw new HttpError(422, 'TEMPLATE_TYPE_MISMATCH', 'Use a new template when changing source format or data type');
    }
    const {rows: [latest]} = await connection.query(`
      SELECT id FROM mizan.import_templates
      WHERE tenant_id=$1 AND entity_id=$2 AND logical_template_id=$3 ORDER BY version DESC LIMIT 1
    `, [tenantId, entityId, previous.logical_template_id]);
    if (latest?.id !== previous.id) {
      throw new HttpError(409, 'TEMPLATE_VERSION_CHANGED', 'Reload the latest template version before saving');
    }
    logicalId = previous.logical_template_id;
    version = previous.version + 1;
  }
  const definition = {
    kind: templateKind, dataType: mapping.dataType, fields: mapping.mapping,
    sourceFormat: format, delimiter, requestFingerprint: fingerprint,
  };
  const {rows: [saved]} = await connection.query(`
    INSERT INTO mizan.import_templates
      (id, tenant_id, entity_id, logical_template_id, version, name, predecessor_id, required_columns,
       column_mapping, header_row, worksheet_name, date_format, decimal_separator, thousands_separator, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING id, name, version
  `, [draft.requestKey, tenantId, entityId, logicalId, version, draft.name, draft.predecessorId,
    serializedHeaders, definition, mapping.headerRow, mapping.sheetName, mapping.dateFormat,
    mapping.decimalSeparator, mapping.thousandsSeparator, actorId]);
  return {...saved, reused: false};
}

export function mountSourcePreviewRoute(router, {scoped, audit, result, HttpError, storage,
  configured = previewConfigured, parse = runIsolatedPreview}) {
  let previewRunning = false;
  const route = '/tenants/:tenantId/entities/:entityId/source-files/:sourceId/preview';
  router.get('/tenants/:tenantId/entities/:entityId/import-templates', async (req, res, next) => {
    try {
      const {tenantId, entityId} = req.params;
      const templates = await scoped(req, tenantId, entityId, 'imports.manage', async connection => {
        const {rows} = await connection.query(`
          SELECT id, name, version, source_format, data_type FROM (
            SELECT DISTINCT ON (logical_template_id) id, name, version, created_at,
              column_mapping->>'sourceFormat' AS source_format, column_mapping->>'dataType' AS data_type
            FROM mizan.import_templates
            WHERE tenant_id=$1 AND entity_id=$2 AND column_mapping->>'kind'=$3
            ORDER BY logical_template_id, version DESC
          ) latest ORDER BY created_at DESC LIMIT 100
        `, [tenantId, entityId, templateKind]);
        return rows;
      });
      result(req, res, templates);
    } catch (error) {
      next(error);
    }
  });

  router.post(route, async (req, res, next) => {
    try {
      const options = requestSchema.parse(req.body);
      const {tenantId, entityId, sourceId} = req.params;
      z.uuid().parse(sourceId);
      const checkAccess = async callback => scoped(req, tenantId, entityId, 'imports.manage', async connection => {
        const {rows: [source]} = await connection.query(`
          SELECT f.object_key, f.sha256, f.byte_size, f.media_type, f.scan_status,
                 f.scanned_at::text, f.scan_job_id, EXISTS (
                   SELECT 1 FROM mizan.processing_jobs j
                   WHERE j.tenant_id=f.tenant_id AND j.entity_id=f.entity_id AND j.id=f.scan_job_id
                     AND j.job_type='file_scan' AND j.status='succeeded'
                     AND j.input_references->>'sourceId'=f.id::text
                 ) AS scan_succeeded
          FROM mizan.source_files f
          WHERE f.tenant_id=$1 AND f.entity_id=$2 AND f.id=$3 AND f.deleted_at IS NULL
        `, [tenantId, entityId, sourceId]);
        if (!source) throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Source not found in this scope');
        if (source.scan_status !== 'clean' || !source.scanned_at || !source.scan_succeeded) {
          throw new HttpError(409, 'SOURCE_SCAN_REQUIRED', 'The source must pass scanning before preview');
        }
        const format = formats.get(source.media_type);
        if (!format) throw new HttpError(422, 'SOURCE_FORMAT_UNSUPPORTED', 'Preview requires a CSV or XLSX source');

        let mapping = options.mapping;
        let delimiter = options.delimiter;
        let requiredHeaders;
        if (options.template) {
          const {rows: [template]} = await connection.query(`
            SELECT required_columns, column_mapping, header_row, worksheet_name, date_format,
                   decimal_separator, thousands_separator
            FROM mizan.import_templates
            WHERE tenant_id=$1 AND entity_id=$2 AND id=$3 AND column_mapping->>'kind'=$4
          `, [tenantId, entityId, options.template.id, templateKind]);
          if (!template) throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Template not found in this scope');
          const definition = template.column_mapping;
          if (definition.sourceFormat !== format) {
            throw new HttpError(422, 'TEMPLATE_TYPE_MISMATCH', 'The template expects a different source format');
          }
          mapping = mappingSchema.parse({
            periodId: options.template.periodId, sheetName: template.worksheet_name,
            headerRow: template.header_row, dataType: definition.dataType, mapping: definition.fields,
            dateFormat: template.date_format, decimalSeparator: template.decimal_separator,
            thousandsSeparator: template.thousands_separator,
          });
          delimiter = definition.delimiter;
          requiredHeaders = template.required_columns;
        }
        let currency;
        if (mapping) {
          const {rows: [periodCurrency]} = await connection.query(`
            SELECT s.currency_code, c.minor_units
            FROM mizan.accounting_periods p
            JOIN mizan.entity_settings_versions s ON s.id=p.settings_version_id AND s.entity_id=p.entity_id AND s.tenant_id=p.tenant_id
            JOIN mizan.currencies c ON c.code=s.currency_code
            WHERE p.tenant_id=$1 AND p.entity_id=$2 AND p.id=$3
          `, [tenantId, entityId, mapping.periodId]);
          if (!periodCurrency) throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Period not found in this scope');
          currency = periodCurrency;
        }
        return callback(connection, {source, format, currency, mapping, delimiter, requiredHeaders});
      }, {fresh: true});

      const input = await checkAccess((_connection, authorized) => authorized);
      if (!storage || !configured()) {
        throw new HttpError(503, 'PREVIEW_RUNTIME_UNAVAILABLE', 'Isolated preview is unavailable');
      }
      if (previewRunning) throw new HttpError(429, 'PREVIEW_BUSY', 'Wait for the current preview to finish');

      const {source, format, currency, mapping, delimiter, requiredHeaders} = input;
      const byteSize = Number(source.byte_size);
      if (!Number.isInteger(byteSize) || byteSize < 1 || byteSize > 50 * 1024 * 1024) {
        throw new HttpError(422, 'FILE_SIZE_LIMIT', 'Source exceeds the preview limit');
      }
      previewRunning = true;
      try {
        let bytes;
        try {
          bytes = await storage.read(source.object_key, source.sha256, byteSize);
        } catch {
          throw new HttpError(503, 'SOURCE_INTEGRITY_UNAVAILABLE', 'The encrypted source could not be verified');
        }
        let parsed;
        try {
          const mappedOptions = mapping && {
            sheetName: mapping.sheetName, headerRow: mapping.headerRow, dataType: mapping.dataType,
            mapping: mapping.mapping, dateFormat: mapping.dateFormat, requiredHeaders,
            numberOptions: {
              decimalSeparator: mapping.decimalSeparator, thousandsSeparator: mapping.thousandsSeparator,
              precision: currency.minor_units,
            },
          };
          const previewRows = options.template ? Math.max(options.previewRows, mapping.headerRow) : options.previewRows;
          parsed = await parse(bytes, {previewRows, delimiter, format, mapping: mappedOptions});
        } finally {
          bytes.fill(0);
        }
        if (parsed.error) {
          const {code, message} = parsed.error;
          if (options.template && ['TEMPLATE_COLUMN_DRIFT', 'INVALID_MAPPING', 'HEADER_NOT_PREVIEWED',
            'INVALID_MAPPING_COLUMN', 'EMPTY_REQUIRED_HEADER'].includes(code)) {
            throw new HttpError(422, 'TEMPLATE_COLUMN_DRIFT', 'The source no longer matches the template. Review column mapping.');
          }
          throw new HttpError(code === 'PREVIEW_RUNTIME_UNAVAILABLE' ? 503 : 422, code, message);
        }
        const savedTemplate = await checkAccess(async (connection, current) => {
          if (current.source.sha256 !== source.sha256 || current.source.scan_job_id !== source.scan_job_id
              || current.source.scanned_at !== source.scanned_at || current.currency?.currency_code !== currency?.currency_code
              || current.currency?.minor_units !== currency?.minor_units) {
            throw new HttpError(409, 'PREVIEW_SOURCE_CHANGED', 'Source or period changed during preview');
          }
          let saved = null;
          if (options.saveTemplate) {
            saved = await saveTemplate(connection, {
              tenantId, entityId, actorId: req.principal.id, draft: options.saveTemplate,
              mapping, delimiter, format, headers: parsed.data.requiredHeaders, HttpError,
            });
            if (!saved.reused) await audit(connection, req, tenantId, entityId, 'import.template_saved', 'import_template',
              saved.id, 'Saved explicit source mapping', {version: saved.version, predecessorId: options.saveTemplate.predecessorId});
          }
          await audit(connection, req, tenantId, entityId, 'source.previewed', 'source_file', sourceId,
            'Read-only import preview', {mapped: Boolean(mapping), templateId: options.template?.id ?? null});
          return saved;
        });
        result(req, res, {sourceId, currencyCode: currency?.currency_code ?? null, preview: parsed.data, savedTemplate});
      } finally {
        previewRunning = false;
      }
    } catch (error) {
      next(error);
    }
  });
}
