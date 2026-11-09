-- Defense in depth; trusted server must derive context after real authentication.
CREATE FUNCTION mizan.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Immutable %: create a new version instead',TG_TABLE_NAME USING ERRCODE='55000'; END $$;
CREATE FUNCTION mizan.guard_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)->'id') IS DISTINCT FROM (to_jsonb(OLD)->'id') OR
    (to_jsonb(NEW)->'tenant_id') IS DISTINCT FROM (to_jsonb(OLD)->'tenant_id') OR
    (to_jsonb(NEW)->'entity_id') IS DISTINCT FROM (to_jsonb(OLD)->'entity_id') OR
    (to_jsonb(NEW)->'created_at') IS DISTINCT FROM (to_jsonb(OLD)->'created_at') THEN
  RAISE EXCEPTION 'Record identity and scope are immutable' USING ERRCODE='23514';
 END IF; RETURN NEW;
END $$;
CREATE FUNCTION mizan.guard_columns() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE col text;
BEGIN FOREACH col IN ARRAY TG_ARGV LOOP
 IF to_jsonb(NEW)->col IS DISTINCT FROM to_jsonb(OLD)->col THEN RAISE EXCEPTION 'Original % cannot change',col USING ERRCODE='55000'; END IF;
END LOOP; RETURN NEW; END $$;
CREATE FUNCTION mizan.guard_currency_precision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE col text; precision smallint; value numeric;
BEGIN
 SELECT minor_units INTO STRICT precision FROM mizan.currencies WHERE code=NEW.currency_code;
 FOREACH col IN ARRAY TG_ARGV LOOP value=(to_jsonb(NEW)->>col)::numeric;
  IF value IS NOT NULL AND value<>round(value,precision) THEN RAISE EXCEPTION 'Invalid currency precision: %',col USING ERRCODE='23514'; END IF;
 END LOOP; RETURN NEW;
END $$;
CREATE FUNCTION mizan.guard_dataset_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb; parent_status text; parent_id uuid;
BEGIN
 row_data=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 parent_id=(row_data->>TG_ARGV[0])::uuid;
 SELECT status INTO parent_status FROM mizan.dataset_versions WHERE tenant_id=(row_data->>'tenant_id')::uuid AND entity_id=(row_data->>'entity_id')::uuid AND id=parent_id FOR UPDATE;
 IF parent_status='published' THEN RAISE EXCEPTION 'Published dataset is immutable' USING ERRCODE='55000'; END IF;
 IF TG_OP='UPDATE' AND to_jsonb(OLD)->TG_ARGV[0] IS DISTINCT FROM row_data->TG_ARGV[0] THEN RAISE EXCEPTION 'Cannot reparent dataset rows' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE FUNCTION mizan.guard_output_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb; parent_status text;
BEGIN
 row_data=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 SELECT status INTO parent_status FROM mizan.output_versions WHERE tenant_id=(row_data->>'tenant_id')::uuid AND entity_id=(row_data->>'entity_id')::uuid AND id=(row_data->>TG_ARGV[0])::uuid FOR UPDATE;
 IF parent_status NOT IN ('draft','rejected','withdrawn') THEN RAISE EXCEPTION 'Output is frozen for review/approval' USING ERRCODE='55000'; END IF;
 IF TG_OP='UPDATE' AND to_jsonb(OLD)->TG_ARGV[0] IS DISTINCT FROM row_data->TG_ARGV[0] THEN RAISE EXCEPTION 'Cannot reparent output rows' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE FUNCTION mizan.has_permission(p_tenant uuid,p_entity uuid,p_user uuid,p_code text,p_bank uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(
 SELECT 1 FROM mizan.memberships m JOIN mizan.access_grants g ON g.tenant_id=m.tenant_id AND g.membership_id=m.id
 WHERE m.tenant_id=p_tenant AND m.user_id=p_user AND m.status='active' AND g.permission_code=p_code AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>now())
 AND (g.entity_id IS NULL OR g.entity_id=p_entity) AND (g.bank_account_id IS NULL OR g.bank_account_id=p_bank)
 UNION ALL
 SELECT 1 FROM mizan.memberships m JOIN mizan.membership_roles g ON g.tenant_id=m.tenant_id AND g.membership_id=m.id JOIN mizan.role_permissions rp ON rp.role_code=g.role_code
 WHERE m.tenant_id=p_tenant AND m.user_id=p_user AND m.status='active' AND g.revoked_at IS NULL AND rp.permission_code=p_code
 AND (g.entity_id IS NULL OR g.entity_id=p_entity) AND (g.bank_account_id IS NULL OR g.bank_account_id=p_bank));
