ALTER TABLE mizan.data_lifecycle_requests ADD COLUMN decision_reason text, ADD COLUMN decided_at timestamptz;

CREATE FUNCTION mizan_private.change_lifecycle_request(
 p_actor uuid,p_session uuid,p_tenant uuid,p_entity uuid,p_id uuid,p_action text,p_reason text,p_key uuid,p_audit uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved mizan.data_lifecycle_requests; request_hash text; response jsonb; event text;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 PERFORM mizan_private.require_active_scope(p_tenant,p_entity);
 IF NOT mizan.has_permission(p_tenant,p_entity,p_actor,'privacy.manage') THEN
  RAISE EXCEPTION 'Data lifecycle permission is required' USING ERRCODE='42501';
 END IF;
 IF p_action IS NULL OR p_action NOT IN ('export','delete','authorize','reject')
  OR coalesce(length(trim(p_reason)),0) NOT BETWEEN 8 AND 500 OR p_key IS NULL
  OR (p_action IN ('authorize','reject'))<>(p_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Invalid data lifecycle request' USING ERRCODE='23514';
 END IF;
 request_hash=encode(sha256(convert_to(jsonb_build_array('data.lifecycle',p_entity,p_id,p_action,trim(p_reason))::text,'UTF8')),'hex');
 response=mizan_private.operation_previous(p_tenant,p_actor,p_key,request_hash);
 IF response IS NOT NULL THEN RETURN response; END IF;
 IF p_id IS NULL THEN
  INSERT INTO mizan.data_lifecycle_requests(tenant_id,entity_id,request_type,requested_by,reauth_session_id,idempotency_key,scope_definition,reason)
  VALUES(p_tenant,p_entity,p_action,p_actor,p_session,p_key::text,
    jsonb_build_object('entityId',p_entity,'scope',CASE WHEN p_entity IS NULL THEN 'workspace' ELSE 'entity' END,
      'coverage',jsonb_build_array('originals','derivatives','indexes','providers')),trim(p_reason))
  RETURNING * INTO saved;
  event='privacy.requested';
 ELSE
  SELECT * INTO STRICT saved FROM mizan.data_lifecycle_requests
  WHERE tenant_id=p_tenant AND entity_id IS NOT DISTINCT FROM p_entity AND id=p_id FOR UPDATE;
  IF saved.status<>'requested' THEN
   RAISE EXCEPTION 'This request already has a decision' USING ERRCODE='40001';
  END IF;
  IF saved.requested_by=p_actor THEN
   RAISE EXCEPTION 'A second authorized administrator must decide the request' USING ERRCODE='42501';
  END IF;
  IF p_action='authorize' THEN
   UPDATE mizan.data_lifecycle_requests SET status='authorized',authorized_by=p_actor,reauth_session_id=p_session,
    authority_verified_at=clock_timestamp(),decision_reason=trim(p_reason),decided_at=clock_timestamp() WHERE id=p_id RETURNING * INTO saved;
   event='privacy.authorized';
  ELSE
   UPDATE mizan.data_lifecycle_requests SET status='rejected',decision_reason=trim(p_reason),decided_at=clock_timestamp() WHERE id=p_id RETURNING * INTO saved;
   event='privacy.rejected';
  END IF;
 END IF;
 response=jsonb_build_object('id',saved.id,'status',saved.status,'request_type',saved.request_type,'reused',false);
 INSERT INTO mizan_private.operation_requests(tenant_id,request_key,actor_id,request_hash,response)
 VALUES(p_tenant,p_key,p_actor,request_hash,response);
 PERFORM mizan_private.append_audit(p_tenant,p_entity,p_actor,event,'data_lifecycle_request',saved.id,
  'Recorded scoped data lifecycle action',p_audit,jsonb_build_object('requestType',saved.request_type,'status',saved.status));
 RETURN response;
END $$;

REVOKE ALL ON FUNCTION mizan_private.change_lifecycle_request(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mizan_api_v1') THEN
  GRANT SELECT ON mizan.data_lifecycle_requests TO mizan_api_v1;
  GRANT EXECUTE ON FUNCTION mizan_private.change_lifecycle_request(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid) TO mizan_api_v1;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION mizan_private.workspace_context(p_user uuid,p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member uuid; entities jsonb;
BEGIN
 SELECT m.id INTO member FROM mizan.memberships m JOIN mizan.app_users u ON u.id=m.user_id JOIN mizan.tenants t ON t.id=m.tenant_id
 WHERE m.user_id=p_user AND m.tenant_id=p_tenant AND m.status='active' AND u.status='active' AND t.status='active';
 IF member IS NULL THEN RETURN NULL;END IF;
 SELECT coalesce(jsonb_agg(e.id),'[]'::jsonb) INTO entities FROM mizan.legal_entities e WHERE e.tenant_id=p_tenant AND e.status='active' AND (
 EXISTS(SELECT 1 FROM mizan.access_grants g WHERE g.tenant_id=p_tenant AND g.membership_id=member AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now()) AND (g.entity_id IS NULL OR g.entity_id=e.id) AND g.permission_code IN ('entities.manage','members.manage','reports.view','imports.manage','outputs.prepare','outputs.approve','privacy.manage'))
 OR EXISTS(SELECT 1 FROM mizan.membership_roles r JOIN mizan.role_permissions rp ON rp.role_code=r.role_code WHERE r.tenant_id=p_tenant AND r.membership_id=member AND r.revoked_at IS NULL AND (r.entity_id IS NULL OR r.entity_id=e.id) AND rp.permission_code IN ('entities.manage','members.manage','reports.view','imports.manage','outputs.prepare','outputs.approve','privacy.manage')));
 RETURN jsonb_build_object('membershipId',member,'entityIds',entities);
END $$;
