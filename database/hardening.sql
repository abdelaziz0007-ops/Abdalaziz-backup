-- Cross-parent links and immutable source/decision layers need explicit guards.
CREATE FUNCTION mizan.guard_source_row_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s text;
BEGIN
 SELECT status INTO s FROM mizan.import_batches WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.import_batch_id) FOR UPDATE;
 IF s='published' THEN RAISE EXCEPTION 'Source rows cannot be appended to a published import' USING ERRCODE='55000'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER source_batch_frozen BEFORE INSERT ON mizan.source_rows FOR EACH ROW EXECUTE FUNCTION mizan.guard_source_row_insert();
CREATE FUNCTION mizan.guard_line_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s text;
BEGIN
 SELECT v.status INTO s FROM mizan.report_lines l JOIN mizan.output_versions v ON (v.tenant_id,v.entity_id,v.id)=(l.tenant_id,l.entity_id,l.output_version_id) WHERE (l.tenant_id,l.entity_id,l.id)=(NEW.tenant_id,NEW.entity_id,NEW.report_line_id) FOR UPDATE OF v;
 IF s NOT IN ('draft','rejected','withdrawn') THEN RAISE EXCEPTION 'Frozen report provenance' USING ERRCODE='55000'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER line_sources_frozen BEFORE INSERT ON mizan.report_line_sources FOR EACH ROW EXECUTE FUNCTION mizan.guard_line_source();
CREATE FUNCTION mizan.guard_ledger_dimension() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s text;
BEGIN
 SELECT d.status INTO s FROM mizan.ledger_entries l JOIN mizan.dataset_versions d ON (d.tenant_id,d.entity_id,d.id)=(l.tenant_id,l.entity_id,l.dataset_id) WHERE (l.tenant_id,l.entity_id,l.id)=(NEW.tenant_id,NEW.entity_id,NEW.ledger_entry_id) FOR UPDATE OF d;
 IF s='published' THEN RAISE EXCEPTION 'Published ledger dimensions are immutable' USING ERRCODE='55000'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER ledger_dimensions_frozen BEFORE INSERT ON mizan.ledger_dimensions FOR EACH ROW EXECUTE FUNCTION mizan.guard_ledger_dimension();
CREATE FUNCTION mizan.guard_bound_budget() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM mizan.budget_versions WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.budget_version_id) FOR UPDATE;
 IF EXISTS(SELECT 1 FROM mizan.output_budget_versions b JOIN mizan.output_versions v ON (v.tenant_id,v.entity_id,v.id)=(b.tenant_id,b.entity_id,b.output_version_id) WHERE (b.tenant_id,b.entity_id,b.budget_version_id)=(NEW.tenant_id,NEW.entity_id,NEW.budget_version_id) AND v.status NOT IN ('draft','rejected','withdrawn')) THEN RAISE EXCEPTION 'Budget version used in a frozen output is immutable' USING ERRCODE='55000'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER budget_binding_frozen BEFORE INSERT ON mizan.budget_lines FOR EACH ROW EXECUTE FUNCTION mizan.guard_bound_budget();
CREATE FUNCTION mizan.guard_output_budget_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE output_period uuid; output_currency text; budget_period uuid; budget_currency text;
BEGIN
 SELECT period_id,currency_code INTO output_period,output_currency FROM mizan.output_versions WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.output_version_id);
 SELECT period_id,currency_code INTO budget_period,budget_currency FROM mizan.budget_versions WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.budget_version_id) FOR UPDATE;
 IF output_period<>budget_period OR output_currency<>budget_currency THEN RAISE EXCEPTION 'Budget period and currency must match output' USING ERRCODE='23514'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER budget_binding_compatible BEFORE INSERT OR UPDATE ON mizan.output_budget_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_output_budget_binding();

CREATE FUNCTION mizan.guard_review_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status='under_review' THEN
  IF NEW.status NOT IN ('under_review','withdrawn','rejected','approved_locked') THEN RAISE EXCEPTION 'Use the documented review transition' USING ERRCODE='23514'; END IF;
  IF NEW.status='withdrawn' AND NOT EXISTS(SELECT 1 FROM mizan.review_submissions s WHERE s.output_version_id=OLD.id AND s.withdrawn_at IS NOT NULL AND length(trim(s.withdrawal_reason))>0) THEN RAISE EXCEPTION 'Withdrawal reason required' USING ERRCODE='23514'; END IF;
  IF NEW.status='rejected' AND NOT EXISTS(SELECT 1 FROM mizan.review_decisions d WHERE d.output_version_id=OLD.id AND d.decision IN ('reject','request_changes')) THEN RAISE EXCEPTION 'Review rejection decision required' USING ERRCODE='23514'; END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER documented_review_transition BEFORE UPDATE ON mizan.output_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_review_transition();
