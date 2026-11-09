CREATE OR REPLACE FUNCTION mizan.guard_period_reference() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE period_status text;
BEGIN
 SELECT status INTO period_status FROM mizan.accounting_periods
 WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.period_id) FOR SHARE;
 IF period_status IS DISTINCT FROM 'open' THEN
  RAISE EXCEPTION 'Period is closed; reopen with a new version' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION mizan_private.change_accounting_period(
 p_actor uuid,p_session uuid,p_tenant uuid,p_entity uuid,p_period uuid,p_action text,p_reason text,p_key uuid,p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_period mizan.accounting_periods; saved mizan.accounting_periods; request_hash text; response jsonb;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 PERFORM mizan_private.require_active_scope(p_tenant,p_entity);
 IF NOT mizan.has_permission(p_tenant,p_entity,p_actor,'entities.manage') THEN
  RAISE EXCEPTION 'Period administration permission is required' USING ERRCODE='42501';
 END IF;
 IF p_action IS NULL OR p_action NOT IN ('lock','reopen') OR coalesce(length(trim(p_reason)),0) NOT BETWEEN 8 AND 500 OR p_key IS NULL THEN
  RAISE EXCEPTION 'A documented lock or reopening request is required' USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_entity::text,42));
 SELECT * INTO STRICT current_period FROM mizan.accounting_periods
 WHERE (tenant_id,entity_id,id)=(p_tenant,p_entity,p_period) FOR UPDATE;
 request_hash=encode(sha256(convert_to(jsonb_build_array('accounting_period',p_period,p_action,trim(p_reason))::text,'UTF8')),'hex');
 response=mizan_private.operation_previous(p_tenant,p_actor,p_key,request_hash);
 IF response IS NOT NULL THEN RETURN response; END IF;
 IF EXISTS(SELECT 1 FROM mizan.accounting_periods p
   WHERE (p.tenant_id,p.entity_id,p.logical_period_id)=(p_tenant,p_entity,current_period.logical_period_id)
     AND p.version>current_period.version) THEN
  RAISE EXCEPTION 'Select the latest version of the accounting period' USING ERRCODE='40001';
 END IF;
 IF p_action='lock' THEN
  IF current_period.status<>'open' THEN
   RAISE EXCEPTION 'Only an open period can be locked' USING ERRCODE='40001';
  END IF;
  IF EXISTS(SELECT 1 FROM mizan.output_versions v
    WHERE (v.tenant_id,v.entity_id,v.period_id)=(p_tenant,p_entity,p_period) AND v.status='under_review') THEN
   RAISE EXCEPTION 'Finish or withdraw active reviews before locking the period' USING ERRCODE='40001';
  END IF;
  UPDATE mizan.accounting_periods SET status='locked',locked_by=p_actor,locked_at=clock_timestamp()
   WHERE id=p_period RETURNING * INTO saved;
 ELSE
  IF current_period.status<>'locked' THEN
   RAISE EXCEPTION 'Only a locked period can be reopened' USING ERRCODE='40001';
  END IF;
  IF EXISTS(SELECT 1 FROM mizan.accounting_periods p
    WHERE (p.tenant_id,p.entity_id)=(p_tenant,p_entity) AND p.logical_period_id<>current_period.logical_period_id
      AND p.status<>'superseded' AND p.start_date<=current_period.end_date AND p.end_date>=current_period.start_date) THEN
   RAISE EXCEPTION 'The period overlaps another accounting period' USING ERRCODE='40001';
  END IF;
  INSERT INTO mizan.accounting_periods(tenant_id,entity_id,logical_period_id,version,predecessor_id,settings_version_id,
    start_date,end_date,reopen_reason,created_by)
  VALUES(p_tenant,p_entity,current_period.logical_period_id,current_period.version+1,p_period,current_period.settings_version_id,
    current_period.start_date,current_period.end_date,trim(p_reason),p_actor) RETURNING * INTO saved;
 END IF;
 response=jsonb_build_object('id',saved.id,'status',saved.status,'version',saved.version,'predecessor_id',saved.predecessor_id,'reused',false);
 INSERT INTO mizan_private.operation_requests(tenant_id,request_key,actor_id,request_hash,response)
 VALUES(p_tenant,p_key,p_actor,request_hash,response);
 PERFORM mizan_private.append_audit(p_tenant,p_entity,p_actor,
  CASE WHEN p_action='lock' THEN 'period.locked' ELSE 'period.reopened' END,'period',saved.id,
  trim(p_reason),p_request,jsonb_build_object('sourcePeriodId',p_period,'version',saved.version));
 RETURN response;
END $$;

REVOKE ALL ON FUNCTION mizan_private.change_accounting_period(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mizan_api_v1') THEN
  GRANT EXECUTE ON FUNCTION mizan_private.change_accounting_period(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid) TO mizan_api_v1;
 END IF;
END $$;
