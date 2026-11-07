import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {expect, it, vi} from 'vitest';
import {mountSourcePreviewRoute} from './source-preview-routes.mjs';
import {parseCsvTable, TableInputError} from './parser/tabular-core.mjs';
import {previewMapping} from './parser/field-mapping.mjs';

const id = '35c535d3-d440-45ed-a349-9ba6e4d16060';
const requestKey = '12b6eb51-cd12-4be3-9ada-c8c359b7aff0';
const secondKey = '22b6eb51-cd12-4be3-9ada-c8c359b7aff0';
const mapping = {
  periodId: id, sheetName: 'CSV', headerRow: 1, dataType: 'trial_balance',
  mapping: {accountCode: 1, accountName: 2, closingBalance: 3},
};
const cleanSource = {
  object_key: 'source.mzn', sha256: 'fixture-digest', byte_size: 3,
  media_type: 'text/csv', scan_status: 'clean', scanned_at: '2026-11-07',
  scan_job_id: id, scan_succeeded: true,
};
class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    Object.assign(this, {status, code});
  }
}

async function withPreview(test, source = cleanSource) {
  const app = express();
  app.use(express.json());
  let authorized = true;
  const templates = new Map();
  const storage = {read: vi.fn(async () => Buffer.from('a,b'))};
  const parse = vi.fn(async () => ({data: {sheets: []}}));
  const audit = vi.fn();
  async function query(sql, params) {
    if (sql.includes('accounting_periods')) return {rows: [{currency_code: 'BHD', minor_units: 3}]};
    if (sql.includes('source_files')) return {rows: [source]};
    if (sql.includes('pg_advisory_xact_lock')) return {rows: []};
    const template = templates.get(params[2]);
    if (sql.includes('INSERT INTO mizan.import_templates')) {
      const [id, , , logical_template_id, version, name, predecessor_id, headers, column_mapping,
        header_row, worksheet_name, date_format, decimal_separator, thousands_separator] = params;
      const row = {id, logical_template_id, version, name, predecessor_id, column_mapping, header_row,
        worksheet_name, date_format, decimal_separator, thousands_separator, required_columns: JSON.parse(headers)};
      templates.set(id, row);
      return {rows: [{id, name, version}]};
    }
    if (sql.includes('WHERE tenant_id=$1 AND entity_id=$2 AND logical_template_id=$3')) {
      return {rows: [...templates.values()].filter(row => row.logical_template_id === params[2])
        .sort((a, b) => b.version - a.version).slice(0, 1)};
    }
    if (sql.includes('FROM mizan.import_templates')) {
      return {rows: template ? [{...template, fingerprint: template.column_mapping.requestFingerprint}] : []};
    }
    throw Error('Unexpected query in preview fixture');
  }
  mountSourcePreviewRoute(app, {
    storage, configured: () => true, parse, audit, HttpError,
    scoped: async (req, _tenant, _entity, _permission, callback) => {
      if (!authorized) throw new HttpError(403, 'PERMISSION_DENIED', 'Access denied');
      req.principal = {id};
      return callback({query});
    },
    result: (_req, res, data) => res.json(data),
  });
  app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({code: error.code}));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const post = body => fetch(`http://127.0.0.1:${server.address().port}/tenants/${id}/entities/${id}/source-files/${id}/preview`,
    {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
  try {
    await test({post, storage, parse, audit, templates, revoke: () => { authorized = false; }});
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

it('refuses a clean label without a successful scan before touching storage', async () => {
  await withPreview(async ({post, storage, parse}) => {
    const response = await post({});
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({code: 'SOURCE_SCAN_REQUIRED'});
    expect(storage.read).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
  }, {...cleanSource, scan_succeeded: false});
});

it('withholds a parsed preview if permission is lost during processing', async () => {
  await withPreview(async ({post, parse, revoke, audit}) => {
    parse.mockImplementation(async () => {
      revoke();
      return {data: {sheets: [{name: 'Sensitive rows'}]}};
    });
    const response = await post({});
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({code: 'PERMISSION_DENIED'});
    expect(audit).not.toHaveBeenCalled();
  });
});

it('uses accounting-period currency precision for a scoped mapped preview', async () => {
  await withPreview(async ({post, parse, audit}) => {
    const response = await post({mapping: {
      periodId: id, sheetName: 'CSV', headerRow: 1, dataType: 'trial_balance',
      mapping: {accountCode: 1, accountName: 2, closingBalance: 3},
    }});
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({sourceId: id, currencyCode: 'BHD'});
    expect(parse.mock.calls[0][1].mapping.numberOptions.precision).toBe(3);
    expect(audit).toHaveBeenCalledOnce();
  });
});

it('reads binary-framed input in the parser process and retains exact mapped amounts', () => {
  const script = fileURLToPath(new URL('./parser/preview-process.mjs', import.meta.url));
  const header = {format: 'csv', mapping: {
    sheetName: 'CSV', headerRow: 1, dataType: 'trial_balance',
    mapping: {accountCode: 1, accountName: 2, closingBalance: 3},
    numberOptions: {precision: 3},
  }};
  const child = spawnSync(process.execPath, [script], {timeout: 5000, encoding: 'utf8',
    input: JSON.stringify(header) + '\ncode,name,balance\n100,Bank,9007199254740993.001\n'});
  expect(child.status).toBe(0);
  expect(JSON.parse(child.stdout).data.rows[0].values.closingBalance).toBe('9007199254740993.001');
});

function useRealMapping(storage, parse, text) {
  storage.read.mockImplementation(async () => Buffer.from(text));
  parse.mockImplementation(async (bytes, options) => {
    try {
      return {data: previewMapping(parseCsvTable(bytes, options), options.mapping)};
    } catch (error) {
      if (!(error instanceof TableInputError)) throw error;
      return {error: {code: error.code, message: error.message}};
    }
  });
}

it('appends template versions, reuses the same save request and rejects a stale predecessor', async () => {
  await withPreview(async ({post, storage, parse, templates}) => {
    useRealMapping(storage, parse, 'code,name,balance\n100,Bank,100.123\n');
    const initial = {mapping, saveTemplate: {requestKey, name: 'Ledger columns'}};
    expect((await (await post(initial)).json()).savedTemplate).toMatchObject({version: 1, reused: false});
    expect((await (await post(initial)).json()).savedTemplate).toMatchObject({version: 1, reused: true});
    const next = {mapping, saveTemplate: {requestKey: secondKey, name: 'Ledger columns', predecessorId: requestKey}};
    expect((await (await post(next)).json()).savedTemplate).toMatchObject({version: 2, reused: false});
    const stale = await post({...next, saveTemplate: {...next.saveTemplate, requestKey: id}});
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({code: 'TEMPLATE_VERSION_CHANGED'});
    expect(templates.size).toBe(2);
    expect(templates.get(secondKey).logical_template_id).toBe(requestKey);
  });
});

it('reuses a stored mapping only while the source column contract still matches', async () => {
  await withPreview(async ({post, storage, parse}) => {
    useRealMapping(storage, parse, 'code,name,balance\n100,Bank,100.123\n');
    expect((await post({mapping, saveTemplate: {requestKey, name: 'Ledger columns'}})).status).toBe(200);
    const request = {template: {id: requestKey, periodId: id}};
    const accepted = await post(request);
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).preview.rows[0].values.closingBalance).toBe('100.123');
    storage.read.mockImplementation(async () => Buffer.from('name,code,balance\nBank,100,100.123\n'));
    const drift = await post(request);
    expect(drift.status).toBe(422);
    expect(await drift.json()).toEqual({code: 'TEMPLATE_COLUMN_DRIFT'});
  });
});