$$;
CREATE FUNCTION mizan.guard_invitation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.accepted_at IS NOT NULL OR OLD.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Invitation already consumed or revoked' USING ERRCODE='23514'; END IF;
 IF NEW.accepted_at IS NOT NULL AND (OLD.expires_at<=now() OR NEW.accepted_at>now()) THEN RAISE EXCEPTION 'Invitation expired' USING ERRCODE='23514'; END IF;
 IF OLD.token_hash<>NEW.token_hash OR OLD.expires_at<>NEW.expires_at OR OLD.email<>NEW.email THEN RAISE EXCEPTION 'Issue a new invitation instead' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invitation_single_use BEFORE UPDATE ON mizan.invitations FOR EACH ROW EXECUTE FUNCTION mizan.guard_invitation();
CREATE FUNCTION mizan.guard_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN IF OLD.status='locked' THEN RAISE EXCEPTION 'Locked period is immutable' USING ERRCODE='55000'; END IF; RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND OLD.status='locked' THEN RAISE EXCEPTION 'Create a new period version with a reopening reason' USING ERRCODE='55000'; END IF;
 IF TG_OP='INSERT' AND NEW.predecessor_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mizan.accounting_periods p WHERE p.tenant_id=NEW.tenant_id AND p.entity_id=NEW.entity_id AND p.id=NEW.predecessor_id AND p.logical_period_id=NEW.logical_period_id AND p.version<NEW.version) THEN RAISE EXCEPTION 'Invalid prior period version' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER locked_period BEFORE INSERT OR UPDATE OR DELETE ON mizan.accounting_periods FOR EACH ROW EXECUTE FUNCTION mizan.guard_period();
CREATE FUNCTION mizan.guard_period_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM mizan.accounting_periods p WHERE p.tenant_id=NEW.tenant_id AND p.entity_id=NEW.entity_id AND p.id=NEW.period_id AND p.status='locked') THEN RAISE EXCEPTION 'Period is locked; reopen with a new version' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION mizan.guard_import() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN IF OLD.status='published' THEN RAISE EXCEPTION 'Published import is immutable' USING ERRCODE='55000'; END IF; RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND OLD.status='published' THEN RAISE EXCEPTION 'Published import is immutable' USING ERRCODE='55000'; END IF;
 IF NEW.status='published' AND (NOT EXISTS(SELECT 1 FROM mizan.source_files f WHERE f.tenant_id=NEW.tenant_id AND f.entity_id=NEW.entity_id AND f.id=NEW.source_file_id AND f.scan_status='clean' AND f.deleted_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM mizan.quality_runs q WHERE q.tenant_id=NEW.tenant_id AND q.entity_id=NEW.entity_id AND q.import_batch_id=NEW.id)
 OR EXISTS(SELECT 1 FROM mizan.quality_issues i JOIN mizan.quality_runs q ON (q.tenant_id,q.entity_id,q.id)=(i.tenant_id,i.entity_id,i.quality_run_id) WHERE q.tenant_id=NEW.tenant_id AND q.entity_id=NEW.entity_id AND q.import_batch_id=NEW.id AND i.severity='blocking')) THEN
 RAISE EXCEPTION 'Clean source and successful quality review required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_import BEFORE INSERT OR UPDATE OR DELETE ON mizan.import_batches FOR EACH ROW EXECUTE FUNCTION mizan.guard_import();
CREATE FUNCTION mizan.guard_dataset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN IF OLD.status='published' THEN RAISE EXCEPTION 'Published dataset is immutable' USING ERRCODE='55000'; END IF; RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND OLD.status='published' THEN RAISE EXCEPTION 'Published dataset is immutable' USING ERRCODE='55000'; END IF;
 IF NEW.status='published' AND (NOT EXISTS(SELECT 1 FROM mizan.dataset_imports x WHERE x.tenant_id=NEW.tenant_id AND x.entity_id=NEW.entity_id AND x.dataset_id=NEW.id)
 OR EXISTS(SELECT 1 FROM mizan.dataset_imports x JOIN mizan.import_batches b ON (b.tenant_id,b.entity_id,b.id)=(x.tenant_id,x.entity_id,x.import_batch_id) WHERE x.tenant_id=NEW.tenant_id AND x.entity_id=NEW.entity_id AND x.dataset_id=NEW.id AND b.status<>'published')) THEN RAISE EXCEPTION 'Dataset requires published imports' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER published_dataset BEFORE INSERT OR UPDATE OR DELETE ON mizan.dataset_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_dataset();
