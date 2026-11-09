CREATE SCHEMA mizan_private;
REVOKE ALL ON SCHEMA mizan_private FROM PUBLIC;
CREATE TABLE mizan_private.audit_heads (
 tenant_id uuid PRIMARY KEY REFERENCES mizan.tenants(id),event_id uuid,event_hash text,sequence bigint NOT NULL DEFAULT 0
);

-- These small privileged functions bridge verified identity to scoped application access.
-- They are executable only by the backend service role provisioned separately.
CREATE FUNCTION mizan_private.sync_identity_session(p_subject text,p_session_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE native_user public.mizan_auth_users; native_session public.mizan_auth_sessions; u mizan.app_users; proof timestamptz; app_session uuid; hash text;
BEGIN
 SELECT * INTO STRICT native_session FROM public.mizan_auth_sessions WHERE id=p_session_id AND "userId"=p_subject AND "expiresAt">now();
 SELECT * INTO STRICT native_user FROM public.mizan_auth_users WHERE id=p_subject;
 hash=encode(sha256(convert_to(native_session.token,'UTF8')),'hex');
 SELECT verified_at INTO proof FROM public.mizan_auth_mfa_proofs WHERE session_token_hash=hash AND user_id=p_subject AND expires_at>now();
 IF NOT coalesce(native_user."twoFactorEnabled",false) THEN proof=NULL;END IF;
 INSERT INTO mizan.app_users(identity_provider,provider_subject,email,display_name,mfa_enabled,last_authenticated_at)
 VALUES('better-auth',native_user.id,native_user.email,native_user.name,coalesce(native_user."twoFactorEnabled",false),now())
 ON CONFLICT(identity_provider,provider_subject) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name,mfa_enabled=EXCLUDED.mfa_enabled
 RETURNING * INTO u;
 IF u.status<>'active' THEN RAISE EXCEPTION 'Identity access revoked' USING ERRCODE='42501';END IF;
 INSERT INTO mizan.user_sessions(user_id,provider_session_hash,authenticated_at,mfa_verified_at,expires_at)
 VALUES(u.id,hash,native_session."createdAt",proof,native_session."expiresAt")
 ON CONFLICT(provider_session_hash) DO UPDATE SET expires_at=EXCLUDED.expires_at,mfa_verified_at=EXCLUDED.mfa_verified_at
 RETURNING id INTO app_session;
 IF EXISTS(SELECT 1 FROM mizan.user_sessions WHERE id=app_session AND revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'Session revoked' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('id',u.id,'name',u.display_name,'email',u.email,'mfaEnabled',u.mfa_enabled,'mfaVerifiedAt',proof,'sessionId',app_session);
END $$;

CREATE FUNCTION mizan_private.workspaces_for_user(p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'region',t.data_region) ORDER BY t.created_at),'[]'::jsonb)
 FROM mizan.tenants t JOIN mizan.memberships m ON m.tenant_id=t.id JOIN mizan.app_users u ON u.id=m.user_id
 WHERE m.user_id=p_user AND m.status='active' AND u.status='active' AND t.status='active';
$$;
CREATE FUNCTION mizan_private.workspace_context(p_user uuid,p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member uuid; entities jsonb;
BEGIN
 SELECT m.id INTO member FROM mizan.memberships m JOIN mizan.app_users u ON u.id=m.user_id JOIN mizan.tenants t ON t.id=m.tenant_id
 WHERE m.user_id=p_user AND m.tenant_id=p_tenant AND m.status='active' AND u.status='active' AND t.status='active';
 IF member IS NULL THEN RETURN NULL;END IF;
 SELECT coalesce(jsonb_agg(e.id),'[]'::jsonb) INTO entities FROM mizan.legal_entities e WHERE e.tenant_id=p_tenant AND e.status='active' AND (
 EXISTS(SELECT 1 FROM mizan.access_grants g WHERE g.tenant_id=p_tenant AND g.membership_id=member AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now()) AND (g.entity_id IS NULL OR g.entity_id=e.id) AND g.permission_code IN ('entities.manage','members.manage','reports.view','imports.manage','outputs.prepare','outputs.approve'))
 OR EXISTS(SELECT 1 FROM mizan.membership_roles r JOIN mizan.role_permissions rp ON rp.role_code=r.role_code WHERE r.tenant_id=p_tenant AND r.membership_id=member AND r.revoked_at IS NULL AND (r.entity_id IS NULL OR r.entity_id=e.id) AND rp.permission_code IN ('entities.manage','members.manage','reports.view','imports.manage','outputs.prepare','outputs.approve')));
 RETURN jsonb_build_object('membershipId',member,'entityIds',entities);
