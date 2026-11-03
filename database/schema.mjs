// Reviewable source for migration 002. Generate once; applied SQL is checksum-protected.
// All financial amounts remain exact numeric values; business policies are versioned data.
export const tables=[];
const table=(name,scope,requirements,columns,constraints=[],options={})=>tables.push({name,scope,requirements,columns,constraints,...options});
const fk=(column,target,scope='entity')=>`FOREIGN KEY (${scope==='entity'?'tenant_id, entity_id, ':scope==='tenant'?'tenant_id, ':''}${column}) REFERENCES mizan.${target} (${scope==='entity'?'tenant_id, entity_id, ':scope==='tenant'?'tenant_id, ':''}id)`;
const actor=column=>fk(column,'app_users','global');
const amount='mizan.exact_amount';
const currency='currency_code text NOT NULL REFERENCES mizan.currencies(code)';
const json=column=>`${column} jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(${column})='object')`;
const status=(values,initial=values[0])=>`status text NOT NULL DEFAULT '${initial}' CHECK (status IN (${values.map(v=>`'${v}'`).join(',')}))`;
const version='version integer NOT NULL CHECK (version > 0)';
const fingerprint="content_fingerprint text NOT NULL CHECK (content_fingerprint ~ '^[0-9a-f]{64}$')";

table('currencies','catalog','DR-002, DR-003',[
 'code text PRIMARY KEY CHECK (code ~ \'^[A-Z]{3}$\')','name text NOT NULL','minor_units smallint NOT NULL CHECK (minor_units BETWEEN 0 AND 8)'
]);
table('app_users','identity','FR-001',[
 'identity_provider text NOT NULL','provider_subject text NOT NULL','email text NOT NULL','display_name text NOT NULL',
 'mfa_enabled boolean NOT NULL DEFAULT false',status(['active','suspended','deleted']), 'last_authenticated_at timestamptz'
],['UNIQUE(identity_provider,provider_subject)']);
table('user_sessions','identity','FR-001',[
 'user_id uuid NOT NULL','provider_session_hash text NOT NULL UNIQUE','authenticated_at timestamptz NOT NULL','mfa_verified_at timestamptz','expires_at timestamptz NOT NULL','revoked_at timestamptz','revocation_reason text'
],[actor('user_id'),'CHECK(expires_at > authenticated_at)','CHECK(revoked_at IS NULL OR revocation_reason IS NOT NULL)'],{userColumn:'user_id'});
table('security_events','identity','FR-001, NFR-011',[
 'user_id uuid','event_type text NOT NULL','request_id uuid','redacted_details jsonb NOT NULL DEFAULT \'{}\'::jsonb'
],[actor('user_id')],{userColumn:'user_id',appendOnly:true});
table('permissions','catalog','FR-003',['code text PRIMARY KEY','description text NOT NULL']);
table('roles','catalog','FR-003',['code text PRIMARY KEY','description text NOT NULL']);
table('role_permissions','catalog','FR-003',['role_code text NOT NULL REFERENCES mizan.roles(code)','permission_code text NOT NULL REFERENCES mizan.permissions(code)'],['PRIMARY KEY(role_code,permission_code)']);
table('tenants','tenantRoot','FR-002, FR-041',[
 'name text NOT NULL','data_region text NOT NULL',status(['active','suspended','export_window','deletion_pending','deleted']), 'owner_user_id uuid NOT NULL'
],[actor('owner_user_id')]);
table('memberships','tenant','FR-001–003',[
 'user_id uuid NOT NULL',status(['invited','active','suspended','revoked']), 'joined_at timestamptz','revoked_at timestamptz'
],[actor('user_id'),'UNIQUE(tenant_id,user_id)']);
table('legal_entities','tenant','FR-002, FR-004',[
 'code text NOT NULL','legal_name text NOT NULL','registration_identifier_ciphertext text',status(['active','archived'])
],['UNIQUE(tenant_id,code)']);
table('entity_settings_versions','entity','FR-004, DR-012',[
 version,'predecessor_id uuid',currency,'fiscal_year_start_month smallint NOT NULL CHECK(fiscal_year_start_month BETWEEN 1 AND 12)',
 "calendar text NOT NULL CHECK(calendar IN ('gregorian','explicit_conversion'))",'calendar_conversion_policy text','accounting_framework text NOT NULL',json('policies'),
 'effective_from date NOT NULL','created_by uuid NOT NULL','change_reason text NOT NULL'
],[fk('predecessor_id','entity_settings_versions'),actor('created_by'),'UNIQUE(tenant_id,entity_id,version)','UNIQUE(tenant_id,entity_id,id,currency_code)'],{appendOnly:true});
table('accounting_periods','entity','FR-005',[
 'logical_period_id uuid NOT NULL DEFAULT gen_random_uuid()',version,'predecessor_id uuid','settings_version_id uuid NOT NULL','start_date date NOT NULL','end_date date NOT NULL',
 status(['open','locked','superseded']), 'locked_at timestamptz','locked_by uuid','reopen_reason text','created_by uuid NOT NULL'
],[fk('settings_version_id','entity_settings_versions'),fk('predecessor_id','accounting_periods'),actor('locked_by'),actor('created_by'),
 'CHECK(end_date>=start_date)',"CHECK(status<>'locked' OR (locked_at IS NOT NULL AND locked_by IS NOT NULL))",'CHECK(predecessor_id IS NULL OR length(trim(reopen_reason))>0)',
 'UNIQUE(tenant_id,entity_id,logical_period_id,version)']);
table('accounts','entity','FR-009, FR-015',[
 'code text NOT NULL','name text NOT NULL',"account_type text NOT NULL CHECK(account_type IN ('asset','liability','equity','income','expense','unclassified'))",'parent_id uuid','active boolean NOT NULL DEFAULT true'
],[fk('parent_id','accounts'),'UNIQUE(tenant_id,entity_id,code)']);
table('bank_accounts','entity','FR-004, FR-025',[
 'label text NOT NULL','identifier_ciphertext text NOT NULL','identifier_last_four text CHECK(length(identifier_last_four)<=4)',currency,'ledger_account_id uuid NOT NULL','active boolean NOT NULL DEFAULT true'
],[fk('ledger_account_id','accounts'),'UNIQUE(tenant_id,entity_id,id,currency_code)']);
table('membership_roles','tenant','FR-002–003',[
 'membership_id uuid NOT NULL','role_code text NOT NULL REFERENCES mizan.roles(code)','entity_id uuid','bank_account_id uuid','granted_by uuid NOT NULL','revoked_at timestamptz'
],[fk('membership_id','memberships','tenant'),fk('entity_id','legal_entities','tenant'),fk('bank_account_id','bank_accounts'),actor('granted_by'),'CHECK(bank_account_id IS NULL OR entity_id IS NOT NULL)']);
table('access_grants','tenant','FR-003',[
 'membership_id uuid NOT NULL','permission_code text NOT NULL REFERENCES mizan.permissions(code)','entity_id uuid','bank_account_id uuid','granted_by uuid NOT NULL','expires_at timestamptz','revoked_at timestamptz'
],[fk('membership_id','memberships','tenant'),fk('entity_id','legal_entities','tenant'),fk('bank_account_id','bank_accounts'),actor('granted_by'),'CHECK(bank_account_id IS NULL OR entity_id IS NOT NULL)']);
table('invitations','tenant','FR-001',[
 'email text NOT NULL','token_hash text NOT NULL UNIQUE','invited_by uuid NOT NULL','expires_at timestamptz NOT NULL','accepted_at timestamptz','accepted_by uuid','revoked_at timestamptz'
],[actor('invited_by'),actor('accepted_by'),'CHECK(expires_at>created_at)','CHECK(accepted_at IS NULL OR (accepted_at<expires_at AND accepted_by IS NOT NULL AND revoked_at IS NULL))']);
table('invitation_grants','tenant','FR-001–003',[
 'invitation_id uuid NOT NULL','permission_code text NOT NULL REFERENCES mizan.permissions(code)','entity_id uuid','bank_account_id uuid'
],[fk('invitation_id','invitations','tenant'),fk('entity_id','legal_entities','tenant'),fk('bank_account_id','bank_accounts'),'CHECK(bank_account_id IS NULL OR entity_id IS NOT NULL)']);

