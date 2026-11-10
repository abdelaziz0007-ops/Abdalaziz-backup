-- Support grants never become ordinary membership permissions.
CREATE FUNCTION mizan_private.support_action(p_actor uuid,p_session uuid,p_tenant uuid,p_entity uuid,p_id uuid,p_action text,p_data jsonb,p_key uuid,p_audit uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ticket mizan.support_requests; access mizan.support_access_grants; target uuid; response jsonb; request_hash text; context jsonb; manager boolean; state text; hours integer;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 PERFORM mizan_private.require_active_scope(p_tenant,p_entity);
 context=mizan_private.workspace_context(p_actor,p_tenant);
 IF context IS NULL OR (p_entity IS NOT NULL AND NOT (context->'entityIds' @> jsonb_build_array(p_entity))) THEN RAISE EXCEPTION 'Support scope unavailable' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('create','transition','grant','revoke') OR p_key IS NULL OR p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Invalid support action' USING ERRCODE='23514'; END IF;
 manager=mizan.has_permission(p_tenant,p_entity,p_actor,'support.authorize');
 request_hash=encode(sha256(convert_to(jsonb_build_array('support',p_entity,p_id,p_action,p_data)::text,'UTF8')),'hex');
 response=mizan_private.operation_previous(p_tenant,p_actor,p_key,request_hash);
 IF response IS NOT NULL THEN RETURN response; END IF;
 IF p_action='create' THEN
  IF p_id IS NOT NULL OR coalesce(length(trim(p_data->>'subject')),0) NOT BETWEEN 4 AND 200 OR coalesce(length(trim(p_data->>'description')),0) NOT BETWEEN 10 AND 4000 THEN RAISE EXCEPTION 'Invalid support request' USING ERRCODE='23514'; END IF;
  INSERT INTO mizan.support_requests(tenant_id,entity_id,requested_by,subject,description) VALUES(p_tenant,p_entity,p_actor,trim(p_data->>'subject'),trim(p_data->>'description')) RETURNING * INTO ticket;
  response=jsonb_build_object('id',ticket.id,'status',ticket.status,'reused',false);
 ELSE
  SELECT * INTO STRICT ticket FROM mizan.support_requests WHERE tenant_id=p_tenant AND entity_id IS NOT DISTINCT FROM p_entity AND id=p_id FOR UPDATE;
  IF NOT manager AND ticket.requested_by<>p_actor THEN RAISE EXCEPTION 'Support permission required' USING ERRCODE='42501'; END IF;
  IF coalesce(length(trim(p_data->>'reason')),0) NOT BETWEEN 8 AND 500 THEN RAISE EXCEPTION 'Documented reason required' USING ERRCODE='23514'; END IF;
  IF p_action='transition' THEN
   state=p_data->>'status';
   IF state IS NULL OR state NOT IN ('in_progress','resolved','closed') OR ticket.status='closed' OR ticket.status=state OR (state<>'closed' AND NOT manager) OR (state='resolved' AND ticket.status<>'in_progress') THEN RAISE EXCEPTION 'Invalid support transition' USING ERRCODE='40001'; END IF;
   UPDATE mizan.support_requests SET status=state WHERE id=ticket.id;
   IF state IN ('resolved','closed') THEN UPDATE mizan.support_access_grants SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE tenant_id=p_tenant AND support_request_id=ticket.id AND revoked_at IS NULL; END IF;
   response=jsonb_build_object('id',ticket.id,'status',state,'reused',false);
  ELSIF p_action='grant' THEN
   IF NOT manager OR p_entity IS NULL OR ticket.status NOT IN ('open','in_progress') THEN RAISE EXCEPTION 'Support authorization unavailable' USING ERRCODE='42501'; END IF;
   hours=(p_data->>'hours')::integer;
   IF hours IS NULL OR hours NOT BETWEEN 1 AND 24 THEN RAISE EXCEPTION 'Support access must expire within 24 hours' USING ERRCODE='23514'; END IF;
   SELECT id INTO target FROM mizan.app_users WHERE lower(email)=lower(trim(p_data->>'email')) AND status='active' AND mfa_enabled AND id<>p_actor;
   IF target IS NULL THEN RAISE EXCEPTION 'Support recipient unavailable' USING ERRCODE='P0002'; END IF;
   INSERT INTO mizan.support_access_grants(tenant_id,support_request_id,entity_id,support_user_id,approved_by,permission_codes,reason,valid_from,expires_at)
   VALUES(p_tenant,ticket.id,p_entity,target,p_actor,ARRAY['reports.view'],trim(p_data->>'reason'),clock_timestamp(),clock_timestamp()+make_interval(hours=>hours)) RETURNING * INTO access;
   response=jsonb_build_object('id',ticket.id,'grantId',access.id,'expiresAt',access.expires_at,'reused',false);
  ELSE
   SELECT * INTO STRICT access FROM mizan.support_access_grants WHERE tenant_id=p_tenant AND support_request_id=ticket.id AND id=(p_data->>'grantId')::uuid FOR UPDATE;
   UPDATE mizan.support_access_grants SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE id=access.id;
   response=jsonb_build_object('id',ticket.id,'grantId',access.id,'revoked',true,'reused',false);
  END IF;
 END IF;
 INSERT INTO mizan_private.operation_requests(tenant_id,request_key,actor_id,request_hash,response) VALUES(p_tenant,p_key,p_actor,request_hash,response);
 PERFORM mizan_private.append_audit(p_tenant,p_entity,p_actor,'support.'||p_action,'support_request',ticket.id,CASE WHEN p_action='create' THEN 'Support request created' ELSE trim(p_data->>'reason') END,p_audit,jsonb_build_object('grantId',response->'grantId','status',response->'status'));
 RETURN response;
END $$;

CREATE FUNCTION mizan_private.support_grants_for_user(p_actor uuid,p_session uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE response jsonb;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 SELECT coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb) INTO response FROM (
 SELECT g.id,g.tenant_id,g.entity_id,g.expires_at,t.name AS workspace_name,e.legal_name AS entity_name,r.subject
 FROM mizan.support_access_grants g JOIN mizan.support_requests r ON (r.tenant_id,r.id)=(g.tenant_id,g.support_request_id)
 JOIN mizan.tenants t ON t.id=g.tenant_id JOIN mizan.legal_entities e ON (e.tenant_id,e.id)=(g.tenant_id,g.entity_id)
 WHERE g.support_user_id=p_actor AND g.revoked_at IS NULL AND g.valid_from<=clock_timestamp() AND g.expires_at>clock_timestamp()
 AND t.status='active' AND e.status='active' AND r.status IN ('open','in_progress') AND g.permission_codes=ARRAY['reports.view']
 AND mizan.has_permission(g.tenant_id,g.entity_id,g.approved_by,'support.authorize')
 ORDER BY g.expires_at LIMIT 100) x;
 RETURN response;
END $$;

CREATE FUNCTION mizan_private.support_read_output(p_actor uuid,p_session uuid,p_grant uuid,p_output uuid,p_reason text,p_audit uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE access mizan.support_access_grants; output mizan.output_versions; response jsonb;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 IF coalesce(length(trim(p_reason)),0) NOT BETWEEN 8 AND 500 THEN RAISE EXCEPTION 'Access purpose required' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT access FROM mizan.support_access_grants WHERE id=p_grant AND support_user_id=p_actor FOR SHARE;
 PERFORM mizan_private.require_active_scope(access.tenant_id,access.entity_id);
 IF access.revoked_at IS NOT NULL OR access.valid_from>clock_timestamp() OR access.expires_at<=clock_timestamp() OR access.permission_codes<>ARRAY['reports.view']
 OR NOT mizan.has_permission(access.tenant_id,access.entity_id,access.approved_by,'support.authorize')
 OR NOT EXISTS(SELECT 1 FROM mizan.support_requests WHERE tenant_id=access.tenant_id AND id=access.support_request_id AND status IN ('open','in_progress'))
 THEN RAISE EXCEPTION 'Support access expired or revoked' USING ERRCODE='42501'; END IF;
 IF p_output IS NULL THEN
  SELECT jsonb_build_object('outputs',coalesce(jsonb_agg(row_to_json(x)),'[]'::jsonb)) INTO response FROM (
   SELECT id,output_type,version,status,currency_code,created_at FROM mizan.output_versions WHERE tenant_id=access.tenant_id AND entity_id=access.entity_id ORDER BY created_at DESC LIMIT 100) x;
 ELSE
  SELECT * INTO STRICT output FROM mizan.output_versions WHERE tenant_id=access.tenant_id AND entity_id=access.entity_id AND id=p_output;
  response=jsonb_build_object('output',jsonb_build_object('id',output.id,'type',output.output_type,'version',output.version,'status',output.status,'currency',output.currency_code),
   'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object('code',i.code,'value',l.value::text,'state',l.value_state) ORDER BY l.display_order),'[]'::jsonb) FROM mizan.report_lines l JOIN mizan.report_line_items i ON (i.tenant_id,i.entity_id,i.id)=(l.tenant_id,l.entity_id,l.line_item_id) WHERE l.tenant_id=access.tenant_id AND l.entity_id=access.entity_id AND l.output_version_id=p_output),
   'metrics',(SELECT coalesce(jsonb_agg(jsonb_build_object('value',m.value::text,'state',m.value_state,'reason',m.unavailable_reason)),'[]'::jsonb) FROM mizan.metric_results m WHERE m.tenant_id=access.tenant_id AND m.entity_id=access.entity_id AND m.output_version_id=p_output));
 END IF;
 INSERT INTO mizan.support_access_events(tenant_id,grant_id,actor_id,action,object_type,object_id) VALUES(access.tenant_id,access.id,p_actor,CASE WHEN p_output IS NULL THEN 'outputs.list' ELSE 'output.read' END,CASE WHEN p_output IS NULL THEN 'support_request' ELSE 'output_version' END,coalesce(p_output,access.support_request_id));
 PERFORM mizan_private.append_audit(access.tenant_id,access.entity_id,p_actor,'support.access','support_grant',access.id,trim(p_reason),p_audit,jsonb_build_object('outputId',p_output));
 RETURN response;
END $$;

REVOKE ALL ON FUNCTION mizan_private.support_action(uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid,uuid),mizan_private.support_grants_for_user(uuid,uuid),mizan_private.support_read_output(uuid,uuid,uuid,uuid,text,uuid) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mizan_api_v1') THEN
 GRANT SELECT ON mizan.support_requests,mizan.support_access_grants,mizan.support_access_events TO mizan_api_v1;
 GRANT EXECUTE ON FUNCTION mizan_private.support_action(uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid,uuid),mizan_private.support_grants_for_user(uuid,uuid),mizan_private.support_read_output(uuid,uuid,uuid,uuid,text,uuid) TO mizan_api_v1;
END IF; END $$;
