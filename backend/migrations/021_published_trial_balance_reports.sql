CREATE FUNCTION mizan_private.publish_trial_balance_mapping(
 p_actor uuid,p_session uuid,p_tenant uuid,p_entity uuid,p_dataset uuid,p_mapping uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE mapping mizan.mapping_versions; expected bigint; actual bigint;
BEGIN
 PERFORM mizan_private.require_recent_actor(p_actor,p_session);
 PERFORM mizan_private.require_active_scope(p_tenant,p_entity);
 IF NOT mizan.has_permission(p_tenant,p_entity,p_actor,'outputs.prepare') THEN
  RAISE EXCEPTION 'Report preparation authority required' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_entity::text,42));
 SELECT * INTO STRICT mapping FROM mizan.mapping_versions
 WHERE (tenant_id,entity_id,id)=(p_tenant,p_entity,p_mapping) FOR UPDATE;
 IF mapping.created_by<>p_actor OR mapping.status<>'draft' THEN
  RAISE EXCEPTION 'A draft mapping owned by the preparer is required' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM mizan.dataset_versions d
  JOIN mizan.accounting_periods p ON (p.tenant_id,p.entity_id,p.id)=(d.tenant_id,d.entity_id,d.period_id)
  JOIN mizan.entity_settings_versions s ON (s.tenant_id,s.entity_id,s.id)=(p.tenant_id,p.entity_id,p.settings_version_id)
  JOIN mizan.dataset_imports x ON (x.tenant_id,x.entity_id,x.dataset_id)=(d.tenant_id,d.entity_id,d.id)
  JOIN mizan.import_batches b ON (b.tenant_id,b.entity_id,b.id)=(x.tenant_id,x.entity_id,x.import_batch_id)
  JOIN mizan.source_files f ON (f.tenant_id,f.entity_id,f.id)=(b.tenant_id,b.entity_id,b.source_file_id)
  JOIN mizan.processing_jobs j ON (j.tenant_id,j.entity_id,j.id)=(f.tenant_id,f.entity_id,f.scan_job_id)
  WHERE (d.tenant_id,d.entity_id,d.id)=(p_tenant,p_entity,p_dataset)
    AND d.data_type='trial_balance' AND d.status='published' AND d.complete_dataset
    AND p.status='open' AND s.currency_code=d.currency_code AND b.period_id=d.period_id
    AND b.parser_version='staged-tabular-v1' AND b.data_type=d.data_type AND b.status='published'
    AND b.complete_dataset AND b.balance_basis='period'
    AND f.deleted_at IS NULL AND f.scan_status='clean' AND f.scanned_at IS NOT NULL
    AND j.job_type='file_scan' AND j.status='succeeded' AND j.input_references->>'sourceId'=f.id::text
  FOR SHARE OF p,f,j
 ) THEN
  RAISE EXCEPTION 'Published, complete and scanned period source required' USING ERRCODE='23514';
 END IF;
 SELECT count(*) INTO expected FROM mizan.trial_balance_rows
 WHERE (tenant_id,entity_id,dataset_id)=(p_tenant,p_entity,p_dataset);
 SELECT count(*) INTO actual FROM mizan.account_mappings
 WHERE (tenant_id,entity_id,mapping_version_id)=(p_tenant,p_entity,p_mapping);
 IF expected=0 OR actual<>expected OR EXISTS(
  SELECT 1 FROM mizan.trial_balance_rows r
  JOIN mizan.accounts a ON (a.tenant_id,a.entity_id,a.id)=(r.tenant_id,r.entity_id,r.account_id)
  WHERE (r.tenant_id,r.entity_id,r.dataset_id)=(p_tenant,p_entity,p_dataset)
    AND (SELECT count(*) FROM mizan.account_mappings m JOIN mizan.report_line_items i
       ON (i.tenant_id,i.entity_id,i.id)=(m.tenant_id,m.entity_id,m.line_item_id)
       WHERE (m.tenant_id,m.entity_id,m.mapping_version_id,m.account_id)=(p_tenant,p_entity,p_mapping,r.account_id)
         AND m.weight=1 AND i.statement_type='classified_trial_balance'
         AND split_part(split_part(i.code,':',2),'.',1)=a.account_type
         AND i.code IN ('classified-tb-draft-v1:asset.current','classified-tb-draft-v1:asset.noncurrent',
           'classified-tb-draft-v1:asset.contra','classified-tb-draft-v1:liability.current',
           'classified-tb-draft-v1:liability.noncurrent','classified-tb-draft-v1:equity',
           'classified-tb-draft-v1:income','classified-tb-draft-v1:expense.cost',
           'classified-tb-draft-v1:expense.operating','classified-tb-draft-v1:expense.tax'))<>1
 ) THEN
  RAISE EXCEPTION 'Exactly one valid classification per source account is required' USING ERRCODE='23514';
 END IF;
 UPDATE mizan.mapping_versions SET status='published',published_at=clock_timestamp() WHERE id=mapping.id;
END $$;

REVOKE ALL ON FUNCTION mizan_private.publish_trial_balance_mapping(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mizan_api_v1') THEN
  GRANT EXECUTE ON FUNCTION mizan_private.publish_trial_balance_mapping(uuid,uuid,uuid,uuid,uuid,uuid) TO mizan_api_v1;
 END IF;
END $$;