table('processing_jobs','entity','FR-013, NFR-009',[
 'job_type text NOT NULL','idempotency_key text NOT NULL',status(['queued','running','succeeded','failed','cancelled']),
 'progress numeric NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 1)','attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0)',
 'lease_expires_at timestamptz','cancel_requested_at timestamptz','started_at timestamptz','finished_at timestamptz','trace_id uuid NOT NULL DEFAULT gen_random_uuid()',json('input_references'),'error_code text','requested_by uuid NOT NULL'
],[actor('requested_by'),'UNIQUE(tenant_id,entity_id,job_type,idempotency_key)']);
table('job_attempts','entity','FR-013, NFR-009',[
 'job_id uuid NOT NULL','attempt_number integer NOT NULL CHECK(attempt_number>0)','worker_identifier text NOT NULL','started_at timestamptz NOT NULL','finished_at timestamptz','error_code text'
],[fk('job_id','processing_jobs'),'UNIQUE(tenant_id,entity_id,job_id,attempt_number)'],{appendOnly:true});
table('source_files','entity','FR-006, FR-010, DR-005',[
 'sha256 text NOT NULL CHECK(sha256 ~ \'^[0-9a-f]{64}$\')','original_name text NOT NULL','media_type text NOT NULL','byte_size bigint NOT NULL CHECK(byte_size>=0)',
 'object_key text NOT NULL','object_version text NOT NULL','encryption_key_reference text NOT NULL','uploaded_by uuid NOT NULL',
 "scan_status text NOT NULL DEFAULT 'quarantined' CHECK(scan_status IN ('quarantined','clean','infected','rejected'))",'scanned_at timestamptz','scanner_version text','scan_job_id uuid','deleted_at timestamptz'
],[actor('uploaded_by'),fk('scan_job_id','processing_jobs'),'UNIQUE(tenant_id,entity_id,sha256)'],{immutableColumns:['sha256','original_name','media_type','byte_size','object_key','object_version','encryption_key_reference','uploaded_by']});
table('import_templates','entity','FR-007–008',[
 'logical_template_id uuid NOT NULL DEFAULT gen_random_uuid()',version,'name text NOT NULL','predecessor_id uuid','required_columns jsonb NOT NULL CHECK(jsonb_typeof(required_columns)=\'array\')',
 json('column_mapping'),'header_row integer NOT NULL CHECK(header_row>0)','worksheet_name text NOT NULL','date_format text NOT NULL','decimal_separator text NOT NULL','thousands_separator text','created_by uuid NOT NULL'
],[fk('predecessor_id','import_templates'),actor('created_by'),'UNIQUE(tenant_id,entity_id,logical_template_id,version)'],{appendOnly:true});
table('import_batches','entity','FR-006–013',[
 'source_file_id uuid NOT NULL','template_id uuid NOT NULL','period_id uuid NOT NULL','parser_version text NOT NULL',"data_type text NOT NULL CHECK(data_type IN ('trial_balance','general_ledger','bank_statement','bank_ledger','budget','trade_items','ocr'))",
 "balance_basis text CHECK(balance_basis IN ('period','year_to_date','point_in_time','not_applicable'))",'range_start date','range_end date','idempotency_key text NOT NULL','job_id uuid',
 status(['uploaded','scanning','extracting','needs_review','failed','ready','published','cancelled']), 'complete_dataset boolean NOT NULL DEFAULT false','published_at timestamptz','published_by uuid'
],[fk('source_file_id','source_files'),fk('template_id','import_templates'),fk('period_id','accounting_periods'),fk('job_id','processing_jobs'),actor('published_by'),
 'UNIQUE(tenant_id,entity_id,idempotency_key)','CHECK(range_end IS NULL OR range_start IS NULL OR range_end>=range_start)',"CHECK(status<>'published' OR (complete_dataset AND published_at IS NOT NULL AND published_by IS NOT NULL))"]);
table('source_rows','entity','FR-007, FR-009, FR-012, DR-005',[
 'import_batch_id uuid NOT NULL','worksheet text NOT NULL','row_number integer NOT NULL CHECK(row_number>0)',json('original_values'),'row_fingerprint text NOT NULL'
],[fk('import_batch_id','import_batches'),'UNIQUE(tenant_id,entity_id,import_batch_id,worksheet,row_number)'],{appendOnly:true});
table('row_transformations','entity','FR-012',[
 'source_row_id uuid NOT NULL',version,json('derived_values'),'reason text NOT NULL','actor_id uuid NOT NULL','validation_job_id uuid'
],[fk('source_row_id','source_rows'),actor('actor_id'),fk('validation_job_id','processing_jobs'),'UNIQUE(tenant_id,entity_id,source_row_id,version)'],{appendOnly:true});
table('row_dispositions','entity','FR-011–012, DR-009',[
 'source_row_id uuid NOT NULL',version,"disposition text NOT NULL CHECK(disposition IN ('accepted','rejected','excluded','total_row'))",'reason text NOT NULL',`signed_effect ${amount}`,'actor_id uuid NOT NULL'
],[fk('source_row_id','source_rows'),actor('actor_id'),'UNIQUE(tenant_id,entity_id,source_row_id,version)'],{appendOnly:true});
table('quality_runs','entity','FR-011',[
 'import_batch_id uuid NOT NULL','job_id uuid','rule_version text NOT NULL',fingerprint,'records_read bigint NOT NULL CHECK(records_read>=0)','accepted bigint NOT NULL CHECK(accepted>=0)','rejected bigint NOT NULL CHECK(rejected>=0)','excluded bigint NOT NULL CHECK(excluded>=0)',json('totals_before'),json('totals_after')
],[fk('import_batch_id','import_batches'),fk('job_id','processing_jobs'),'CHECK(records_read=accepted+rejected+excluded)'],{appendOnly:true});
table('quality_issues','entity','FR-011',[
 'quality_run_id uuid NOT NULL','source_row_id uuid',"severity text NOT NULL CHECK(severity IN ('blocking','warning'))",'code text NOT NULL','message text NOT NULL',json('evidence')
],[fk('quality_run_id','quality_runs'),fk('source_row_id','source_rows')],{appendOnly:true});
table('duplicate_candidates','entity','FR-010',[
 'source_row_id uuid NOT NULL','other_source_row_id uuid NOT NULL','rule_version text NOT NULL',status(['pending','legitimate','duplicate']), 'decided_by uuid','decision_reason text','decided_at timestamptz'
],[fk('source_row_id','source_rows'),fk('other_source_row_id','source_rows'),actor('decided_by'),'CHECK(source_row_id<>other_source_row_id)',"CHECK(status='pending' OR (decided_by IS NOT NULL AND length(trim(decision_reason))>0))",'UNIQUE(tenant_id,entity_id,source_row_id,other_source_row_id,rule_version)']);
table('dataset_versions','entity','FR-009–012, DR-006',[
 'logical_dataset_id uuid NOT NULL DEFAULT gen_random_uuid()',version,'period_id uuid NOT NULL','predecessor_id uuid',currency,'data_type text NOT NULL',fingerprint,
 status(['draft','published']), 'complete_dataset boolean NOT NULL DEFAULT false','published_at timestamptz','published_by uuid','idempotency_key text NOT NULL'
],[fk('period_id','accounting_periods'),fk('predecessor_id','dataset_versions'),actor('published_by'),'UNIQUE(tenant_id,entity_id,logical_dataset_id,version)','UNIQUE(tenant_id,entity_id,idempotency_key)',
 "CHECK(status<>'published' OR (complete_dataset AND published_at IS NOT NULL AND published_by IS NOT NULL))",'UNIQUE(tenant_id,entity_id,id,currency_code)']);
