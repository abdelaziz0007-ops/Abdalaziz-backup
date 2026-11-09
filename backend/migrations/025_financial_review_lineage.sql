CREATE FUNCTION mizan.guard_financial_review_lineage() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE target mizan.output_versions; latest uuid;
BEGIN
 IF TG_TABLE_NAME='review_decisions' AND to_jsonb(NEW)->>'decision'<>'approve' THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.entity_id::text,42));
 SELECT * INTO STRICT target FROM mizan.output_versions
 WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.output_version_id);
 IF target.output_type NOT IN ('income_statement','financial_position','analysis') THEN RETURN NEW; END IF;
 SELECT id INTO latest FROM mizan.output_versions
 WHERE (tenant_id,entity_id,period_id,output_type)=(target.tenant_id,target.entity_id,target.period_id,target.output_type)
   AND status='approved_locked' ORDER BY version DESC,created_at DESC,id DESC LIMIT 1;
 IF target.predecessor_id IS DISTINCT FROM latest THEN
  RAISE EXCEPTION 'This draft does not replace the latest approved report' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER financial_submission_lineage BEFORE INSERT ON mizan.review_submissions
 FOR EACH ROW EXECUTE FUNCTION mizan.guard_financial_review_lineage();
CREATE TRIGGER financial_approval_lineage BEFORE INSERT ON mizan.review_decisions
 FOR EACH ROW EXECUTE FUNCTION mizan.guard_financial_review_lineage();
