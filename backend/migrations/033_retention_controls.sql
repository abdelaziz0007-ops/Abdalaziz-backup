-- Privacy governance. A review date is not an automatic hold expiry.
CREATE FUNCTION mizan_private.retention_controls(p_actor uuid,p_session uuid,p_tenant uuid,p_entity uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 PERFORM mizan_private.require_active_scope(p_tenant,p_entity);
 IF NOT mizan.has_permission(p_tenant,p_entity,p_actor,'privacy.manage') THEN RAISE EXCEPTION 'Privacy permission required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
 'holds',coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC) FROM (
 SELECT id,entity_id,reason,authority,authorized_by,review_due_at,released_at,release_reason,created_at
 FROM mizan.legal_holds WHERE tenant_id=p_tenant AND (p_entity IS NULL OR entity_id IS NULL OR entity_id=p_entity)
 ORDER BY created_at DESC LIMIT 200) h),'[]'::jsonb),
 'policies',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policy_code) FROM (
 SELECT DISTINCT ON (policy_code) id,policy_code,version,category,retention_days,trigger_event,legal_basis,approved_by,approved_at
 FROM mizan.retention_policy_versions WHERE tenant_id=p_tenant ORDER BY policy_code,version DESC) p),'[]'::jsonb));
END $$;

CREATE FUNCTION mizan_private.retention_action(p_actor uuid,p_session uuid,p_tenant uuid,p_entity uuid,p_id uuid,p_action text,p_data jsonb,p_key uuid,p_audit uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE h mizan.legal_holds; policy mizan.retention_policy_versions; response jsonb; digest text; reason text; due timestamptz; next_version integer;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 PERFORM mizan_private.require_active_scope(p_tenant,p_entity);
 IF NOT mizan.has_permission(p_tenant,p_entity,p_actor,'privacy.manage') THEN RAISE EXCEPTION 'Privacy permission required' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('hold','release','policy') OR p_key IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid retention action' USING ERRCODE='23514'; END IF;
 reason=trim(p_data->>'reason');
 IF coalesce(length(reason),0) NOT BETWEEN 8 AND 500 THEN RAISE EXCEPTION 'An audit reason is required' USING ERRCODE='23514'; END IF;
 -- Shared tenant lock serializes hold creation/release against lifecycle execution transitions.
 PERFORM 1 FROM mizan.tenants WHERE id=p_tenant FOR UPDATE;
 digest=encode(sha256(convert_to(jsonb_build_array('retention',p_entity,p_id,p_action,p_data)::text,'UTF8')),'hex');
 response=mizan_private.operation_previous(p_tenant,p_actor,p_key,digest);
 IF response IS NOT NULL THEN RETURN response; END IF;
 IF p_action='policy' THEN
  IF p_entity IS NOT NULL OR p_id IS NOT NULL OR NOT mizan.has_permission(p_tenant,NULL,p_actor,'privacy.manage') THEN RAISE EXCEPTION 'Workspace privacy permission required for policies' USING ERRCODE='42501'; END IF;
  IF coalesce(p_data->>'code','') !~ '^[a-z][a-z0-9_-]{2,39}$' OR coalesce(p_data->>'category','') NOT IN ('originals','derivatives','indexes','providers','audit')
   OR coalesce(p_data->>'triggerEvent','') NOT IN ('created_at','service_terminated')
   OR coalesce(length(trim(p_data->>'legalBasis')),0) NOT BETWEEN 8 AND 1000
   OR coalesce(p_data->>'retentionDays','') !~ '^[0-9]{1,6}$' OR (p_data->>'retentionDays')::integer>36500 THEN
   RAISE EXCEPTION 'Invalid explicit retention policy' USING ERRCODE='23514'; END IF;
  SELECT coalesce(max(version),0)+1 INTO next_version FROM mizan.retention_policy_versions WHERE tenant_id=p_tenant AND policy_code=p_data->>'code';
  INSERT INTO mizan.retention_policy_versions(tenant_id,policy_code,version,category,retention_days,trigger_event,approved_by,approved_at,legal_basis)
  VALUES(p_tenant,p_data->>'code',next_version,p_data->>'category',(p_data->>'retentionDays')::integer,p_data->>'triggerEvent',p_actor,clock_timestamp(),trim(p_data->>'legalBasis')) RETURNING * INTO policy;
  response=jsonb_build_object('id',policy.id,'version',policy.version,'reused',false);
 ELSIF p_action='hold' THEN
  IF p_id IS NOT NULL OR coalesce(length(trim(p_data->>'authority')),0) NOT BETWEEN 4 AND 500 OR p_data->>'reviewDueAt' IS NULL THEN RAISE EXCEPTION 'Invalid hold details' USING ERRCODE='23514'; END IF;
  due=(p_data->>'reviewDueAt')::timestamptz;
  IF NOT isfinite(due) OR due<=clock_timestamp() OR due>clock_timestamp()+interval '5 years' THEN RAISE EXCEPTION 'Invalid hold review date' USING ERRCODE='23514'; END IF;
  INSERT INTO mizan.legal_holds(tenant_id,entity_id,scope_definition,reason,authority,authorized_by,review_due_at)
  VALUES(p_tenant,p_entity,jsonb_build_object('scope',CASE WHEN p_entity IS NULL THEN 'workspace' ELSE 'entity' END,'entityId',p_entity),reason,trim(p_data->>'authority'),p_actor,due) RETURNING * INTO h;
  response=jsonb_build_object('id',h.id,'reused',false);
 ELSE
  SELECT * INTO STRICT h FROM mizan.legal_holds WHERE tenant_id=p_tenant AND entity_id IS NOT DISTINCT FROM p_entity AND id=p_id FOR UPDATE;
  IF h.released_at IS NOT NULL THEN RAISE EXCEPTION 'Hold already released' USING ERRCODE='40001'; END IF;
  IF h.authorized_by=p_actor THEN RAISE EXCEPTION 'Independent privacy administrator must release this hold' USING ERRCODE='42501'; END IF;
  UPDATE mizan.legal_holds SET released_at=clock_timestamp(),release_reason=reason WHERE id=h.id;
  response=jsonb_build_object('id',h.id,'reused',false);
 END IF;
 PERFORM mizan_private.append_audit(p_tenant,p_entity,p_actor,'privacy.'||p_action,CASE WHEN p_action='policy' THEN 'retention_policy' ELSE 'legal_hold' END,(response->>'id')::uuid,reason,p_audit,jsonb_build_object('action',p_action));
 INSERT INTO mizan_private.operation_requests(tenant_id,request_key,actor_id,request_hash,response) VALUES(p_tenant,p_key,p_actor,digest,response);
 RETURN response;
END $$;

CREATE FUNCTION mizan_private.guard_held_lifecycle() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.request_type IN ('delete','terminate') AND NEW.status IN ('running','partially_completed','completed') THEN
  PERFORM 1 FROM mizan.tenants WHERE id=NEW.tenant_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM mizan.legal_holds h WHERE h.tenant_id=NEW.tenant_id AND h.released_at IS NULL AND (NEW.entity_id IS NULL OR h.entity_id IS NULL OR h.entity_id=NEW.entity_id)) THEN
   RAISE EXCEPTION 'Active legal hold blocks deletion execution' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER held_lifecycle BEFORE INSERT OR UPDATE OF status ON mizan.data_lifecycle_requests FOR EACH ROW EXECUTE FUNCTION mizan_private.guard_held_lifecycle();
REVOKE ALL ON FUNCTION mizan_private.retention_controls(uuid,uuid,uuid,uuid),mizan_private.retention_action(uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid,uuid),mizan_private.guard_held_lifecycle() FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mizan_api_v1') THEN
 GRANT EXECUTE ON FUNCTION mizan_private.retention_controls(uuid,uuid,uuid,uuid),mizan_private.retention_action(uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid,uuid) TO mizan_api_v1;
 END IF;
END $$;