table('dataset_imports','entity','FR-009–010',[
 'dataset_id uuid NOT NULL','import_batch_id uuid NOT NULL'
],[fk('dataset_id','dataset_versions'),fk('import_batch_id','import_batches'),'UNIQUE(tenant_id,entity_id,dataset_id,import_batch_id)'],{datasetColumn:'dataset_id'});
table('dimensions','entity','FR-024',['code text NOT NULL','name text NOT NULL','dimension_type text NOT NULL'],['UNIQUE(tenant_id,entity_id,code)']);
table('dimension_values','entity','FR-024',['dimension_id uuid NOT NULL','code text NOT NULL','name text NOT NULL','parent_id uuid'],[fk('dimension_id','dimensions'),fk('parent_id','dimension_values'),'UNIQUE(tenant_id,entity_id,dimension_id,code)']);
table('ledger_entries','entity','FR-009, DR-002–008',[
 'dataset_id uuid NOT NULL','source_row_id uuid NOT NULL','account_id uuid NOT NULL',currency,'journal_reference text NOT NULL','line_reference text NOT NULL','posting_date date NOT NULL',
 `debit ${amount} NOT NULL DEFAULT 0 CHECK(debit>=0)`,`credit ${amount} NOT NULL DEFAULT 0 CHECK(credit>=0)`,'description_ciphertext text','reversal_of_id uuid'
],[fk('dataset_id','dataset_versions'),fk('source_row_id','source_rows'),fk('account_id','accounts'),fk('reversal_of_id','ledger_entries'),
 'FOREIGN KEY(tenant_id,entity_id,dataset_id,currency_code) REFERENCES mizan.dataset_versions(tenant_id,entity_id,id,currency_code)',
 'CHECK(debit=0 OR credit=0)','UNIQUE(tenant_id,entity_id,dataset_id,journal_reference,line_reference)'],{datasetColumn:'dataset_id',amountColumns:['debit','credit']});
table('ledger_dimensions','entity','FR-024',['ledger_entry_id uuid NOT NULL','dimension_value_id uuid NOT NULL'],[fk('ledger_entry_id','ledger_entries'),fk('dimension_value_id','dimension_values'),'UNIQUE(tenant_id,entity_id,ledger_entry_id,dimension_value_id)'],{appendOnly:true});
table('trial_balance_rows','entity','FR-009, FR-016, DR-002–008',[
 'dataset_id uuid NOT NULL','source_row_id uuid NOT NULL','account_id uuid NOT NULL',currency,"balance_type text NOT NULL CHECK(balance_type IN ('period','year_to_date','point_in_time'))",
 `opening_balance ${amount}`,`debit_movement ${amount} CHECK(debit_movement>=0)`,`credit_movement ${amount} CHECK(credit_movement>=0)`,`closing_balance ${amount} NOT NULL`
],[fk('dataset_id','dataset_versions'),fk('source_row_id','source_rows'),fk('account_id','accounts'),
 'FOREIGN KEY(tenant_id,entity_id,dataset_id,currency_code) REFERENCES mizan.dataset_versions(tenant_id,entity_id,id,currency_code)',
 'CHECK(opening_balance IS NULL OR debit_movement IS NULL OR credit_movement IS NULL OR opening_balance+debit_movement-credit_movement=closing_balance)',
 'UNIQUE(tenant_id,entity_id,dataset_id,account_id)'],{datasetColumn:'dataset_id',amountColumns:['opening_balance','debit_movement','credit_movement','closing_balance']});
table('report_line_items','entity','FR-015',['code text NOT NULL','name text NOT NULL','statement_type text NOT NULL','parent_id uuid','display_order integer NOT NULL DEFAULT 0'],[fk('parent_id','report_line_items'),'UNIQUE(tenant_id,entity_id,code)']);
table('mapping_versions','entity','FR-015, DR-012',[
 'logical_mapping_id uuid NOT NULL DEFAULT gen_random_uuid()',version,'predecessor_id uuid','created_by uuid NOT NULL',fingerprint,status(['draft','published']),'published_at timestamptz'
],[fk('predecessor_id','mapping_versions'),actor('created_by'),'UNIQUE(tenant_id,entity_id,logical_mapping_id,version)']);
table('account_mappings','entity','FR-015',[
 'mapping_version_id uuid NOT NULL','account_id uuid NOT NULL','line_item_id uuid NOT NULL','weight numeric NOT NULL CHECK(weight>0 AND weight<=1)','split_rule text'
],[fk('mapping_version_id','mapping_versions'),fk('account_id','accounts'),fk('line_item_id','report_line_items'),'UNIQUE(tenant_id,entity_id,mapping_version_id,account_id,line_item_id)']);
table('formula_versions','entity','FR-018, DR-012',[
 'formula_code text NOT NULL',version,'name text NOT NULL','expression text NOT NULL',json('required_inputs'),'unit text NOT NULL','limitations text NOT NULL','approved_by uuid','approved_at timestamptz'
],[actor('approved_by'),'UNIQUE(tenant_id,entity_id,formula_code,version)'],{appendOnly:true});
table('exception_rule_versions','entity','FR-020',[
 'rule_code text NOT NULL',version,json('definition'),'explanation_template text NOT NULL','approved_by uuid','approved_at timestamptz'
],[actor('approved_by'),'UNIQUE(tenant_id,entity_id,rule_code,version)'],{appendOnly:true});
table('matching_rule_versions','entity','FR-027–029, DR-012',[
 'rule_code text NOT NULL',version,'priority integer NOT NULL','date_basis text NOT NULL CHECK(date_basis IN (\'posting_date\',\'value_date\'))','date_window_days integer NOT NULL CHECK(date_window_days>=0)',
 `amount_tolerance ${amount} NOT NULL CHECK(amount_tolerance>=0)`,'group_size_limit integer NOT NULL CHECK(group_size_limit>0)','group_date_window_days integer NOT NULL CHECK(group_date_window_days>=0)',
 'auto_confirm boolean NOT NULL DEFAULT false',json('conditions'),'approved_by uuid','approved_at timestamptz'
],[actor('approved_by'),'UNIQUE(tenant_id,entity_id,rule_code,version)',"CHECK(NOT auto_confirm OR (amount_tolerance=0 AND approved_by IS NOT NULL AND approved_at IS NOT NULL))"],{appendOnly:true});
table('exchange_rates','entity','DR-011',[
 'base_currency text NOT NULL REFERENCES mizan.currencies(code)','quote_currency text NOT NULL REFERENCES mizan.currencies(code)','rate_date date NOT NULL','rate numeric NOT NULL CHECK(rate>0 AND rate<1e18 AND scale(rate)<=18)',
 'rate_source text NOT NULL','policy_version_id uuid NOT NULL','approved_by uuid NOT NULL'
],[fk('policy_version_id','entity_settings_versions'),actor('approved_by'),'CHECK(base_currency<>quote_currency)','UNIQUE(tenant_id,entity_id,base_currency,quote_currency,rate_date,rate_source,policy_version_id)'],{appendOnly:true});