CREATE FUNCTION mizan.guard_review_submission_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Review history is immutable' USING ERRCODE='55000'; END IF;
 IF (to_jsonb(NEW)-ARRAY['withdrawn_at','withdrawal_reason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['withdrawn_at','withdrawal_reason']) OR OLD.withdrawn_at IS NOT NULL OR NEW.withdrawn_at IS NULL THEN RAISE EXCEPTION 'Only a documented withdrawal is allowed' USING ERRCODE='55000'; END IF;
 IF EXISTS(SELECT 1 FROM mizan.output_versions WHERE id=OLD.output_version_id AND status='approved_locked') THEN RAISE EXCEPTION 'Approved review cannot be withdrawn' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER submission_immutable BEFORE UPDATE OR DELETE ON mizan.review_submissions FOR EACH ROW EXECUTE FUNCTION mizan.guard_review_submission_update();
CREATE FUNCTION mizan.apply_withdrawal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN UPDATE mizan.output_versions SET status='withdrawn' WHERE id=NEW.output_version_id AND status='under_review'; RETURN NEW; END $$;
CREATE TRIGGER apply_withdrawal AFTER UPDATE ON mizan.review_submissions FOR EACH ROW EXECUTE FUNCTION mizan.apply_withdrawal();

CREATE FUNCTION mizan.guard_approval_financials() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o mizan.output_versions; r mizan.reconciliations;
BEGIN
 IF NEW.decision<>'approve' THEN RETURN NEW; END IF;
 SELECT * INTO STRICT o FROM mizan.output_versions WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.output_version_id) FOR UPDATE;
 IF o.output_type IN ('income_statement','financial_position') THEN
  IF NOT EXISTS(SELECT 1 FROM mizan.mapping_versions m WHERE (m.tenant_id,m.entity_id,m.id)=(o.tenant_id,o.entity_id,o.mapping_version_id) AND m.status='published') THEN RAISE EXCEPTION 'Published account mapping required' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM mizan.output_datasets x WHERE x.output_version_id=o.id AND x.source_role='primary') THEN RAISE EXCEPTION 'Primary reporting dataset required' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM mizan.output_datasets x JOIN mizan.trial_balance_rows t ON (t.tenant_id,t.entity_id,t.dataset_id)=(x.tenant_id,x.entity_id,x.dataset_id) WHERE x.output_version_id=o.id AND x.source_role='primary' GROUP BY t.dataset_id HAVING sum(t.closing_balance)<>0) THEN RAISE EXCEPTION 'Unbalanced source trial balance' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM mizan.output_datasets x JOIN mizan.trial_balance_rows t ON (t.tenant_id,t.entity_id,t.dataset_id)=(x.tenant_id,x.entity_id,x.dataset_id) WHERE x.output_version_id=o.id AND x.source_role='primary' AND NOT EXISTS(SELECT 1 FROM mizan.account_mappings a WHERE (a.tenant_id,a.entity_id,a.mapping_version_id,a.account_id)=(o.tenant_id,o.entity_id,o.mapping_version_id,t.account_id))) THEN RAISE EXCEPTION 'Unmapped account in reporting source' USING ERRCODE='23514'; END IF;
 END IF;
 IF o.output_type='reconciliation' THEN
  SELECT * INTO STRICT r FROM mizan.reconciliations WHERE output_version_id=o.id;
  IF r.cutoff_date NOT BETWEEN (SELECT start_date FROM mizan.accounting_periods WHERE id=o.period_id) AND (SELECT end_date FROM mizan.accounting_periods WHERE id=o.period_id) THEN RAISE EXCEPTION 'Cutoff outside accounting period' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM mizan.proposed_entries p JOIN mizan.proposed_entry_lines l ON (l.tenant_id,l.entity_id,l.proposed_entry_id)=(p.tenant_id,p.entity_id,p.id) WHERE p.reconciliation_id=r.id GROUP BY p.id HAVING sum(l.debit)<>sum(l.credit) OR count(DISTINCT l.currency_code)<>1) THEN RAISE EXCEPTION 'Unbalanced proposed entry' USING ERRCODE='23514'; END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER b_approval_financials BEFORE INSERT ON mizan.review_decisions FOR EACH ROW EXECUTE FUNCTION mizan.guard_approval_financials();

CREATE FUNCTION mizan.guard_same_parent_sources() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_batch uuid; source_dataset uuid;
BEGIN
 IF TG_TABLE_NAME IN ('ledger_entries','trial_balance_rows','bank_transactions','book_transactions','trade_items') THEN
  SELECT import_batch_id INTO source_batch FROM mizan.source_rows WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.source_row_id);
  IF NOT EXISTS(SELECT 1 FROM mizan.dataset_imports x WHERE (x.tenant_id,x.entity_id,x.dataset_id,x.import_batch_id)=(NEW.tenant_id,NEW.entity_id,NEW.dataset_id,source_batch)) THEN RAISE EXCEPTION 'Source row is not part of the dataset imports' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='source_rows' THEN NULL;
 END IF;RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['ledger_entries','trial_balance_rows','bank_transactions','book_transactions','trade_items'] LOOP
  EXECUTE format('CREATE TRIGGER source_belongs_to_dataset BEFORE INSERT OR UPDATE ON mizan.%I FOR EACH ROW EXECUTE FUNCTION mizan.guard_same_parent_sources()',t);
 END LOOP;
