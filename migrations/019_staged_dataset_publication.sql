CREATE OR REPLACE FUNCTION mizan.guard_import() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.status='published' THEN RAISE EXCEPTION 'Published import is immutable' USING ERRCODE='55000'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND OLD.status='published' THEN
  RAISE EXCEPTION 'Published import is immutable' USING ERRCODE='55000';
 END IF;
 IF NEW.status='published' AND (
  NOT EXISTS(SELECT 1 FROM mizan.source_files f
   WHERE (f.tenant_id,f.entity_id,f.id)=(NEW.tenant_id,NEW.entity_id,NEW.source_file_id)
     AND f.scan_status='clean' AND f.deleted_at IS NULL)
  OR NOT EXISTS(SELECT 1 FROM mizan.quality_runs q
   WHERE (q.tenant_id,q.entity_id,q.import_batch_id)=(NEW.tenant_id,NEW.entity_id,NEW.id))
  OR EXISTS(SELECT 1 FROM mizan.quality_issues i JOIN mizan.quality_runs q
   ON (q.tenant_id,q.entity_id,q.id)=(i.tenant_id,i.entity_id,i.quality_run_id)
   WHERE (q.tenant_id,q.entity_id,q.import_batch_id)=(NEW.tenant_id,NEW.entity_id,NEW.id)
     AND i.severity='blocking' AND (
      NEW.parser_version<>'staged-tabular-v1' OR q.id=(
       SELECT latest.id FROM mizan.quality_runs latest
       WHERE (latest.tenant_id,latest.entity_id,latest.import_batch_id)=(NEW.tenant_id,NEW.entity_id,NEW.id)
       ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1
      )
     )
  )
 ) THEN RAISE EXCEPTION 'Clean source and successful quality review required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION mizan.guard_staged_row_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b mizan.import_batches;
BEGIN
 SELECT i.* INTO b FROM mizan.source_rows r
 JOIN mizan.import_batches i ON (i.tenant_id,i.entity_id,i.id)=(r.tenant_id,r.entity_id,r.import_batch_id)
 WHERE (r.tenant_id,r.entity_id,r.id)=(NEW.tenant_id,NEW.entity_id,NEW.source_row_id)
 FOR UPDATE OF i;
 IF b.parser_version='staged-tabular-v1' AND b.status<>'needs_review' THEN
  RAISE EXCEPTION 'Staged import row history is frozen' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER staged_transformation_open BEFORE INSERT ON mizan.row_transformations
 FOR EACH ROW EXECUTE FUNCTION mizan.guard_staged_row_revision();
CREATE TRIGGER staged_disposition_open BEFORE INSERT ON mizan.row_dispositions
 FOR EACH ROW EXECUTE FUNCTION mizan.guard_staged_row_revision();