table('output_versions','entity','FR-016–019, FR-025, FR-036–037',[
 'logical_output_id uuid NOT NULL DEFAULT gen_random_uuid()',version,'predecessor_id uuid','reopen_reason text',"output_type text NOT NULL CHECK(output_type IN ('income_statement','financial_position','cash_flows','analysis','reconciliation','executive_pack'))",
 'period_id uuid NOT NULL',currency,'settings_version_id uuid NOT NULL','mapping_version_id uuid','preparer_id uuid NOT NULL',fingerprint,
 status(['draft','ready_for_review','under_review','rejected','withdrawn','approved_locked']), 'submitted_fingerprint text','submitted_at timestamptz','locked_at timestamptz'
],[fk('predecessor_id','output_versions'),fk('period_id','accounting_periods'),fk('settings_version_id','entity_settings_versions'),fk('mapping_version_id','mapping_versions'),actor('preparer_id'),
 'CHECK(predecessor_id IS NULL OR length(trim(reopen_reason))>0)','UNIQUE(tenant_id,entity_id,logical_output_id,version)','UNIQUE(tenant_id,entity_id,id,currency_code)',
 "CHECK(status NOT IN ('under_review','approved_locked') OR (submitted_fingerprint=content_fingerprint AND submitted_at IS NOT NULL))", "CHECK(status<>'approved_locked' OR locked_at IS NOT NULL)"]);
table('output_datasets','entity','FR-019, DR-012',[
 'output_version_id uuid NOT NULL','dataset_id uuid NOT NULL',"source_role text NOT NULL CHECK(source_role IN ('primary','comparative','opening','supplemental','bank','books'))"
],[fk('output_version_id','output_versions'),fk('dataset_id','dataset_versions'),'UNIQUE(tenant_id,entity_id,output_version_id,dataset_id,source_role)'],{outputColumn:'output_version_id'});
table('report_lines','entity','FR-016–019',[
 'output_version_id uuid NOT NULL','line_item_id uuid NOT NULL',currency,`value ${amount}`,"value_state text NOT NULL CHECK(value_state IN ('available','missing','not_applicable'))",'unavailable_reason text','formula_version_id uuid',
 'display_order integer NOT NULL DEFAULT 0'
],[fk('output_version_id','output_versions'),fk('line_item_id','report_line_items'),fk('formula_version_id','formula_versions'),
 'FOREIGN KEY(tenant_id,entity_id,output_version_id,currency_code) REFERENCES mizan.output_versions(tenant_id,entity_id,id,currency_code)',
 "CHECK((value_state='available' AND value IS NOT NULL) OR (value_state<>'available' AND value IS NULL AND unavailable_reason IS NOT NULL))",'UNIQUE(tenant_id,entity_id,output_version_id,line_item_id)'],{outputColumn:'output_version_id',amountColumns:['value']});
table('report_line_sources','entity','FR-019',[
 'report_line_id uuid NOT NULL','source_row_id uuid NOT NULL','account_id uuid',`contribution ${amount}`,'transformation_id uuid'
],[fk('report_line_id','report_lines'),fk('source_row_id','source_rows'),fk('account_id','accounts'),fk('transformation_id','row_transformations')],{appendOnly:true});
table('metric_results','entity','FR-017–018',[
 'output_version_id uuid NOT NULL','formula_version_id uuid NOT NULL','value numeric CHECK(value::text NOT IN (\'NaN\',\'Infinity\',\'-Infinity\'))',"value_state text NOT NULL CHECK(value_state IN ('available','missing','not_applicable'))",'unavailable_reason text',json('input_references')
],[fk('output_version_id','output_versions'),fk('formula_version_id','formula_versions'),"CHECK((value_state='available' AND value IS NOT NULL) OR (value_state<>'available' AND value IS NULL AND unavailable_reason IS NOT NULL))"],{outputColumn:'output_version_id'});
table('exception_results','entity','FR-020',[
 'output_version_id uuid NOT NULL','rule_version_id uuid NOT NULL','severity text NOT NULL','explanation text NOT NULL',json('affected_sources'), 'resolved_by uuid','resolution_reason text'
],[fk('output_version_id','output_versions'),fk('rule_version_id','exception_rule_versions'),actor('resolved_by')],{outputColumn:'output_version_id'});
table('analysis_narratives','entity','FR-021, FR-023',[
 'output_version_id uuid NOT NULL',"narrative_type text NOT NULL CHECK(narrative_type IN ('rule_based','ai_assisted'))",'text_content text NOT NULL','metric_result_id uuid','model_run_id uuid'
],[fk('output_version_id','output_versions'),fk('metric_result_id','metric_results')],{outputColumn:'output_version_id'});
table('validation_results','entity','FR-016, FR-026, FR-036',[
 'output_version_id uuid NOT NULL','validated_fingerprint text NOT NULL','code text NOT NULL',"severity text NOT NULL CHECK(severity IN ('blocking','warning','info'))",'passed boolean NOT NULL','message text NOT NULL',json('evidence')
],[fk('output_version_id','output_versions'),'UNIQUE(tenant_id,entity_id,output_version_id,validated_fingerprint,code)'],{appendOnly:true});
table('budget_versions','entity','FR-024',[
 'logical_budget_id uuid NOT NULL DEFAULT gen_random_uuid()',version,'period_id uuid NOT NULL',currency,'name text NOT NULL',fingerprint
],[fk('period_id','accounting_periods'),'UNIQUE(tenant_id,entity_id,logical_budget_id,version)','UNIQUE(tenant_id,entity_id,id,currency_code)'],{appendOnly:true});
table('budget_lines','entity','FR-024',[
 'budget_version_id uuid NOT NULL','account_id uuid NOT NULL','dimension_value_id uuid',currency,`amount ${amount} NOT NULL`
],[fk('budget_version_id','budget_versions'),fk('account_id','accounts'),fk('dimension_value_id','dimension_values'),
 'FOREIGN KEY(tenant_id,entity_id,budget_version_id,currency_code) REFERENCES mizan.budget_versions(tenant_id,entity_id,id,currency_code)'],{appendOnly:true,amountColumns:['amount']});
table('trade_items','entity','FR-018, FR-024',[
 'dataset_id uuid NOT NULL','source_row_id uuid NOT NULL','account_id uuid NOT NULL',currency,'external_id text NOT NULL',"kind text NOT NULL CHECK(kind IN ('receivable','payable'))",'party_ciphertext text NOT NULL','invoice_date date NOT NULL','due_date date NOT NULL',`amount ${amount} NOT NULL CHECK(amount>=0)`, 'as_of_date date NOT NULL'
],[fk('dataset_id','dataset_versions'),fk('source_row_id','source_rows'),fk('account_id','accounts'),'CHECK(due_date>=invoice_date)',
 'UNIQUE(tenant_id,entity_id,dataset_id,external_id)'],{datasetColumn:'dataset_id',amountColumns:['amount']});
