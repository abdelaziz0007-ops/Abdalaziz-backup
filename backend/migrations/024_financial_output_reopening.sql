CREATE FUNCTION mizan.guard_financial_reopening() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE approved mizan.output_versions; actor uuid;
BEGIN
 IF NEW.output_type NOT IN ('income_statement','financial_position','analysis') THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.entity_id::text,42));
 SELECT * INTO approved FROM mizan.output_versions
 WHERE (tenant_id,entity_id,period_id,output_type)=(NEW.tenant_id,NEW.entity_id,NEW.period_id,NEW.output_type)
   AND status='approved_locked' ORDER BY version DESC,created_at DESC,id DESC LIMIT 1;
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
   WHERE (tenant_id,entity_id,predecessor_id)=(NEW.tenant_id,NEW.entity_id,approved.id)
     AND status IN ('draft','ready_for_review','under_review','withdrawn')) THEN
  RAISE EXCEPTION 'A replacement for this approved version already exists' USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER financial_output_reopening BEFORE INSERT ON mizan.output_versions
 FOR EACH ROW EXECUTE FUNCTION mizan.guard_financial_reopening();
