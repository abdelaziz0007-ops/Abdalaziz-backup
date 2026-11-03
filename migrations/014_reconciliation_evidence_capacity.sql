-- Forward-only guards: evidence must be currently usable, not merely have once passed.
CREATE FUNCTION mizan.guard_current_approval_sources() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.decision<>'approve' THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM mizan.output_datasets x
   JOIN mizan.dataset_imports d ON (d.tenant_id,d.entity_id,d.dataset_id)=(x.tenant_id,x.entity_id,x.dataset_id)
   JOIN mizan.import_batches b ON (b.tenant_id,b.entity_id,b.id)=(d.tenant_id,d.entity_id,d.import_batch_id)
   JOIN mizan.source_files f ON (f.tenant_id,f.entity_id,f.id)=(b.tenant_id,b.entity_id,b.source_file_id)
   WHERE (x.tenant_id,x.entity_id,x.output_version_id)=(NEW.tenant_id,NEW.entity_id,NEW.output_version_id)
   AND (f.scan_status<>'clean' OR f.deleted_at IS NOT NULL)) THEN
   RAISE EXCEPTION 'Current clean undeleted source files required' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM mizan.reconciliations r JOIN mizan.reconciliation_items x
   ON (x.tenant_id,x.entity_id,x.reconciliation_id)=(r.tenant_id,r.entity_id,r.id)
   WHERE (r.tenant_id,r.entity_id,r.output_version_id)=(NEW.tenant_id,NEW.entity_id,NEW.output_version_id)
   AND x.status='outstanding' AND NOT EXISTS(SELECT 1 FROM mizan.attachments a JOIN mizan.source_files f
    ON (f.tenant_id,f.entity_id,f.id)=(a.tenant_id,a.entity_id,a.source_file_id)
    WHERE (a.tenant_id,a.entity_id,a.item_id)=(x.tenant_id,x.entity_id,x.item_id)
    AND f.scan_status='clean' AND f.deleted_at IS NULL)) THEN
   RAISE EXCEPTION 'Current clean undeleted difference evidence required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aa_current_approval_sources BEFORE INSERT ON mizan.review_decisions
 FOR EACH ROW EXECUTE FUNCTION mizan.guard_current_approval_sources();

CREATE FUNCTION mizan.guard_classified_allocation_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rec uuid; source uuid; total numeric; used numeric; classified numeric; txn uuid; side text;
BEGIN
 IF TG_OP='UPDATE' THEN RETURN NEW; END IF;
 SELECT reconciliation_id INTO STRICT rec FROM mizan.match_groups WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.match_group_id);
 FOREACH side IN ARRAY ARRAY['bank','books'] LOOP
  txn=CASE side WHEN 'bank' THEN NEW.bank_transaction_id ELSE NEW.book_transaction_id END;
  IF side='bank' THEN
   SELECT source_row_id,abs(signed_amount) INTO STRICT source,total FROM mizan.bank_transactions WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,txn) FOR UPDATE;
   SELECT coalesce(sum(amount),0) INTO used FROM mizan.allocations WHERE (tenant_id,entity_id,bank_transaction_id)=(NEW.tenant_id,NEW.entity_id,txn) AND reversed_at IS NULL;
  ELSE
   SELECT source_row_id,abs(signed_amount) INTO STRICT source,total FROM mizan.book_transactions WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,txn) FOR UPDATE;
   SELECT coalesce(sum(amount),0) INTO used FROM mizan.allocations WHERE (tenant_id,entity_id,book_transaction_id)=(NEW.tenant_id,NEW.entity_id,txn) AND reversed_at IS NULL;
  END IF;
  SELECT coalesce(sum(abs(i.signed_amount)),0) INTO classified FROM mizan.reconciliation_items x JOIN mizan.reconciling_items i
   ON (i.tenant_id,i.entity_id,i.id)=(x.tenant_id,x.entity_id,x.item_id)
   WHERE (x.tenant_id,x.entity_id,x.reconciliation_id)=(NEW.tenant_id,NEW.entity_id,rec) AND x.status='outstanding' AND i.source_row_id=source;
  IF used+classified+NEW.amount>total THEN RAISE EXCEPTION 'Classified movement capacity cannot also be allocated' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER z_classified_allocation_capacity BEFORE INSERT ON mizan.allocations
 FOR EACH ROW EXECUTE FUNCTION mizan.guard_classified_allocation_capacity();
