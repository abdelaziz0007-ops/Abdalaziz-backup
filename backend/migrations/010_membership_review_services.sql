-- These bridges are deliberately narrower than granting the API role direct
-- identity directory, membership activation, approval or output-status writes.
CREATE TABLE mizan_private.operation_requests (
 tenant_id uuid NOT NULL REFERENCES mizan.tenants(id),request_key uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES mizan.app_users(id),request_hash text NOT NULL,
 response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,request_key)
);
CREATE FUNCTION mizan_private.require_recent_actor(p_actor uuid,p_session uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM mizan.user_sessions s JOIN mizan.app_users u ON u.id=s.user_id
 WHERE s.id=p_session AND s.user_id=p_actor AND s.revoked_at IS NULL AND s.expires_at>now()
 AND s.mfa_verified_at>now()-interval '15 minutes' AND u.status='active' AND u.mfa_enabled)
 THEN RAISE EXCEPTION 'Recent authenticated MFA session required' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION mizan_private.operation_previous(p_tenant uuid,p_actor uuid,p_key uuid,p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE previous mizan_private.operation_requests;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':'||p_key::text,91));
 SELECT * INTO previous FROM mizan_private.operation_requests WHERE tenant_id=p_tenant AND request_key=p_key;
 IF FOUND THEN IF previous.actor_id<>p_actor OR previous.request_hash<>p_hash THEN RAISE EXCEPTION 'Request key conflict' USING ERRCODE='23514';END IF;RETURN previous.response||'{"reused":true}'::jsonb;END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION mizan_private.create_invitation(p_actor uuid,p_session uuid,p_tenant uuid,p_email text,p_hours integer,p_grants jsonb,p_token_hash text,p_reason text,p_key uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE grant_row record; fingerprint text; previous jsonb; invite mizan.invitations; response jsonb;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 IF p_hours<1 OR p_hours>168 OR length(trim(p_reason))<8 OR length(p_email)>254 OR jsonb_typeof(p_grants)<>'array' OR jsonb_array_length(p_grants) NOT BETWEEN 1 AND 30 OR p_token_hash!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid invitation contract' USING ERRCODE='23514';END IF;
 IF NOT EXISTS(SELECT 1 FROM mizan.tenants WHERE id=p_tenant AND status='active') THEN RAISE EXCEPTION 'Workspace unavailable' USING ERRCODE='42501';END IF;
 FOR grant_row IN SELECT * FROM jsonb_to_recordset(p_grants) AS x("permissionCode" text,"entityId" uuid,"bankAccountId" uuid) LOOP
  IF NOT mizan.has_permission(p_tenant,grant_row."entityId",p_actor,'members.manage',grant_row."bankAccountId") THEN RAISE EXCEPTION 'Invitation scope is not administrable' USING ERRCODE='42501';END IF;
  IF grant_row."bankAccountId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mizan.bank_accounts WHERE tenant_id=p_tenant AND entity_id=grant_row."entityId" AND id=grant_row."bankAccountId" AND active) THEN RAISE EXCEPTION 'Invalid invitation bank scope' USING ERRCODE='23514';END IF;
 END LOOP;
 fingerprint=encode(sha256(convert_to(jsonb_build_array('invite',lower(trim(p_email)),p_hours,p_grants,trim(p_reason))::text,'UTF8')),'hex');
 previous=mizan_private.operation_previous(p_tenant,p_actor,p_key,fingerprint);IF previous IS NOT NULL THEN RETURN previous;END IF;
 INSERT INTO mizan.invitations(tenant_id,email,token_hash,invited_by,expires_at) VALUES(p_tenant,lower(trim(p_email)),p_token_hash,p_actor,clock_timestamp()+make_interval(hours=>p_hours)) RETURNING * INTO invite;
 FOR grant_row IN SELECT * FROM jsonb_to_recordset(p_grants) AS x("permissionCode" text,"entityId" uuid,"bankAccountId" uuid) LOOP
  INSERT INTO mizan.invitation_grants(tenant_id,invitation_id,permission_code,entity_id,bank_account_id) VALUES(p_tenant,invite.id,grant_row."permissionCode",grant_row."entityId",grant_row."bankAccountId");
 END LOOP;
 response=jsonb_build_object('id',invite.id,'expiresAt',invite.expires_at,'reused',false);
 INSERT INTO mizan_private.operation_requests(tenant_id,request_key,actor_id,request_hash,response) VALUES(p_tenant,p_key,p_actor,fingerprint,response);
 PERFORM mizan_private.append_audit(p_tenant,NULL,p_actor,'invitation.created','invitation',invite.id,trim(p_reason),p_request,jsonb_build_object('grants',jsonb_array_length(p_grants),'expiresAt',invite.expires_at));
 RETURN response;
END $$;
CREATE FUNCTION mizan_private.accept_invitation(p_actor uuid,p_session uuid,p_token_hash text,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE invite mizan.invitations; member mizan.memberships; grant_row mizan.invitation_grants; email text; n integer;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 SELECT i.* INTO invite FROM mizan.invitations i JOIN mizan.tenants t ON t.id=i.tenant_id AND t.status='active' WHERE i.token_hash=p_token_hash FOR UPDATE OF i;
 IF NOT FOUND OR invite.accepted_at IS NOT NULL OR invite.revoked_at IS NOT NULL OR invite.expires_at<=clock_timestamp() THEN RETURN NULL;END IF;
 SELECT u.email INTO email FROM mizan.app_users u WHERE u.id=p_actor;
 IF lower(email)<>lower(invite.email) THEN RETURN NULL;END IF;
 SELECT count(*) INTO n FROM mizan.invitation_grants WHERE tenant_id=invite.tenant_id AND invitation_id=invite.id;
 IF n=0 THEN RETURN NULL;END IF;
 FOR grant_row IN SELECT * FROM mizan.invitation_grants WHERE tenant_id=invite.tenant_id AND invitation_id=invite.id LOOP
  IF NOT mizan.has_permission(invite.tenant_id,grant_row.entity_id,invite.invited_by,'members.manage',grant_row.bank_account_id) THEN RETURN NULL;END IF;
 END LOOP;
 SELECT * INTO member FROM mizan.memberships WHERE tenant_id=invite.tenant_id AND user_id=p_actor FOR UPDATE;
 IF FOUND AND member.status<>'active' THEN RETURN NULL;END IF;
 IF member.id IS NULL THEN INSERT INTO mizan.memberships(tenant_id,user_id,status,joined_at) VALUES(invite.tenant_id,p_actor,'active',clock_timestamp()) RETURNING * INTO member;END IF;
 FOR grant_row IN SELECT * FROM mizan.invitation_grants WHERE tenant_id=invite.tenant_id AND invitation_id=invite.id LOOP
  IF NOT EXISTS(SELECT 1 FROM mizan.access_grants g WHERE g.tenant_id=invite.tenant_id AND g.membership_id=member.id AND g.permission_code=grant_row.permission_code AND g.entity_id IS NOT DISTINCT FROM grant_row.entity_id AND g.bank_account_id IS NOT DISTINCT FROM grant_row.bank_account_id AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now())) THEN
   INSERT INTO mizan.access_grants(tenant_id,membership_id,permission_code,entity_id,bank_account_id,granted_by) VALUES(invite.tenant_id,member.id,grant_row.permission_code,grant_row.entity_id,grant_row.bank_account_id,invite.invited_by);
  END IF;
 END LOOP;
 UPDATE mizan.invitations SET accepted_at=clock_timestamp(),accepted_by=p_actor WHERE tenant_id=invite.tenant_id AND id=invite.id;
 PERFORM mizan_private.append_audit(invite.tenant_id,NULL,p_actor,'invitation.accepted','invitation',invite.id,'Single-use invitation accepted by its authenticated addressee',p_request,jsonb_build_object('grants',n));
 RETURN jsonb_build_object('tenantId',invite.tenant_id,'membershipId',member.id);
END $$;
CREATE FUNCTION mizan_private.member_directory(p_actor uuid,p_session uuid,p_tenant uuid,p_entity uuid,p_bank uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 IF NOT mizan.has_permission(p_tenant,p_entity,p_actor,'members.manage',p_bank) THEN RAISE EXCEPTION 'Membership administration required' USING ERRCODE='42501';END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'userId',m.user_id,'name',u.display_name,'email',u.email,'status',m.status) ORDER BY u.display_name),'[]'::jsonb) FROM mizan.memberships m JOIN mizan.app_users u ON u.id=m.user_id WHERE m.tenant_id=p_tenant AND (p_entity IS NULL OR EXISTS(SELECT 1 FROM mizan.access_grants g WHERE g.tenant_id=p_tenant AND g.membership_id=m.id AND (g.entity_id IS NULL OR g.entity_id=p_entity) AND (p_bank IS NULL OR g.bank_account_id IS NULL OR g.bank_account_id=p_bank) AND g.revoked_at IS NULL) OR EXISTS(SELECT 1 FROM mizan.membership_roles g WHERE g.tenant_id=p_tenant AND g.membership_id=m.id AND (g.entity_id IS NULL OR g.entity_id=p_entity) AND (p_bank IS NULL OR g.bank_account_id IS NULL OR g.bank_account_id=p_bank) AND g.revoked_at IS NULL)));
END $$;
CREATE FUNCTION mizan_private.revoke_membership(p_actor uuid,p_session uuid,p_tenant uuid,p_member uuid,p_reason text,p_key uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member mizan.memberships; fingerprint text; previous jsonb; response jsonb;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 IF NOT mizan.has_permission(p_tenant,NULL,p_actor,'members.manage') OR length(trim(p_reason))<8 THEN RAISE EXCEPTION 'Workspace membership administration required' USING ERRCODE='42501';END IF;
 fingerprint=encode(sha256(convert_to(jsonb_build_array('revoke_member',p_member,trim(p_reason))::text,'UTF8')),'hex');
 previous=mizan_private.operation_previous(p_tenant,p_actor,p_key,fingerprint);IF previous IS NOT NULL THEN RETURN previous;END IF;
 SELECT * INTO STRICT member FROM mizan.memberships WHERE tenant_id=p_tenant AND id=p_member FOR UPDATE;
 IF member.user_id=p_actor OR EXISTS(SELECT 1 FROM mizan.tenants WHERE id=p_tenant AND owner_user_id=member.user_id) THEN RAISE EXCEPTION 'Self/owner removal requires a different ownership workflow' USING ERRCODE='23514';END IF;
 UPDATE mizan.memberships SET status='revoked',revoked_at=clock_timestamp() WHERE id=member.id;
 UPDATE mizan.access_grants SET revoked_at=clock_timestamp() WHERE tenant_id=p_tenant AND membership_id=member.id AND revoked_at IS NULL;
 UPDATE mizan.membership_roles SET revoked_at=clock_timestamp() WHERE tenant_id=p_tenant AND membership_id=member.id AND revoked_at IS NULL;
 UPDATE mizan.user_sessions SET revoked_at=clock_timestamp(),revocation_reason=trim(p_reason) WHERE user_id=member.user_id AND revoked_at IS NULL;
 response=jsonb_build_object('membershipId',member.id,'status','revoked','reauthenticationRequired',true,'reused',false);
 INSERT INTO mizan_private.operation_requests(tenant_id,request_key,actor_id,request_hash,response) VALUES(p_tenant,p_key,p_actor,fingerprint,response);
 PERFORM mizan_private.append_audit(p_tenant,NULL,p_actor,'membership.revoked','membership',member.id,trim(p_reason),p_request,'{}'::jsonb);
 RETURN response;
END $$;
CREATE FUNCTION mizan_private.reviewer_directory(p_actor uuid,p_session uuid,p_tenant uuid,p_entity uuid,p_bank uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 IF NOT mizan.has_permission(p_tenant,p_entity,p_actor,'outputs.prepare',p_bank) THEN RAISE EXCEPTION 'Preparation access required' USING ERRCODE='42501';END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',u.display_name) ORDER BY u.display_name),'[]'::jsonb) FROM mizan.memberships m JOIN mizan.app_users u ON u.id=m.user_id WHERE m.tenant_id=p_tenant AND m.status='active' AND u.status='active' AND u.mfa_enabled AND m.user_id<>p_actor AND mizan.has_permission(p_tenant,p_entity,m.user_id,'outputs.approve',p_bank));
END $$;
CREATE FUNCTION mizan_private.review_action(p_actor uuid,p_session uuid,p_tenant uuid,p_entity uuid,p_output uuid,p_action text,p_reviewer uuid,p_submission uuid,p_expected text,p_reason text,p_key uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o mizan.output_versions; s mizan.review_submissions; bank uuid; fingerprint text; response jsonb; old_response jsonb; sid uuid; new_fp text;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 IF p_action NOT IN ('submit','withdraw','approve','reject','request_changes') OR length(trim(p_reason))<8 THEN RAISE EXCEPTION 'Invalid review action or reason' USING ERRCODE='23514';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_entity::text,42));
 SELECT * INTO STRICT o FROM mizan.output_versions WHERE tenant_id=p_tenant AND entity_id=p_entity AND id=p_output FOR UPDATE;
 SELECT bank_account_id INTO bank FROM mizan.reconciliations WHERE tenant_id=p_tenant AND entity_id=p_entity AND output_version_id=o.id;
 IF NOT mizan.has_permission(p_tenant,p_entity,p_actor,CASE WHEN p_action IN ('submit','withdraw') THEN 'outputs.prepare' ELSE 'outputs.approve' END,bank) THEN RAISE EXCEPTION 'Review permission missing' USING ERRCODE='42501';END IF;
 fingerprint=encode(sha256(convert_to(jsonb_build_array(p_actor,p_output,p_action,p_reviewer,p_submission,p_expected,trim(p_reason))::text,'UTF8')),'hex');
 old_response=mizan_private.operation_previous(p_tenant,p_actor,p_key,fingerprint);IF old_response IS NOT NULL THEN RETURN old_response;END IF;
 IF o.content_fingerprint<>p_expected THEN RAISE EXCEPTION 'Review fingerprint changed' USING ERRCODE='40001';END IF;
 IF p_action='submit' THEN
  IF p_actor<>o.preparer_id OR p_actor=p_reviewer THEN RAISE EXCEPTION 'Independent reviewer required' USING ERRCODE='42501';END IF;
  INSERT INTO mizan.review_submissions(tenant_id,entity_id,output_version_id,content_fingerprint,submitted_by,reviewer_id) VALUES(p_tenant,p_entity,o.id,p_expected,p_actor,p_reviewer) RETURNING id INTO sid;
 ELSIF p_action='withdraw' THEN
  SELECT * INTO STRICT s FROM mizan.review_submissions WHERE tenant_id=p_tenant AND entity_id=p_entity AND output_version_id=o.id AND id=p_submission FOR UPDATE;
  IF s.submitted_by<>p_actor OR o.status<>'under_review' OR s.withdrawn_at IS NOT NULL THEN RAISE EXCEPTION 'Only the preparer may withdraw the active review' USING ERRCODE='42501';END IF;
  UPDATE mizan.review_submissions SET withdrawn_at=clock_timestamp(),withdrawal_reason=trim(p_reason) WHERE id=s.id;
  -- A new review cycle has an explicit new fingerprint; its old signature remains.
  new_fp=encode(sha256(convert_to(jsonb_build_array(o.content_fingerprint,p_key,'withdraw',trim(p_reason))::text,'UTF8')),'hex');
  UPDATE mizan.output_versions SET content_fingerprint=new_fp,submitted_fingerprint=NULL,submitted_at=NULL WHERE id=o.id;
  INSERT INTO mizan.validation_results(tenant_id,entity_id,output_version_id,validated_fingerprint,code,severity,passed,message,evidence)
  SELECT p_tenant,p_entity,o.id,new_fp,code,severity,passed,message,evidence FROM mizan.validation_results WHERE tenant_id=p_tenant AND entity_id=p_entity AND output_version_id=o.id AND validated_fingerprint=o.content_fingerprint;
  sid=s.id;
 ELSE
  IF o.preparer_id=p_actor THEN RAISE EXCEPTION 'Self approval/review is forbidden' USING ERRCODE='42501';END IF;
  INSERT INTO mizan.review_decisions(tenant_id,entity_id,submission_id,output_version_id,reviewed_fingerprint,actor_id,decision,reason,mfa_session_id) VALUES(p_tenant,p_entity,p_submission,o.id,p_expected,p_actor,p_action,trim(p_reason),p_session) RETURNING id INTO sid;
 END IF;
 SELECT * INTO STRICT o FROM mizan.output_versions WHERE id=o.id;
 response=jsonb_build_object('id',sid,'outputId',o.id,'status',o.status,'fingerprint',o.content_fingerprint,'reused',false);
 INSERT INTO mizan_private.operation_requests(tenant_id,request_key,actor_id,request_hash,response) VALUES(p_tenant,p_key,p_actor,fingerprint,response);
 PERFORM mizan_private.append_audit(p_tenant,p_entity,p_actor,'review.'||p_action,'output',o.id,trim(p_reason),p_request,jsonb_build_object('reviewObjectId',sid,'fingerprint',o.content_fingerprint));
 RETURN response;
END $$;
-- Keep application-session revocation distinguishable from role authorization.
DO $$ DECLARE definition text; anchor text; BEGIN
 anchor='RAISE EXCEPTION ''Session revoked'' USING ERRCODE=''42501''';
 SELECT pg_get_functiondef('mizan_private.sync_identity_session(text,text)'::regprocedure) INTO definition;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Identity session guard changed unexpectedly';END IF;
 EXECUTE replace(definition,anchor,'RAISE EXCEPTION ''Session revoked'' USING ERRCODE=''P0401''');
END $$;
REVOKE ALL ON FUNCTION mizan_private.require_recent_actor(uuid,uuid),mizan_private.operation_previous(uuid,uuid,uuid,text),mizan_private.create_invitation(uuid,uuid,uuid,text,integer,jsonb,text,text,uuid,uuid),mizan_private.accept_invitation(uuid,uuid,text,uuid),mizan_private.member_directory(uuid,uuid,uuid,uuid,uuid),mizan_private.revoke_membership(uuid,uuid,uuid,uuid,text,uuid,uuid),mizan_private.reviewer_directory(uuid,uuid,uuid,uuid,uuid),mizan_private.review_action(uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
