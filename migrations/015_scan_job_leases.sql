CREATE TABLE mizan_private.scan_leases (
 job_id uuid PRIMARY KEY REFERENCES mizan.processing_jobs(id),attempt_number integer NOT NULL,
 token_hash text NOT NULL,worker_identifier text NOT NULL,started_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE FUNCTION mizan_private.enqueue_source_scan(p_actor uuid,p_session uuid,p_tenant uuid,p_entity uuid,p_source uuid,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE f mizan.source_files; j mizan.processing_jobs; response jsonb;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 PERFORM mizan_private.require_active_scope(p_tenant,p_entity);
 IF NOT mizan.has_permission(p_tenant,p_entity,p_actor,'imports.manage') THEN RAISE EXCEPTION 'Import permission required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text,57));
 SELECT * INTO STRICT f FROM mizan.source_files WHERE (tenant_id,entity_id,id)=(p_tenant,p_entity,p_source) FOR UPDATE;
 IF f.deleted_at IS NOT NULL OR f.scan_status IN ('infected','rejected') THEN RAISE EXCEPTION 'Source is unavailable' USING ERRCODE='23514';END IF;
 IF f.scan_status='clean' THEN RETURN jsonb_build_object('sourceId',f.id,'jobId',f.scan_job_id,'scanStatus','clean','reused',true);END IF;
 SELECT * INTO j FROM mizan.processing_jobs WHERE tenant_id=p_tenant AND entity_id=p_entity AND job_type='file_scan' AND idempotency_key='file-scan-v1:'||p_source::text;
 IF FOUND THEN RETURN jsonb_build_object('sourceId',f.id,'jobId',j.id,'status',j.status,'reused',true);END IF;
 IF (SELECT count(*) FROM mizan.processing_jobs WHERE tenant_id=p_tenant AND status IN ('queued','running'))>=10 THEN RAISE EXCEPTION 'Workspace job capacity reached' USING ERRCODE='54000';END IF;
 INSERT INTO mizan.processing_jobs(tenant_id,entity_id,job_type,idempotency_key,status,requested_by,input_references)
 VALUES(p_tenant,p_entity,'file_scan','file-scan-v1:'||p_source::text,'queued',p_actor,jsonb_build_object('sourceId',p_source)) RETURNING * INTO j;
 UPDATE mizan.source_files SET scan_job_id=j.id WHERE id=f.id;
 response=jsonb_build_object('sourceId',f.id,'jobId',j.id,'status','queued','reused',false);
 PERFORM mizan_private.append_audit(p_tenant,p_entity,p_actor,'source.scan_queued','processing_job',j.id,'Explicit file-scanning request',p_request,jsonb_build_object('sourceId',f.id));RETURN response;
END $$;
CREATE FUNCTION mizan_private.control_scan_job(p_actor uuid,p_session uuid,p_tenant uuid,p_entity uuid,p_job uuid,p_action text,p_reason text,p_key uuid,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j mizan.processing_jobs; f mizan.source_files; previous jsonb; response jsonb; fingerprint text;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);PERFORM mizan_private.require_active_scope(p_tenant,p_entity);
 IF NOT mizan.has_permission(p_tenant,p_entity,p_actor,'imports.manage') THEN RAISE EXCEPTION 'Import permission required' USING ERRCODE='42501';END IF;
 IF p_action NOT IN ('cancel','retry') OR length(trim(p_reason)) NOT BETWEEN 8 AND 500 THEN RAISE EXCEPTION 'Invalid job action' USING ERRCODE='23514';END IF;
 fingerprint=encode(sha256(convert_to(jsonb_build_array('scan-job-control',p_entity,p_job,p_action,p_reason)::text,'UTF8')),'hex');
 previous=mizan_private.operation_previous(p_tenant,p_actor,p_key,fingerprint);IF previous IS NOT NULL THEN RETURN previous;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text,57));
 SELECT * INTO STRICT j FROM mizan.processing_jobs WHERE (tenant_id,entity_id,id)=(p_tenant,p_entity,p_job) AND job_type='file_scan' FOR UPDATE;
 IF p_action='cancel' THEN
  IF j.status NOT IN ('queued','running') THEN RAISE EXCEPTION 'Job cannot be cancelled' USING ERRCODE='23514';END IF;
  UPDATE mizan.processing_jobs SET cancel_requested_at=clock_timestamp(),status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END,
   finished_at=CASE WHEN status='queued' THEN clock_timestamp() ELSE finished_at END WHERE id=j.id RETURNING * INTO j;
 ELSE
  SELECT * INTO STRICT f FROM mizan.source_files WHERE (tenant_id,entity_id,id)=(p_tenant,p_entity,(j.input_references->>'sourceId')::uuid);
  IF j.status<>'failed' OR j.attempt_count>=3 OR f.deleted_at IS NOT NULL OR f.scan_status<>'quarantined' THEN RAISE EXCEPTION 'Job cannot be retried' USING ERRCODE='23514';END IF;
  IF (SELECT count(*) FROM mizan.processing_jobs WHERE tenant_id=p_tenant AND status IN ('queued','running'))>=10 THEN RAISE EXCEPTION 'Workspace job capacity reached' USING ERRCODE='54000';END IF;
  UPDATE mizan.processing_jobs SET status='queued',progress=0,cancel_requested_at=NULL,finished_at=NULL,lease_expires_at=NULL,error_code=NULL WHERE id=j.id RETURNING * INTO j;
 END IF;
 response=jsonb_build_object('jobId',j.id,'status',j.status,'cancelRequested',j.cancel_requested_at IS NOT NULL,'reused',false);
 INSERT INTO mizan_private.operation_requests(tenant_id,request_key,actor_id,request_hash,response) VALUES(p_tenant,p_key,p_actor,fingerprint,response);
 PERFORM mizan_private.append_audit(p_tenant,p_entity,p_actor,'source.scan_'||p_action,'processing_job',j.id,p_reason,p_request,'{}');RETURN response;