CREATE FUNCTION mizan.guard_mapping() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN IF OLD.status='published' THEN RAISE EXCEPTION 'Published mapping is immutable' USING ERRCODE='55000'; END IF; RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND OLD.status='published' THEN RAISE EXCEPTION 'Published mapping is immutable' USING ERRCODE='55000'; END IF;
 IF NEW.status='published' AND (NOT EXISTS(SELECT 1 FROM mizan.account_mappings m WHERE (m.tenant_id,m.entity_id,m.mapping_version_id)=(NEW.tenant_id,NEW.entity_id,NEW.id)) OR EXISTS(SELECT 1 FROM mizan.account_mappings m WHERE (m.tenant_id,m.entity_id,m.mapping_version_id)=(NEW.tenant_id,NEW.entity_id,NEW.id) GROUP BY account_id HAVING sum(weight)<>1 OR (count(*)>1 AND bool_or(split_rule IS NULL)))) THEN RAISE EXCEPTION 'Mapping splits must total one and explain their rule' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER published_mapping BEFORE INSERT OR UPDATE OR DELETE ON mizan.mapping_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_mapping();
CREATE FUNCTION mizan.guard_mapping_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r jsonb; s text;
BEGIN
 r=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 SELECT status INTO s FROM mizan.mapping_versions WHERE tenant_id=(r->>'tenant_id')::uuid AND entity_id=(r->>'entity_id')::uuid AND id=(r->>'mapping_version_id')::uuid FOR UPDATE;
 IF s='published' THEN RAISE EXCEPTION 'Published mapping cannot change' USING ERRCODE='55000'; END IF;
 IF TG_OP='UPDATE' AND NEW.mapping_version_id<>OLD.mapping_version_id THEN RAISE EXCEPTION 'Cannot reparent mapping' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER mapping_editable BEFORE INSERT OR UPDATE OR DELETE ON mizan.account_mappings FOR EACH ROW EXECUTE FUNCTION mizan.guard_mapping_child();
CREATE FUNCTION mizan.guard_output() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN IF OLD.status IN ('under_review','approved_locked') THEN RAISE EXCEPTION 'Frozen output' USING ERRCODE='55000'; END IF; RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND OLD.status='approved_locked' THEN RAISE EXCEPTION 'Approved output cannot be changed; create a new version' USING ERRCODE='55000'; END IF;
 IF TG_OP='UPDATE' AND OLD.status='under_review' AND (to_jsonb(NEW)-ARRAY['status','locked_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','locked_at']) THEN RAISE EXCEPTION 'Submitted content cannot change' USING ERRCODE='55000'; END IF;
 IF NEW.status='approved_locked' AND NOT EXISTS(SELECT 1 FROM mizan.review_decisions d WHERE (d.tenant_id,d.entity_id,d.output_version_id)=(NEW.tenant_id,NEW.entity_id,NEW.id) AND d.decision='approve' AND d.reviewed_fingerprint=NEW.content_fingerprint) THEN RAISE EXCEPTION 'A valid approval decision is required' USING ERRCODE='23514'; END IF;
 IF NEW.status='under_review' AND NOT EXISTS(SELECT 1 FROM mizan.review_submissions s WHERE (s.tenant_id,s.entity_id,s.output_version_id)=(NEW.tenant_id,NEW.entity_id,NEW.id) AND s.content_fingerprint=NEW.content_fingerprint AND s.withdrawn_at IS NULL) THEN RAISE EXCEPTION 'Submit a fixed version for review first' USING ERRCODE='23514'; END IF;
 IF NEW.predecessor_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mizan.output_versions p WHERE (p.tenant_id,p.entity_id,p.id)=(NEW.tenant_id,NEW.entity_id,NEW.predecessor_id) AND p.logical_output_id=NEW.logical_output_id AND p.version<NEW.version AND p.status='approved_locked') THEN RAISE EXCEPTION 'Invalid reopened version' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER output_version_guard BEFORE INSERT OR UPDATE OR DELETE ON mizan.output_versions FOR EACH ROW EXECUTE FUNCTION mizan.guard_output();
