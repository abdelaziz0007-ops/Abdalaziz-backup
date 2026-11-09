import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import { writeFile,readFile } from 'node:fs/promises';
import { loadEnv } from 'vite';
import { database,migrate } from '../server/database.mjs';
import { tables } from '../database/schema.mjs';

const env=loadEnv('development',process.cwd(),''),production=process.argv.includes('--production');
const linked=JSON.parse(await readFile(new URL('../.neon',import.meta.url),'utf8'));
if(production?linked.branch!=='production':!linked.branch.startsWith('codex-srs-schema'))throw new Error('Select production with --production, or a codex-srs-schema test branch; committed concurrency fixtures are test-branch only');
const pool=database(env.DATABASE_URL_UNPOOLED),passed=[];
const fingerprint=()=>randomBytes(32).toString('hex');
const known=new Set(tables.map(t=>t.name));
async function insert(c,table,values){
 assert(known.has(table));const columns=Object.keys(values);assert(columns.every(k=>/^[a-z_][a-z_0-9]*$/.test(k)));
 return (await c.query(`INSERT INTO mizan.${table} (${columns.join(',')}) VALUES (${columns.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,Object.values(values))).rows[0];
}
async function fixture(c){
 const user=await insert(c,'app_users',{identity_provider:'srs-test',provider_subject:randomUUID(),email:'synthetic@example.invalid',display_name:'Synthetic preparer'});
 const reviewer=await insert(c,'app_users',{identity_provider:'srs-test',provider_subject:randomUUID(),email:'synthetic-reviewer@example.invalid',display_name:'Synthetic reviewer',mfa_enabled:true});
 const tenant=await insert(c,'tenants',{name:'SRS synthetic test '+randomUUID(),data_region:'test-only',owner_user_id:user.id});
 const entity=await insert(c,'legal_entities',{tenant_id:tenant.id,code:'0001',legal_name:'Synthetic entity'});
 const scope={tenant_id:tenant.id,entity_id:entity.id};
 const add=(t,v)=>insert(c,t,{...scope,...v});
 const member=await insert(c,'memberships',{tenant_id:tenant.id,user_id:reviewer.id,status:'active'});
 await insert(c,'access_grants',{tenant_id:tenant.id,membership_id:member.id,permission_code:'outputs.approve',entity_id:entity.id,granted_by:user.id});
 const settings=await add('entity_settings_versions',{version:1,currency_code:'USD',fiscal_year_start_month:1,calendar:'gregorian',accounting_framework:'Synthetic reference only',effective_from:'2026-01-01',created_by:user.id,change_reason:'Test fixture'});
 const period=await add('accounting_periods',{version:1,settings_version_id:settings.id,start_date:'2026-10-01',end_date:'2026-10-31',created_by:user.id});
 const cash=await add('accounts',{code:'00100',name:'Synthetic cash',account_type:'asset'});
 const equity=await add('accounts',{code:'00300',name:'Synthetic equity',account_type:'equity'});
 const bank=await add('bank_accounts',{label:'Synthetic bank',identifier_ciphertext:'test-encrypted-marker-not-real-data',identifier_last_four:'0000',currency_code:'USD',ledger_account_id:cash.id});
 const file=await add('source_files',{sha256:fingerprint(),original_name:'synthetic.csv',media_type:'text/csv',byte_size:100,object_key:'synthetic/'+randomUUID(),object_version:'1',encryption_key_reference:'test-key-reference',uploaded_by:user.id,scan_status:'clean',scanned_at:new Date(),scanner_version:'synthetic-1'});
 const template=await add('import_templates',{version:1,name:'Synthetic',required_columns:JSON.stringify(['date','amount']),column_mapping:{date:'date'},header_row:1,worksheet_name:'CSV',date_format:'YYYY-MM-DD',decimal_separator:'.',created_by:user.id});
 async function dataset(type){
  const batch=await add('import_batches',{source_file_id:file.id,template_id:template.id,period_id:period.id,parser_version:'test-1',data_type:type,idempotency_key:randomUUID()});
  const rows=[];
  for(let i=0;i<2;i++)rows.push(await add('source_rows',{import_batch_id:batch.id,worksheet:'CSV',row_number:i+2,original_values:{value:i?'negative':'positive'},row_fingerprint:fingerprint()}));
  await add('quality_runs',{import_batch_id:batch.id,rule_version:'test-1',content_fingerprint:fingerprint(),records_read:2,accepted:2,rejected:0,excluded:0});
  await c.query("UPDATE mizan.import_batches SET status='published',complete_dataset=true,published_at=now(),published_by=$2 WHERE id=$1",[batch.id,user.id]);
  const data=await add('dataset_versions',{version:1,period_id:period.id,currency_code:'USD',data_type:type,content_fingerprint:fingerprint(),idempotency_key:randomUUID()});
  await add('dataset_imports',{dataset_id:data.id,import_batch_id:batch.id});
  return {data,batch,rows};
 }
 const bd=await dataset('bank_statement'),kd=await dataset('bank_ledger'),td=await dataset('trial_balance');
 const bankTransactions=[],bookTransactions=[];
 for(let i=0;i<2;i++){
  bankTransactions.push(await add('bank_transactions',{dataset_id:bd.data.id,source_row_id:bd.rows[i].id,bank_account_id:bank.id,currency_code:'USD',posting_date:'2026-10-10',signed_amount:i?'-20':'100'}));
  bookTransactions.push(await add('book_transactions',{dataset_id:kd.data.id,source_row_id:kd.rows[i].id,bank_account_id:bank.id,currency_code:'USD',posting_date:'2026-10-10',signed_amount:i?'-20':'100'}));
 }
 const tb=[];
 for(let i=0;i<2;i++)tb.push(await add('trial_balance_rows',{dataset_id:td.data.id,source_row_id:td.rows[i].id,account_id:i?equity.id:cash.id,currency_code:'USD',balance_type:'period',opening_balance:'0',debit_movement:i?'0':'100',credit_movement:i?'100':'0',closing_balance:i?'-100':'100'}));
 for(const x of [bd,kd,td])await c.query("UPDATE mizan.dataset_versions SET status='published',complete_dataset=true,published_at=now(),published_by=$2 WHERE id=$1",[x.data.id,user.id]);
 const cashLine=await add('report_line_items',{code:'CASH',name:'Cash',statement_type:'financial_position'}),equityLine=await add('report_line_items',{code:'EQUITY',name:'Equity',statement_type:'financial_position'});
 const mapping=await add('mapping_versions',{version:1,created_by:user.id,content_fingerprint:fingerprint()});
 await add('account_mappings',{mapping_version_id:mapping.id,account_id:cash.id,line_item_id:cashLine.id,weight:'1'});
 await add('account_mappings',{mapping_version_id:mapping.id,account_id:equity.id,line_item_id:equityLine.id,weight:'1'});
 await c.query("UPDATE mizan.mapping_versions SET status='published',published_at=now() WHERE id=$1",[mapping.id]);
 const outputValues={version:1,period_id:period.id,currency_code:'USD',settings_version_id:settings.id,mapping_version_id:mapping.id,preparer_id:user.id,content_fingerprint:fingerprint()};
 const report=await add('output_versions',{...outputValues,output_type:'financial_position'});
 await add('output_datasets',{output_version_id:report.id,dataset_id:td.data.id,source_role:'primary'});
 const reportLine=await add('report_lines',{output_version_id:report.id,line_item_id:cashLine.id,currency_code:'USD',value:'100',value_state:'available'});
 const output=await add('output_versions',{...outputValues,content_fingerprint:fingerprint(),output_type:'reconciliation'});
 await add('output_datasets',{output_version_id:output.id,dataset_id:bd.data.id,source_role:'bank'});await add('output_datasets',{output_version_id:output.id,dataset_id:kd.data.id,source_role:'books'});
 const rec=await add('reconciliations',{output_version_id:output.id,bank_account_id:bank.id,currency_code:'USD',cutoff_date:'2026-10-31',bank_dataset_id:bd.data.id,book_dataset_id:kd.data.id,bank_opening_balance:'0',bank_closing_balance:'80',book_opening_balance:'0',book_closing_balance:'80',bank_complete:true,book_complete:true,bank_sign_policy:'cash-positive',book_sign_policy:'debit-positive'});
 async function group(bankIndex=0,bookIndex=0){
  const g=await add('match_groups',{reconciliation_id:rec.id,bank_account_id:bank.id,currency_code:'USD',match_kind:'one_to_one',idempotency_key:randomUUID()});
  await add('match_group_members',{match_group_id:g.id,bank_account_id:bank.id,currency_code:'USD',bank_transaction_id:bankTransactions[bankIndex].id});
  await add('match_group_members',{match_group_id:g.id,bank_account_id:bank.id,currency_code:'USD',book_transaction_id:bookTransactions[bookIndex].id});
  await c.query("UPDATE mizan.match_groups SET status='confirmed',decided_by=$2,decision_reason='Synthetic exact match',decided_at=now() WHERE id=$1",[g.id,user.id]);return g;
 }
 const group1=await group(),negativeGroup=await group(1,1);
 const session=await insert(c,'user_sessions',{user_id:reviewer.id,provider_session_hash:fingerprint(),authenticated_at:new Date(Date.now()-60000),mfa_verified_at:new Date(),expires_at:new Date(Date.now()+3600000)});
 const allocation=(g,quantity,bankIndex=0,bookIndex=0)=>({...scope,match_group_id:g.id,bank_account_id:bank.id,currency_code:'USD',bank_transaction_id:bankTransactions[bankIndex].id,book_transaction_id:bookTransactions[bookIndex].id,amount:quantity,allocated_by:user.id,idempotency_key:randomUUID()});
 return {scope,add,user,reviewer,tenant,entity,settings,period,cash,equity,bank,file,template,bd,kd,td,tb,mapping,cashLine,equityLine,report,reportLine,output,rec,group1,negativeGroup,session,allocation,group};
}
const c=await pool.connect();
try{
 assert.equal((await migrate(pool)).length,0,'Migration rerun must be a no-op');passed.push('Versioned migrations rerun without changes');
 const inventory=await c.query("SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='mizan'");
 for(const t of tables){assert(inventory.rows.some(r=>r.tablename===t.name));if(t.scope!=='catalog')assert(inventory.rows.find(r=>r.tablename===t.name).rowsecurity);}
 passed.push(`${tables.length} SRS business tables present; row security enabled on every scoped table`);
 await c.query('BEGIN');
 const f=await fixture(c);
 async function check(name,operation,code){
  await c.query('SAVEPOINT case_check');let failure;
  try{await operation();}catch(e){failure=e;}
  await c.query('ROLLBACK TO SAVEPOINT case_check');await c.query('RELEASE SAVEPOINT case_check');
  if(code){assert(failure,`${name}: expected rejection`);assert.equal(failure.code,code,`${name}: ${failure?.message}`);}else if(failure)throw failure;
  passed.push(name);
 }
 await check('A source row cannot be overwritten',()=>c.query("UPDATE mizan.source_rows SET original_values='{}' WHERE id=$1",[f.bd.rows[0].id]),'55000');
 await check('A published import cannot receive extra original rows',()=>f.add('source_rows',{import_batch_id:f.bd.batch.id,worksheet:'CSV',row_number:99,original_values:{extra:true},row_fingerprint:fingerprint()}),'55000');
 await check('A published dataset cannot be edited',async()=>c.query('UPDATE mizan.bank_transactions SET signed_amount=99 WHERE id=$1',[(await c.query('SELECT id FROM mizan.bank_transactions WHERE dataset_id=$1',[f.bd.data.id])).rows[0].id]),'55000');
 await check('Duplicate source file fingerprint is rejected',()=>f.add('source_files',{sha256:f.file.sha256,original_name:'again.csv',media_type:'text/csv',byte_size:100,object_key:'again',object_version:'1',encryption_key_reference:'test',uploaded_by:f.user.id}),'23505');
 await check('Quality correction reruns preserve old issues and allow the latest valid result',async()=>{
  const batch=await f.add('import_batches',{source_file_id:f.file.id,template_id:f.template.id,period_id:f.period.id,parser_version:'test-1',data_type:'trial_balance',idempotency_key:randomUUID()});
  const old=await f.add('quality_runs',{import_batch_id:batch.id,rule_version:'test-1',content_fingerprint:fingerprint(),records_read:1,accepted:0,rejected:1,excluded:0});
  await f.add('quality_issues',{quality_run_id:old.id,severity:'blocking',code:'BAD',message:'Synthetic prior failure'});
  await f.add('quality_runs',{import_batch_id:batch.id,rule_version:'test-1',content_fingerprint:fingerprint(),records_read:1,accepted:1,rejected:0,excluded:0});
  await c.query("UPDATE mizan.import_batches SET status='published',complete_dataset=true,published_at=now(),published_by=$2 WHERE id=$1",[batch.id,f.user.id]);
 });
 await check('Cross-entity account relationship is rejected',async()=>{const other=await insert(c,'legal_entities',{tenant_id:f.tenant.id,code:'other',legal_name:'Other synthetic'});await f.add('bank_accounts',{entity_id:other.id,label:'Wrong scope',identifier_ciphertext:'test',currency_code:'USD',ledger_account_id:f.cash.id});},'23503');
 const plan=await insert(c,'plan_versions',{code:randomUUID(),version:1,name:'Synthetic plan',limits:{}}),subscription=await insert(c,'subscriptions',{tenant_id:f.tenant.id,plan_version_id:plan.id});
 const invoice=(ccy,total)=>insert(c,'invoices',{tenant_id:f.tenant.id,subscription_id:subscription.id,provider:'synthetic',provider_invoice_id:randomUUID(),currency_code:ccy,total,period_start:'2026-10-01',period_end:'2026-10-31'});
 await check('JPY rejects fractional currency amounts',()=>invoice('JPY','1.5'),'23514');
 await check('USD rejects hidden third-decimal rounding',()=>invoice('USD','1.001'),'23514');
 await check('KWD preserves three-decimal exact values',async()=>assert.equal((await invoice('KWD','1.234')).total,'1.234'));
 await check('Nonfinite monetary values are rejected',()=>invoice('USD','NaN'),'23514');
 await check('Leading zero account codes are preserved',async()=>assert.equal((await c.query('SELECT code FROM mizan.accounts WHERE id=$1',[f.cash.id])).rows[0].code,'00100'));
 await check('A new period version requires an explicit reopening reason',()=>f.add('accounting_periods',{logical_period_id:f.period.logical_period_id,version:2,predecessor_id:f.period.id,settings_version_id:f.settings.id,start_date:'2026-10-01',end_date:'2026-10-31',created_by:f.user.id}),'23514');
 await check('Published account mappings cannot change',()=>c.query('UPDATE mizan.account_mappings SET weight=0.5 WHERE mapping_version_id=$1',[f.mapping.id]),'55000');
 await check('Incomplete mapping splits cannot be published',async()=>{const m=await f.add('mapping_versions',{version:1,created_by:f.user.id,content_fingerprint:fingerprint()});await f.add('account_mappings',{mapping_version_id:m.id,account_id:f.cash.id,line_item_id:f.cashLine.id,weight:'0.5'});await c.query("UPDATE mizan.mapping_versions SET status='published' WHERE id=$1",[m.id]);},'23514');
 await check('Zero is distinct from a missing financial value',async()=>{const line=await f.add('report_line_items',{code:'ZERO',name:'Zero test',statement_type:'financial_position'});const row=await f.add('report_lines',{output_version_id:f.report.id,line_item_id:line.id,currency_code:'USD',value:'0',value_state:'available'});assert.equal(row.value,'0');});
 await check('Missing values require an explanation',()=>f.add('report_lines',{output_version_id:f.report.id,line_item_id:f.equityLine.id,currency_code:'USD',value_state:'missing'}),'23514');
 await check('Partial allocation is retained and excess rejected',async()=>{await insert(c,'allocations',f.allocation(f.group1,'60'));await c.query('SAVEPOINT excess');let blocked=false;try{await insert(c,'allocations',f.allocation(f.group1,'41'));}catch(e){blocked=e.code==='23514';await c.query('ROLLBACK TO SAVEPOINT excess');}assert(blocked);assert.equal((await c.query('SELECT sum(amount)::text AS total FROM mizan.allocations WHERE match_group_id=$1',[f.group1.id])).rows[0].total,'60');});
 await check('Negative payments allow magnitude-based partial allocation',()=>insert(c,'allocations',f.allocation(f.negativeGroup,'15',1,1)));
 await check('Reference conflict override requires an explicit supervisor grant',()=>c.query("UPDATE mizan.match_groups SET reference_conflict=true,supervisor_override_by=$2,decision_reason='Synthetic override' WHERE id=$1",[f.group1.id,f.user.id]),'42501');
 await check('A reversal releases the allocation and retains its reason',async()=>{const a=await insert(c,'allocations',f.allocation(f.group1,'60'));await c.query("UPDATE mizan.allocations SET reversed_at=now(),reversed_by=$2,reversal_reason='Synthetic correction' WHERE id=$1",[a.id,f.user.id]);await insert(c,'allocations',f.allocation(f.group1,'100'));});
 await check('A reversal with a missing reason is rejected',async()=>{const a=await insert(c,'allocations',f.allocation(f.group1,'10'));await c.query('UPDATE mizan.allocations SET reversed_at=now(),reversed_by=$2 WHERE id=$1',[a.id,f.user.id]);},'23514');
 await check('Deleting allocation history is forbidden',async()=>{const a=await insert(c,'allocations',f.allocation(f.group1,'10'));await c.query('DELETE FROM mizan.allocations WHERE id=$1',[a.id]);},'55000');
 const inv=await insert(c,'invitations',{tenant_id:f.tenant.id,email:'invite@example.invalid',token_hash:fingerprint(),invited_by:f.user.id,expires_at:new Date(Date.now()+3600000)});
 await c.query('UPDATE mizan.invitations SET accepted_at=now(),accepted_by=$2 WHERE id=$1',[inv.id,f.reviewer.id]);
 await check('An invitation cannot be consumed twice',()=>c.query('UPDATE mizan.invitations SET accepted_at=now() WHERE id=$1',[inv.id]),'23514');
 await check('Expired invitations cannot be accepted',async()=>{const expired=await insert(c,'invitations',{tenant_id:f.tenant.id,email:'expired@example.invalid',token_hash:fingerprint(),invited_by:f.user.id,created_at:new Date(Date.now()-7200000),expires_at:new Date(Date.now()-3600000)});await c.query('UPDATE mizan.invitations SET accepted_at=now(),accepted_by=$2 WHERE id=$1',[expired.id,f.reviewer.id]);},'23514');
 const bucket=await insert(c,'usage_buckets',{tenant_id:f.tenant.id,unit:'rows',window_start:'2026-10-01',window_end:'2026-11-01',quota_limit:100});
 const usage=()=>insert(c,'usage_events',{tenant_id:f.tenant.id,bucket_id:bucket.id,idempotency_key:'same-event',event_type:'reserve',quantity:60});
 await check('Usage quota rejects excess reservations atomically',async()=>{await usage();await insert(c,'usage_events',{tenant_id:f.tenant.id,bucket_id:bucket.id,idempotency_key:randomUUID(),event_type:'reserve',quantity:41});},'23514');
 await usage();await check('Duplicate usage event does not consume quota twice',usage,'23505');
 await check('Subscription owner has no implicit financial access',async()=>{const ownerMember=await insert(c,'memberships',{tenant_id:f.tenant.id,user_id:f.user.id,status:'active'});await insert(c,'membership_roles',{tenant_id:f.tenant.id,membership_id:ownerMember.id,role_code:'subscription_owner',granted_by:f.user.id});assert.equal((await c.query("SELECT mizan.has_permission($1,$2,$3,'reports.view') AS allowed",[f.tenant.id,f.entity.id,f.user.id])).rows[0].allowed,false);});
 await check('Self approval is rejected even before review',()=>f.add('review_submissions',{output_version_id:f.report.id,content_fingerprint:f.report.content_fingerprint,submitted_by:f.user.id,reviewer_id:f.user.id}),'23514');
 await check('Stale review fingerprints are rejected',()=>f.add('review_submissions',{output_version_id:f.report.id,content_fingerprint:fingerprint(),submitted_by:f.user.id,reviewer_id:f.reviewer.id}),'23514');
 const submission=await f.add('review_submissions',{output_version_id:f.report.id,content_fingerprint:f.report.content_fingerprint,submitted_by:f.user.id,reviewer_id:f.reviewer.id});
 await check('Submitted content cannot change after review starts',()=>c.query('UPDATE mizan.output_versions SET content_fingerprint=$2 WHERE id=$1',[f.report.id,fingerprint()]),'55000');
 await check('Review cannot be bypassed by returning directly to draft',()=>c.query("UPDATE mizan.output_versions SET status='draft' WHERE id=$1",[f.report.id]),'23514');
 await check('The submitted reviewer and fingerprint cannot be rewritten',()=>c.query('UPDATE mizan.review_submissions SET reviewer_id=$2 WHERE id=$1',[submission.id,f.user.id]),'55000');
 await check('Submitted report lines cannot change',()=>c.query('UPDATE mizan.report_lines SET value=99 WHERE id=$1',[f.reportLine.id]),'55000');
 const decision=()=>f.add('review_decisions',{submission_id:submission.id,output_version_id:f.report.id,reviewed_fingerprint:f.report.content_fingerprint,actor_id:f.reviewer.id,decision:'approve',reason:'Synthetic independent review',mfa_session_id:f.session.id});
 await check('Approval is blocked when critical validations are missing',decision,'23514');
 for(const code of ['scope','completeness','balance','mapping'])await f.add('validation_results',{output_version_id:f.report.id,validated_fingerprint:f.report.content_fingerprint,code,severity:'blocking',passed:true,message:'Synthetic validation'});
 await check('A revoked MFA session cannot approve',async()=>{await c.query('UPDATE mizan.user_sessions SET revoked_at=now(),revocation_reason=\'Test\' WHERE id=$1',[f.session.id]);await decision();},'42501');
 await decision();passed.push('Independent MFA review approves a fixed version');
 await check('Approved output cannot be unlocked or edited',()=>c.query("UPDATE mizan.output_versions SET status='draft',locked_at=NULL WHERE id=$1",[f.report.id]),'55000');
 await check('Approved report lines remain frozen',()=>c.query('UPDATE mizan.report_lines SET value=99 WHERE id=$1',[f.reportLine.id]),'55000');
 await check('Approved report provenance cannot acquire new sources',()=>f.add('report_line_sources',{report_line_id:f.reportLine.id,source_row_id:f.td.rows[0].id,account_id:f.cash.id,contribution:'100'}),'55000');
 await check('Approval decisions are immutable',()=>c.query("UPDATE mizan.review_decisions SET reason='Changed' WHERE submission_id=$1",[submission.id]),'55000');
 await check('Reopening an approved output requires a nonempty reason',()=>f.add('output_versions',{logical_output_id:f.report.logical_output_id,version:2,predecessor_id:f.report.id,output_type:'financial_position',period_id:f.period.id,currency_code:'USD',settings_version_id:f.settings.id,mapping_version_id:f.mapping.id,preparer_id:f.user.id,content_fingerprint:fingerprint()}),'23514');
 const audit=await insert(c,'audit_events',{tenant_id:f.tenant.id,entity_id:f.entity.id,actor_id:f.user.id,action:'synthetic_test',object_type:'output',object_id:f.report.id,event_hash:fingerprint()});
 await check('Audit events cannot be overwritten',()=>c.query("UPDATE mizan.audit_events SET action='Changed' WHERE id=$1",[audit.id]),'55000');
 await check('Restored backups cannot be released before deletions and revocations are reapplied',()=>insert(c,'backup_restore_runs',{tenant_id:f.tenant.id,backup_reference:'synthetic',restored_at:new Date(),released_at:new Date(),operator_id:f.user.id}),'23514');
 await check('Provider approvals can be revoked without rewriting the approved contract',async()=>{const approval=await insert(c,'provider_approvals',{tenant_id:f.tenant.id,provider:'synthetic',service_type:'ai',processing_region:'test-only',contract_reference:'Synthetic contract',no_training:true,approved_by:f.user.id,approved_at:new Date()});await c.query('UPDATE mizan.provider_approvals SET revoked_at=now() WHERE id=$1',[approval.id]);assert((await c.query('SELECT revoked_at FROM mizan.provider_approvals WHERE id=$1',[approval.id])).rows[0].revoked_at);});
 await check('A bank-only approval grant applies only to that account output',async()=>{
  const member=(await c.query('SELECT id FROM mizan.memberships WHERE tenant_id=$1 AND user_id=$2',[f.tenant.id,f.reviewer.id])).rows[0];
  await c.query('DELETE FROM mizan.access_grants WHERE membership_id=$1',[member.id]);
  await insert(c,'access_grants',{tenant_id:f.tenant.id,membership_id:member.id,permission_code:'outputs.approve',entity_id:f.entity.id,bank_account_id:f.bank.id,granted_by:f.user.id});
  assert.equal((await c.query('SELECT mizan.can_approve_output($1,$2,$3,$4) AS allowed',[f.tenant.id,f.entity.id,f.reviewer.id,f.output.id])).rows[0].allowed,true);
  assert.equal((await c.query('SELECT mizan.can_approve_output($1,$2,$3,$4) AS allowed',[f.tenant.id,f.entity.id,f.reviewer.id,f.report.id])).rows[0].allowed,false);
 });
 await c.query('UPDATE mizan.reconciliations SET bank_opening_balance=99920,bank_closing_balance=100000,book_opening_balance=102120,book_closing_balance=102200 WHERE id=$1',[f.rec.id]);
 for(const [item_type,signed_amount,effect_side] of [['deposit_in_transit','5000','bank'],['outstanding_check','-3000','bank'],['unrecorded_fee','-200','books']]){
  const item=await f.add('reconciling_items',{origin_reconciliation_id:f.rec.id,bank_account_id:f.bank.id,currency_code:'USD',item_type,origin_date:'2026-10-01',signed_amount,effect_side,owner_id:f.user.id,source_row_id:f.bd.rows[0].id,description:'Synthetic SRS 9.6 evidence'});
  await f.add('reconciliation_items',{reconciliation_id:f.rec.id,item_id:item.id,bank_account_id:f.bank.id,currency_code:'USD'});
  await f.add('attachments',{source_file_id:f.file.id,item_id:item.id,attached_by:f.user.id});
 }
 const reconciled=await c.query("SELECT r.bank_closing_balance+sum(i.signed_amount) FILTER(WHERE i.effect_side='bank') AS bank_adjusted,r.book_closing_balance+sum(i.signed_amount) FILTER(WHERE i.effect_side='books') AS book_adjusted FROM mizan.reconciliations r JOIN mizan.reconciliation_items x ON x.reconciliation_id=r.id JOIN mizan.reconciling_items i ON i.id=x.item_id WHERE r.id=$1 GROUP BY r.id",[f.rec.id]);
 assert.equal(reconciled.rows[0].bank_adjusted,'102000');assert.equal(reconciled.rows[0].book_adjusted,'102000');passed.push('SRS section 9.6: both adjusted balances equal exactly 102000');
 const recSubmission=await f.add('review_submissions',{output_version_id:f.output.id,content_fingerprint:f.output.content_fingerprint,submitted_by:f.user.id,reviewer_id:f.reviewer.id});
 for(const code of ['scope','completeness','balance','mapping'])await f.add('validation_results',{output_version_id:f.output.id,validated_fingerprint:f.output.content_fingerprint,code,severity:'blocking',passed:true,message:'Synthetic validated SRS example'});
 await f.add('review_decisions',{submission_id:recSubmission.id,output_version_id:f.output.id,reviewed_fingerprint:f.output.content_fingerprint,actor_id:f.reviewer.id,decision:'approve',reason:'Independent synthetic SRS example review',mfa_session_id:f.session.id});
 passed.push('Complete reconciliation with evidence, roll-forward and zero residual is approved');
 await check('Locked reconciliation blocks further matching changes',()=>insert(c,'allocations',f.allocation(f.group1,'10')),'55000');
 await check('Bank settings cannot change behind a locked reconciliation',()=>c.query('UPDATE mizan.bank_accounts SET ledger_account_id=$2 WHERE id=$1',[f.bank.id,f.equity.id]),'55000');
 const role='mizan_test_'+randomBytes(6).toString('hex');
 await c.query('CREATE ROLE '+role+' NOLOGIN NOBYPASSRLS');await c.query('GRANT '+role+' TO CURRENT_USER');
 await c.query('GRANT USAGE ON SCHEMA mizan TO '+role);await c.query('GRANT SELECT ON mizan.legal_entities,mizan.bank_accounts TO '+role);
 await c.query('SET LOCAL ROLE '+role);
 assert.equal((await c.query('SELECT count(*)::int AS n FROM mizan.legal_entities')).rows[0].n,0);passed.push('RLS denies rows when tenant context is missing');
 await c.query("SELECT set_config('mizan.tenant_id',$1,true),set_config('mizan.entity_ids',$2,true)",[f.tenant.id,f.entity.id]);
 assert.equal((await c.query('SELECT count(*)::int AS n FROM mizan.bank_accounts')).rows[0].n,1);
 await c.query("SELECT set_config('mizan.entity_ids',$1,true)",[randomUUID()]);
 assert.equal((await c.query('SELECT count(*)::int AS n FROM mizan.bank_accounts')).rows[0].n,0);passed.push('RLS restricts entity rows to server-provided entity scope');
 await c.query("SELECT set_config('mizan.tenant_id',$1,true),set_config('mizan.entity_ids',$2,true)",[randomUUID(),f.entity.id]);
 assert.equal((await c.query('SELECT count(*)::int AS n FROM mizan.bank_accounts')).rows[0].n,0);passed.push('RLS rejects another tenant even when an entity identifier is known');
 await c.query('RESET ROLE');await c.query('ROLLBACK');
 if(!production){
  await c.query('BEGIN');const concurrent=await fixture(c);await c.query('COMMIT');
  const a=await pool.connect(),b=await pool.connect();
  try{
   await a.query('BEGIN');await b.query('BEGIN');
   await insert(a,'allocations',concurrent.allocation(concurrent.group1,'60'));
   const attempted=insert(b,'allocations',concurrent.allocation(concurrent.group1,'60')).then(()=>null,e=>e);
   await new Promise(resolve=>setTimeout(resolve,150));await a.query('COMMIT');
   const error=await attempted;assert.equal(error?.code,'23514');await b.query('ROLLBACK');
   const total=(await c.query('SELECT sum(amount)::text AS total FROM mizan.allocations WHERE match_group_id=$1',[concurrent.group1.id])).rows[0].total;assert.equal(total,'60');
   passed.push('Two concurrent 60/100 allocations: one commits, the other is rejected; total remains 60');
  }finally{await a.query('ROLLBACK').catch(()=>{});await b.query('ROLLBACK').catch(()=>{});a.release();b.release();}
 }
 const result={target:linked.branch,businessTables:tables.length,passed,errors:[],productionTestsRolledBack:production,concurrencyTestRun:!production};
 await writeFile(new URL(production?'./srs-database-production.json':'./srs-database-branch.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
 console.log(`SRS database: ${passed.length} checks passed; ${tables.length} business tables; target=${result.target}`);
}catch(error){await c.query('ROLLBACK').catch(()=>{});console.error('SRS database test failed:',error.message);process.exitCode=1;}
finally{c.release();await pool.end();}
