-- The existing invitation guard forbids acceptance timestamps after transaction
-- now(). Keep its contract, while the service separately checks actual expiry.
DO $$ DECLARE definition text; anchor text; BEGIN
 anchor='SET accepted_at=clock_timestamp(),accepted_by=p_actor';
 SELECT pg_get_functiondef('mizan_private.accept_invitation(uuid,uuid,text,uuid)'::regprocedure) INTO definition;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Invitation acceptance definition changed unexpectedly';END IF;
 EXECUTE replace(definition,anchor,'SET accepted_at=now(),accepted_by=p_actor');
 anchor='UPDATE mizan.memberships SET status=''revoked''';
 SELECT pg_get_functiondef('mizan_private.revoke_membership(uuid,uuid,uuid,uuid,text,uuid,uuid)'::regprocedure) INTO definition;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Membership revocation definition changed unexpectedly';END IF;
 EXECUTE replace(definition,anchor,'IF member.status<>''active'' THEN RAISE EXCEPTION ''Membership already inactive'' USING ERRCODE=''23514'';END IF; UPDATE mizan.memberships SET status=''revoked''');
END $$;
CREATE FUNCTION mizan_private.revoke_invitation(p_actor uuid,p_session uuid,p_tenant uuid,p_invite uuid,p_reason text,p_key uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE invite mizan.invitations; g mizan.invitation_grants; fingerprint text; previous jsonb; response jsonb; n integer;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 IF length(trim(p_reason))<8 THEN RAISE EXCEPTION 'A revocation reason is required' USING ERRCODE='23514';END IF;
 SELECT * INTO STRICT invite FROM mizan.invitations WHERE tenant_id=p_tenant AND id=p_invite FOR UPDATE;
 SELECT count(*) INTO n FROM mizan.invitation_grants WHERE tenant_id=p_tenant AND invitation_id=p_invite;
 IF n=0 OR NOT EXISTS(SELECT 1 FROM mizan.memberships WHERE tenant_id=p_tenant AND user_id=p_actor AND status='active') THEN RAISE EXCEPTION 'Invitation scope unavailable' USING ERRCODE='42501';END IF;
 FOR g IN SELECT * FROM mizan.invitation_grants WHERE tenant_id=p_tenant AND invitation_id=p_invite LOOP
  IF NOT mizan.has_permission(p_tenant,g.entity_id,p_actor,'members.manage',g.bank_account_id) THEN RAISE EXCEPTION 'Full invitation scope administration required' USING ERRCODE='42501';END IF;
 END LOOP;
 fingerprint=encode(sha256(convert_to(jsonb_build_array('revoke_invite',p_invite,trim(p_reason))::text,'UTF8')),'hex');previous=mizan_private.operation_previous(p_tenant,p_actor,p_key,fingerprint);IF previous IS NOT NULL THEN RETURN previous;END IF;
 IF invite.accepted_at IS NOT NULL OR invite.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Invitation already consumed or revoked' USING ERRCODE='23514';END IF;
 UPDATE mizan.invitations SET revoked_at=clock_timestamp() WHERE id=invite.id;
 response=jsonb_build_object('id',invite.id,'status','revoked','reused',false);
 INSERT INTO mizan_private.operation_requests(tenant_id,request_key,actor_id,request_hash,response) VALUES(p_tenant,p_key,p_actor,fingerprint,response);
 PERFORM mizan_private.append_audit(p_tenant,NULL,p_actor,'invitation.revoked','invitation',invite.id,trim(p_reason),p_request,'{}'::jsonb);RETURN response;
END $$;
CREATE FUNCTION mizan_private.revoke_scoped_access(p_actor uuid,p_session uuid,p_tenant uuid,p_kind text,p_target uuid,p_reason text,p_key uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g mizan.access_grants; r mizan.membership_roles; member uuid; entity uuid; bank uuid; subject uuid; revoked timestamptz; fingerprint text; previous jsonb; response jsonb; remaining jsonb;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 IF p_kind NOT IN ('grant','role') OR length(trim(p_reason))<8 THEN RAISE EXCEPTION 'Invalid scope revocation request' USING ERRCODE='23514';END IF;
 IF p_kind='grant' THEN
  SELECT * INTO STRICT g FROM mizan.access_grants WHERE tenant_id=p_tenant AND id=p_target FOR UPDATE;member=g.membership_id;entity=g.entity_id;bank=g.bank_account_id;revoked=g.revoked_at;
 ELSE
  SELECT * INTO STRICT r FROM mizan.membership_roles WHERE tenant_id=p_tenant AND id=p_target FOR UPDATE;member=r.membership_id;entity=r.entity_id;bank=r.bank_account_id;revoked=r.revoked_at;
 END IF;
 IF NOT mizan.has_permission(p_tenant,entity,p_actor,'members.manage',bank) THEN RAISE EXCEPTION 'Scope administration required' USING ERRCODE='42501';END IF;
 SELECT user_id INTO STRICT subject FROM mizan.memberships WHERE tenant_id=p_tenant AND id=member;
 IF subject=p_actor AND (p_kind='role' AND r.role_code IN ('subscription_owner','entity_admin') OR p_kind='grant' AND g.permission_code IN ('members.manage','entities.manage')) THEN RAISE EXCEPTION 'Self administration removal requires another administrator' USING ERRCODE='23514';END IF;
 IF p_kind='role' AND r.role_code='subscription_owner' AND EXISTS(SELECT 1 FROM mizan.tenants WHERE id=p_tenant AND owner_user_id=subject) THEN RAISE EXCEPTION 'Ownership transfer required' USING ERRCODE='23514';END IF;
 fingerprint=encode(sha256(convert_to(jsonb_build_array('revoke_scope',p_kind,p_target,trim(p_reason))::text,'UTF8')),'hex');previous=mizan_private.operation_previous(p_tenant,p_actor,p_key,fingerprint);IF previous IS NOT NULL THEN RETURN previous;END IF;
 IF revoked IS NOT NULL THEN RAISE EXCEPTION 'Scope already revoked' USING ERRCODE='23514';END IF;
 IF p_kind='grant' THEN
  UPDATE mizan.access_grants SET revoked_at=clock_timestamp() WHERE id=p_target;
  remaining=jsonb_build_object(g.permission_code,mizan.has_permission(p_tenant,entity,subject,g.permission_code,bank));
 ELSE
  UPDATE mizan.membership_roles SET revoked_at=clock_timestamp() WHERE id=p_target;
  SELECT coalesce(jsonb_object_agg(permission_code,mizan.has_permission(p_tenant,entity,subject,permission_code,bank)),'{}'::jsonb) INTO remaining FROM mizan.role_permissions WHERE role_code=r.role_code;
 END IF;
 response=jsonb_build_object('id',p_target,'status','revoked','effectivePermissionsRemaining',remaining,'reused',false);
 INSERT INTO mizan_private.operation_requests(tenant_id,request_key,actor_id,request_hash,response) VALUES(p_tenant,p_key,p_actor,fingerprint,response);
 PERFORM mizan_private.append_audit(p_tenant,entity,p_actor,'access.revoked',p_kind,p_target,trim(p_reason),p_request,jsonb_build_object('membershipId',member,'bankAccountId',bank));RETURN response;
END $$;
REVOKE ALL ON FUNCTION mizan_private.revoke_invitation(uuid,uuid,uuid,uuid,text,uuid,uuid),mizan_private.revoke_scoped_access(uuid,uuid,uuid,text,uuid,text,uuid,uuid) FROM PUBLIC;