END $$;
CREATE FUNCTION mizan_private.claim_scan_job(p_worker text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j mizan.processing_jobs; old_lease mizan_private.scan_leases; f mizan.source_files; token text; expiration timestamptz;
BEGIN
 IF length(p_worker) NOT BETWEEN 3 AND 100 OR p_worker!~'^[a-zA-Z0-9_.:-]+$' THEN RAISE EXCEPTION 'Invalid worker identity' USING ERRCODE='23514';END IF;
 SELECT * INTO j FROM mizan.processing_jobs q WHERE q.job_type='file_scan' AND (q.status='queued' OR q.status='running' AND q.lease_expires_at<clock_timestamp()) ORDER BY q.created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended(j.tenant_id::text,57)) THEN RETURN NULL;END IF;
 SELECT * INTO old_lease FROM mizan_private.scan_leases WHERE job_id=j.id;
 IF FOUND THEN
  INSERT INTO mizan.job_attempts(tenant_id,entity_id,job_id,attempt_number,worker_identifier,started_at,finished_at,error_code)
  VALUES(j.tenant_id,j.entity_id,j.id,old_lease.attempt_number,old_lease.worker_identifier,old_lease.started_at,clock_timestamp(),'LEASE_EXPIRED') ON CONFLICT DO NOTHING;
  DELETE FROM mizan_private.scan_leases WHERE job_id=j.id;
 END IF;
 IF j.cancel_requested_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM mizan.tenants t JOIN mizan.legal_entities e ON e.tenant_id=t.id WHERE t.id=j.tenant_id AND e.id=j.entity_id AND t.status='active' AND e.status='active') OR NOT mizan.has_permission(j.tenant_id,j.entity_id,j.requested_by,'imports.manage') THEN
  UPDATE mizan.processing_jobs SET status='cancelled',finished_at=clock_timestamp(),lease_expires_at=NULL,error_code='AUTHORITY_REVOKED_OR_CANCELLED' WHERE id=j.id;RETURN NULL;
 END IF;
 IF j.attempt_count>=3 THEN UPDATE mizan.processing_jobs SET status='failed',finished_at=clock_timestamp(),lease_expires_at=NULL,error_code='ATTEMPTS_EXHAUSTED' WHERE id=j.id;RETURN NULL;END IF;
 IF (SELECT count(*) FROM mizan.processing_jobs WHERE tenant_id=j.tenant_id AND status='running' AND lease_expires_at>clock_timestamp())>=2 THEN RETURN NULL;END IF;
 SELECT * INTO STRICT f FROM mizan.source_files WHERE (tenant_id,entity_id,id)=(j.tenant_id,j.entity_id,(j.input_references->>'sourceId')::uuid) FOR UPDATE;
 IF f.deleted_at IS NOT NULL OR f.scan_status<>'quarantined' THEN UPDATE mizan.processing_jobs SET status='failed',finished_at=clock_timestamp(),lease_expires_at=NULL,error_code='SOURCE_UNAVAILABLE' WHERE id=j.id;RETURN NULL;END IF;
 token=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');expiration=clock_timestamp()+interval '5 minutes';
 UPDATE mizan.processing_jobs SET status='running',progress=0.1,attempt_count=attempt_count+1,started_at=coalesce(started_at,clock_timestamp()),finished_at=NULL,lease_expires_at=expiration,error_code=NULL WHERE id=j.id RETURNING * INTO j;
 INSERT INTO mizan_private.scan_leases(job_id,attempt_number,token_hash,worker_identifier,started_at,expires_at)
 VALUES(j.id,j.attempt_count,encode(sha256(convert_to(token,'UTF8')),'hex'),p_worker,clock_timestamp(),expiration);
 RETURN jsonb_build_object('jobId',j.id,'tenantId',j.tenant_id,'entityId',j.entity_id,'sourceId',f.id,'objectKey',f.object_key,'sha256',f.sha256,'byteSize',f.byte_size,'attempt',j.attempt_count,'leaseToken',token,'traceId',j.trace_id);