END $$;
CREATE FUNCTION mizan.guard_match_members() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb; s text;
BEGIN
 row_data=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 SELECT status INTO s FROM mizan.match_groups WHERE id=(row_data->>'match_group_id')::uuid FOR UPDATE;
 IF s='confirmed' THEN RAISE EXCEPTION 'Unmatch and reverse allocations before changing group members' USING ERRCODE='55000'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
CREATE TRIGGER match_members_fixed BEFORE INSERT OR UPDATE OR DELETE ON mizan.match_group_members FOR EACH ROW EXECUTE FUNCTION mizan.guard_match_members();
CREATE TRIGGER a_reconciliation_editable BEFORE INSERT ON mizan.match_decisions FOR EACH ROW EXECUTE FUNCTION mizan.guard_reconciliation_change();

CREATE FUNCTION mizan.guard_support_access_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM mizan.support_access_grants g WHERE (g.tenant_id,g.id)=(NEW.tenant_id,NEW.grant_id) AND g.support_user_id=NEW.actor_id AND g.valid_from<=now() AND g.expires_at>now() AND g.revoked_at IS NULL) THEN RAISE EXCEPTION 'Temporary support grant expired or missing' USING ERRCODE='42501'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER active_support_grant BEFORE INSERT ON mizan.support_access_events FOR EACH ROW EXECUTE FUNCTION mizan.guard_support_access_event();
ALTER TABLE mizan.source_files ADD CONSTRAINT clean_scan_evidence CHECK(scan_status<>'clean' OR (scanned_at IS NOT NULL AND scanner_version IS NOT NULL));
ALTER TABLE mizan.source_rows ADD CONSTRAINT original_json_object CHECK(jsonb_typeof(original_values)='object');
CREATE INDEX allocations_active_bank ON mizan.allocations(tenant_id,entity_id,bank_transaction_id) WHERE reversed_at IS NULL;
CREATE INDEX allocations_active_books ON mizan.allocations(tenant_id,entity_id,book_transaction_id) WHERE reversed_at IS NULL;
CREATE INDEX audit_events_search ON mizan.audit_events(tenant_id,entity_id,created_at DESC,action);
CREATE INDEX jobs_queue ON mizan.processing_jobs(status,lease_expires_at,created_at) WHERE status IN ('queued','running');
CREATE INDEX notifications_inbox ON mizan.notifications(tenant_id,recipient_id,created_at DESC) WHERE read_at IS NULL;

-- A correction rerun supersedes the prior quality result, without deleting its history.
ALTER TABLE mizan.quality_runs ALTER COLUMN created_at SET DEFAULT clock_timestamp();
CREATE OR REPLACE FUNCTION mizan.guard_import() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE latest_run uuid;
BEGIN
 IF TG_OP='DELETE' THEN IF OLD.status='published' THEN RAISE EXCEPTION 'Published import is immutable' USING ERRCODE='55000'; END IF;RETURN OLD;END IF;
 IF TG_OP='UPDATE' AND OLD.status='published' THEN RAISE EXCEPTION 'Published import is immutable' USING ERRCODE='55000';END IF;
 IF NEW.status='published' THEN
  SELECT id INTO latest_run FROM mizan.quality_runs WHERE (tenant_id,entity_id,import_batch_id)=(NEW.tenant_id,NEW.entity_id,NEW.id) ORDER BY created_at DESC,id DESC LIMIT 1;
  IF latest_run IS NULL OR NOT EXISTS(SELECT 1 FROM mizan.source_files f WHERE (f.tenant_id,f.entity_id,f.id)=(NEW.tenant_id,NEW.entity_id,NEW.source_file_id) AND f.scan_status='clean' AND f.deleted_at IS NULL)
  OR EXISTS(SELECT 1 FROM mizan.quality_issues i WHERE (i.tenant_id,i.entity_id,i.quality_run_id)=(NEW.tenant_id,NEW.entity_id,latest_run) AND i.severity='blocking') THEN RAISE EXCEPTION 'Clean source and successful latest quality review required' USING ERRCODE='23514';END IF;
 END IF;RETURN NEW;
END $$;
CREATE FUNCTION mizan.guard_bank_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.currency_code,NEW.ledger_account_id) IS DISTINCT FROM (OLD.currency_code,OLD.ledger_account_id) AND EXISTS(SELECT 1 FROM mizan.reconciliations r JOIN mizan.output_versions v ON v.id=r.output_version_id WHERE (r.tenant_id,r.entity_id,r.bank_account_id)=(OLD.tenant_id,OLD.entity_id,OLD.id) AND v.status='approved_locked') THEN RAISE EXCEPTION 'Bank configuration used by locked output cannot change' USING ERRCODE='55000';END IF;RETURN NEW;
END $$;
CREATE TRIGGER bank_settings_frozen BEFORE UPDATE ON mizan.bank_accounts FOR EACH ROW EXECUTE FUNCTION mizan.guard_bank_configuration();
