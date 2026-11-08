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
import {mountMatchRoutes} from '../server/match-routes.mjs';
import {mountAuditRoutes} from '../server/audit-routes.mjs';
import {mountOutputExportRoutes} from '../server/output-export-routes.mjs';
import {mountOutputCommentRoutes} from '../server/output-comment-routes.mjs';
import {mountReviewRoutes} from '../server/review-routes.mjs';
import {mountPeriodRoutes} from '../server/period-routes.mjs';
import ExcelJS from 'exceljs';

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
      AND mizan.has_permission(p.tenant_id,NULL,u.id,'members.manage')
      AND mizan.has_permission(p.tenant_id,p.entity_id,u.id,'entities.manage')
    ORDER BY p.created_at DESC LIMIT 1
  `);
  assert(fixture, 'Run financial-api verification on the isolated branch first');
  const {tenant_id: t, entity_id: e, period_id: periodId, uploaded_by: actor, minor_units: precision} = fixture;
  const scope = {tenant_id: t, entity_id: e};
  const sessionId = randomUUID();
  let identity={id:actor,sessionId};
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
      if (tenant !== t || (entity && entity !== e)) throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Out of scope');
      req.principal = identity;
      req.requestId = randomUUID();
      const {rows: [access]} = await connection.query('SELECT mizan.has_permission($1,$2,$3,$4) AS allowed', [t,entity,identity.id,permission]);
      if (permission&&!access.allowed)throw new HttpError(403,'PERMISSION_DENIED','Action is not granted');
      await connection.query('SAVEPOINT route_request');
      try { return await callback(connection,{entityIds:[e]}); }
      catch (error) { await connection.query('ROLLBACK TO route_request'); throw error; }
      finally { await connection.query('RELEASE route_request'); }
    },
    audit: (db, req, tenant, entity, action, type, id, reason, metadata) =>
      db.query('SELECT mizan_private.append_audit($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [tenant, entity, req.principal.id, action, type, id, reason, req.requestId, metadata]),
    result: (_req, res, data, status = 200) => res.status(status).json(data),
  };
  mountStagedImportRoutes(app, dependencies);
  mountPublishedBankRoutes(app, dependencies);
  mountMatchRoutes(app, dependencies);
  mountAuditRoutes(app, dependencies);
  mountOutputExportRoutes(app, dependencies);
  mountOutputCommentRoutes(app, {...dependencies,storage:{read:async(key,expectedHash,expectedSize)=>{
    const bytes=sources.get(key);
    assert.equal(hash(bytes),expectedHash);
    assert.equal(bytes.length,expectedSize);
    return bytes;
  }}});
  mountFinancialRoutes(app, dependencies);
  mountReviewRoutes(app, dependencies);
  mountPeriodRoutes(app, dependencies);
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
    const status=error.status??({'23505':409,'23514':422,'42501':403,'40001':409}[error.code]??500);
    if (status===500) console.error('Unexpected SQL or runtime error', error.code ?? error.name, error.message);
    res.status(status).json({code: error.code});
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

  const comparativePeriod=randomUUID();
  await connection.query(`
    INSERT INTO mizan.accounting_periods(id,tenant_id,entity_id,version,settings_version_id,start_date,end_date,created_by)
    SELECT $1,tenant_id,entity_id,1,settings_version_id,(start_date+interval '20 years')::date,
      (end_date+interval '20 years')::date,$3 FROM mizan.accounting_periods WHERE id=$2
  `,[comparativePeriod,periodId,actor]);
  const comparativeFile=await fixtureSource('code,name,classification,balance\n'+asset+
    ',Cash,asset.current,125\n'+equity+',Equity,equity,-125\n');
  const {staged:later}=await request('/source-files/'+comparativeFile+'/preview',
    {template:{id:savedTemplate.id,periodId:comparativePeriod},stageImport:true},201);
  const laterPath='/staged-imports/'+later.batchId;
  const laterReview=await request(laterPath);
  const laterDataset=await request(laterPath+'/publish',{...publication,qualityRunId:laterReview.quality.id});
  const laterReports=await request('/datasets/'+laterDataset.datasetId+'/reports',reportRequest,201);
  const comparisonPath='/reports/'+laterReports.outputs[1].id+'/comparisons';
  assert((await request(comparisonPath)).some(item=>item.id===report.id));
  const query='?baselineId='+report.id;
  const comparison=await request(comparisonPath+query);
  assert.equal(comparison.entityId,e);
  assert.equal(comparison.current.currency_code,comparison.baseline.currency_code);
  assert.equal(comparison.lines.find(line=>line.code==='assets').percent,'25.00');
  assert.match(comparison.lines.find(line=>line.code==='assets').variance,/^25(?:\.0+)?$/);
  assert.equal(comparison.lines.find(line=>line.code==='liabilities').percent,null);
  assert.equal(comparison.lines.find(line=>line.code==='liabilities').unavailableReason,'zero_baseline');
  const incompatible='/reports/'+laterReports.outputs[2].id+'/comparisons'+query;
  assert.equal((await request(incompatible,undefined,422)).code,'INCOMPATIBLE_COMPARISON');
  passed.push('Compatible published statement versions compare exact monetary variances and suppress zero-base percentages');

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
  async function bankDataset(dataType, marker, closing, targetPeriod=periodId) {
    const deposit=Number(closing)-98;
    const bankSource = await fixtureSource('id,date,reference,amount,running\n'
      + marker+'1,'+fixture.start_date+',RX,'+deposit+','+(100+deposit)+'\n'+marker+'2,'+fixture.start_date+',RY,-2,'+closing+'\n');
    const bankPreview = '/source-files/' + bankSource + '/preview';
    const template = await request(bankPreview, {mapping:{periodId:targetPeriod,sheetName:'CSV',headerRow:1,dataType,
      mapping:{rowId:1,postingDate:2,reference:3,signedAmount:4,runningBalance:5}},
      saveTemplate:{requestKey:randomUUID(),name:'Rollback bank template'}});
    const stagedBank = await request(bankPreview, {template:{id:template.savedTemplate.id,periodId:targetPeriod},stageImport:true}, 201);
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
    assert.deepEqual({rows:totals.rows,movement:Number(totals.movement),linked:totals.linked},{rows:2,movement:Number(closing)-100,linked:true});
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

  const reviewer=randomUUID(), reviewerSession=randomUUID(), membership=randomUUID();
  await insert(connection,'app_users',{id:reviewer,identity_provider:'verification',provider_subject:reviewer,
    email:'synthetic-'+reviewer+'@example.invalid',display_name:'Rollback independent reviewer',mfa_enabled:true});
  await insert(connection,'memberships',{id:membership,tenant_id:t,user_id:reviewer,status:'active'});
  await insert(connection,'access_grants',{tenant_id:t,membership_id:membership,permission_code:'outputs.approve',entity_id:e,granted_by:actor});
  await insert(connection,'access_grants',{tenant_id:t,membership_id:membership,permission_code:'reports.view',entity_id:e,granted_by:actor});
  await insert(connection,'access_grants',{tenant_id:t,membership_id:membership,permission_code:'comments.create',entity_id:e,granted_by:actor});
  await connection.query(`
    INSERT INTO mizan.user_sessions(id,user_id,provider_session_hash,authenticated_at,mfa_verified_at,expires_at)
    VALUES($1,$2,$3,now(),now(),now()+interval '30 minutes')
  `,[reviewerSession,reviewer,hash(reviewerSession)]);
  async function reviewAction(outputId,action,fingerprint,submissionId=null,reviewerId=reviewer) {
    const [user,session]=action==='submit'?[actor,sessionId]:[reviewer,reviewerSession];
    const {rows:[result]}=await connection.query(`
      SELECT mizan_private.review_action($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) AS value
    `,[user,session,t,e,outputId,action,action==='submit'?reviewerId:null,submissionId,fingerprint,
      'Synthetic independent review of this specific version',randomUUID(),randomUUID()]);
    return result.value;
  }
  const financialReview=await reviewAction(report.id,'submit',report.content_fingerprint);
  const periodPath='/periods/'+periodId;
  const lockPeriod={requestKey:randomUUID(),reason:'Finalize the completed test accounting period'};
  assert.equal((await request(periodPath+'/lock',lockPeriod,409)).code,'PERIOD_STATE_CONFLICT');
  const supersededId=randomUUID(),supersededFingerprint=hash(supersededId);
  await connection.query(`
    INSERT INTO mizan.output_versions(id,tenant_id,entity_id,logical_output_id,version,output_type,period_id,currency_code,
      settings_version_id,mapping_version_id,preparer_id,content_fingerprint)
    SELECT $1,tenant_id,entity_id,logical_output_id,version+1,output_type,period_id,currency_code,
      settings_version_id,mapping_version_id,preparer_id,$3 FROM mizan.output_versions WHERE id=$2
  `,[supersededId,report.id,supersededFingerprint]);
  const commentsPath='/outputs/'+report.id+'/comments';
  const commentInput={expectedFingerprint:financialReview.fingerprint,body:'Synthetic review comment',
    attachmentIds:[sourceId],requestKey:randomUUID()};
  await request(commentsPath,{...commentInput,attachmentIds:[randomUUID()]},422);
  const comment=await request(commentsPath,commentInput,201);
  assert.equal((await request(commentsPath,commentInput)).id,comment.id);
  const authorDiscussion=await request(commentsPath);
  assert.equal(authorDiscussion.unread,0);
  assert.equal(authorDiscussion.comments[0].attachments[0].id,sourceId);
  identity={id:reviewer,sessionId:reviewerSession};
  await connection.query("SELECT set_config('mizan.user_id',$1,true)",[reviewer]);
  assert.equal((await request(commentsPath)).unread,1);
  const attached=await fetch(base+commentsPath+'/'+comment.id+'/attachments/'+sourceId+'/download',{
    method:'POST',headers:{'content-type':'application/json'},body:'{}',
  });
  assert.equal(attached.status,200);
  assert.equal(attached.headers.get('x-content-type-options'),'nosniff');
  assert.match(await attached.text(),/Cash,asset\.current,100/);
  assert.equal((await request(commentsPath+'/read',{})).read,1);
  assert.equal((await request(commentsPath)).unread,0);
  await request(commentsPath,{expectedFingerprint:financialReview.fingerprint,parentId:comment.id,
    body:'Synthetic reply from independent reviewer',requestKey:randomUUID()},201);
  identity={id:actor,sessionId};
  await connection.query("SELECT set_config('mizan.user_id',$1,true)",[actor]);
  const replies=await request(commentsPath);
  assert.equal(replies.unread,1);
  assert(replies.comments.some(reply=>reply.parent_id===comment.id));
  passed.push('Version comments protect scanned attachments and notify only the other participant without duplicate retries');
  assert.equal((await reviewAction(report.id,'approve',financialReview.fingerprint,financialReview.id)).status,'approved_locked');
  await connection.query('SAVEPOINT stale_financial_draft');
  await assert.rejects(reviewAction(supersededId,'submit',supersededFingerprint),/does not replace the latest approved/);
  await connection.query('ROLLBACK TO SAVEPOINT stale_financial_draft');
  await connection.query('RELEASE SAVEPOINT stale_financial_draft');
  passed.push('An independent reviewer can approve and lock financial statements generated from a published source');

  const {rows:[initial]}=await connection.query('SELECT content_fingerprint FROM mizan.output_versions WHERE id=$1',[draft.output_version_id]);
  const draftPath='/reconciliations/'+draft.id;
  const initialCheck=await request(draftPath+'/validate',{expectedFingerprint:initial.content_fingerprint},422);
  assert.equal(initialCheck.code,'RECONCILIATION_VALIDATION_FAILED');
  await connection.query('SAVEPOINT premature_review');
  await assert.rejects(reviewAction(draft.output_version_id,'submit',initial.content_fingerprint),/Validate this version/);
  await connection.query('ROLLBACK TO SAVEPOINT premature_review');
  await connection.query('RELEASE SAVEPOINT premature_review');
  const {rows:groups}=await connection.query('SELECT id FROM mizan.match_groups WHERE reconciliation_id=$1 ORDER BY id',[draft.id]);
  for (const group of groups) {
    const confirmed=await request(draftPath+'/matches/'+group.id+'/confirm',
      {requestKey:randomUUID(),expectedVersion:0,reason:'Verify both signed movements and their exact references'});
    assert.equal(confirmed.status,'confirmed');
  }
  assert.equal((await request(draftPath+'/validate',{expectedFingerprint:initial.content_fingerprint},409)).code,'STALE_OUTPUT');
  const {rows:[matched]}=await connection.query('SELECT content_fingerprint FROM mizan.output_versions WHERE id=$1',[draft.output_version_id]);
  const check={expectedFingerprint:matched.content_fingerprint};
  const validated=await request(draftPath+'/validate',check);
  assert.equal(validated.reused,false);
  assert.equal(validated.totals.bankUnexplained,0);
  assert.match(validated.totals.adjustedBooks,/^108(?:\.0+)?$/);
  assert.equal((await request(draftPath+'/validate',check)).fingerprint,validated.fingerprint);
  const submission=await reviewAction(draft.output_version_id,'submit',validated.fingerprint);
  assert.equal(submission.status,'under_review');
  assert.equal((await request(draftPath+'/matches/'+groups[0].id+'/unmatch',
    {requestKey:randomUUID(),expectedVersion:1,reason:'Mutation should fail during independent review'},409)).code,'OUTPUT_FROZEN');
  assert.equal((await reviewAction(draft.output_version_id,'approve',submission.fingerprint,submission.id)).status,'approved_locked');
  passed.push('Equal balances alone cannot pass; confirmed coverage enables validation, independent review and immutable bank approval');

  const auditPath='http://127.0.0.1:'+server.address().port+'/tenants/'+t+'/audit';
  const auditResponse=await fetch(auditPath+'?action=review.approve&objectId='+report.id);
  assert.equal(auditResponse.status,200);
  const auditEvents=await auditResponse.json();
  assert.equal(auditEvents.length,1);
  assert.equal(auditEvents[0].actor_id,reviewer);
  assert.match(auditEvents[0].event_hash,/^[0-9a-f]{64}$/);
  const csvResponse=await fetch(auditPath+'/export',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({action:'review.approve',objectId:report.id})});
  assert.equal(csvResponse.status,200);
  const auditExport=await csvResponse.json();
  assert.equal(auditExport.count,1);
  assert(auditExport.csv.includes(report.id));
  assert(!auditExport.csv.includes('Synthetic independent review'));
  const exportEvents=await (await fetch(auditPath+'?action=audit.exported')).json();
  assert(exportEvents.some(event=>event.redacted_metadata.count===1));
  passed.push('Audit filters isolate one approval and CSV download records its own audit event without reasons');

  const download=(id,format,fingerprint,status)=>fetch(base+'/outputs/'+id+'/export',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({format,expectedFingerprint:fingerprint,expectedStatus:status}),
  });
  assert.equal((await download(report.id,'pdf',financialReview.fingerprint,'approved_locked')).status,403);
  const {rows:[exportMember]}=await connection.query('SELECT id FROM mizan.memberships WHERE tenant_id=$1 AND user_id=$2',[t,actor]);
  await insert(connection,'access_grants',{tenant_id:t,membership_id:exportMember.id,entity_id:e,permission_code:'outputs.export',granted_by:actor});
  assert.equal((await download(report.id,'xlsx',financialReview.fingerprint,'draft')).status,409);
  const workbookResponse=await download(report.id,'xlsx',financialReview.fingerprint,'approved_locked');
  assert.equal(workbookResponse.status,200);
  assert.match(workbookResponse.headers.get('content-disposition'),/attachment/);
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await workbookResponse.arrayBuffer()));
  assert.equal(workbook.getWorksheet('Version').getCell('B3').value,e);
  assert.equal(workbook.getWorksheet('Version').getCell('B6').value,'Approved and locked');
  assert.match(workbook.getWorksheet('Values').getCell('B2').value,/^100(?:\.0+)?$/);
  const pdf=await download(draft.output_version_id,'pdf',submission.fingerprint,'approved_locked');
  assert.equal(pdf.status,200);
  assert.equal(pdf.headers.get('content-type'),'application/pdf');
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
  const exportLog=await (await fetch(auditPath+'?action=output.exported')).json();
  assert.equal(exportLog.length,2);
  assert(exportLog.every(event=>/^[0-9a-f]{64}$/.test(event.redacted_metadata.sha256)));
  passed.push('Exact approved outputs download as PDF and XLSX with scoped permission, stale-state protection and audited hashes');

  const correctionFile=await fixtureSource('code,name,classification,balance\n'+asset+
    ',Cash,asset.current,110\n'+equity+',Equity,equity,-110\n');
  const {staged:replacement}=await request('/source-files/'+correctionFile+'/preview',
    {template:{id:savedTemplate.id,periodId},stageImport:true},201);
  const replacementPath='/staged-imports/'+replacement.batchId;
  const replacementReview=await request(replacementPath);
  const replacementDataset=await request(replacementPath+'/publish',{...publication,qualityRunId:replacementReview.quality.id});
  const reopenPath='/datasets/'+replacementDataset.datasetId+'/reports';
  const reopening={confirmation:true,reopen:{predecessorId:report.id,expectedFingerprint:financialReview.fingerprint,
    reason:'Use the corrected published trial balance for this period'}};
  const bankReopen={predecessorId:draft.output_version_id,expectedFingerprint:submission.fingerprint,
    reason:'Correct the published bank and ledger balances for this period'};
  await request('/reconciliations/from-published',{...pair,reopen:bankReopen},403);
  assert.equal((await request(reopenPath,{confirmation:true},409)).code,'REOPEN_REQUIRED');
  await request(reopenPath,reopening,403);
  await insert(connection,'access_grants',{tenant_id:t,membership_id:exportMember.id,entity_id:e,permission_code:'outputs.reopen',granted_by:actor});
  await request(reopenPath,{...reopening,reopen:{...reopening.reopen,expectedFingerprint:'0'.repeat(64)}},409);
  const reopened=await request(reopenPath,reopening,201);
  assert.equal(reopened.outputs.length,1);
  const newReport=reopened.outputs[0];
  assert.equal(newReport.output_type,'financial_position');
  assert.equal((await request(reopenPath,reopening)).outputs[0].id,newReport.id);
  await request(reopenPath,{...reopening,reopen:{...reopening.reopen,reason:'Try to create a conflicting active replacement'}},409);
  const details=await request('/outputs/'+newReport.id+'/review');
  assert.equal(details.output.predecessor_id,report.id);
  assert.equal(details.output.reopen_reason,reopening.reopen.reason);
  assert.match(details.changes.find(item=>item.label==='assets').difference,/^10(?:\.0+)?$/);
  const newSubmission=await reviewAction(newReport.id,'submit',details.output.content_fingerprint);
  assert.equal((await reviewAction(newReport.id,'approve',newSubmission.fingerprint,newSubmission.id)).status,'approved_locked');
  const originalAfter=await request('/reports/'+report.id);
  assert.equal(originalAfter.status,'approved_locked');
  assert.equal(originalAfter.content_fingerprint,financialReview.fingerprint);
  assert.match(originalAfter.lines.find(line=>line.code==='assets').value,/^100(?:\.0+)?$/);
  passed.push('Authorized reopening creates a linked replacement from corrected figures and leaves the approved original intact');

  assert.equal((await request('/reconciliations/from-published',{...pair,reopen:bankReopen},409)).code,'REPLACEMENT_SOURCES_USED');
  const replacementBank=await bankDataset('bank_statement','S2','110');
  const replacementBooks=await bankDataset('bank_ledger','L2','110');
  const newPair={bankDatasetId:replacementBank,bookDatasetId:replacementBooks,confirmation:true};
  assert.equal((await request('/reconciliations/from-published',newPair,409)).code,'REOPEN_REQUIRED');
  await request('/reconciliations/from-published',{...newPair,reopen:{...bankReopen,expectedFingerprint:'0'.repeat(64)}},409);
  const replacementBankDraft=await request('/reconciliations/from-published',{...newPair,reopen:bankReopen},201);
  assert.equal((await request('/reconciliations/from-published',{...newPair,reopen:bankReopen})).id,replacementBankDraft.id);
  const bankChanges=await request('/outputs/'+replacementBankDraft.output_version_id+'/review');
  assert.equal(bankChanges.output.predecessor_id,draft.output_version_id);
  assert.match(bankChanges.changes.find(row=>row.key==='bank_closing').difference,/^2(?:\.0+)?$/);
  const {rows:replacementGroups}=await connection.query('SELECT id FROM mizan.match_groups WHERE reconciliation_id=$1 ORDER BY id',[replacementBankDraft.id]);
  assert.equal(replacementGroups.length,2);
  for(const group of replacementGroups){
    await request('/reconciliations/'+replacementBankDraft.id+'/matches/'+group.id+'/confirm',
      {requestKey:randomUUID(),expectedVersion:0,reason:'Confirm the new sources and their independent exact match'});
  }
  const bankBeforeValidation=await request('/outputs/'+replacementBankDraft.output_version_id+'/review');
  const replacementCheck=await request('/reconciliations/'+replacementBankDraft.id+'/validate',
    {expectedFingerprint:bankBeforeValidation.output.content_fingerprint});
  const newBankReview=await reviewAction(replacementBankDraft.output_version_id,'submit',replacementCheck.fingerprint);
  assert.equal((await reviewAction(replacementBankDraft.output_version_id,'approve',newBankReview.fingerprint,newBankReview.id)).status,'approved_locked');
  const originalBank=await request('/outputs/'+draft.output_version_id+'/review');
  assert.equal(originalBank.output.status,'approved_locked');
  assert.equal(originalBank.output.content_fingerprint,submission.fingerprint);
  const {rows:[originalAllocations]}=await connection.query(`
    SELECT count(*)::int AS active FROM mizan.allocations a JOIN mizan.match_groups g ON g.id=a.match_group_id
    WHERE g.reconciliation_id=$1 AND a.reversed_at IS NULL
  `,[draft.id]);
  assert.equal(originalAllocations.active,2);
  passed.push('Bank reopening requires new sources and independently approves replacement matches while preserving the original allocations');

  identity={id:reviewer,sessionId:reviewerSession};
  await connection.query("SELECT set_config('mizan.user_id',$1,true)",[reviewer]);
  await request(periodPath+'/lock',lockPeriod,403);
  identity={id:actor,sessionId};
  await connection.query("SELECT set_config('mizan.user_id',$1,true)",[actor]);
  const locked=await request(periodPath+'/lock',lockPeriod);
  assert.equal(locked.status,'locked');
  assert.equal((await request(periodPath+'/lock',lockPeriod)).reused,true);
  await connection.query('SAVEPOINT frozen_period');
  await assert.rejects(connection.query('UPDATE mizan.output_versions SET content_fingerprint=$2 WHERE id=$1',
    [supersededId,hash(randomUUID())]),/Period is closed/);
  await connection.query('ROLLBACK TO SAVEPOINT frozen_period');
  await connection.query('RELEASE SAVEPOINT frozen_period');
  const reopenPeriod={requestKey:randomUUID(),reason:'Create a new period version for controlled corrections'};
  const newPeriod=await request(periodPath+'/reopen',reopenPeriod,201);
  assert.equal(newPeriod.predecessor_id,periodId);
  assert.equal(newPeriod.version,locked.version+1);
  assert.equal((await request(periodPath+'/reopen',reopenPeriod)).id,newPeriod.id);
  await request(periodPath+'/reopen',{...reopenPeriod,requestKey:randomUUID()},409);
  const periods=await request('/periods');
  const previous=periods.find(item=>item.id===periodId), next=periods.find(item=>item.id===newPeriod.id);
  assert.equal(previous.status,'locked');
  assert.equal(previous.is_latest,false);
  assert.equal(next.status,'open');
  assert.equal(next.is_latest,true);
  assert.equal(next.reopen_reason,reopenPeriod.reason);
  assert.deepEqual([next.start_date,next.end_date],[previous.start_date,previous.end_date]);
  const reimport=await request('/source-files/'+correctionFile+'/preview',
    {template:{id:savedTemplate.id,periodId:newPeriod.id},stageImport:true},201);
  assert.notEqual(reimport.staged.batchId,replacement.batchId);
  assert.equal((await request('/reports/'+report.id)).status,'approved_locked');
  passed.push('Period locking protects active reviews and historical reports, and reopening starts one new importable version');

  const targetReview=await request('/outputs/'+newReport.id+'/review');
  assert.equal(targetReview.output.period_status,'locked');
  assert.equal(targetReview.output.reopen_period_id,newPeriod.id);
  assert.equal((await request('/outputs/'+report.id+'/review')).output.reopen_period_id,null);
  const nextReview=await request('/staged-imports/'+reimport.staged.batchId);
  const nextDataset=await request('/staged-imports/'+reimport.staged.batchId+'/publish',
    {...publication,qualityRunId:nextReview.quality.id});
  const nextReportPath='/datasets/'+nextDataset.datasetId+'/reports';
  assert.equal((await request(nextReportPath,{confirmation:true},409)).code,'REOPEN_REQUIRED');
  await request(nextReportPath,reopening,404);
  const across=await request(nextReportPath,{confirmation:true,reopen:{
    predecessorId:newReport.id,expectedFingerprint:newSubmission.fingerprint,reason:'Replace the report in the reopened accounting period',
  }},201);
  const acrossId=across.outputs[0].id;
  const acrossDetails=await request('/outputs/'+acrossId+'/review');
  assert.equal(acrossDetails.output.period_id,newPeriod.id);
  assert.equal(acrossDetails.output.predecessor_id,newReport.id);
  assert.equal(acrossDetails.output.version,targetReview.output.version+1);
  const acrossSubmission=await reviewAction(acrossId,'submit',acrossDetails.output.content_fingerprint);
  assert.equal((await reviewAction(acrossId,'approve',acrossSubmission.fingerprint,acrossSubmission.id)).status,'approved_locked');

  const bankTarget=await request('/outputs/'+replacementBankDraft.output_version_id+'/review');
  assert.equal(bankTarget.output.reopen_period_id,newPeriod.id);
  const carriedBank=await bankDataset('bank_statement','S3','110',newPeriod.id);
  const carriedBooks=await bankDataset('bank_ledger','L3','110',newPeriod.id);
  const acrossPair={bankDatasetId:carriedBank,bookDatasetId:carriedBooks,confirmation:true};
  assert.equal((await request('/reconciliations/from-published',acrossPair,409)).code,'REOPEN_REQUIRED');
  const bankAcross=await request('/reconciliations/from-published',{...acrossPair,reopen:{
    predecessorId:replacementBankDraft.output_version_id,expectedFingerprint:newBankReview.fingerprint,
    reason:'Replace the reconciliation in the reopened accounting period',
  }},201);
  const bankAcrossReview=await request('/outputs/'+bankAcross.output_version_id+'/review');
  assert.equal(bankAcrossReview.output.period_id,newPeriod.id);
  assert.equal(bankAcrossReview.output.predecessor_id,replacementBankDraft.output_version_id);
  assert.equal(bankAcrossReview.output.version,bankTarget.output.version+1);
  assert.equal((await request('/outputs/'+replacementBankDraft.output_version_id+'/review')).output.status,'approved_locked');
  passed.push('A reopened period links financial and bank replacements to the latest approval while preserving prior versions');

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
