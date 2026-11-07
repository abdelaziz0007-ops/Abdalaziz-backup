import {z} from 'zod';
import {previewConfigured, runIsolatedPreview} from './parser/isolated-preview.mjs';

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
}).strict();
const formats = new Map([
  ['text/csv', 'csv'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
]);

export function mountSourcePreviewRoute(router, {scoped, audit, result, HttpError, storage,
  configured = previewConfigured, parse = runIsolatedPreview}) {
  let previewRunning = false;
  const route = '/tenants/:tenantId/entities/:entityId/source-files/:sourceId/preview';

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

        let currency;
        if (options.mapping) {
          const {rows: [periodCurrency]} = await connection.query(`
            SELECT s.currency_code, c.minor_units
            FROM mizan.accounting_periods p
            JOIN mizan.entity_settings_versions s ON s.id=p.settings_version_id AND s.entity_id=p.entity_id AND s.tenant_id=p.tenant_id
            JOIN mizan.currencies c ON c.code=s.currency_code
            WHERE p.tenant_id=$1 AND p.entity_id=$2 AND p.id=$3
          `, [tenantId, entityId, options.mapping.periodId]);
          if (!periodCurrency) throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Period not found in this scope');
          currency = periodCurrency;
        }
        return callback(connection, {source, format, currency});
      }, {fresh: true});

      const input = await checkAccess((_connection, authorized) => authorized);
      if (!storage || !configured()) {
        throw new HttpError(503, 'PREVIEW_RUNTIME_UNAVAILABLE', 'Isolated preview is unavailable');
      }
      if (previewRunning) throw new HttpError(429, 'PREVIEW_BUSY', 'Wait for the current preview to finish');

      const {source, format, currency} = input;
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
          const {mapping, ...readerOptions} = options;
          const mappedOptions = mapping && {
            sheetName: mapping.sheetName, headerRow: mapping.headerRow, dataType: mapping.dataType,
            mapping: mapping.mapping, dateFormat: mapping.dateFormat,
            numberOptions: {
              decimalSeparator: mapping.decimalSeparator, thousandsSeparator: mapping.thousandsSeparator,
              precision: currency.minor_units,
            },
          };
          parsed = await parse(bytes, {...readerOptions, format, mapping: mappedOptions});
        } finally {
          bytes.fill(0);
        }
        if (parsed.error) {
          const {code, message} = parsed.error;
          throw new HttpError(code === 'PREVIEW_RUNTIME_UNAVAILABLE' ? 503 : 422, code, message);
        }
        await checkAccess(async (connection, current) => {
          if (current.source.sha256 !== source.sha256 || current.source.scan_job_id !== source.scan_job_id
              || current.source.scanned_at !== source.scanned_at || current.currency?.currency_code !== currency?.currency_code
              || current.currency?.minor_units !== currency?.minor_units) {
            throw new HttpError(409, 'PREVIEW_SOURCE_CHANGED', 'Source or period changed during preview');
          }
          await audit(connection, req, tenantId, entityId, 'source.previewed', 'source_file', sourceId,
            'Read-only import preview', {mapped: Boolean(options.mapping)});
        });
        result(req, res, {sourceId, currencyCode: currency?.currency_code ?? null, preview: parsed.data});
      } finally {
        previewRunning = false;
      }
    } catch (error) {
      next(error);
    }
  });
}
