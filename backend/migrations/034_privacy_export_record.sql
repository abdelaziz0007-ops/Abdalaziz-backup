CREATE FUNCTION mizan_private.record_privacy_export(p_actor uuid,p_session uuid,p_tenant uuid,p_entity uuid,p_request uuid,p_digest text,p_audit uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved mizan.data_lifecycle_requests;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 PERFORM mizan_private.require_active_scope(p_tenant,p_entity);
 IF p_entity IS NULL OR NOT mizan.has_permission(p_tenant,p_entity,p_actor,'privacy.manage')
 OR NOT mizan.has_permission(p_tenant,p_entity,p_actor,'reports.view') OR NOT mizan.has_permission(p_tenant,p_entity,p_actor,'outputs.export') THEN
 RAISE EXCEPTION 'Entity privacy, view and export permissions required' USING ERRCODE='42501'; END IF;
 IF p_digest IS NULL OR p_digest !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid export digest' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT saved FROM mizan.data_lifecycle_requests WHERE tenant_id=p_tenant AND entity_id=p_entity AND id=p_request FOR UPDATE;
 IF saved.request_type<>'export' OR saved.status NOT IN ('authorized','partially_completed') OR saved.authorized_by IS NULL OR saved.authorized_by=saved.requested_by THEN
 RAISE EXCEPTION 'Independent authorization required before export' USING ERRCODE='42501'; END IF;
 IF NOT mizan.has_permission(p_tenant,p_entity,saved.authorized_by,'privacy.manage') THEN RAISE EXCEPTION 'Export authorization is no longer valid' USING ERRCODE='42501'; END IF;
 UPDATE mizan.data_lifecycle_requests SET status='partially_completed' WHERE id=saved.id;
 PERFORM mizan_private.append_audit(p_tenant,p_entity,p_actor,'privacy.structured_export','data_lifecycle_request',saved.id,
 'Generated partial structured financial export; originals and other providers remain outstanding',p_audit,jsonb_build_object('sha256',p_digest,'coverage','structured_financial_only'));
END $$;
REVOKE ALL ON FUNCTION mizan_private.record_privacy_export(uuid,uuid,uuid,uuid,uuid,text,uuid) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mizan_api_v1') THEN
 GRANT EXECUTE ON FUNCTION mizan_private.record_privacy_export(uuid,uuid,uuid,uuid,uuid,text,uuid) TO mizan_api_v1;
END IF; END $$;
