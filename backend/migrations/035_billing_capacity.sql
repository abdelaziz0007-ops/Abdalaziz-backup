-- The metered unit is a distinct scan job accepted in the subscription period.
-- Retries of the same job do not add another unit; cancellations do not refund it.
CREATE FUNCTION mizan_private.assert_scan_plan_capacity(p_tenant uuid,p_exclude uuid,p_created timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE subscription mizan.subscriptions; limits jsonb; cap bigint; used bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text,88));
 SELECT * INTO subscription FROM mizan.subscriptions WHERE tenant_id=p_tenant ORDER BY created_at DESC,id DESC LIMIT 1;
 -- Workspaces without a subscription retain the existing beta concurrency guards.
 IF NOT FOUND THEN RETURN; END IF;
 IF subscription.status NOT IN ('trial','active') OR subscription.ended_at IS NOT NULL
 OR subscription.current_period_start IS NULL OR subscription.current_period_end IS NULL
 OR subscription.current_period_start>clock_timestamp() OR subscription.current_period_end<=clock_timestamp() THEN
  RAISE EXCEPTION 'Subscription is inactive or its billing period has expired' USING ERRCODE='P0041';
 END IF;
 SELECT p.limits INTO limits FROM mizan.plan_versions p WHERE p.id=subscription.plan_version_id AND p.published_at IS NOT NULL;
 IF limits IS NULL OR coalesce(limits->>'scan_jobs_per_period','') !~ '^[0-9]{1,9}$' THEN
  RAISE EXCEPTION 'Published plan scan quota is not configured' USING ERRCODE='P0042';
 END IF;
 cap=(limits->>'scan_jobs_per_period')::bigint;
 SELECT count(*) INTO used FROM mizan.processing_jobs j WHERE j.tenant_id=p_tenant AND j.job_type='file_scan'
 AND j.created_at>=subscription.current_period_start AND j.created_at<subscription.current_period_end AND (p_exclude IS NULL OR j.id<>p_exclude);
 -- Existing jobs from earlier periods are not newly metered; they must still have a live subscription.
 IF (p_exclude IS NULL OR p_created>=subscription.current_period_start) AND used>=cap THEN
  RAISE EXCEPTION 'Subscription scan quota exhausted for this period' USING ERRCODE='P0043';
 END IF;
 RETURN;
END $$;
CREATE FUNCTION mizan_private.guard_scan_plan_capacity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.job_type='file_scan' AND NEW.status='queued' THEN
  IF TG_OP='INSERT' THEN PERFORM mizan_private.assert_scan_plan_capacity(NEW.tenant_id,NULL,NEW.created_at);
  ELSIF OLD.status<>'queued' THEN PERFORM mizan_private.assert_scan_plan_capacity(NEW.tenant_id,NEW.id,NEW.created_at); END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION mizan_private.scan_capacity_for_upload(p_actor uuid,p_session uuid,p_tenant uuid,p_entity uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 PERFORM mizan_private.require_active_scope(p_tenant,p_entity);
 IF NOT mizan.has_permission(p_tenant,p_entity,p_actor,'imports.manage') THEN RAISE EXCEPTION 'Import permission required' USING ERRCODE='42501'; END IF;
 -- Same lock order as enqueue_source_scan; reserve acceptance capacity before writing an object.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text,57));
 IF (SELECT count(*) FROM mizan.processing_jobs WHERE tenant_id=p_tenant AND status IN ('queued','running'))>=10 THEN RAISE EXCEPTION 'Workspace job capacity reached' USING ERRCODE='54000'; END IF;
 PERFORM mizan_private.assert_scan_plan_capacity(p_tenant,NULL,clock_timestamp());
END $$;
CREATE TRIGGER scan_plan_capacity BEFORE INSERT OR UPDATE OF status ON mizan.processing_jobs
FOR EACH ROW EXECUTE FUNCTION mizan_private.guard_scan_plan_capacity();

CREATE FUNCTION mizan_private.billing_overview(p_actor uuid,p_session uuid,p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE subscription mizan.subscriptions; plan jsonb; usage bigint;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 PERFORM mizan_private.require_active_scope(p_tenant,NULL);
 IF NOT mizan.has_permission(p_tenant,NULL,p_actor,'billing.manage') THEN RAISE EXCEPTION 'Workspace billing permission required' USING ERRCODE='42501'; END IF;
 SELECT * INTO subscription FROM mizan.subscriptions WHERE tenant_id=p_tenant ORDER BY created_at DESC,id DESC LIMIT 1;
 IF FOUND THEN
 SELECT jsonb_build_object('name',name,'code',code,'version',version,'limits',limits,'priceAmount',price_amount::text,'priceCurrency',price_currency,'interval',billing_interval,'published',published_at IS NOT NULL) INTO plan FROM mizan.plan_versions WHERE id=subscription.plan_version_id;
 SELECT count(*) INTO usage FROM mizan.processing_jobs WHERE tenant_id=p_tenant AND job_type='file_scan' AND created_at>=subscription.current_period_start AND created_at<subscription.current_period_end;
 END IF;
 RETURN jsonb_build_object('subscription',CASE WHEN subscription.id IS NULL THEN NULL ELSE jsonb_build_object('id',subscription.id,'status',subscription.status,'periodStart',subscription.current_period_start,'periodEnd',subscription.current_period_end,'endedAt',subscription.ended_at,'plan',plan) END,
 'acceptedScans',coalesce(usage,0)::text,
 'activeJobs',(SELECT count(*) FROM mizan.processing_jobs WHERE tenant_id=p_tenant AND status IN ('queued','running')),
 'invoices',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC) FROM (SELECT id,currency_code,total::text,status,period_start,period_end,created_at FROM mizan.invoices WHERE tenant_id=p_tenant ORDER BY created_at DESC,id DESC LIMIT 100) i),'[]'::jsonb),
 'paymentEnabled',false);
END $$;
REVOKE ALL ON FUNCTION mizan_private.assert_scan_plan_capacity(uuid,uuid,timestamptz),mizan_private.scan_capacity_for_upload(uuid,uuid,uuid,uuid),mizan_private.guard_scan_plan_capacity(),mizan_private.billing_overview(uuid,uuid,uuid) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mizan_api_v1') THEN
 GRANT EXECUTE ON FUNCTION mizan_private.scan_capacity_for_upload(uuid,uuid,uuid,uuid),mizan_private.billing_overview(uuid,uuid,uuid) TO mizan_api_v1;
END IF; END $$;