CREATE FUNCTION mizan.submit_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o mizan.output_versions;
BEGIN
 SELECT * INTO STRICT o FROM mizan.output_versions WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.output_version_id) FOR UPDATE;
 IF o.status NOT IN ('draft','ready_for_review','rejected','withdrawn') OR NEW.content_fingerprint<>o.content_fingerprint OR NEW.submitted_by<>o.preparer_id OR NEW.reviewer_id=o.preparer_id THEN RAISE EXCEPTION 'Invalid review submission or reviewer' USING ERRCODE='23514'; END IF;
 IF NOT mizan.has_permission(NEW.tenant_id,NEW.entity_id,NEW.reviewer_id,'outputs.approve') THEN RAISE EXCEPTION 'Reviewer has no approval grant' USING ERRCODE='42501'; END IF;
 UPDATE mizan.output_versions SET status='under_review',submitted_fingerprint=NEW.content_fingerprint,submitted_at=now() WHERE id=o.id;
 RETURN NEW;
END $$;
CREATE TRIGGER review_submission AFTER INSERT ON mizan.review_submissions FOR EACH ROW EXECUTE FUNCTION mizan.submit_review();
CREATE FUNCTION mizan.review_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o mizan.output_versions; s mizan.review_submissions; needed text; r mizan.reconciliations; bank_adjustment numeric; book_adjustment numeric;
BEGIN
 SELECT * INTO STRICT o FROM mizan.output_versions WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.output_version_id) FOR UPDATE;
 SELECT * INTO STRICT s FROM mizan.review_submissions WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.submission_id);
 IF s.output_version_id<>o.id OR s.reviewer_id<>NEW.actor_id OR NEW.actor_id=o.preparer_id OR o.status<>'under_review' OR s.withdrawn_at IS NOT NULL OR NEW.reviewed_fingerprint<>o.content_fingerprint OR NEW.reviewed_fingerprint<>s.content_fingerprint THEN RAISE EXCEPTION 'Stale, self, withdrawn or unauthorized review' USING ERRCODE='23514'; END IF;
 IF NOT mizan.has_permission(NEW.tenant_id,NEW.entity_id,NEW.actor_id,'outputs.approve') THEN RAISE EXCEPTION 'Approval permission required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM mizan.user_sessions u WHERE u.id=NEW.mfa_session_id AND u.user_id=NEW.actor_id AND u.revoked_at IS NULL AND u.expires_at>now() AND u.mfa_verified_at IS NOT NULL) THEN RAISE EXCEPTION 'Active MFA session required' USING ERRCODE='42501'; END IF;
 IF NEW.decision='approve' THEN
  FOREACH needed IN ARRAY ARRAY['scope','completeness','balance','mapping'] LOOP
   IF NOT EXISTS(SELECT 1 FROM mizan.validation_results v WHERE (v.tenant_id,v.entity_id,v.output_version_id)=(o.tenant_id,o.entity_id,o.id) AND v.validated_fingerprint=o.content_fingerprint AND v.code=needed AND v.passed) THEN RAISE EXCEPTION 'Required validation missing: %',needed USING ERRCODE='23514'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM mizan.validation_results v WHERE (v.tenant_id,v.entity_id,v.output_version_id)=(o.tenant_id,o.entity_id,o.id) AND v.validated_fingerprint=o.content_fingerprint AND v.severity='blocking' AND NOT v.passed) THEN RAISE EXCEPTION 'Blocking validation failed' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM mizan.output_datasets x WHERE (x.tenant_id,x.entity_id,x.output_version_id)=(o.tenant_id,o.entity_id,o.id)) OR EXISTS(SELECT 1 FROM mizan.output_datasets x JOIN mizan.dataset_versions d ON (d.tenant_id,d.entity_id,d.id)=(x.tenant_id,x.entity_id,x.dataset_id) WHERE (x.tenant_id,x.entity_id,x.output_version_id)=(o.tenant_id,o.entity_id,o.id) AND (d.status<>'published' OR NOT d.complete_dataset OR d.currency_code<>o.currency_code)) THEN RAISE EXCEPTION 'Complete published in-currency datasets required' USING ERRCODE='23514'; END IF;
  IF o.output_type='reconciliation' THEN
   SELECT * INTO STRICT r FROM mizan.reconciliations WHERE (tenant_id,entity_id,output_version_id)=(o.tenant_id,o.entity_id,o.id);
   IF NOT r.bank_complete OR NOT r.book_complete OR r.bank_opening_balance IS NULL OR r.bank_closing_balance IS NULL OR r.book_opening_balance IS NULL OR r.book_closing_balance IS NULL THEN RAISE EXCEPTION 'Reconciliation sources incomplete' USING ERRCODE='23514'; END IF;
   IF r.bank_opening_balance+coalesce((SELECT sum(signed_amount) FROM mizan.bank_transactions WHERE (tenant_id,entity_id,dataset_id,bank_account_id)=(r.tenant_id,r.entity_id,r.bank_dataset_id,r.bank_account_id) AND posting_date<=r.cutoff_date),0)<>r.bank_closing_balance OR r.book_opening_balance+coalesce((SELECT sum(signed_amount) FROM mizan.book_transactions WHERE (tenant_id,entity_id,dataset_id,bank_account_id)=(r.tenant_id,r.entity_id,r.book_dataset_id,r.bank_account_id) AND posting_date<=r.cutoff_date),0)<>r.book_closing_balance THEN RAISE EXCEPTION 'Balance roll-forward failed' USING ERRCODE='23514'; END IF;
   SELECT coalesce(sum(i.signed_amount) FILTER(WHERE i.effect_side='bank'),0),coalesce(sum(i.signed_amount) FILTER(WHERE i.effect_side='books'),0) INTO bank_adjustment,book_adjustment FROM mizan.reconciliation_items x JOIN mizan.reconciling_items i ON (i.tenant_id,i.entity_id,i.id)=(x.tenant_id,x.entity_id,x.item_id) WHERE (x.tenant_id,x.entity_id,x.reconciliation_id)=(r.tenant_id,r.entity_id,r.id) AND x.status='outstanding';
   IF r.bank_closing_balance+bank_adjustment<>r.book_closing_balance+book_adjustment THEN RAISE EXCEPTION 'Unexplained reconciliation difference' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM mizan.reconciliation_items x JOIN mizan.reconciling_items i ON (i.tenant_id,i.entity_id,i.id)=(x.tenant_id,x.entity_id,x.item_id) WHERE (x.tenant_id,x.entity_id,x.reconciliation_id)=(r.tenant_id,r.entity_id,r.id) AND x.status='outstanding' AND NOT EXISTS(SELECT 1 FROM mizan.attachments a WHERE (a.tenant_id,a.entity_id,a.item_id)=(i.tenant_id,i.entity_id,i.id))) THEN RAISE EXCEPTION 'Difference evidence required' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM mizan.proposed_entries p JOIN mizan.reconciliation_items x ON (x.tenant_id,x.entity_id,x.item_id,x.reconciliation_id)=(p.tenant_id,p.entity_id,p.item_id,p.reconciliation_id) WHERE (p.tenant_id,p.entity_id,p.reconciliation_id)=(r.tenant_id,r.entity_id,r.id) AND p.recorded_ledger_entry_id IS NOT NULL AND x.status='outstanding') THEN RAISE EXCEPTION 'Imported adjustment would be counted twice' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER review_decision BEFORE INSERT ON mizan.review_decisions FOR EACH ROW EXECUTE FUNCTION mizan.review_decision_guard();
