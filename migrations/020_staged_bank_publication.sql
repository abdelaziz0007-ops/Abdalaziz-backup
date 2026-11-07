CREATE TABLE mizan.published_bank_balances (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 entity_id uuid NOT NULL,
 bank_account_id uuid NOT NULL,
 currency_code text NOT NULL,
 opening_balance mizan.exact_amount NOT NULL,
 closing_balance mizan.exact_amount NOT NULL,
 sign_policy text NOT NULL CHECK(sign_policy='cash_increase_positive'),
 FOREIGN KEY(tenant_id,entity_id,id,currency_code) REFERENCES mizan.dataset_versions(tenant_id,entity_id,id,currency_code),
 FOREIGN KEY(tenant_id,entity_id,bank_account_id,currency_code) REFERENCES mizan.bank_accounts(tenant_id,entity_id,id,currency_code)
);
CREATE INDEX published_bank_balances_account ON mizan.published_bank_balances(tenant_id,entity_id,bank_account_id);
ALTER TABLE mizan.published_bank_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE mizan.published_bank_balances FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped_bank_balances ON mizan.published_bank_balances
 USING (tenant_id::text=current_setting('mizan.tenant_id',true)
   AND entity_id::text=ANY(string_to_array(current_setting('mizan.entity_ids',true),',')))
 WITH CHECK (tenant_id::text=current_setting('mizan.tenant_id',true)
   AND entity_id::text=ANY(string_to_array(current_setting('mizan.entity_ids',true),',')));
CREATE TRIGGER bank_balances_draft_only BEFORE INSERT ON mizan.published_bank_balances
 FOR EACH ROW EXECUTE FUNCTION mizan.guard_dataset_child('id');
CREATE TRIGGER bank_balances_append_only BEFORE UPDATE OR DELETE ON mizan.published_bank_balances
 FOR EACH ROW EXECUTE FUNCTION mizan.reject_mutation();

