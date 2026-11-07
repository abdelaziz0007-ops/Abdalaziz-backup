CREATE FUNCTION mizan_private.create_output_comment(
 p_actor uuid,p_session uuid,p_tenant uuid,p_entity uuid,p_output uuid,p_fingerprint text,
 p_body text,p_parent uuid,p_files uuid[],p_key uuid,p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o mizan.output_versions; bank uuid; comment_id uuid; request_hash text; response jsonb;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 PERFORM mizan_private.require_active_scope(p_tenant,p_entity);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_entity::text,42));
 SELECT * INTO STRICT o FROM mizan.output_versions WHERE (tenant_id,entity_id,id)=(p_tenant,p_entity,p_output) FOR UPDATE;
 SELECT bank_account_id INTO bank FROM mizan.reconciliations
 WHERE (tenant_id,entity_id,output_version_id)=(p_tenant,p_entity,p_output);
 IF (o.output_type='reconciliation' AND bank IS NULL) OR NOT mizan.has_permission(p_tenant,p_entity,p_actor,'reports.view',bank)
  OR NOT mizan.has_permission(p_tenant,p_entity,p_actor,'comments.create',bank) THEN
  RAISE EXCEPTION 'Comment permission is required for this output' USING ERRCODE='42501';
 END IF;
 IF p_body IS NULL OR length(trim(p_body)) NOT BETWEEN 1 AND 2000 OR p_files IS NULL OR cardinality(p_files)>5 THEN
  RAISE EXCEPTION 'Invalid comment body or attachment count' USING ERRCODE='23514';
 END IF;
 request_hash=encode(sha256(convert_to(jsonb_build_array('output.comment',p_output,p_fingerprint,trim(p_body),p_parent,p_files)::text,'UTF8')),'hex');
 response=mizan_private.operation_previous(p_tenant,p_actor,p_key,request_hash);
 IF response IS NOT NULL THEN RETURN response||jsonb_build_object('reused',true); END IF;
 IF p_fingerprint<>o.content_fingerprint THEN RAISE EXCEPTION 'Output fingerprint changed' USING ERRCODE='40001'; END IF;
 IF p_parent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mizan.comments
    WHERE (tenant_id,entity_id,output_version_id,id)=(p_tenant,p_entity,p_output,p_parent)) THEN
  RAISE EXCEPTION 'The parent comment must belong to this output' USING ERRCODE='23514';
 END IF;
 IF (SELECT count(*) FROM mizan.source_files f JOIN mizan.processing_jobs j
    ON (j.tenant_id,j.entity_id,j.id)=(f.tenant_id,f.entity_id,f.scan_job_id)
    WHERE (f.tenant_id,f.entity_id)=(p_tenant,p_entity) AND f.id=ANY(p_files)
      AND f.uploaded_by=p_actor AND f.deleted_at IS NULL AND f.scan_status='clean' AND f.scanned_at IS NOT NULL
      AND j.job_type='file_scan' AND j.status='succeeded' AND j.input_references->>'sourceId'=f.id::text)<>cardinality(p_files) THEN
  RAISE EXCEPTION 'Each attachment must be a distinct available upload with a successful scan' USING ERRCODE='23514';
 END IF;
 INSERT INTO mizan.comments(tenant_id,entity_id,output_version_id,author_id,body,parent_id)
 VALUES(p_tenant,p_entity,p_output,p_actor,trim(p_body),p_parent) RETURNING id INTO comment_id;
 INSERT INTO mizan.attachments(tenant_id,entity_id,source_file_id,comment_id,attached_by)
 SELECT p_tenant,p_entity,file_id,comment_id,p_actor FROM unnest(p_files) AS file_id;
 INSERT INTO mizan.notifications(tenant_id,entity_id,output_version_id,recipient_id,notification_type,safe_template_code)
 SELECT p_tenant,p_entity,p_output,member,'output_comment','output_comment_added'
 FROM (
  SELECT o.preparer_id AS member
  UNION
  SELECT reviewer_id FROM mizan.review_submissions WHERE (tenant_id,entity_id,output_version_id)=(p_tenant,p_entity,p_output)
    AND withdrawn_at IS NULL AND content_fingerprint=o.content_fingerprint AND o.status='under_review'
 ) participants WHERE member<>p_actor AND mizan.has_permission(p_tenant,p_entity,member,'reports.view',bank);
 response=jsonb_build_object('id',comment_id,'reused',false);
 INSERT INTO mizan_private.operation_requests(tenant_id,request_key,actor_id,request_hash,response)
 VALUES(p_tenant,p_key,p_actor,request_hash,response);
 PERFORM mizan_private.append_audit(p_tenant,p_entity,p_actor,'output.commented','output',p_output,
   'Added a version-bound review comment',p_request,jsonb_build_object('commentId',comment_id,'attachmentCount',cardinality(p_files)));
 RETURN response;
END $$;

CREATE POLICY notification_recipient_read ON mizan.notifications AS RESTRICTIVE FOR SELECT
 USING (recipient_id::text=current_setting('mizan.user_id',true));
CREATE POLICY notification_recipient_update ON mizan.notifications AS RESTRICTIVE FOR UPDATE
 USING (recipient_id::text=current_setting('mizan.user_id',true))
 WITH CHECK (recipient_id::text=current_setting('mizan.user_id',true));
REVOKE ALL ON FUNCTION mizan_private.create_output_comment(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid[],uuid,uuid) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mizan_api_v1') THEN
  GRANT EXECUTE ON FUNCTION mizan_private.create_output_comment(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid[],uuid,uuid) TO mizan_api_v1;
  GRANT SELECT ON mizan.comments,mizan.notifications TO mizan_api_v1;
  GRANT UPDATE(read_at) ON mizan.notifications TO mizan_api_v1;
 END IF;
END $$;