CREATE FUNCTION mizan.apply_review_decision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN UPDATE mizan.output_versions SET status=CASE NEW.decision WHEN 'approve' THEN 'approved_locked' ELSE 'rejected' END,locked_at=CASE WHEN NEW.decision='approve' THEN now() END WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.output_version_id);RETURN NEW;END $$;
CREATE TRIGGER apply_review_decision AFTER INSERT ON mizan.review_decisions FOR EACH ROW EXECUTE FUNCTION mizan.apply_review_decision();

CREATE FUNCTION mizan.guard_reconciliation_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r jsonb; rec_id uuid; output_id uuid; s text; group_id uuid;
BEGIN
 r=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_TABLE_NAME IN ('match_groups','reconciliation_items','reconciliation_rule_bindings','proposed_entries') THEN rec_id=(r->>'reconciliation_id')::uuid;
 ELSIF TG_TABLE_NAME='proposed_entry_lines' THEN SELECT reconciliation_id INTO rec_id FROM mizan.proposed_entries WHERE id=(r->>'proposed_entry_id')::uuid AND tenant_id=(r->>'tenant_id')::uuid AND entity_id=(r->>'entity_id')::uuid;
 ELSE group_id=(r->>'match_group_id')::uuid; SELECT reconciliation_id INTO rec_id FROM mizan.match_groups WHERE id=group_id AND tenant_id=(r->>'tenant_id')::uuid AND entity_id=(r->>'entity_id')::uuid; END IF;
 SELECT v.id,v.status INTO output_id,s FROM mizan.reconciliations x JOIN mizan.output_versions v ON (v.tenant_id,v.entity_id,v.id)=(x.tenant_id,x.entity_id,x.output_version_id) WHERE (x.tenant_id,x.entity_id,x.id)=((r->>'tenant_id')::uuid,(r->>'entity_id')::uuid,rec_id) FOR UPDATE OF v;
 IF s NOT IN ('draft','rejected','withdrawn') THEN RAISE EXCEPTION 'Reconciliation is frozen' USING ERRCODE='55000'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(OLD)->'reconciliation_id' IS DISTINCT FROM r->'reconciliation_id' OR to_jsonb(OLD)->'match_group_id' IS DISTINCT FROM r->'match_group_id' OR to_jsonb(OLD)->'proposed_entry_id' IS DISTINCT FROM r->'proposed_entry_id') THEN RAISE EXCEPTION 'Cannot reparent decisions' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE FUNCTION mizan.guard_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b numeric; k numeric; used_bank numeric; used_book numeric; g mizan.match_groups; r mizan.reconciliations;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reverse allocations with an actor and reason' USING ERRCODE='55000'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-ARRAY['reversed_at','reversed_by','reversal_reason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['reversed_at','reversed_by','reversal_reason']) OR OLD.reversed_at IS NOT NULL OR NEW.reversed_at IS NULL THEN RAISE EXCEPTION 'Only one documented reversal is allowed' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO STRICT g FROM mizan.match_groups WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.match_group_id);
 IF g.status<>'confirmed' THEN RAISE EXCEPTION 'Confirm the match group before allocating' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT r FROM mizan.reconciliations WHERE (tenant_id,entity_id,id)=(g.tenant_id,g.entity_id,g.reconciliation_id);
 -- Row locks serialize allocations of the same bank and book transaction, across groups.
 SELECT signed_amount INTO STRICT b FROM mizan.bank_transactions WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.bank_transaction_id) AND dataset_id=r.bank_dataset_id AND posting_date<=r.cutoff_date FOR UPDATE;
 SELECT signed_amount INTO STRICT k FROM mizan.book_transactions WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.book_transaction_id) AND dataset_id=r.book_dataset_id AND posting_date<=r.cutoff_date FOR UPDATE;
 IF sign(b)<>sign(k) THEN RAISE EXCEPTION 'Opposite-sign transactions cannot be matched' USING ERRCODE='23514'; END IF;
 SELECT coalesce(sum(amount),0) INTO used_bank FROM mizan.allocations WHERE (tenant_id,entity_id,bank_transaction_id)=(NEW.tenant_id,NEW.entity_id,NEW.bank_transaction_id) AND reversed_at IS NULL;
 SELECT coalesce(sum(amount),0) INTO used_book FROM mizan.allocations WHERE (tenant_id,entity_id,book_transaction_id)=(NEW.tenant_id,NEW.entity_id,NEW.book_transaction_id) AND reversed_at IS NULL;
 IF NEW.amount+used_bank>abs(b) OR NEW.amount+used_book>abs(k) THEN RAISE EXCEPTION 'Allocation exceeds available amount' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM mizan.match_group_members m WHERE (m.tenant_id,m.entity_id,m.match_group_id)=(NEW.tenant_id,NEW.entity_id,NEW.match_group_id) AND m.bank_transaction_id=NEW.bank_transaction_id) OR NOT EXISTS(SELECT 1 FROM mizan.match_group_members m WHERE (m.tenant_id,m.entity_id,m.match_group_id)=(NEW.tenant_id,NEW.entity_id,NEW.match_group_id) AND m.book_transaction_id=NEW.book_transaction_id) THEN RAISE EXCEPTION 'Allocation must use group members' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bounded_allocation BEFORE INSERT OR UPDATE OR DELETE ON mizan.allocations FOR EACH ROW EXECUTE FUNCTION mizan.guard_allocation();
