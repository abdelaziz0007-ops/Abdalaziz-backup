CREATE FUNCTION mizan_private.check_reconciliation(p_tenant uuid,p_entity uuid,p_reconciliation uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r mizan.reconciliations; p mizan.accounting_periods;
 bank_total numeric; book_total numeric; bank_adjustment numeric; book_adjustment numeric;
 bank_unexplained bigint; book_unexplained bigint;
BEGIN
 SELECT * INTO STRICT r FROM mizan.reconciliations
 WHERE (tenant_id,entity_id,id)=(p_tenant,p_entity,p_reconciliation);
 SELECT a.* INTO STRICT p FROM mizan.output_versions o JOIN mizan.accounting_periods a
   ON (a.tenant_id,a.entity_id,a.id)=(o.tenant_id,o.entity_id,o.period_id)
 WHERE (o.tenant_id,o.entity_id,o.id)=(p_tenant,p_entity,r.output_version_id);

 IF p.status<>'open' OR r.cutoff_date<>p.end_date OR NOT r.bank_complete OR NOT r.book_complete OR
  (SELECT count(*) FROM mizan.published_bank_balances b JOIN mizan.dataset_versions d
     ON (d.tenant_id,d.entity_id,d.id)=(b.tenant_id,b.entity_id,b.id)
   JOIN mizan.output_datasets x ON (x.tenant_id,x.entity_id,x.dataset_id)=(d.tenant_id,d.entity_id,d.id)
   WHERE (d.tenant_id,d.entity_id,d.period_id)=(p_tenant,p_entity,p.id)
     AND x.output_version_id=r.output_version_id AND d.status='published' AND d.complete_dataset
     AND (b.bank_account_id,b.currency_code)=(r.bank_account_id,r.currency_code)
     AND ((x.source_role='bank' AND d.data_type='bank_statement' AND d.id=r.bank_dataset_id
          AND (b.opening_balance,b.closing_balance,b.sign_policy)=(r.bank_opening_balance,r.bank_closing_balance,r.bank_sign_policy))
       OR (x.source_role='books' AND d.data_type='bank_ledger' AND d.id=r.book_dataset_id
          AND (b.opening_balance,b.closing_balance,b.sign_policy)=(r.book_opening_balance,r.book_closing_balance,r.book_sign_policy))))<>2 THEN
  RAISE EXCEPTION 'Two complete published sources with matching balances and cutoff are required' USING ERRCODE='23514';
 END IF;
 IF (SELECT count(*) FROM mizan.dataset_imports x
     JOIN mizan.import_batches i ON (i.tenant_id,i.entity_id,i.id)=(x.tenant_id,x.entity_id,x.import_batch_id)
     JOIN mizan.source_files f ON (f.tenant_id,f.entity_id,f.id)=(i.tenant_id,i.entity_id,i.source_file_id)
     JOIN mizan.processing_jobs j ON (j.tenant_id,j.entity_id,j.id)=(f.tenant_id,f.entity_id,f.scan_job_id)
     WHERE (x.tenant_id,x.entity_id)=(p_tenant,p_entity) AND x.dataset_id IN (r.bank_dataset_id,r.book_dataset_id)
       AND i.status='published' AND f.deleted_at IS NULL AND f.scan_status='clean' AND f.scanned_at IS NOT NULL
       AND j.job_type='file_scan' AND j.status='succeeded' AND j.input_references->>'sourceId'=f.id::text)<>2 THEN
  RAISE EXCEPTION 'Current successful scans are required for both sources' USING ERRCODE='23514';
 END IF;

 WITH movements AS (
  SELECT 'bank' AS side,id,source_row_id,signed_amount FROM mizan.bank_transactions
  WHERE (tenant_id,entity_id,dataset_id,bank_account_id,currency_code)=(p_tenant,p_entity,r.bank_dataset_id,r.bank_account_id,r.currency_code)
    AND posting_date BETWEEN p.start_date AND r.cutoff_date
  UNION ALL
  SELECT 'books',id,source_row_id,signed_amount FROM mizan.book_transactions
  WHERE (tenant_id,entity_id,dataset_id,bank_account_id,currency_code)=(p_tenant,p_entity,r.book_dataset_id,r.bank_account_id,r.currency_code)
    AND posting_date BETWEEN p.start_date AND r.cutoff_date
 ), current_allocations AS (
  SELECT a.bank_transaction_id,a.book_transaction_id,a.amount FROM mizan.allocations a
  JOIN mizan.match_groups g ON (g.tenant_id,g.entity_id,g.id)=(a.tenant_id,a.entity_id,a.match_group_id)
  WHERE (g.tenant_id,g.entity_id,g.reconciliation_id)=(p_tenant,p_entity,r.id)
    AND g.status='confirmed' AND a.reversed_at IS NULL
 ), matched AS (
  SELECT 'bank' AS side,bank_transaction_id AS movement_id,sum(amount) AS amount FROM current_allocations GROUP BY bank_transaction_id
  UNION ALL
  SELECT 'books',book_transaction_id,sum(amount) FROM current_allocations GROUP BY book_transaction_id
 ), classified AS (
  SELECT CASE WHEN x.status='cleared' THEN x.clearance_source_row_id ELSE i.source_row_id END AS source_row_id,
    sum(abs(i.signed_amount)) AS amount
  FROM mizan.reconciliation_items x JOIN mizan.reconciling_items i
    ON (i.tenant_id,i.entity_id,i.id)=(x.tenant_id,x.entity_id,x.item_id)
  WHERE (x.tenant_id,x.entity_id,x.reconciliation_id)=(p_tenant,p_entity,r.id)
    AND (x.status='cleared' OR (x.status='outstanding' AND i.effect_side<>'none'))
  GROUP BY 1
 )
 SELECT coalesce(sum(m.signed_amount) FILTER(WHERE m.side='bank'),0),
        coalesce(sum(m.signed_amount) FILTER(WHERE m.side='books'),0),
        count(*) FILTER(WHERE m.side='bank' AND abs(m.signed_amount)<>coalesce(a.amount,0)+coalesce(c.amount,0)),
        count(*) FILTER(WHERE m.side='books' AND abs(m.signed_amount)<>coalesce(a.amount,0)+coalesce(c.amount,0))
 INTO bank_total,book_total,bank_unexplained,book_unexplained
 FROM movements m LEFT JOIN matched a ON (a.side,a.movement_id)=(m.side,m.id)
 LEFT JOIN classified c ON c.source_row_id=m.source_row_id;

 IF r.bank_opening_balance+bank_total<>r.bank_closing_balance OR r.book_opening_balance+book_total<>r.book_closing_balance THEN
  RAISE EXCEPTION 'Source balances do not roll forward to cutoff' USING ERRCODE='23514';
 END IF;
 IF bank_unexplained<>0 OR book_unexplained<>0 THEN
  RAISE EXCEPTION 'Movement coverage is incomplete or exceeds source capacity (bank %, books %)',bank_unexplained,book_unexplained USING ERRCODE='23514';
 END IF;
 SELECT coalesce(sum(i.signed_amount) FILTER(WHERE i.effect_side='bank'),0),
        coalesce(sum(i.signed_amount) FILTER(WHERE i.effect_side='books'),0)
 INTO bank_adjustment,book_adjustment
 FROM mizan.reconciliation_items x JOIN mizan.reconciling_items i
   ON (i.tenant_id,i.entity_id,i.id)=(x.tenant_id,x.entity_id,x.item_id)
 WHERE (x.tenant_id,x.entity_id,x.reconciliation_id)=(p_tenant,p_entity,r.id) AND x.status='outstanding';
 IF r.bank_closing_balance+bank_adjustment<>r.book_closing_balance+book_adjustment THEN
  RAISE EXCEPTION 'Adjusted bank and book balances differ' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM mizan.reconciliation_items x
   WHERE (x.tenant_id,x.entity_id,x.reconciliation_id)=(p_tenant,p_entity,r.id)
     AND x.status='outstanding' AND NOT EXISTS(
       SELECT 1 FROM mizan.attachments a JOIN mizan.source_files f
       ON (f.tenant_id,f.entity_id,f.id)=(a.tenant_id,a.entity_id,a.source_file_id)
       WHERE (a.tenant_id,a.entity_id,a.item_id)=(x.tenant_id,x.entity_id,x.item_id)
         AND f.scan_status='clean' AND f.deleted_at IS NULL)) THEN
  RAISE EXCEPTION 'Outstanding differences require current clean evidence' USING ERRCODE='23514';
 END IF;
 RETURN jsonb_build_object('adjustedBank',(r.bank_closing_balance+bank_adjustment)::text,
   'adjustedBooks',(r.book_closing_balance+book_adjustment)::text,'bankUnexplained',bank_unexplained,'bookUnexplained',book_unexplained);