table('trade_settlements','entity','FR-018, FR-024',[
 'trade_item_id uuid NOT NULL',currency,'settlement_date date NOT NULL',`amount ${amount} NOT NULL CHECK(amount>0)`,'source_row_id uuid NOT NULL'
],[fk('trade_item_id','trade_items'),fk('source_row_id','source_rows')],{appendOnly:true,amountColumns:['amount']});
table('planning_versions','entity','FR-024',[
 'period_id uuid NOT NULL',version,json('scenario_assumptions'),json('supplemental_inputs'),'management_notes text NOT NULL DEFAULT \'\'','created_by uuid NOT NULL'
],[fk('period_id','accounting_periods'),actor('created_by'),'UNIQUE(tenant_id,entity_id,period_id,version)'],{appendOnly:true});

for(const name of ['bank_transactions','book_transactions'])table(name,'entity',name==='bank_transactions'?'FR-025–026, FR-034':'FR-009, FR-025–026',[
 'dataset_id uuid NOT NULL','source_row_id uuid NOT NULL','bank_account_id uuid NOT NULL',currency,'posting_date date NOT NULL','value_date date','reference_ciphertext text','reference_hash text','description_ciphertext text',
 `signed_amount ${amount} NOT NULL CHECK(signed_amount<>0)`,`running_balance ${amount}`,'reversal_of_id uuid',...(name==='book_transactions'?['ledger_entry_id uuid']:[])
],[fk('dataset_id','dataset_versions'),fk('source_row_id','source_rows'),fk('reversal_of_id',name),...(name==='book_transactions'?[fk('ledger_entry_id','ledger_entries')]:[]),
 'FOREIGN KEY(tenant_id,entity_id,bank_account_id,currency_code) REFERENCES mizan.bank_accounts(tenant_id,entity_id,id,currency_code)',
 'FOREIGN KEY(tenant_id,entity_id,dataset_id,currency_code) REFERENCES mizan.dataset_versions(tenant_id,entity_id,id,currency_code)',
 'UNIQUE(tenant_id,entity_id,dataset_id,source_row_id)','UNIQUE(tenant_id,entity_id,id,bank_account_id,currency_code)'],{datasetColumn:'dataset_id',amountColumns:['signed_amount','running_balance']});
table('reconciliations','entity','FR-025–026, FR-033',[
 'output_version_id uuid NOT NULL','bank_account_id uuid NOT NULL',currency,'cutoff_date date NOT NULL','bank_dataset_id uuid NOT NULL','book_dataset_id uuid NOT NULL',
 `bank_opening_balance ${amount}`,`bank_closing_balance ${amount}`,`book_opening_balance ${amount}`,`book_closing_balance ${amount}`,
 'bank_complete boolean NOT NULL DEFAULT false','book_complete boolean NOT NULL DEFAULT false','bank_sign_policy text NOT NULL','book_sign_policy text NOT NULL'
],[fk('output_version_id','output_versions'),fk('bank_dataset_id','dataset_versions'),fk('book_dataset_id','dataset_versions'),
 'FOREIGN KEY(tenant_id,entity_id,bank_account_id,currency_code) REFERENCES mizan.bank_accounts(tenant_id,entity_id,id,currency_code)',
 'FOREIGN KEY(tenant_id,entity_id,output_version_id,currency_code) REFERENCES mizan.output_versions(tenant_id,entity_id,id,currency_code)',
 'FOREIGN KEY(tenant_id,entity_id,bank_dataset_id,currency_code) REFERENCES mizan.dataset_versions(tenant_id,entity_id,id,currency_code)',
 'FOREIGN KEY(tenant_id,entity_id,book_dataset_id,currency_code) REFERENCES mizan.dataset_versions(tenant_id,entity_id,id,currency_code)',
 'UNIQUE(tenant_id,entity_id,output_version_id)','UNIQUE(tenant_id,entity_id,id,bank_account_id,currency_code)'],{outputColumn:'output_version_id',amountColumns:['bank_opening_balance','bank_closing_balance','book_opening_balance','book_closing_balance']});
table('reconciliation_rule_bindings','entity','FR-027–029',[
 'reconciliation_id uuid NOT NULL','rule_version_id uuid NOT NULL'
],[fk('reconciliation_id','reconciliations'),fk('rule_version_id','matching_rule_versions'),'UNIQUE(tenant_id,entity_id,reconciliation_id,rule_version_id)']);
table('match_groups','entity','FR-027–031',[
 'reconciliation_id uuid NOT NULL','bank_account_id uuid NOT NULL',currency,'rule_version_id uuid',"match_kind text NOT NULL CHECK(match_kind IN ('one_to_one','one_to_many','many_to_one','partial'))",
 status(['suggested','ambiguous','confirmed','rejected','unmatched']), 'automatic boolean NOT NULL DEFAULT false','unique_candidate boolean NOT NULL DEFAULT false','reference_conflict boolean NOT NULL DEFAULT false',
 'similarity_score numeric CHECK(similarity_score BETWEEN 0 AND 1)','decided_by uuid','decision_reason text','supervisor_override_by uuid','decided_at timestamptz','idempotency_key text NOT NULL'
],[fk('reconciliation_id','reconciliations'),fk('rule_version_id','matching_rule_versions'),actor('decided_by'),actor('supervisor_override_by'),
 'FOREIGN KEY(tenant_id,entity_id,reconciliation_id,bank_account_id,currency_code) REFERENCES mizan.reconciliations(tenant_id,entity_id,id,bank_account_id,currency_code)',
 "CHECK(NOT automatic OR (match_kind='one_to_one' AND unique_candidate AND rule_version_id IS NOT NULL AND NOT reference_conflict))",
 "CHECK(status IN ('suggested','ambiguous') OR (decision_reason IS NOT NULL AND decided_at IS NOT NULL AND (decided_by IS NOT NULL OR automatic)))",
 "CHECK(NOT reference_conflict OR status<>'confirmed' OR (supervisor_override_by IS NOT NULL AND length(trim(decision_reason))>0))",'UNIQUE(tenant_id,entity_id,reconciliation_id,idempotency_key)',
 'UNIQUE(tenant_id,entity_id,id,bank_account_id,currency_code)']);
table('match_group_members','entity','FR-028–029',[
 'match_group_id uuid NOT NULL','bank_account_id uuid NOT NULL',currency,'bank_transaction_id uuid','book_transaction_id uuid',json('evidence')
],[fk('match_group_id','match_groups'),
 'FOREIGN KEY(tenant_id,entity_id,match_group_id,bank_account_id,currency_code) REFERENCES mizan.match_groups(tenant_id,entity_id,id,bank_account_id,currency_code)',
 'FOREIGN KEY(tenant_id,entity_id,bank_transaction_id,bank_account_id,currency_code) REFERENCES mizan.bank_transactions(tenant_id,entity_id,id,bank_account_id,currency_code)',
 'FOREIGN KEY(tenant_id,entity_id,book_transaction_id,bank_account_id,currency_code) REFERENCES mizan.book_transactions(tenant_id,entity_id,id,bank_account_id,currency_code)',
 'CHECK(num_nonnulls(bank_transaction_id,book_transaction_id)=1)',
 'UNIQUE NULLS NOT DISTINCT(tenant_id,entity_id,match_group_id,bank_transaction_id,book_transaction_id)']);
