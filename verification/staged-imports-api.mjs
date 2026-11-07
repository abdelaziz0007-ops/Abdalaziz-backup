import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {readFile, writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import express from 'express';
import {database} from '../server/database.mjs';
import {insert,mountFinancialRoutes} from '../server/financial-routes.mjs';
import {hash} from '../server/financial-core.mjs';
import {encryptField} from '../server/financial-storage.mjs';
import {parseCsvTable, TableInputError} from '../server/parser/tabular-core.mjs';
import {previewMapping} from '../server/parser/field-mapping.mjs';
import {mountSourcePreviewRoute} from '../server/source-preview-routes.mjs';
import {mountStagedImportRoutes} from '../server/staged-import-routes.mjs';
import {mountPublishedBankRoutes} from '../server/published-bank-routes.mjs';

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
  const {rows: [grants]} = await connection.query(`
    SELECT has_function_privilege('mizan_api_v1','mizan_private.publish_staged_dataset(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)','EXECUTE') AS publish,
      has_table_privilege('mizan_api_v1','mizan.ledger_entries','INSERT') AS ledger,
      has_column_privilege('mizan_api_v1','mizan.dataset_versions','status','UPDATE') AS update_status,
      has_function_privilege('mizan_api_v1','mizan_private.publish_trial_balance_mapping(uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE') AS mapping,
      has_column_privilege('mizan_api_v1','mizan.mapping_versions','status','UPDATE') AS update_mapping
  `);
  assert.deepEqual(grants, {publish:true,ledger:true,update_status:false,mapping:true,update_mapping:false});
  const {rows: [fixture]} = await connection.query(`
    SELECT p.tenant_id,p.entity_id,p.id AS period_id,p.start_date::text,u.id AS uploaded_by,s.currency_code,c.minor_units
    FROM mizan.accounting_periods p
    JOIN mizan.memberships m ON m.tenant_id=p.tenant_id
    JOIN mizan.app_users u ON u.id=m.user_id
    JOIN mizan.entity_settings_versions s ON s.id=p.settings_version_id
    JOIN mizan.currencies c ON c.code=s.currency_code
    WHERE u.email LIKE 'synthetic-%@example.invalid' AND u.mfa_enabled AND p.status='open'
      AND mizan.has_permission(p.tenant_id,p.entity_id,u.id,'imports.manage')
      AND mizan.has_permission(p.tenant_id,p.entity_id,u.id,'reports.view')
      AND mizan.has_permission(p.tenant_id,p.entity_id,u.id,'outputs.prepare')
    ORDER BY p.created_at DESC LIMIT 1
  `);
  assert(fixture, 'Run financial-api verification on the isolated branch first');
  const {tenant_id: t, entity_id: e, period_id: periodId, uploaded_by: actor, minor_units: precision} = fixture;
  const scope = {tenant_id: t, entity_id: e};
  const sessionId = randomUUID();
  await connection.query(`
    INSERT INTO mizan.user_sessions(id,user_id,provider_session_hash,authenticated_at,mfa_verified_at,expires_at)
    VALUES($1,$2,$3,now(),now(),now()+interval '30 minutes')
  `, [sessionId, actor, hash(sessionId)]);
  const sources = new Map();
  async function fixtureSource(content) {
    const sourceId = randomUUID(), jobId = randomUUID(), csv = Buffer.from(content);
    const objectKey = 'rollback-fixture/' + sourceId;
    await insert(connection, 'processing_jobs', {...scope, id: jobId, job_type: 'file_scan',
      status: 'succeeded', idempotency_key: 'rollback-stage-test:' + jobId, requested_by: actor,
      input_references: JSON.stringify({sourceId}), progress: 1, finished_at: new Date().toISOString()});
    await insert(connection, 'source_files', {...scope, id: sourceId, sha256: hash(csv), original_name: 'rollback-stage.csv',
      media_type: 'text/csv', byte_size: csv.length, object_key: objectKey,
      object_version: '1', encryption_key_reference: 'source-v1', uploaded_by: actor, scan_status: 'clean',
      scanned_at: new Date().toISOString(), scanner_version: 'Rollback SQL fixture', scan_job_id: jobId});
    sources.set(objectKey, csv);
    return sourceId;
  }
  const suffix = randomUUID().slice(0,8);
  const asset = 'A' + suffix, equity = 'B' + suffix;
  const sourceId = await fixtureSource('code,name,classification,balance\n' + asset +
    ',Cash,asset.current,100\n' + equity + ',Equity,equity,-99\n');

  await connection.query("SELECT set_config('mizan.user_id',$1,true),set_config('mizan.tenant_id',$2,true),set_config('mizan.entity_ids',$3,true)", [actor,t,e]);
  const app = express();
  app.use(express.json());
  const dependencies = {
    HttpError,
    scoped: async (req, tenant, entity, permission, callback) => {
      if (tenant !== t || entity !== e) throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Out of scope');
      req.principal = {id: actor, sessionId};
      const {rows: [access]} = await connection.query('SELECT mizan.has_permission($1,$2,$3,$4) AS allowed', [t,e,actor,permission]);
      if (permission) assert(access.allowed);
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
  mountPublishedBankRoutes(app, dependencies);
  mountFinancialRoutes(app, dependencies);
  mountSourcePreviewRoute(app, {...dependencies, configured: () => true,
    storage: {read: async key => Buffer.from(sources.get(key))},
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

  const publication = {confirmation:true, balanceBasis:'period', reason:'Reviewed complete period source and corrections'};
  await request(path + '/publish', {...publication,qualityRunId:corrected.quality.id}, 409);
  await request(path + '/publish', {...publication,qualityRunId:excluded.quality.id}, 409);
  await request(path + '/corrections', {rowId:row.id, expectedVersion:2, requestKey:randomUUID(),
    excluded:false, reason:'Reinstate the verified corrected row'});
  const reviewed = await request(path);
  assert.equal(reviewed.publishable, true);
  const publishRequest = {...publication, qualityRunId: reviewed.quality.id};
  const published = await request(path + '/publish', publishRequest);
  assert.equal((await request(path + '/publish', publishRequest)).datasetId, published.datasetId);
  assert.equal((await request(path)).status, 'published');
  const {rows: [dataset]} = await connection.query(`
    SELECT d.status, d.complete_dataset, count(r.id)::int AS typed_rows, sum(r.closing_balance)::text AS balance
    FROM mizan.dataset_versions d JOIN mizan.trial_balance_rows r ON r.dataset_id=d.id
    WHERE d.id=$1 GROUP BY d.id
  `, [published.datasetId]);
  assert.equal(dataset.status, 'published');
  assert.equal(dataset.complete_dataset, true);
  assert.equal(dataset.typed_rows, 2);
  assert.match(dataset.balance, /^0(?:\.0+)?$/);
  await request(path + '/corrections', {...correction, expectedVersion:3, requestKey:randomUUID()}, 409);
  passed.push('Publication rejects stale or incomplete reviews and locks a corrected typed dataset exactly once');

  const reportPath = '/datasets/' + published.datasetId + '/reports';
  const availableTrialBalances = await request('/datasets?status=published');
  assert(availableTrialBalances.some(item=>item.id===published.datasetId && item.account_count===2));
  assert(availableTrialBalances.every(item=>item.status==='published'));
  const reportRequest = {confirmation:true};
  const generated = await request(reportPath, reportRequest, 201);
  assert.equal(generated.reused, false);
  assert.deepEqual(generated.outputs.map(output=>output.output_type), ['analysis','financial_position','income_statement']);
  assert(generated.outputs.every(output=>output.status==='draft'));
  const replay = await request(reportPath, reportRequest);
  assert.equal(replay.reused, true);
  assert.deepEqual(replay.outputs, generated.outputs);
  const report = await request('/reports/' + generated.outputs[1].id);
  const equityLine = report.lines.find(line=>line.code==='equity');
  assert.match(equityLine.value, /^100(?:\.0+)?$/);
  assert.match(report.lines.find(line=>line.code==='assets').value, /^100(?:\.0+)?$/);
  assert(report.validations.every(validation=>validation.passed));
  const [evidence] = await request('/reports/' + report.id + '/lines/' + equityLine.id + '/sources');
  assert.equal(evidence.id, row.id);
  assert.equal(evidence.original_values.signedDebitBalance, original);
  assert.match(evidence.effective_values.signedDebitBalance, /^-100(?:\.0+)?$/);
  assert(evidence.transformation_id);
  assert(!JSON.stringify(evidence).includes('"sealed"'));
  const {rows:[mapping]} = await connection.query(`
    SELECT m.status,m.published_at,count(a.id)::int AS accounts FROM mizan.output_versions o
    JOIN mizan.mapping_versions m ON m.id=o.mapping_version_id
    JOIN mizan.account_mappings a ON a.mapping_version_id=m.id WHERE o.id=$1 GROUP BY m.id
  `,[report.id]);
  assert.equal(mapping.status,'published');
  assert.equal(mapping.accounts,2);
  assert(mapping.published_at);
  const analysis = await request('/reports/' + generated.outputs[0].id);
  assert.equal(analysis.metrics.find(metric=>metric.name==='Net margin').value,null);
  passed.push('Published trial balance generates three drafts once, freezes mapping and links exact corrected evidence');

  const ledgerSource = await fixtureSource('journal,line,account,date,debit,credit,description\n' +
    ['J,1,'+asset+','+fixture.start_date+',100,0,Cash entry',
      'J,2,'+equity+','+fixture.start_date+',0,100,Equity entry'].join('\n')+'\n');
  const ledgerPreview = '/source-files/' + ledgerSource + '/preview';
  const ledgerTemplate = await request(ledgerPreview, {mapping: {periodId, sheetName:'CSV', headerRow:1, dataType:'general_ledger',
    mapping:{journalReference:1,lineReference:2,accountCode:3,postingDate:4,debit:5,credit:6,description:7}},
    saveTemplate:{requestKey:randomUUID(), name:'Rollback ledger template'}});
  const ledger = await request(ledgerPreview, {template:{id:ledgerTemplate.savedTemplate.id,periodId},stageImport:true}, 201);
  const ledgerPath = '/staged-imports/' + ledger.staged.batchId;
  const ledgerReview = await request(ledgerPath);
  const ledgerPublication = await request(ledgerPath + '/publish', {qualityRunId:ledgerReview.quality.id,
    confirmation:true, reason:'Reviewed complete balanced journal'});
  const {rows: [journal]} = await connection.query(`
    SELECT count(*)::int AS rows, sum(debit-credit)::text AS balance, bool_and(description_ciphertext IS NOT NULL) AS protected
    FROM mizan.ledger_entries WHERE dataset_id=$1
  `, [ledgerPublication.datasetId]);
  assert.equal(journal.rows, 2);
  assert.match(journal.balance, /^0(?:\.0+)?$/);
  assert.equal(journal.protected, true);
  passed.push('Balanced ledger publishes typed debit and credit rows with encrypted descriptions');

  const bankAccount = randomUUID();
  const {rows: [bankLedgerAccount]} = await connection.query('SELECT id FROM mizan.accounts WHERE tenant_id=$1 AND entity_id=$2 AND code=$3',[t,e,asset]);
  await insert(connection, 'bank_accounts', {...scope, id:bankAccount, label:'Rollback bank',
    identifier_ciphertext:encryptField('synthetic', t+':'+e+':'+bankAccount), identifier_last_four:'0000',
    ledger_account_id:bankLedgerAccount.id,currency_code:fixture.currency_code});
  async function bankDataset(dataType, marker, closing) {
    const bankSource = await fixtureSource('id,date,reference,amount,running\n'
      + marker+'1,'+fixture.start_date+',RX,10,110\n'+marker+'2,'+fixture.start_date+',RY,-2,108\n');
    const bankPreview = '/source-files/' + bankSource + '/preview';
    const template = await request(bankPreview, {mapping:{periodId,sheetName:'CSV',headerRow:1,dataType,
      mapping:{rowId:1,postingDate:2,reference:3,signedAmount:4,runningBalance:5}},
      saveTemplate:{requestKey:randomUUID(),name:'Rollback bank template'}});
    const stagedBank = await request(bankPreview, {template:{id:template.savedTemplate.id,periodId},stageImport:true}, 201);
    const bankPath = '/staged-imports/' + stagedBank.staged.batchId;
    const bankReview = await request(bankPath);
    const input = {qualityRunId:bankReview.quality.id,confirmation:true,reason:'Reviewed complete bank period',
      bank:{accountId:bankAccount,opening:'100',closing,signPolicy:'cash_increase_positive'}};
    assert.equal((await request(bankPath+'/publish',{...input,bank:{...input.bank,opening:'101'}},422)).code,'BANK_RUNNING_BALANCE_MISMATCH');
    assert.equal((await request(bankPath+'/publish',{...input,bank:{...input.bank,closing:'109'}},422)).code,'BANK_CLOSING_BALANCE_MISMATCH');
    const published = await request(bankPath+'/publish',input);
    assert.equal((await request(bankPath+'/publish',input)).datasetId,published.datasetId);
    assert.equal((await request(bankPath+'/publish',{...input,bank:{...input.bank,closing:'109'}},409)).code,'BANK_PUBLICATION_CHANGED');
    const table = dataType==='bank_statement' ? 'bank_transactions' : 'book_transactions';
    const {rows: [totals]} = await connection.query(`
      SELECT count(*)::int AS rows, sum(signed_amount)::text AS movement,
        bool_and(reference_ciphertext IS NOT NULL AND bank_account_id=$2) AS linked
      FROM mizan.${table} WHERE dataset_id=$1
    `, [published.datasetId,bankAccount]);
    assert.deepEqual({rows:totals.rows,movement:Number(totals.movement),linked:totals.linked},{rows:2,movement:8,linked:true});
    return published.datasetId;
  }
  const bankDatasetId = await bankDataset('bank_statement','S','108');
  const bookDatasetId = await bankDataset('bank_ledger','L','108');
  passed.push('Bank statement and ledger publication verify exact balances, account linkage and immutable replay');

  const available=await request('/published-bank-datasets');
  assert(available.some(item=>item.id===bankDatasetId));
  assert(available.some(item=>item.id===bookDatasetId));
  const pair={bankDatasetId,bookDatasetId,confirmation:true};
  await request('/reconciliations/from-published',{...pair,bookDatasetId:bankDatasetId},404);
  const draft=await request('/reconciliations/from-published',pair,201);
  assert.equal((await request('/reconciliations/from-published',pair)).id,draft.id);
  const {rows:[reconciliation]}=await connection.query(`
    SELECT r.bank_complete,r.book_complete,v.status,
      (SELECT count(*)::int FROM mizan.match_groups WHERE reconciliation_id=r.id) AS suggestions
    FROM mizan.reconciliations r JOIN mizan.output_versions v ON v.id=r.output_version_id WHERE r.id=$1
  `,[draft.id]);
  assert.deepEqual(reconciliation,{bank_complete:true,book_complete:true,status:'draft',suggestions:2});
  passed.push('Published sources create one draft with exact-match suggestions and reject a wrong source type');

  await connection.query('ROLLBACK');
  assert.equal((await connection.query('SELECT count(*)::int AS count FROM mizan.import_batches WHERE id=$1',[staged.batchId])).rows[0].count,0);
  assert.equal((await connection.query('SELECT count(*)::int AS count FROM mizan.dataset_versions WHERE id=ANY($1::uuid[])',[[bankDatasetId,bookDatasetId]])).rows[0].count,0);
  passed.push('Synthetic records completely rolled back and publication uses a restricted database function');
  await writeFile('verification/staged-imports-api.json', JSON.stringify({branch, passed, rolledBack:true,
    fixture:'Synthetic scan evidence, verified-session fixture, source bytes and parser in a rollback-only transaction. Live Docker and antivirus not exercised.'}, null, 2)+'\n');
  console.log('Staged imports: ' + passed.length + ' transactional checks passed');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await connection.query('ROLLBACK').catch(() => {});
  connection.release();
  await pool.end();
}
