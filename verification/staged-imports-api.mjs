import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {readFile, writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import express from 'express';
import {database} from '../server/database.mjs';
import {insert} from '../server/financial-routes.mjs';
import {hash} from '../server/financial-core.mjs';
import {parseCsvTable, TableInputError} from '../server/parser/tabular-core.mjs';
import {previewMapping} from '../server/parser/field-mapping.mjs';
import {mountSourcePreviewRoute} from '../server/source-preview-routes.mjs';
import {mountStagedImportRoutes} from '../server/staged-import-routes.mjs';

const {branch} = JSON.parse(await readFile('.neon', 'utf8'));
assert.equal(branch, 'codex-backend-completion');
const env = parseEnv(await readFile('.env.local', 'utf8'));
process.env.SOURCE_ENCRYPTION_KEY = env.SOURCE_ENCRYPTION_KEY;
const pool = database(env.DATABASE_URL_UNPOOLED);
const connection = await pool.connect();
const passed = [];
let server;
class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    Object.assign(this, {status, code});
  }
}

try {
  await connection.query('BEGIN');
  const {rows: [fixture]} = await connection.query(`
    SELECT p.tenant_id,p.entity_id,p.id AS period_id,u.id AS uploaded_by,s.currency_code,c.minor_units
    FROM mizan.accounting_periods p
    JOIN mizan.memberships m ON m.tenant_id=p.tenant_id
    JOIN mizan.app_users u ON u.id=m.user_id
    JOIN mizan.entity_settings_versions s ON s.id=p.settings_version_id
    JOIN mizan.currencies c ON c.code=s.currency_code
    WHERE u.email LIKE 'synthetic-%@example.invalid' AND p.status='open'
      AND mizan.has_permission(p.tenant_id,p.entity_id,u.id,'imports.manage')
    ORDER BY p.created_at DESC LIMIT 1
  `);
  assert(fixture, 'Run financial-api verification on the isolated branch first');
  const {tenant_id: t, entity_id: e, period_id: periodId, uploaded_by: actor, minor_units: precision} = fixture;
  const scope = {tenant_id: t, entity_id: e};
  const sourceId = randomUUID(), jobId = randomUUID();
  const csv = Buffer.from('code,name,classification,balance\nA,Cash,asset.current,100\nB,Equity,equity,-99\n');
  await insert(connection, 'processing_jobs', {...scope, id: jobId, job_type: 'file_scan',
    status: 'succeeded', idempotency_key: 'rollback-stage-test:' + jobId, requested_by: actor,
    input_references: JSON.stringify({sourceId}), progress: 1, finished_at: new Date().toISOString()});
  await insert(connection, 'source_files', {...scope, id: sourceId, sha256: hash(csv), original_name: 'rollback-stage.csv',
    media_type: 'text/csv', byte_size: csv.length, object_key: 'rollback-fixture/' + sourceId,
    object_version: '1', encryption_key_reference: 'source-v1', uploaded_by: actor, scan_status: 'clean',
    scanned_at: new Date().toISOString(), scanner_version: 'Rollback SQL fixture', scan_job_id: jobId});

  await connection.query("SELECT set_config('mizan.user_id',$1,true),set_config('mizan.tenant_id',$2,true),set_config('mizan.entity_ids',$3,true)", [actor,t,e]);
  const app = express();
  app.use(express.json());
  const dependencies = {
    HttpError,
    scoped: async (req, tenant, entity, permission, callback) => {
      if (tenant !== t || entity !== e) throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Out of scope');
      req.principal = {id: actor};
      const {rows: [access]} = await connection.query('SELECT mizan.has_permission($1,$2,$3,$4) AS allowed', [t,e,actor,permission]);
      assert(access.allowed);
      await connection.query('SAVEPOINT route_request');
      try { return await callback(connection); }
      catch (error) { await connection.query('ROLLBACK TO route_request'); throw error; }
      finally { await connection.query('RELEASE route_request'); }
    },
    audit: (db, _req, tenant, entity, action, type, id, reason, metadata) =>
      db.query('SELECT mizan_private.append_audit($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [tenant, entity, actor, action, type, id, reason, randomUUID(), metadata]),
    result: (_req, res, data, status = 200) => res.status(status).json(data),
  };
  mountStagedImportRoutes(app, dependencies);
  mountSourcePreviewRoute(app, {...dependencies, configured: () => true,
    storage: {read: async () => Buffer.from(csv)},
    parse: async (bytes, options) => {
      try {
        const table = parseCsvTable(bytes, options);
        const mapped = previewMapping(table, options.mapping);
        if (options.importSheet) {
          for (const row of mapped.rows) row.cells = table.sheets[0].rows.find(original => original.rowNumber === row.rowNumber).cells;
        }
        return {data: {...mapped, dateSystem: table.dateSystem}};
      } catch (error) {
        if (!(error instanceof TableInputError)) throw error;
        return {error: {code: error.code, message: error.message}};
      }
    }});
  app.use((error, _req, res, _next) => {
    if (!error.status) console.error('Unexpected SQL or runtime error', error.code ?? error.name, error.message);
    res.status(error.status ?? 500).json({code: error.code});
  });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/tenants/${t}/entities/${e}`;
  async function request(path, body, status = 200) {
    const response = await fetch(base + path, body ? {method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify(body)} : undefined);
    const value = await response.json();
    assert.equal(response.status, status, JSON.stringify(value));
    return value;
  }
  const preview = '/source-files/' + sourceId + '/preview';
  const {savedTemplate} = await request(preview, {mapping: {periodId, sheetName:'CSV', headerRow:1, dataType:'trial_balance',
    mapping:{accountCode:1,accountName:2,classification:3,closingBalance:4}},
    saveTemplate:{requestKey:randomUUID(), name:'Rollback fixture'}});
  const stage = {template:{id:savedTemplate.id,periodId},stageImport:true};
  const {staged} = await request(preview, stage, 201);
  assert.equal(staged.recordsRead, 2);
  assert.equal((await request(preview, stage)).staged.batchId, staged.batchId);
  passed.push('Whole worksheet saved once through the scoped preview route');

  const path = '/staged-imports/' + staged.batchId;
  const first = await request(path);
  assert(first.issues.some(issue => issue.code === 'TRIAL_BALANCE_UNBALANCED'));
  const row = first.rows.find(item => item.rowNumber === 3);
  const original = row.originalValues.closingBalance;
  const correction = {rowId:row.id, expectedVersion:0, requestKey:randomUUID(),
    change:{field:'closingBalance',value:'-100'}, reason:'Correct balance from source evidence'};
  assert.equal((await request(path + '/corrections', correction)).version, 1);
  assert.equal((await request(path + '/corrections', correction)).reused, true);
  await request(path + '/corrections', {...correction,requestKey:randomUUID()}, 409);
  const corrected = await request(path);
  assert.equal(corrected.rows.find(item => item.id===row.id).originalValues.closingBalance, original);
  assert.equal(corrected.issues.length, 0);
  assert.equal(corrected.quality.totals_after.closingBalance.amount, precision ? '0.'+'0'.repeat(precision) : '0');
  passed.push('Versioned correction preserves the original, rejects stale changes and revalidates exact totals');

  await request(path + '/corrections', {rowId:row.id, expectedVersion:1, requestKey:randomUUID(),
    excluded:true, reason:'Exclude disputed source row for review'});
  const excluded = await request(path);
  assert.equal(excluded.quality.excluded, 1);
  assert(excluded.issues.some(issue => issue.code === 'TRIAL_BALANCE_UNBALANCED'));
  passed.push('Explicit exclusion records counts and reopens balance validation');

  await connection.query('ROLLBACK');
  assert.equal((await connection.query('SELECT count(*)::int AS count FROM mizan.import_batches WHERE id=$1',[staged.batchId])).rows[0].count,0);
  passed.push('Synthetic records completely rolled back');
  await writeFile('verification/staged-imports-api.json', JSON.stringify({branch, passed, rolledBack:true,
    fixture:'Synthetic scan evidence, source bytes and parser in a rollback-only transaction. Live Docker and antivirus not exercised.'}, null, 2)+'\n');
  console.log('Staged imports: ' + passed.length + ' transactional checks passed');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await connection.query('ROLLBACK').catch(() => {});
  connection.release();
  await pool.end();
}