CREATE FUNCTION mizan.guard_staged_bank_balance() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE balances mizan.published_bank_balances; p mizan.accounting_periods; precision integer;
DECLARE movement_count bigint; calculated numeric; incorrect boolean;
BEGIN
 IF NEW.status<>'published' OR NEW.data_type NOT IN ('bank_statement','bank_ledger') OR NOT EXISTS(
  SELECT 1 FROM mizan.dataset_imports x JOIN mizan.import_batches b
  ON (b.tenant_id,b.entity_id,b.id)=(x.tenant_id,x.entity_id,x.import_batch_id)
  WHERE (x.tenant_id,x.entity_id,x.dataset_id)=(NEW.tenant_id,NEW.entity_id,NEW.id)
  AND b.parser_version='staged-tabular-v1'
 ) THEN RETURN NEW; END IF;
 SELECT * INTO STRICT balances FROM mizan.published_bank_balances
 WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.id);
 SELECT * INTO STRICT p FROM mizan.accounting_periods
 WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.period_id);
 SELECT minor_units INTO STRICT precision FROM mizan.currencies WHERE code=NEW.currency_code;
 IF balances.opening_balance<>trunc(balances.opening_balance,precision)
  OR balances.closing_balance<>trunc(balances.closing_balance,precision) THEN
  RAISE EXCEPTION 'Bank balance precision must match the currency' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM mizan.bank_accounts a
  WHERE (a.tenant_id,a.entity_id,a.id)=(NEW.tenant_id,NEW.entity_id,balances.bank_account_id)
    AND a.active FOR SHARE)
  OR NOT mizan.has_permission(NEW.tenant_id,NEW.entity_id,NEW.published_by,'imports.manage',balances.bank_account_id) THEN
  RAISE EXCEPTION 'Active bank account and import authority required' USING ERRCODE='42501';
 END IF;
 IF EXISTS(
  SELECT 1 FROM mizan.published_bank_balances b JOIN mizan.dataset_versions d ON d.id=b.id
  JOIN mizan.accounting_periods other ON other.id=d.period_id
  WHERE (b.tenant_id,b.entity_id,b.bank_account_id)=(NEW.tenant_id,NEW.entity_id,balances.bank_account_id)
    AND d.status='published' AND d.data_type=NEW.data_type AND other.logical_period_id<>p.logical_period_id
    AND other.start_date<=p.end_date AND p.start_date<=other.end_date
 ) THEN RAISE EXCEPTION 'Overlapping published bank period' USING ERRCODE='23514'; END IF;
 WITH movements AS (
  SELECT t.source_row_id,t.bank_account_id,t.posting_date,t.signed_amount,t.running_balance
  FROM mizan.bank_transactions t
  WHERE (t.tenant_id,t.entity_id,t.dataset_id)=(NEW.tenant_id,NEW.entity_id,NEW.id) AND NEW.data_type='bank_statement'
  UNION ALL
  SELECT t.source_row_id,t.bank_account_id,t.posting_date,t.signed_amount,t.running_balance
  FROM mizan.book_transactions t
  WHERE (t.tenant_id,t.entity_id,t.dataset_id)=(NEW.tenant_id,NEW.entity_id,NEW.id) AND NEW.data_type='bank_ledger'
 ), ordered AS (
  SELECT m.*,balances.opening_balance+sum(m.signed_amount) OVER(ORDER BY r.row_number) AS expected_running,
    lag(m.posting_date) OVER(ORDER BY r.row_number) AS previous_date
  FROM movements m JOIN mizan.source_rows r
   ON (r.tenant_id,r.entity_id,r.id)=(NEW.tenant_id,NEW.entity_id,m.source_row_id)
 )
 SELECT count(*),balances.opening_balance+coalesce(sum(signed_amount),0),
   coalesce(bool_or(bank_account_id<>balances.bank_account_id OR posting_date NOT BETWEEN p.start_date AND p.end_date
    OR posting_date<previous_date OR running_balance IS NOT NULL AND running_balance<>expected_running),false)
 INTO movement_count,calculated,incorrect FROM ordered;
 IF movement_count NOT BETWEEN 1 AND 1000 OR calculated<>balances.closing_balance OR incorrect THEN
  RAISE EXCEPTION 'Bank rows must reconcile to opening, running and closing balances' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER staged_bank_balance_before_publish BEFORE UPDATE OF status ON mizan.dataset_versions
 FOR EACH ROW EXECUTE FUNCTION mizan.guard_staged_bank_balance();

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mizan_api_v1') THEN
  GRANT SELECT,INSERT ON mizan.published_bank_balances TO mizan_api_v1;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION mizan_private.publish_staged_dataset(
 p_actor uuid,p_session uuid,p_tenant uuid,p_entity uuid,p_batch uuid,p_dataset uuid,p_quality uuid,p_basis text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b mizan.import_batches; d mizan.dataset_versions; q mizan.quality_runs; typed_count bigint; source_count bigint;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 PERFORM mizan_private.require_active_scope(p_tenant,p_entity);
 IF NOT mizan.has_permission(p_tenant,p_entity,p_actor,'imports.manage') THEN
  RAISE EXCEPTION 'Import authority required' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_entity::text,42));
 SELECT * INTO STRICT b FROM mizan.import_batches
 WHERE (tenant_id,entity_id,id)=(p_tenant,p_entity,p_batch) FOR UPDATE;
 SELECT * INTO STRICT d FROM mizan.dataset_versions
 WHERE (tenant_id,entity_id,id)=(p_tenant,p_entity,p_dataset) FOR UPDATE;
 IF b.parser_version<>'staged-tabular-v1' OR b.status<>'needs_review' OR d.status<>'draft'
    OR b.period_id<>d.period_id OR b.data_type<>d.data_type
    OR b.data_type NOT IN ('trial_balance','general_ledger','bank_statement','bank_ledger')
    OR (b.data_type IN ('trial_balance','bank_statement','bank_ledger') AND p_basis IS DISTINCT FROM 'period')
    OR (b.data_type='general_ledger' AND p_basis IS DISTINCT FROM 'not_applicable') THEN
  RAISE EXCEPTION 'Invalid staged publication' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM mizan.accounting_periods p JOIN mizan.entity_settings_versions s
   ON (s.tenant_id,s.entity_id,s.id)=(p.tenant_id,p.entity_id,p.settings_version_id)
   WHERE (p.tenant_id,p.entity_id,p.id)=(p_tenant,p_entity,b.period_id)
     AND p.status='open' AND s.currency_code=d.currency_code FOR UPDATE OF p) THEN
  RAISE EXCEPTION 'An open accounting period with matching currency is required' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM mizan.source_files f JOIN mizan.processing_jobs j
   ON (j.tenant_id,j.entity_id,j.id)=(f.tenant_id,f.entity_id,f.scan_job_id)
   WHERE (f.tenant_id,f.entity_id,f.id)=(p_tenant,p_entity,b.source_file_id) AND f.deleted_at IS NULL
     AND f.scan_status='clean' AND f.scanned_at IS NOT NULL AND j.job_type='file_scan'
     AND j.status='succeeded' AND j.input_references->>'sourceId'=f.id::text FOR SHARE OF f,j) THEN
  RAISE EXCEPTION 'Successful source scan required' USING ERRCODE='23514';
 END IF;
 SELECT * INTO STRICT q FROM mizan.quality_runs WHERE (tenant_id,entity_id,import_batch_id)=(p_tenant,p_entity,p_batch)
 ORDER BY created_at DESC,id DESC LIMIT 1;
 IF q.id IS DISTINCT FROM p_quality OR q.records_read=0 OR q.accepted<>q.records_read OR q.rejected<>0 OR q.excluded<>0
   OR q.content_fingerprint<>d.content_fingerprint
   OR EXISTS(SELECT 1 FROM mizan.quality_issues i
    WHERE (i.tenant_id,i.entity_id,i.quality_run_id)=(p_tenant,p_entity,q.id) AND i.severity='blocking') THEN
  RAISE EXCEPTION 'Complete latest validation required' USING ERRCODE='23514';
 END IF;
 IF (SELECT count(*) FROM mizan.dataset_imports x WHERE (x.tenant_id,x.entity_id,x.dataset_id)=(p_tenant,p_entity,p_dataset))<>1
    OR NOT EXISTS(SELECT 1 FROM mizan.dataset_imports x
     WHERE (x.tenant_id,x.entity_id,x.dataset_id,x.import_batch_id)=(p_tenant,p_entity,p_dataset,p_batch)) THEN
  RAISE EXCEPTION 'Dataset requires exactly this import' USING ERRCODE='23514';
 END IF;
 IF b.data_type='trial_balance' THEN
  SELECT count(*),count(DISTINCT source_row_id) INTO typed_count,source_count FROM mizan.trial_balance_rows
  WHERE (tenant_id,entity_id,dataset_id)=(p_tenant,p_entity,p_dataset);
 ELSIF b.data_type='bank_statement' THEN
  SELECT count(*),count(DISTINCT source_row_id) INTO typed_count,source_count FROM mizan.bank_transactions
  WHERE (tenant_id,entity_id,dataset_id)=(p_tenant,p_entity,p_dataset);
 ELSIF b.data_type='bank_ledger' THEN
  SELECT count(*),count(DISTINCT source_row_id) INTO typed_count,source_count FROM mizan.book_transactions
  WHERE (tenant_id,entity_id,dataset_id)=(p_tenant,p_entity,p_dataset);
 ELSE
  SELECT count(*),count(DISTINCT source_row_id) INTO typed_count,source_count FROM mizan.ledger_entries
  WHERE (tenant_id,entity_id,dataset_id)=(p_tenant,p_entity,p_dataset);
 END IF;
 IF typed_count<>source_count OR typed_count<>q.records_read OR typed_count<>(SELECT count(*) FROM mizan.source_rows
   WHERE (tenant_id,entity_id,import_batch_id)=(p_tenant,p_entity,p_batch)) THEN
  RAISE EXCEPTION 'Typed dataset must cover every source row' USING ERRCODE='23514';
 END IF;
 UPDATE mizan.import_batches SET status='published', complete_dataset=true, balance_basis=p_basis,
  published_at=clock_timestamp(), published_by=p_actor WHERE id=b.id;
 UPDATE mizan.dataset_versions SET status='published', complete_dataset=true,
  published_at=clock_timestamp(), published_by=p_actor WHERE id=d.id;
END $$;
