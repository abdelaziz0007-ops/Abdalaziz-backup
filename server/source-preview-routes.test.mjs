import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {expect, it, vi} from 'vitest';
import {mountSourcePreviewRoute} from './source-preview-routes.mjs';

const id = '35c535d3-d440-45ed-a349-9ba6e4d16060';
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
  const storage = {read: vi.fn(async () => Buffer.from('a,b'))};
  const parse = vi.fn(async () => ({data: {sheets: []}}));
  const audit = vi.fn();
  mountSourcePreviewRoute(app, {
    storage, configured: () => true, parse, audit, HttpError,
    scoped: async (_req, _tenant, _entity, _permission, callback) => {
      if (!authorized) throw new HttpError(403, 'PERMISSION_DENIED', 'Access denied');
      return callback({query: async sql => ({rows: sql.includes('accounting_periods')
        ? [{currency_code: 'BHD', minor_units: 3}] : [source]})});
    },
    result: (_req, res, data) => res.json(data),
  });
  app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({code: error.code}));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const post = body => fetch(`http://127.0.0.1:${server.address().port}/tenants/${id}/entities/${id}/source-files/${id}/preview`,
    {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
  try {
    await test({post, storage, parse, audit, revoke: () => { authorized = false; }});
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