END $$;

REVOKE ALL ON FUNCTION mizan_private.check_reconciliation(uuid,uuid,uuid) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mizan_api_v1') THEN
  GRANT EXECUTE ON FUNCTION mizan_private.check_reconciliation(uuid,uuid,uuid) TO mizan_api_v1;
 END IF;
END $$;

CREATE FUNCTION mizan.guard_reconciliation_review() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog AS $$
DECLARE r uuid; fingerprint text;
BEGIN
 IF TG_TABLE_NAME='review_decisions' AND to_jsonb(NEW)->>'decision'<>'approve' THEN RETURN NEW; END IF;
 SELECT id INTO r FROM mizan.reconciliations
 WHERE (tenant_id,entity_id,output_version_id)=(NEW.tenant_id,NEW.entity_id,NEW.output_version_id);
 IF r IS NULL THEN RETURN NEW; END IF;
 SELECT content_fingerprint INTO STRICT fingerprint FROM mizan.output_versions
 WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.output_version_id) FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM mizan.validation_results
   WHERE (tenant_id,entity_id,output_version_id)=(NEW.tenant_id,NEW.entity_id,NEW.output_version_id)
     AND validated_fingerprint=fingerprint AND code='residual' AND passed) THEN
  RAISE EXCEPTION 'Validate this version of the reconciliation before review' USING ERRCODE='23514';
 END IF;
 PERFORM mizan_private.check_reconciliation(NEW.tenant_id,NEW.entity_id,r);
 RETURN NEW;
END $$;

CREATE TRIGGER reconciliation_ready_for_submission BEFORE INSERT ON mizan.review_submissions
 FOR EACH ROW EXECUTE FUNCTION mizan.guard_reconciliation_review();
CREATE TRIGGER reconciliation_current_at_approval BEFORE INSERT ON mizan.review_decisions
 FOR EACH ROW EXECUTE FUNCTION mizan.guard_reconciliation_review();
