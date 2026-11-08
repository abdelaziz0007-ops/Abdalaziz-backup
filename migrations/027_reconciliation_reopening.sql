CREATE FUNCTION mizan.guard_reconciliation_reopening() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE target mizan.output_versions; previous mizan.output_versions; sources mizan.reconciliations; actor uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.entity_id::text,42));
 SELECT * INTO STRICT target FROM mizan.output_versions
 WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.output_version_id);
 SELECT v.* INTO previous FROM mizan.output_versions v JOIN mizan.reconciliations r
 ON (r.tenant_id,r.entity_id,r.output_version_id)=(v.tenant_id,v.entity_id,v.id)
 WHERE (v.tenant_id,v.entity_id,v.period_id,r.bank_account_id)=(NEW.tenant_id,NEW.entity_id,target.period_id,NEW.bank_account_id)
   AND v.status='approved_locked' ORDER BY v.version DESC,v.id DESC LIMIT 1;
 IF NOT FOUND THEN
  IF target.predecessor_id IS NOT NULL THEN RAISE EXCEPTION 'Approved reconciliation predecessor required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF target.predecessor_id IS DISTINCT FROM previous.id OR target.logical_output_id<>previous.logical_output_id
  OR target.settings_version_id<>previous.settings_version_id OR target.currency_code<>previous.currency_code
  OR target.status<>'draft' OR coalesce(length(trim(target.reopen_reason)),0) NOT BETWEEN 8 AND 500 THEN
  RAISE EXCEPTION 'Explicit reopening of the latest approved reconciliation is required' USING ERRCODE='23514';
 END IF;
 actor=nullif(current_setting('mizan.user_id',true),'')::uuid;
 IF actor IS NULL OR actor<>target.preparer_id OR NOT mizan.has_permission(NEW.tenant_id,NEW.entity_id,actor,'outputs.reopen',NEW.bank_account_id)
  OR NOT mizan.has_permission(NEW.tenant_id,NEW.entity_id,actor,'outputs.prepare',NEW.bank_account_id)
  OR NOT mizan.has_permission(NEW.tenant_id,NEW.entity_id,actor,'reports.view',NEW.bank_account_id) THEN
  RAISE EXCEPTION 'Bank reconciliation reopening authority required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO STRICT sources FROM mizan.reconciliations
 WHERE (tenant_id,entity_id,output_version_id)=(NEW.tenant_id,NEW.entity_id,previous.id);
 IF NEW.bank_dataset_id=sources.bank_dataset_id OR NEW.book_dataset_id=sources.book_dataset_id
  OR NOT NEW.bank_complete OR NOT NEW.book_complete OR NEW.cutoff_date<>sources.cutoff_date THEN
  RAISE EXCEPTION 'Reopening requires replacement published sources for both sides and the original cutoff' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM mizan.output_versions v WHERE (v.tenant_id,v.entity_id,v.predecessor_id)=(NEW.tenant_id,NEW.entity_id,previous.id)
  AND v.id<>target.id AND v.status IN ('draft','ready_for_review','under_review','withdrawn')) THEN
  RAISE EXCEPTION 'A replacement for this approved reconciliation already exists' USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reconciliation_reopening BEFORE INSERT ON mizan.reconciliations
 FOR EACH ROW EXECUTE FUNCTION mizan.guard_reconciliation_reopening();

CREATE FUNCTION mizan.guard_reconciliation_review_lineage() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE current_rec record; latest uuid;
BEGIN
 IF TG_TABLE_NAME='review_decisions' AND to_jsonb(NEW)->>'decision'<>'approve' THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.entity_id::text,42));
 SELECT v.predecessor_id,v.period_id,r.bank_account_id INTO current_rec
 FROM mizan.output_versions v JOIN mizan.reconciliations r
 ON (r.tenant_id,r.entity_id,r.output_version_id)=(v.tenant_id,v.entity_id,v.id)
 WHERE (v.tenant_id,v.entity_id,v.id)=(NEW.tenant_id,NEW.entity_id,NEW.output_version_id);
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT v.id INTO latest FROM mizan.output_versions v JOIN mizan.reconciliations r
 ON (r.tenant_id,r.entity_id,r.output_version_id)=(v.tenant_id,v.entity_id,v.id)
 WHERE (v.tenant_id,v.entity_id,v.period_id,r.bank_account_id)=(NEW.tenant_id,NEW.entity_id,current_rec.period_id,current_rec.bank_account_id)
   AND v.status='approved_locked' ORDER BY v.version DESC,v.id DESC LIMIT 1;
 IF current_rec.predecessor_id IS DISTINCT FROM latest THEN
  RAISE EXCEPTION 'This draft does not replace the latest approved reconciliation' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reconciliation_submission_lineage BEFORE INSERT ON mizan.review_submissions
 FOR EACH ROW EXECUTE FUNCTION mizan.guard_reconciliation_review_lineage();
CREATE TRIGGER reconciliation_approval_lineage BEFORE INSERT ON mizan.review_decisions
 FOR EACH ROW EXECUTE FUNCTION mizan.guard_reconciliation_review_lineage();
