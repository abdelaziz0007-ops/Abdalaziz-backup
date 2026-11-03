CREATE FUNCTION mizan_private.restore_membership(p_actor uuid,p_session uuid,p_tenant uuid,p_member uuid,p_reason text,p_key uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member mizan.memberships; fingerprint text; previous jsonb; response jsonb;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 IF NOT mizan.has_permission(p_tenant,NULL,p_actor,'members.manage') OR length(trim(p_reason))<8 THEN RAISE EXCEPTION 'Workspace administration and a reason required' USING ERRCODE='42501';END IF;
 fingerprint=encode(sha256(convert_to(jsonb_build_array('restore_member',p_member,trim(p_reason))::text,'UTF8')),'hex');previous=mizan_private.operation_previous(p_tenant,p_actor,p_key,fingerprint);IF previous IS NOT NULL THEN RETURN previous;END IF;
 SELECT * INTO STRICT member FROM mizan.memberships WHERE tenant_id=p_tenant AND id=p_member FOR UPDATE;
 IF member.status NOT IN ('revoked','suspended') OR EXISTS(SELECT 1 FROM mizan.tenants WHERE id=p_tenant AND owner_user_id=member.user_id) OR NOT EXISTS(SELECT 1 FROM mizan.app_users WHERE id=member.user_id AND status='active') THEN RAISE EXCEPTION 'Membership cannot be restored by this workflow' USING ERRCODE='23514';END IF;
 -- Reactivation never resurrects historical financial or administration rights.
 UPDATE mizan.access_grants SET revoked_at=clock_timestamp() WHERE tenant_id=p_tenant AND membership_id=member.id AND revoked_at IS NULL;
 UPDATE mizan.membership_roles SET revoked_at=clock_timestamp() WHERE tenant_id=p_tenant AND membership_id=member.id AND revoked_at IS NULL;
 UPDATE mizan.memberships SET status='active',revoked_at=NULL WHERE id=member.id;
 response=jsonb_build_object('membershipId',member.id,'status','active','permissionsRestored',false,'reused',false);
 INSERT INTO mizan_private.operation_requests(tenant_id,request_key,actor_id,request_hash,response) VALUES(p_tenant,p_key,p_actor,fingerprint,response);
 PERFORM mizan_private.append_audit(p_tenant,NULL,p_actor,'membership.restored','membership',member.id,trim(p_reason),p_request,'{"historicalPermissionsRestored":false}'::jsonb);RETURN response;
END $$;
REVOKE ALL ON FUNCTION mizan_private.restore_membership(uuid,uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC;
