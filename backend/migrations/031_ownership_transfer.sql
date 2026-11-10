CREATE TABLE mizan_private.ownership_transfers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES mizan.tenants(id),
 from_user uuid NOT NULL REFERENCES mizan.app_users(id),to_user uuid NOT NULL REFERENCES mizan.app_users(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','cancelled','expired')),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 8 AND 500),created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',decided_at timestamptz,
 CHECK(from_user<>to_user),CHECK(expires_at>created_at)
);
CREATE UNIQUE INDEX one_pending_ownership_transfer ON mizan_private.ownership_transfers(tenant_id) WHERE status='pending';
REVOKE ALL ON mizan_private.ownership_transfers FROM PUBLIC;

CREATE FUNCTION mizan_private.ownership_status(p_actor uuid,p_session uuid,p_tenant uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner uuid; pending jsonb;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);PERFORM mizan_private.require_active_scope(p_tenant,NULL);
 IF mizan_private.workspace_context(p_actor,p_tenant) IS NULL THEN RAISE EXCEPTION 'Membership required' USING ERRCODE='42501'; END IF;
 SELECT owner_user_id INTO owner FROM mizan.tenants WHERE id=p_tenant;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'fromUser',t.from_user,'toUser',t.to_user,'recipientEmail',u.email,'status',CASE WHEN t.status='pending' AND t.expires_at<=clock_timestamp() THEN 'expired' ELSE t.status END,'expiresAt',t.expires_at,'reason',t.reason) ORDER BY t.created_at DESC),'[]'::jsonb) INTO pending
 FROM mizan_private.ownership_transfers t JOIN mizan.app_users u ON u.id=t.to_user WHERE t.tenant_id=p_tenant AND (t.from_user=p_actor OR t.to_user=p_actor) AND t.created_at>now()-interval '90 days';
 RETURN jsonb_build_object('isOwner',owner=p_actor,'transfers',pending);
END $$;

CREATE FUNCTION mizan_private.ownership_action(p_actor uuid,p_session uuid,p_tenant uuid,p_id uuid,p_action text,p_email text,p_reason text,p_consent boolean,p_key uuid,p_audit uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE transfer mizan_private.ownership_transfers; owner uuid; recipient uuid; member uuid; response jsonb; request_hash text;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);PERFORM mizan_private.require_active_scope(p_tenant,NULL);
 IF mizan_private.workspace_context(p_actor,p_tenant) IS NULL THEN RAISE EXCEPTION 'Membership required' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('propose','accept','cancel') OR p_key IS NULL OR coalesce(length(trim(p_reason)),0) NOT BETWEEN 8 AND 500 THEN RAISE EXCEPTION 'Invalid ownership request' USING ERRCODE='23514'; END IF;
 request_hash=encode(sha256(convert_to(jsonb_build_array('ownership',p_id,p_action,p_email,p_reason,p_consent)::text,'UTF8')),'hex');
 response=mizan_private.operation_previous(p_tenant,p_actor,p_key,request_hash);IF response IS NOT NULL THEN RETURN response; END IF;
 SELECT owner_user_id INTO owner FROM mizan.tenants WHERE id=p_tenant FOR UPDATE;
 IF p_action='propose' THEN
  IF owner<>p_actor OR p_id IS NOT NULL THEN RAISE EXCEPTION 'Only the owner can propose transfer' USING ERRCODE='42501'; END IF;
  SELECT u.id INTO recipient FROM mizan.app_users u JOIN mizan.memberships m ON m.user_id=u.id WHERE m.tenant_id=p_tenant AND m.status='active' AND u.status='active' AND u.mfa_enabled AND lower(u.email)=lower(trim(p_email)) AND u.id<>p_actor;
  IF recipient IS NULL THEN RAISE EXCEPTION 'Recipient unavailable' USING ERRCODE='P0002'; END IF;
  UPDATE mizan_private.ownership_transfers SET status='expired',decided_at=clock_timestamp() WHERE tenant_id=p_tenant AND status='pending' AND expires_at<=clock_timestamp();
  IF EXISTS(SELECT 1 FROM mizan_private.ownership_transfers WHERE tenant_id=p_tenant AND status='pending') THEN RAISE EXCEPTION 'A pending transfer already exists' USING ERRCODE='40001'; END IF;
  INSERT INTO mizan_private.ownership_transfers(tenant_id,from_user,to_user,reason) VALUES(p_tenant,p_actor,recipient,trim(p_reason)) RETURNING * INTO transfer;
 ELSE
  SELECT * INTO STRICT transfer FROM mizan_private.ownership_transfers WHERE tenant_id=p_tenant AND id=p_id FOR UPDATE;
  IF transfer.status<>'pending' OR transfer.expires_at<=clock_timestamp() OR owner<>transfer.from_user THEN RAISE EXCEPTION 'Transfer is no longer available' USING ERRCODE='40001'; END IF;
  IF p_action='cancel' THEN
   IF p_actor NOT IN (transfer.from_user,transfer.to_user) THEN RAISE EXCEPTION 'Transfer participant required' USING ERRCODE='42501'; END IF;
   UPDATE mizan_private.ownership_transfers SET status='cancelled',decided_at=clock_timestamp() WHERE id=p_id RETURNING * INTO transfer;
  ELSE
   IF p_actor<>transfer.to_user OR p_consent IS DISTINCT FROM true THEN RAISE EXCEPTION 'Recipient consent is required' USING ERRCODE='42501'; END IF;
   SELECT id INTO STRICT member FROM mizan.memberships WHERE tenant_id=p_tenant AND user_id=p_actor AND status='active' FOR UPDATE;
   -- Ownership itself does not grant access to financial content. Administrative grants are explicit at acceptance.
   INSERT INTO mizan.access_grants(tenant_id,membership_id,permission_code,granted_by)
   SELECT p_tenant,member,permission,p_actor FROM unnest(ARRAY['entities.manage','members.manage']) permission
   WHERE NOT mizan.has_permission(p_tenant,NULL,p_actor,permission);
   UPDATE mizan.tenants SET owner_user_id=p_actor WHERE id=p_tenant;
   UPDATE mizan_private.ownership_transfers SET status='accepted',decided_at=clock_timestamp() WHERE id=p_id RETURNING * INTO transfer;
  END IF;
 END IF;
 response=jsonb_build_object('id',transfer.id,'status',transfer.status,'reused',false);
 INSERT INTO mizan_private.operation_requests(tenant_id,request_key,actor_id,request_hash,response) VALUES(p_tenant,p_key,p_actor,request_hash,response);
 PERFORM mizan_private.append_audit(p_tenant,NULL,p_actor,'ownership.'||p_action,'ownership_transfer',transfer.id,trim(p_reason),p_audit,jsonb_build_object('fromUser',transfer.from_user,'toUser',transfer.to_user,'existingMembershipPermissionsRetained',true));
 RETURN response;
END $$;
REVOKE ALL ON FUNCTION mizan_private.ownership_status(uuid,uuid,uuid),mizan_private.ownership_action(uuid,uuid,uuid,uuid,text,text,text,boolean,uuid,uuid) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mizan_api_v1') THEN
 GRANT EXECUTE ON FUNCTION mizan_private.ownership_status(uuid,uuid,uuid),mizan_private.ownership_action(uuid,uuid,uuid,uuid,text,text,text,boolean,uuid,uuid) TO mizan_api_v1;
END IF; END $$;