table('allocations','entity','FR-030–031, DR-010',[
 'match_group_id uuid NOT NULL','bank_account_id uuid NOT NULL',currency,'bank_transaction_id uuid NOT NULL','book_transaction_id uuid NOT NULL',`amount ${amount} NOT NULL CHECK(amount>0)`,
 'allocated_by uuid NOT NULL','idempotency_key text NOT NULL','reversed_at timestamptz','reversed_by uuid','reversal_reason text'
],[fk('match_group_id','match_groups'),actor('allocated_by'),actor('reversed_by'),
 'FOREIGN KEY(tenant_id,entity_id,match_group_id,bank_account_id,currency_code) REFERENCES mizan.match_groups(tenant_id,entity_id,id,bank_account_id,currency_code)',
 'FOREIGN KEY(tenant_id,entity_id,bank_transaction_id,bank_account_id,currency_code) REFERENCES mizan.bank_transactions(tenant_id,entity_id,id,bank_account_id,currency_code)',
 'FOREIGN KEY(tenant_id,entity_id,book_transaction_id,bank_account_id,currency_code) REFERENCES mizan.book_transactions(tenant_id,entity_id,id,bank_account_id,currency_code)',
 'CHECK(reversed_at IS NULL OR (reversed_by IS NOT NULL AND length(trim(reversal_reason))>0))','UNIQUE(tenant_id,entity_id,idempotency_key)'],{amountColumns:['amount']});
table('match_decisions','entity','FR-031',[
 'match_group_id uuid NOT NULL','actor_id uuid NOT NULL','action text NOT NULL','reason text NOT NULL',json('previous_state'),json('new_state')
],[fk('match_group_id','match_groups'),actor('actor_id')],{appendOnly:true});
table('reconciling_items','entity','FR-032–034',[
 'origin_reconciliation_id uuid NOT NULL','bank_account_id uuid NOT NULL',currency,'item_type text NOT NULL','origin_date date NOT NULL',`signed_amount ${amount} NOT NULL CHECK(signed_amount<>0)`,
 "effect_side text NOT NULL CHECK(effect_side IN ('bank','books','none'))",'owner_id uuid NOT NULL','source_row_id uuid','description text NOT NULL'
],[fk('origin_reconciliation_id','reconciliations'),actor('owner_id'),fk('source_row_id','source_rows'),
 'FOREIGN KEY(tenant_id,entity_id,origin_reconciliation_id,bank_account_id,currency_code) REFERENCES mizan.reconciliations(tenant_id,entity_id,id,bank_account_id,currency_code)',
 'UNIQUE(tenant_id,entity_id,id,bank_account_id,currency_code)'],{appendOnly:true,amountColumns:['signed_amount']});
table('reconciliation_items','entity','FR-032–034',[
 'reconciliation_id uuid NOT NULL','item_id uuid NOT NULL','bank_account_id uuid NOT NULL',currency,status(['outstanding','cleared','excluded']), 'carried_from_reconciliation_id uuid','clearance_source_row_id uuid','decision_reason text'
],[fk('reconciliation_id','reconciliations'),fk('carried_from_reconciliation_id','reconciliations'),fk('clearance_source_row_id','source_rows'),
 'FOREIGN KEY(tenant_id,entity_id,reconciliation_id,bank_account_id,currency_code) REFERENCES mizan.reconciliations(tenant_id,entity_id,id,bank_account_id,currency_code)',
 'FOREIGN KEY(tenant_id,entity_id,item_id,bank_account_id,currency_code) REFERENCES mizan.reconciling_items(tenant_id,entity_id,id,bank_account_id,currency_code)',
 'UNIQUE(tenant_id,entity_id,reconciliation_id,item_id)',"CHECK(status='outstanding' OR length(trim(decision_reason))>0)"]);
table('proposed_entries','entity','FR-033–034',[
 'reconciliation_id uuid NOT NULL','item_id uuid NOT NULL','description text NOT NULL','recorded_ledger_entry_id uuid',status(['proposed','linked_to_imported_entry','withdrawn']), 'created_by uuid NOT NULL'
],[fk('reconciliation_id','reconciliations'),fk('item_id','reconciling_items'),fk('recorded_ledger_entry_id','ledger_entries'),actor('created_by'),
 'UNIQUE(tenant_id,entity_id,reconciliation_id,item_id)',"CHECK((status='linked_to_imported_entry')=(recorded_ledger_entry_id IS NOT NULL))"]);
table('proposed_entry_lines','entity','FR-033',[
 'proposed_entry_id uuid NOT NULL','account_id uuid NOT NULL',currency,`debit ${amount} NOT NULL DEFAULT 0 CHECK(debit>=0)`,`credit ${amount} NOT NULL DEFAULT 0 CHECK(credit>=0)`
],[fk('proposed_entry_id','proposed_entries'),fk('account_id','accounts'),'CHECK((debit>0 AND credit=0) OR (credit>0 AND debit=0))'],{amountColumns:['debit','credit']});
table('matching_quality_runs','entity','FR-035, NFR-006',[
 'reconciliation_id uuid NOT NULL','rule_version_id uuid','ground_truth_reference text','sample_size bigint CHECK(sample_size>0)',
 'precision_value numeric CHECK(precision_value BETWEEN 0 AND 1)','confidence_lower numeric CHECK(confidence_lower BETWEEN 0 AND 1)','confidence_upper numeric CHECK(confidence_upper BETWEEN 0 AND 1)',json('coverage_counts'),json('coverage_absolute_amounts'),json('denominators'),json('strata')
],[fk('reconciliation_id','reconciliations'),fk('rule_version_id','matching_rule_versions'),'CHECK(precision_value IS NULL OR (ground_truth_reference IS NOT NULL AND sample_size IS NOT NULL))'],{appendOnly:true});

table('review_submissions','entity','FR-036',[
 'output_version_id uuid NOT NULL','content_fingerprint text NOT NULL','submitted_by uuid NOT NULL','reviewer_id uuid NOT NULL','withdrawn_at timestamptz','withdrawal_reason text'
],[fk('output_version_id','output_versions'),actor('submitted_by'),actor('reviewer_id'),'CHECK(submitted_by<>reviewer_id)','UNIQUE(tenant_id,entity_id,output_version_id,content_fingerprint)','CHECK(withdrawn_at IS NULL OR length(trim(withdrawal_reason))>0)']);
table('review_decisions','entity','FR-036–037',[
 'submission_id uuid NOT NULL','output_version_id uuid NOT NULL','reviewed_fingerprint text NOT NULL','actor_id uuid NOT NULL',"decision text NOT NULL CHECK(decision IN ('approve','reject','request_changes'))",'reason text NOT NULL','mfa_session_id uuid NOT NULL'
],[fk('submission_id','review_submissions'),fk('output_version_id','output_versions'),actor('actor_id'),fk('mfa_session_id','user_sessions','global')],{appendOnly:true});
table('reopen_events','entity','FR-005, FR-037',[
 'previous_output_id uuid NOT NULL','new_output_id uuid NOT NULL','actor_id uuid NOT NULL','reason text NOT NULL',json('change_summary')
],[fk('previous_output_id','output_versions'),fk('new_output_id','output_versions'),actor('actor_id'),'CHECK(previous_output_id<>new_output_id)','UNIQUE(tenant_id,entity_id,new_output_id)'],{appendOnly:true});
table('export_artifacts','entity','FR-038',[
 'output_version_id uuid NOT NULL','content_fingerprint text NOT NULL',"format text NOT NULL CHECK(format IN ('pdf','xlsx','csv'))",'job_id uuid NOT NULL','object_key text NOT NULL','object_version text NOT NULL','sha256 text NOT NULL',
 'output_status_at_generation text NOT NULL','generated_by uuid NOT NULL','expires_at timestamptz','deleted_at timestamptz'
],[fk('output_version_id','output_versions'),fk('job_id','processing_jobs'),actor('generated_by')]);
table('comments','entity','FR-039',[
 'output_version_id uuid NOT NULL','author_id uuid NOT NULL','body text NOT NULL','parent_id uuid'
],[fk('output_version_id','output_versions'),actor('author_id'),fk('parent_id','comments')],{appendOnly:true});
table('attachments','entity','FR-032, FR-039',[
 'source_file_id uuid NOT NULL','output_version_id uuid','comment_id uuid','item_id uuid','attached_by uuid NOT NULL'
],[fk('source_file_id','source_files'),fk('output_version_id','output_versions'),fk('comment_id','comments'),fk('item_id','reconciling_items'),actor('attached_by'),'CHECK(num_nonnulls(output_version_id,comment_id,item_id)=1)'],{appendOnly:true});
table('notifications','tenant','FR-039',[
 'recipient_id uuid NOT NULL','entity_id uuid','output_version_id uuid','notification_type text NOT NULL','safe_template_code text NOT NULL','read_at timestamptz'
],[actor('recipient_id'),fk('entity_id','legal_entities','tenant'),fk('output_version_id','output_versions'),'CHECK(output_version_id IS NULL OR entity_id IS NOT NULL)']);
table('notification_deliveries','tenant','FR-039',[
 'notification_id uuid NOT NULL','channel text NOT NULL CHECK(channel IN (\'email\',\'in_app\'))','idempotency_key text NOT NULL',status(['queued','sent','failed']), 'provider_message_id text','attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0)','last_error_code text'
],[fk('notification_id','notifications','tenant'),'UNIQUE(tenant_id,idempotency_key)']);
table('audit_events','tenant','FR-040',[
 'entity_id uuid','actor_id uuid','action text NOT NULL','object_type text NOT NULL','object_id uuid','object_version integer','reason text','request_id uuid','job_id uuid','event_hash text NOT NULL','previous_event_hash text',json('redacted_metadata')
],[fk('entity_id','legal_entities','tenant'),actor('actor_id'),fk('job_id','processing_jobs'),'CHECK(job_id IS NULL OR entity_id IS NOT NULL)'],{appendOnly:true});