CREATE FUNCTION mizan_private.publish_staged_dataset(
 p_actor uuid,p_session uuid,p_tenant uuid,p_entity uuid,p_batch uuid,p_dataset uuid,p_quality uuid,p_basis text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b mizan.import_batches; d mizan.dataset_versions; q mizan.quality_runs; typed_count bigint; source_count bigint;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 PERFORM mizan_private.require_active_scope(p_tenant,p_entity);
 IF NOT mizan.has_permission(p_tenant,p_entity,p_actor,'imports.manage') THEN
  RAISE EXCEPTION 'Import authority required' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_entity::text,42));
 SELECT * INTO STRICT b FROM mizan.import_batches
 WHERE (tenant_id,entity_id,id)=(p_tenant,p_entity,p_batch) FOR UPDATE;
 SELECT * INTO STRICT d FROM mizan.dataset_versions
 WHERE (tenant_id,entity_id,id)=(p_tenant,p_entity,p_dataset) FOR UPDATE;
 IF b.parser_version<>'staged-tabular-v1' OR b.status<>'needs_review' OR d.status<>'draft'
    OR b.period_id<>d.period_id OR b.data_type<>d.data_type
    OR b.data_type NOT IN ('trial_balance','general_ledger')
    OR (b.data_type='trial_balance' AND p_basis IS DISTINCT FROM 'period')
    OR (b.data_type='general_ledger' AND p_basis IS DISTINCT FROM 'not_applicable') THEN
  RAISE EXCEPTION 'Invalid staged publication' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM mizan.accounting_periods p JOIN mizan.entity_settings_versions s
   ON (s.tenant_id,s.entity_id,s.id)=(p.tenant_id,p.entity_id,p.settings_version_id)
   WHERE (p.tenant_id,p.entity_id,p.id)=(p_tenant,p_entity,b.period_id)
     AND p.status='open' AND s.currency_code=d.currency_code FOR UPDATE OF p) THEN
  RAISE EXCEPTION 'An open accounting period with matching currency is required' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM mizan.source_files f JOIN mizan.processing_jobs j
   ON (j.tenant_id,j.entity_id,j.id)=(f.tenant_id,f.entity_id,f.scan_job_id)
   WHERE (f.tenant_id,f.entity_id,f.id)=(p_tenant,p_entity,b.source_file_id) AND f.deleted_at IS NULL
     AND f.scan_status='clean' AND f.scanned_at IS NOT NULL AND j.job_type='file_scan'
     AND j.status='succeeded' AND j.input_references->>'sourceId'=f.id::text FOR SHARE OF f,j) THEN
  RAISE EXCEPTION 'Successful source scan required' USING ERRCODE='23514';
 END IF;
 SELECT * INTO STRICT q FROM mizan.quality_runs WHERE (tenant_id,entity_id,import_batch_id)=(p_tenant,p_entity,p_batch)
 ORDER BY created_at DESC,id DESC LIMIT 1;
 IF q.id IS DISTINCT FROM p_quality OR q.records_read=0 OR q.accepted<>q.records_read OR q.rejected<>0 OR q.excluded<>0
   OR q.content_fingerprint<>d.content_fingerprint
   OR EXISTS(SELECT 1 FROM mizan.quality_issues i
    WHERE (i.tenant_id,i.entity_id,i.quality_run_id)=(p_tenant,p_entity,q.id) AND i.severity='blocking') THEN
  RAISE EXCEPTION 'Complete latest validation required' USING ERRCODE='23514';
 END IF;
 IF (SELECT count(*) FROM mizan.dataset_imports x WHERE (x.tenant_id,x.entity_id,x.dataset_id)=(p_tenant,p_entity,p_dataset))<>1
    OR NOT EXISTS(SELECT 1 FROM mizan.dataset_imports x
     WHERE (x.tenant_id,x.entity_id,x.dataset_id,x.import_batch_id)=(p_tenant,p_entity,p_dataset,p_batch)) THEN
  RAISE EXCEPTION 'Dataset requires exactly this import' USING ERRCODE='23514';
 END IF;
 IF b.data_type='trial_balance' THEN
  SELECT count(*),count(DISTINCT source_row_id) INTO typed_count,source_count FROM mizan.trial_balance_rows
  WHERE (tenant_id,entity_id,dataset_id)=(p_tenant,p_entity,p_dataset);
 ELSE
  SELECT count(*),count(DISTINCT source_row_id) INTO typed_count,source_count FROM mizan.ledger_entries
  WHERE (tenant_id,entity_id,dataset_id)=(p_tenant,p_entity,p_dataset);
 END IF;
 IF typed_count<>source_count OR typed_count<>q.records_read OR typed_count<>(SELECT count(*) FROM mizan.source_rows
   WHERE (tenant_id,entity_id,import_batch_id)=(p_tenant,p_entity,p_batch)) THEN
  RAISE EXCEPTION 'Typed dataset must cover every source row' USING ERRCODE='23514';
 END IF;
 UPDATE mizan.import_batches SET status='published', complete_dataset=true, balance_basis=p_basis,
  published_at=clock_timestamp(), published_by=p_actor WHERE id=b.id;
 UPDATE mizan.dataset_versions SET status='published', complete_dataset=true,
  published_at=clock_timestamp(), published_by=p_actor WHERE id=d.id;
END $$;
REVOKE ALL ON FUNCTION mizan_private.publish_staged_dataset(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mizan_api_v1') THEN
  GRANT SELECT,INSERT ON mizan.ledger_entries TO mizan_api_v1;
  GRANT EXECUTE ON FUNCTION mizan_private.publish_staged_dataset(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text) TO mizan_api_v1;
 END IF;
END $$;
