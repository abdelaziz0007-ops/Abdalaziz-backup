CREATE FUNCTION mizan_private.require_active_scope(p_tenant uuid,p_entity uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM mizan.tenants WHERE id=p_tenant AND status='active') OR
 (p_entity IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mizan.legal_entities WHERE tenant_id=p_tenant AND id=p_entity AND status='active'))
 THEN RAISE EXCEPTION 'Workspace or entity is not active' USING ERRCODE='42501';END IF;
END $$;
DO $$ DECLARE fn regprocedure; definition text; anchor text; BEGIN
 FOREACH fn IN ARRAY ARRAY['mizan_private.member_directory(uuid,uuid,uuid,uuid,uuid)'::regprocedure,'mizan_private.reviewer_directory(uuid,uuid,uuid,uuid,uuid)'::regprocedure,'mizan_private.review_action(uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,text,text,uuid,uuid)'::regprocedure] LOOP
  SELECT pg_get_functiondef(fn) INTO definition;
  anchor='PERFORM mizan_private.require_recent_actor(p_actor,p_session);';
  IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Review identity contract changed unexpectedly';END IF;
  EXECUTE replace(definition,anchor,anchor||' PERFORM mizan_private.require_active_scope(p_tenant,p_entity);');
 END LOOP;
 SELECT pg_get_functiondef('mizan_private.review_action(uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,text,text,uuid,uuid)'::regprocedure) INTO definition;
 anchor='new_fp text;';IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Review declaration changed';END IF;
 definition=replace(definition,anchor,'new_fp text; period_state text;');
 anchor='IF o.content_fingerprint<>p_expected THEN';IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Review fingerprint guard changed';END IF;
 definition=replace(definition,anchor,'SELECT status INTO period_state FROM mizan.accounting_periods WHERE tenant_id=p_tenant AND entity_id=p_entity AND id=o.period_id FOR UPDATE;
 IF period_state IS DISTINCT FROM ''open'' OR (p_action=''submit'' AND o.status NOT IN (''draft'',''ready_for_review'',''rejected'',''withdrawn'')) OR (p_action<>''submit'' AND o.status<>''under_review'') THEN RAISE EXCEPTION ''Review stage or period is frozen'' USING ERRCODE=''40001'';END IF;
 IF o.content_fingerprint<>p_expected THEN');
 EXECUTE definition;
END $$;
REVOKE ALL ON FUNCTION mizan_private.require_active_scope(uuid,uuid) FROM PUBLIC;