CREATE FUNCTION mizan.guard_match_group() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rule mizan.matching_rule_versions; banks integer; books integer;
BEGIN
 IF TG_OP='DELETE' THEN IF EXISTS(SELECT 1 FROM mizan.allocations WHERE match_group_id=OLD.id) THEN RAISE EXCEPTION 'Keep match decision history' USING ERRCODE='55000'; END IF; RETURN OLD; END IF;
 IF NEW.automatic THEN SELECT * INTO STRICT rule FROM mizan.matching_rule_versions WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.rule_version_id); IF NOT rule.auto_confirm OR rule.approved_at IS NULL THEN RAISE EXCEPTION 'Automatic matching rule not approved' USING ERRCODE='23514'; END IF; END IF;
 IF NEW.status IN ('unmatched','rejected') AND EXISTS(SELECT 1 FROM mizan.allocations a WHERE a.match_group_id=NEW.id AND a.reversed_at IS NULL) THEN RAISE EXCEPTION 'Reverse active allocations first' USING ERRCODE='23514'; END IF;
 IF NEW.status='confirmed' THEN
  SELECT count(bank_transaction_id),count(book_transaction_id) INTO banks,books FROM mizan.match_group_members WHERE match_group_id=NEW.id;
  IF banks=0 OR books=0 OR (NEW.match_kind='one_to_one' AND (banks<>1 OR books<>1)) OR (NEW.match_kind='one_to_many' AND (banks<>1 OR books<2)) OR (NEW.match_kind='many_to_one' AND (banks<2 OR books<>1)) THEN RAISE EXCEPTION 'Invalid group cardinality' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER match_group_guard BEFORE INSERT OR UPDATE OR DELETE ON mizan.match_groups FOR EACH ROW EXECUTE FUNCTION mizan.guard_match_group();
