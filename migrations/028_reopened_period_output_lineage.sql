CREATE FUNCTION mizan.latest_approved_output(p_tenant uuid,p_entity uuid,p_period uuid,p_type text,p_bank uuid)
RETURNS uuid LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT v.id FROM mizan.accounting_periods target
 JOIN mizan.accounting_periods p ON (p.tenant_id,p.entity_id,p.logical_period_id)=(target.tenant_id,target.entity_id,target.logical_period_id)
 JOIN mizan.output_versions v ON (v.tenant_id,v.entity_id,v.period_id)=(p.tenant_id,p.entity_id,p.id)
 LEFT JOIN mizan.reconciliations r ON (r.tenant_id,r.entity_id,r.output_version_id)=(v.tenant_id,v.entity_id,v.id)
 WHERE (target.tenant_id,target.entity_id,target.id)=(p_tenant,p_entity,p_period)
   AND p.version<=target.version AND v.output_type=p_type AND v.status='approved_locked'
   AND (p_type<>'reconciliation' OR r.bank_account_id=p_bank)
 ORDER BY p.version DESC,v.version DESC,v.id DESC LIMIT 1
$$;


CREATE OR REPLACE FUNCTION mizan.guard_financial_reopening() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE approved mizan.output_versions; actor uuid;
BEGIN
 IF NEW.output_type NOT IN ('income_statement','financial_position','analysis') THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.entity_id::text,42));
 SELECT * INTO approved FROM mizan.output_versions
 WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,mizan.latest_approved_output(NEW.tenant_id,NEW.entity_id,NEW.period_id,NEW.output_type,NULL));
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF NEW.predecessor_id IS DISTINCT FROM approved.id OR NEW.logical_output_id<>approved.logical_output_id
    OR NEW.settings_version_id<>approved.settings_version_id OR NEW.currency_code<>approved.currency_code
    OR coalesce(length(trim(NEW.reopen_reason)),0) NOT BETWEEN 8 AND 500 OR NEW.status<>'draft' THEN
  RAISE EXCEPTION 'An explicit reopening of the latest approved version is required' USING ERRCODE='23514';
 END IF;
 actor=nullif(current_setting('mizan.user_id',true),'')::uuid;
 IF actor IS NULL OR actor<>NEW.preparer_id OR NOT mizan.has_permission(NEW.tenant_id,NEW.entity_id,actor,'outputs.reopen')
    OR NOT mizan.has_permission(NEW.tenant_id,NEW.entity_id,actor,'outputs.prepare')
    OR NOT mizan.has_permission(NEW.tenant_id,NEW.entity_id,actor,'reports.view') THEN
  RAISE EXCEPTION 'Report reopening authority required' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM mizan.output_versions
   WHERE (tenant_id,entity_id,predecessor_id,period_id)=(NEW.tenant_id,NEW.entity_id,approved.id,NEW.period_id)
     AND status IN ('draft','ready_for_review','under_review','withdrawn')) THEN
  RAISE EXCEPTION 'A replacement for this approved version already exists' USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION mizan.guard_financial_review_lineage() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE target mizan.output_versions; latest uuid;
BEGIN
 IF TG_TABLE_NAME='review_decisions' AND to_jsonb(NEW)->>'decision'<>'approve' THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.entity_id::text,42));
 SELECT * INTO STRICT target FROM mizan.output_versions
 WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.output_version_id);
 IF target.output_type NOT IN ('income_statement','financial_position','analysis') THEN RETURN NEW; END IF;
 latest=mizan.latest_approved_output(target.tenant_id,target.entity_id,target.period_id,target.output_type,NULL);
 IF target.predecessor_id IS DISTINCT FROM latest THEN
  RAISE EXCEPTION 'This draft does not replace the latest approved report' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION mizan.guard_reconciliation_reopening() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE target mizan.output_versions; previous mizan.output_versions; sources mizan.reconciliations; actor uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.entity_id::text,42));
 SELECT * INTO STRICT target FROM mizan.output_versions
 WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.output_version_id);
 SELECT * INTO previous FROM mizan.output_versions WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,
   mizan.latest_approved_output(NEW.tenant_id,NEW.entity_id,target.period_id,'reconciliation',NEW.bank_account_id));
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
 IF EXISTS(SELECT 1 FROM mizan.output_versions v WHERE (v.tenant_id,v.entity_id,v.predecessor_id,v.period_id)=(NEW.tenant_id,NEW.entity_id,previous.id,target.period_id)
  AND v.id<>target.id AND v.status IN ('draft','ready_for_review','under_review','withdrawn')) THEN
  RAISE EXCEPTION 'A replacement for this approved reconciliation already exists' USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION mizan.guard_reconciliation_review_lineage() RETURNS trigger
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
 latest=mizan.latest_approved_output(NEW.tenant_id,NEW.entity_id,current_rec.period_id,'reconciliation',current_rec.bank_account_id);
 IF current_rec.predecessor_id IS DISTINCT FROM latest THEN
  RAISE EXCEPTION 'This draft does not replace the latest approved reconciliation' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