table('plan_versions','catalog','FR-041',[
 'id uuid PRIMARY KEY DEFAULT gen_random_uuid()','code text NOT NULL',version,'name text NOT NULL','limits jsonb NOT NULL CHECK(jsonb_typeof(limits)=\'object\')','price_amount mizan.exact_amount CHECK(price_amount>=0)','price_currency text REFERENCES mizan.currencies(code)','billing_interval text','published_at timestamptz'
],['UNIQUE(code,version)','CHECK((price_amount IS NULL)=(price_currency IS NULL))'],{appendOnly:true});
table('subscriptions','tenant','FR-041',[
 'plan_version_id uuid NOT NULL REFERENCES mizan.plan_versions(id)','provider text','provider_subscription_id text',status(['trial','active','past_due','suspended','cancelled']), 'current_period_start timestamptz','current_period_end timestamptz','ended_at timestamptz'
],['UNIQUE(provider,provider_subscription_id)','CHECK(current_period_end IS NULL OR current_period_end>current_period_start)']);
table('invoices','tenant','FR-041',[
 'subscription_id uuid NOT NULL','provider text NOT NULL','provider_invoice_id text NOT NULL',currency,`total ${amount} NOT NULL CHECK(total>=0)`,status(['draft','open','paid','void','uncollectible']), 'period_start date NOT NULL','period_end date NOT NULL'
],[fk('subscription_id','subscriptions','tenant'),'UNIQUE(provider,provider_invoice_id)','CHECK(period_end>=period_start)'],{amountColumns:['total']});
table('payment_events','tenant','FR-041',[
 'provider text NOT NULL','provider_event_id text NOT NULL','event_type text NOT NULL','provider_created_at timestamptz NOT NULL','verified_at timestamptz NOT NULL','payload_hash text NOT NULL',status(['received','processed','ignored','failed']), 'processed_at timestamptz','last_error_code text'
],['UNIQUE(provider,provider_event_id)']);
table('usage_buckets','tenant','FR-041, NFR-017',[
 'unit text NOT NULL','window_start timestamptz NOT NULL','window_end timestamptz NOT NULL','quota_limit bigint NOT NULL CHECK(quota_limit>=0)','reserved bigint NOT NULL DEFAULT 0 CHECK(reserved>=0)','consumed bigint NOT NULL DEFAULT 0 CHECK(consumed>=0)'
],['CHECK(window_end>window_start)','CHECK(reserved+consumed<=quota_limit)','UNIQUE(tenant_id,unit,window_start,window_end)']);
table('usage_events','tenant','FR-041, NFR-009',[
 'bucket_id uuid NOT NULL','entity_id uuid','job_id uuid','idempotency_key text NOT NULL',"event_type text NOT NULL CHECK(event_type IN ('reserve','consume','release'))",'quantity bigint NOT NULL CHECK(quantity>0)'
],[fk('bucket_id','usage_buckets','tenant'),fk('entity_id','legal_entities','tenant'),fk('job_id','processing_jobs'),'CHECK(job_id IS NULL OR entity_id IS NOT NULL)','UNIQUE(tenant_id,idempotency_key)'],{appendOnly:true});
table('retention_policy_versions','tenant','FR-042',[
 'policy_code text NOT NULL',version,'category text NOT NULL','retention_days integer CHECK(retention_days>=0)','trigger_event text NOT NULL','approved_by uuid','approved_at timestamptz','legal_basis text NOT NULL'
],[actor('approved_by'),'UNIQUE(tenant_id,policy_code,version)'],{appendOnly:true});
table('data_lifecycle_requests','tenant','FR-042',[
 'entity_id uuid',"request_type text NOT NULL CHECK(request_type IN ('export','delete','terminate'))",'requested_by uuid NOT NULL','authorized_by uuid','reauth_session_id uuid','authority_verified_at timestamptz',status(['requested','authorized','running','partially_completed','completed','rejected']),
 'idempotency_key text NOT NULL','scope_definition jsonb NOT NULL','completed_at timestamptz','reason text NOT NULL'
],[fk('entity_id','legal_entities','tenant'),actor('requested_by'),actor('authorized_by'),fk('reauth_session_id','user_sessions','global'),'UNIQUE(tenant_id,idempotency_key)']);
table('legal_holds','tenant','FR-042',[
 'entity_id uuid','scope_definition jsonb NOT NULL','reason text NOT NULL','authority text NOT NULL','authorized_by uuid NOT NULL','review_due_at timestamptz NOT NULL','released_at timestamptz','release_reason text'
],[fk('entity_id','legal_entities','tenant'),actor('authorized_by'),'CHECK(released_at IS NULL OR release_reason IS NOT NULL)']);
table('deletion_manifest','tenant','FR-042, T-13',[
 'request_id uuid NOT NULL','entity_id uuid','resource_type text NOT NULL','resource_locator_hash text NOT NULL','provider text NOT NULL','deleted_at timestamptz','backup_expiry_at timestamptz','reapply_on_restore boolean NOT NULL DEFAULT true',status(['pending','deleted','held','failed'])
],[fk('request_id','data_lifecycle_requests','tenant'),fk('entity_id','legal_entities','tenant'),'UNIQUE(tenant_id,request_id,resource_type,resource_locator_hash,provider)']);
table('backup_restore_runs','tenant','NFR-008, T-13',[
 'backup_reference text NOT NULL','restored_at timestamptz NOT NULL','deletions_reapplied_at timestamptz','access_revocations_reapplied_at timestamptz','released_at timestamptz','operator_id uuid NOT NULL'
],[actor('operator_id'),'CHECK(released_at IS NULL OR (deletions_reapplied_at IS NOT NULL AND access_revocations_reapplied_at IS NOT NULL))'],{appendOnly:true});
table('support_requests','tenant','FR-043',[
 'entity_id uuid','requested_by uuid NOT NULL','subject text NOT NULL','description text NOT NULL',status(['open','in_progress','resolved','closed'])
],[fk('entity_id','legal_entities','tenant'),actor('requested_by')]);
table('support_access_grants','tenant','FR-043',[
 'support_request_id uuid NOT NULL','entity_id uuid NOT NULL','support_user_id uuid NOT NULL','approved_by uuid NOT NULL','permission_codes text[] NOT NULL','reason text NOT NULL','valid_from timestamptz NOT NULL','expires_at timestamptz NOT NULL','revoked_at timestamptz'
],[fk('support_request_id','support_requests','tenant'),fk('entity_id','legal_entities','tenant'),actor('support_user_id'),actor('approved_by'),'CHECK(expires_at>valid_from)','CHECK(support_user_id<>approved_by)']);
table('support_access_events','tenant','FR-043',['grant_id uuid NOT NULL','actor_id uuid NOT NULL','action text NOT NULL','object_type text NOT NULL','object_id uuid NOT NULL'],[fk('grant_id','support_access_grants','tenant'),actor('actor_id')],{appendOnly:true});