CREATE FUNCTION mizan.guard_carry_forward() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_cutoff date; new_cutoff date;
BEGIN
 IF NEW.carried_from_reconciliation_id IS NOT NULL THEN
  SELECT r.cutoff_date INTO old_cutoff FROM mizan.reconciliations r JOIN mizan.output_versions v ON (v.tenant_id,v.entity_id,v.id)=(r.tenant_id,r.entity_id,r.output_version_id) JOIN mizan.reconciliation_items x ON (x.tenant_id,x.entity_id,x.reconciliation_id)=(r.tenant_id,r.entity_id,r.id)
  WHERE (r.tenant_id,r.entity_id,r.id)=(NEW.tenant_id,NEW.entity_id,NEW.carried_from_reconciliation_id) AND r.bank_account_id=NEW.bank_account_id AND r.currency_code=NEW.currency_code AND v.status='approved_locked' AND x.item_id=NEW.item_id AND x.status='outstanding';
  SELECT cutoff_date INTO new_cutoff FROM mizan.reconciliations WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.reconciliation_id);
  IF old_cutoff IS NULL OR old_cutoff>=new_cutoff THEN RAISE EXCEPTION 'Carry-forward requires an approved earlier outstanding item' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER carry_forward_guard BEFORE INSERT OR UPDATE ON mizan.reconciliation_items FOR EACH ROW EXECUTE FUNCTION mizan.guard_carry_forward();
CREATE FUNCTION mizan.apply_usage_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE mizan.usage_buckets SET reserved=reserved+CASE NEW.event_type WHEN 'reserve' THEN NEW.quantity ELSE -NEW.quantity END,
 consumed=consumed+CASE NEW.event_type WHEN 'consume' THEN NEW.quantity ELSE 0 END WHERE (tenant_id,id)=(NEW.tenant_id,NEW.bucket_id);
 RETURN NEW;