END $$;

CREATE FUNCTION mizan_private.append_audit(p_tenant uuid,p_entity uuid,p_actor uuid,p_action text,p_object_type text,p_object uuid,p_reason text,p_request uuid,p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE head mizan_private.audit_heads; eid uuid; hash text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM mizan.memberships WHERE tenant_id=p_tenant AND user_id=p_actor AND status='active') THEN RAISE EXCEPTION 'Membership required for audit event' USING ERRCODE='42501';END IF;
 IF p_entity IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mizan.legal_entities WHERE tenant_id=p_tenant AND id=p_entity) THEN RAISE EXCEPTION 'Audit entity scope mismatch' USING ERRCODE='42501';END IF;
 INSERT INTO mizan_private.audit_heads(tenant_id) VALUES(p_tenant) ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT head FROM mizan_private.audit_heads WHERE tenant_id=p_tenant FOR UPDATE;
 eid=gen_random_uuid();
 hash=encode(sha256(convert_to(jsonb_build_array(head.event_hash,head.sequence+1,eid,p_actor,p_action,p_object_type,p_object,p_reason,p_request,p_metadata)::text,'UTF8')),'hex');
 INSERT INTO mizan.audit_events(id,tenant_id,entity_id,actor_id,action,object_type,object_id,reason,request_id,event_hash,previous_event_hash,redacted_metadata,created_at)
 VALUES(eid,p_tenant,p_entity,p_actor,p_action,p_object_type,p_object,p_reason,p_request,hash,head.event_hash,p_metadata,clock_timestamp());
 UPDATE mizan_private.audit_heads SET event_id=eid,event_hash=hash,sequence=sequence+1 WHERE tenant_id=p_tenant;
 RETURN eid;
END $$;

CREATE FUNCTION mizan_private.create_workspace(p_user uuid,p_session uuid,p_name text,p_region text,p_administration_consent boolean,p_request uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE tenant uuid; member uuid; code text;
BEGIN
 IF length(trim(p_name)) NOT BETWEEN 2 AND 200 OR length(trim(p_region)) NOT BETWEEN 2 AND 100 OR NOT p_administration_consent THEN RAISE EXCEPTION 'Explicit administration consent required' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM mizan.user_sessions s JOIN mizan.app_users u ON u.id=s.user_id WHERE s.id=p_session AND s.user_id=p_user AND s.revoked_at IS NULL AND s.expires_at>now() AND s.mfa_verified_at>now()-interval '15 minutes' AND u.mfa_enabled AND u.status='active') THEN RAISE EXCEPTION 'Recent MFA required' USING ERRCODE='42501';END IF;
 INSERT INTO mizan.tenants(name,data_region,owner_user_id) VALUES(trim(p_name),p_region,p_user) RETURNING id INTO tenant;
 INSERT INTO mizan.memberships(tenant_id,user_id,status,joined_at) VALUES(tenant,p_user,'active',now()) RETURNING id INTO member;
 INSERT INTO mizan.membership_roles(tenant_id,membership_id,role_code,granted_by) VALUES(tenant,member,'subscription_owner',p_user);
 FOREACH code IN ARRAY ARRAY['entities.manage','members.manage'] LOOP
  INSERT INTO mizan.access_grants(tenant_id,membership_id,permission_code,granted_by) VALUES(tenant,member,code,p_user);
 END LOOP;
 PERFORM mizan_private.append_audit(tenant,NULL,p_user,'workspace.created','tenant',tenant,'Explicit owner and entity-administration enrollment',p_request,jsonb_build_object('administrationConsent',true));
 RETURN tenant;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA mizan_private FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mizan_private FROM PUBLIC;