table('integration_connections','entity','FR-044',[
 'provider text NOT NULL','credential_secret_reference text NOT NULL','granted_scopes text[] NOT NULL','read_only boolean NOT NULL DEFAULT true CHECK(read_only)',status(['disabled','active','revoked','failed']), 'consented_by uuid NOT NULL','consented_at timestamptz NOT NULL','revoked_at timestamptz'
],[actor('consented_by')]);
table('sync_runs','entity','FR-044',[
 'connection_id uuid NOT NULL','job_id uuid NOT NULL','cursor_before text','cursor_after text','idempotency_key text NOT NULL',status(['queued','running','succeeded','failed'])
],[fk('connection_id','integration_connections'),fk('job_id','processing_jobs'),'UNIQUE(tenant_id,entity_id,connection_id,idempotency_key)']);
table('external_record_versions','entity','FR-044',[
 'connection_id uuid NOT NULL','external_id text NOT NULL','external_version text NOT NULL','source_row_id uuid','deleted_in_source boolean NOT NULL DEFAULT false','conflict_reason text','sync_run_id uuid NOT NULL'
],[fk('connection_id','integration_connections'),fk('source_row_id','source_rows'),fk('sync_run_id','sync_runs'),'UNIQUE(tenant_id,entity_id,connection_id,external_id,external_version)'],{appendOnly:true});
table('api_clients','tenant','FR-045',[
 'name text NOT NULL','credential_hash text NOT NULL UNIQUE','permission_codes text[] NOT NULL','rate_limit_policy jsonb NOT NULL','expires_at timestamptz','revoked_at timestamptz','created_by uuid NOT NULL'
],[actor('created_by')]);
table('api_client_entities','entity','FR-045',['api_client_id uuid NOT NULL'],[fk('api_client_id','api_clients','tenant'),'UNIQUE(tenant_id,entity_id,api_client_id)']);
table('api_idempotency_keys','tenant','FR-045',[
 'api_client_id uuid NOT NULL','idempotency_key text NOT NULL','request_hash text NOT NULL','response_code integer','response_object_id uuid','expires_at timestamptz NOT NULL'
],[fk('api_client_id','api_clients','tenant'),'UNIQUE(tenant_id,api_client_id,idempotency_key)']);
table('webhook_endpoints','tenant','FR-045',[
 'url text NOT NULL CHECK(url LIKE \'https://%\')','signing_secret_reference text NOT NULL','event_types text[] NOT NULL',status(['disabled','active']), 'created_by uuid NOT NULL'
],[actor('created_by')]);
table('webhook_deliveries','tenant','FR-045',[
 'endpoint_id uuid NOT NULL','event_id uuid NOT NULL','idempotency_key text NOT NULL','attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0)','next_attempt_at timestamptz',status(['queued','delivered','failed','dead_letter']), 'payload_hash text NOT NULL','last_http_status integer'
],[fk('endpoint_id','webhook_endpoints','tenant'),'UNIQUE(tenant_id,endpoint_id,event_id)','UNIQUE(tenant_id,idempotency_key)']);
table('webhook_receipts','tenant','FR-045',[
 'provider text NOT NULL','provider_event_id text NOT NULL','signature_verified_at timestamptz NOT NULL','provider_timestamp timestamptz NOT NULL','payload_hash text NOT NULL','nonce_hash text NOT NULL',status(['received','processed','failed'])
],['UNIQUE(tenant_id,provider,provider_event_id)','UNIQUE(tenant_id,provider,nonce_hash)']);
table('provider_approvals','tenant','FR-014, FR-023',[
 'provider text NOT NULL','service_type text NOT NULL CHECK(service_type IN (\'ocr\',\'ai\'))','processing_region text NOT NULL','contract_reference text NOT NULL','no_training boolean NOT NULL DEFAULT false','approved_by uuid NOT NULL','approved_at timestamptz NOT NULL','revoked_at timestamptz'
],[actor('approved_by')],{appendOnly:true});
table('ocr_runs','entity','FR-014',[
 'source_file_id uuid NOT NULL','provider_approval_id uuid NOT NULL','job_id uuid NOT NULL','model_version text NOT NULL',status(['queued','running','needs_review','succeeded','failed'])
],[fk('source_file_id','source_files'),fk('provider_approval_id','provider_approvals','tenant'),fk('job_id','processing_jobs')]);
table('ocr_fields','entity','FR-014',[
 'ocr_run_id uuid NOT NULL','page_number integer NOT NULL CHECK(page_number>0)','field_name text NOT NULL','extracted_value_ciphertext text NOT NULL','confidence numeric CHECK(confidence BETWEEN 0 AND 1)','reviewed_by uuid','reviewed_at timestamptz','corrected_value_ciphertext text'
],[fk('ocr_run_id','ocr_runs'),actor('reviewed_by'),'CHECK(reviewed_at IS NULL OR reviewed_by IS NOT NULL)']);
table('ai_narrative_runs','entity','FR-023',[
 'output_version_id uuid NOT NULL','provider_approval_id uuid NOT NULL','job_id uuid NOT NULL','model_version text NOT NULL','prompt_template_version text NOT NULL',json('source_references'),'minimized_request_hash text NOT NULL',status(['queued','running','succeeded','failed'])
],[fk('output_version_id','output_versions'),fk('provider_approval_id','provider_approvals','tenant'),fk('job_id','processing_jobs')],{outputColumn:'output_version_id'});

table('output_budget_versions','entity','FR-024, DR-012',[
 'output_version_id uuid NOT NULL','budget_version_id uuid NOT NULL'
],[fk('output_version_id','output_versions'),fk('budget_version_id','budget_versions'),'UNIQUE(tenant_id,entity_id,output_version_id,budget_version_id)'],{migration:3,outputColumn:'output_version_id'});
table('output_planning_versions','entity','FR-024, DR-012',[
 'output_version_id uuid NOT NULL','planning_version_id uuid NOT NULL'
],[fk('output_version_id','output_versions'),fk('planning_version_id','planning_versions'),'UNIQUE(tenant_id,entity_id,output_version_id,planning_version_id)'],{migration:3,outputColumn:'output_version_id'});