END $$;
CREATE TRIGGER atomic_usage AFTER INSERT ON mizan.usage_events FOR EACH ROW EXECUTE FUNCTION mizan.apply_usage_event();
CREATE FUNCTION mizan.guard_trade_settlement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total numeric; paid numeric; code text;
BEGIN
 SELECT amount,currency_code INTO STRICT total,code FROM mizan.trade_items WHERE (tenant_id,entity_id,id)=(NEW.tenant_id,NEW.entity_id,NEW.trade_item_id) FOR UPDATE;
 SELECT coalesce(sum(amount),0) INTO paid FROM mizan.trade_settlements WHERE (tenant_id,entity_id,trade_item_id)=(NEW.tenant_id,NEW.entity_id,NEW.trade_item_id);
 IF NEW.currency_code<>code OR paid+NEW.amount>total THEN RAISE EXCEPTION 'Invalid or excessive trade settlement' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER trade_settlement_guard BEFORE INSERT ON mizan.trade_settlements FOR EACH ROW EXECUTE FUNCTION mizan.guard_trade_settlement();
CREATE FUNCTION mizan.guard_provider_run() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE service text;
BEGIN service=CASE WHEN TG_TABLE_NAME='ocr_runs' THEN 'ocr' ELSE 'ai' END;
 IF NOT EXISTS(SELECT 1 FROM mizan.provider_approvals a WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.provider_approval_id AND a.service_type=service AND a.revoked_at IS NULL AND (service<>'ai' OR a.no_training)) THEN RAISE EXCEPTION 'Approved provider and processing policy required' USING ERRCODE='42501'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER approved_ocr_provider BEFORE INSERT ON mizan.ocr_runs FOR EACH ROW EXECUTE FUNCTION mizan.guard_provider_run();
CREATE TRIGGER approved_ai_provider BEFORE INSERT ON mizan.ai_narrative_runs FOR EACH ROW EXECUTE FUNCTION mizan.guard_provider_run();

-- Guards for dependencies whose output is reached through a parent record.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['import_batches','dataset_versions','output_versions','budget_versions','planning_versions'] LOOP
  EXECUTE format('CREATE TRIGGER period_open BEFORE INSERT OR UPDATE ON mizan.%I FOR EACH ROW EXECUTE FUNCTION mizan.guard_period_reference()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['match_groups','match_group_members','allocations','reconciliation_items','reconciliation_rule_bindings','proposed_entries','proposed_entry_lines'] LOOP
  EXECUTE format('CREATE TRIGGER a_reconciliation_editable BEFORE INSERT OR UPDATE OR DELETE ON mizan.%I FOR EACH ROW EXECUTE FUNCTION mizan.guard_reconciliation_change()',t);
 END LOOP;
END $$;

INSERT INTO mizan.currencies(code,name,minor_units) VALUES
 ('USD','US dollar',2),('ILS','Israeli new shekel',2),('EUR','Euro',2),('GBP','Pound sterling',2),('JPY','Japanese yen',0),('JOD','Jordanian dinar',3),('KWD','Kuwaiti dinar',3),('BHD','Bahraini dinar',3),('SAR','Saudi riyal',2),('AED','UAE dirham',2);
INSERT INTO mizan.permissions(code,description) VALUES
 ('billing.manage','Manage plan and billing only'),('entities.manage','Manage entity settings'),('members.manage','Manage scoped membership'),('imports.manage','Upload and map sources'),('reports.view','View financial outputs'),('outputs.prepare','Prepare financial outputs'),('outputs.approve','Approve another preparer with MFA'),('outputs.reopen','Create a reopened version'),('outputs.export','Export a selected version'),('comments.create','Comment on an output version'),('matches.override','Override documented reference conflicts'),('privacy.manage','Authorize data lifecycle requests'),('support.authorize','Authorize temporary support access');
INSERT INTO mizan.roles(code,description) VALUES
 ('subscription_owner','Billing only; financial content requires a separate grant'),('entity_admin','Entity and member administration only'),('preparer','Prepare financial outputs'),('approver','Review and approve independent work'),('viewer','View financial outputs');
INSERT INTO mizan.role_permissions(role_code,permission_code) VALUES
 ('subscription_owner','billing.manage'),('entity_admin','entities.manage'),('entity_admin','members.manage'),('preparer','imports.manage'),('preparer','outputs.prepare'),('preparer','reports.view'),('preparer','comments.create'),('approver','reports.view'),('approver','outputs.approve'),('approver','comments.create'),('viewer','reports.view');