END $$;
CREATE FUNCTION mizan_private.finish_scan_job(p_job uuid,p_token text,p_outcome text,p_version text,p_error text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j mizan.processing_jobs; lease mizan_private.scan_leases; f mizan.source_files; outcome text;
BEGIN
 SELECT * INTO STRICT j FROM mizan.processing_jobs WHERE id=p_job AND job_type='file_scan' FOR UPDATE;
 SELECT * INTO lease FROM mizan_private.scan_leases WHERE job_id=p_job FOR UPDATE;
 IF lease.job_id IS NULL OR lease.token_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') OR lease.expires_at<=clock_timestamp() OR lease.attempt_number<>j.attempt_count OR j.status<>'running' THEN RAISE EXCEPTION 'Stale worker lease' USING ERRCODE='40001';END IF;
 IF p_outcome NOT IN ('clean','infected','failed') OR (p_outcome IN ('clean','infected') AND (p_version IS NULL OR length(p_version) NOT BETWEEN 8 AND 250 OR p_version!~'^ClamAV [0-9]')) OR (p_error IS NOT NULL AND p_error!~'^[A-Z0-9_]{3,80}$') THEN RAISE EXCEPTION 'Invalid scanner result contract' USING ERRCODE='23514';END IF;
 outcome=p_outcome;
 IF j.cancel_requested_at IS NOT NULL OR NOT mizan.has_permission(j.tenant_id,j.entity_id,j.requested_by,'imports.manage') OR NOT EXISTS(SELECT 1 FROM mizan.tenants t JOIN mizan.legal_entities e ON e.tenant_id=t.id WHERE t.id=j.tenant_id AND e.id=j.entity_id AND t.status='active' AND e.status='active') THEN outcome='cancelled';END IF;
 SELECT * INTO STRICT f FROM mizan.source_files WHERE (tenant_id,entity_id,id)=(j.tenant_id,j.entity_id,(j.input_references->>'sourceId')::uuid) FOR UPDATE;
 IF f.deleted_at IS NOT NULL OR f.scan_status<>'quarantined' THEN outcome='failed';p_error='SOURCE_UNAVAILABLE';END IF;
 IF outcome IN ('clean','infected') THEN UPDATE mizan.source_files SET scan_status=outcome,scanned_at=clock_timestamp(),scanner_version=p_version WHERE id=f.id;END IF;
 UPDATE mizan.processing_jobs SET status=CASE outcome WHEN 'clean' THEN 'succeeded' WHEN 'cancelled' THEN 'cancelled' ELSE 'failed' END,progress=CASE WHEN outcome IN ('clean','infected') THEN 1 ELSE progress END,finished_at=clock_timestamp(),lease_expires_at=NULL,error_code=CASE outcome WHEN 'infected' THEN 'MALWARE_DETECTED' WHEN 'failed' THEN coalesce(p_error,'SCAN_FAILED') WHEN 'cancelled' THEN 'CANCELLED_BEFORE_RESULT' END WHERE id=j.id RETURNING * INTO j;
 INSERT INTO mizan.job_attempts(tenant_id,entity_id,job_id,attempt_number,worker_identifier,started_at,finished_at,error_code)
 VALUES(j.tenant_id,j.entity_id,j.id,lease.attempt_number,lease.worker_identifier,lease.started_at,j.finished_at,j.error_code);
 DELETE FROM mizan_private.scan_leases WHERE job_id=j.id;
 -- Audit attribution retains the requesting actor; the immutable attempt records the worker.
 IF EXISTS(SELECT 1 FROM mizan.memberships WHERE tenant_id=j.tenant_id AND user_id=j.requested_by AND status='active') THEN
  PERFORM mizan_private.append_audit(j.tenant_id,j.entity_id,j.requested_by,'source.scan_finished','processing_job',j.id,'Scanner job reached a terminal state',gen_random_uuid(),jsonb_build_object('status',j.status,'errorCode',j.error_code,'attempt',j.attempt_count));
 END IF;
 RETURN jsonb_build_object('jobId',j.id,'status',j.status,'errorCode',j.error_code);
END $$;
REVOKE ALL ON FUNCTION mizan_private.enqueue_source_scan(uuid,uuid,uuid,uuid,uuid,uuid),mizan_private.control_scan_job(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid),mizan_private.claim_scan_job(text),mizan_private.finish_scan_job(uuid,text,text,text,text) FROM PUBLIC;
