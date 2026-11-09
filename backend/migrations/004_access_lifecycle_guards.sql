-- Provider approvals keep their original contract but must support explicit revocation.
DROP TRIGGER append_only ON mizan.provider_approvals;
CREATE FUNCTION mizan.guard_provider_approval_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Provider approval history is immutable' USING ERRCODE='55000';END IF;
 IF (to_jsonb(NEW)-'revoked_at') IS DISTINCT FROM (to_jsonb(OLD)-'revoked_at') OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN RAISE EXCEPTION 'Only explicit one-way provider revocation is allowed' USING ERRCODE='55000';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER provider_approval_revision BEFORE UPDATE OR DELETE ON mizan.provider_approvals FOR EACH ROW EXECUTE FUNCTION mizan.guard_provider_approval_revision();

CREATE FUNCTION mizan.can_approve_output(p_tenant uuid,p_entity uuid,p_user uuid,p_output uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT mizan.has_permission(p_tenant,p_entity,p_user,'outputs.approve',(
  SELECT bank_account_id FROM mizan.reconciliations WHERE tenant_id=p_tenant AND entity_id=p_entity AND output_version_id=p_output
 ));
$$;
-- Preserve the audited review functions, changing only the permission lookup to include bank scope.
DO $$ DECLARE body text; anchor text; BEGIN
 anchor='mizan.has_permission(NEW.tenant_id,NEW.entity_id,NEW.reviewer_id,''outputs.approve'')';
 SELECT pg_get_functiondef('mizan.submit_review()'::regprocedure) INTO body;
 IF position(anchor IN body)=0 THEN RAISE EXCEPTION 'Review permission function changed unexpectedly';END IF;
 EXECUTE replace(body,anchor,'mizan.can_approve_output(NEW.tenant_id,NEW.entity_id,NEW.reviewer_id,NEW.output_version_id)');
 anchor='mizan.has_permission(NEW.tenant_id,NEW.entity_id,NEW.actor_id,''outputs.approve'')';
 SELECT pg_get_functiondef('mizan.review_decision_guard()'::regprocedure) INTO body;
 IF position(anchor IN body)=0 THEN RAISE EXCEPTION 'Decision permission function changed unexpectedly';END IF;
 EXECUTE replace(body,anchor,'mizan.can_approve_output(NEW.tenant_id,NEW.entity_id,NEW.actor_id,NEW.output_version_id)');
END $$;
CREATE FUNCTION mizan.guard_supervisor_override() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.reference_conflict AND NEW.status='confirmed' AND NOT mizan.has_permission(NEW.tenant_id,NEW.entity_id,NEW.supervisor_override_by,'matches.override',NEW.bank_account_id) THEN RAISE EXCEPTION 'Explicit supervisor override permission required' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER supervisor_override_permission BEFORE INSERT OR UPDATE ON mizan.match_groups FOR EACH ROW EXECUTE FUNCTION mizan.guard_supervisor_override();
ALTER TABLE mizan.match_groups ADD CONSTRAINT meaningful_match_decision CHECK(status IN ('suggested','ambiguous') OR length(trim(decision_reason))>0);
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mizan FROM PUBLIC;
