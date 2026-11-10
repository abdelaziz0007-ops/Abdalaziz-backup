import { readFile,writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { database } from './database.mjs';

const path='.env.local',text=await readFile(path,'utf8'),env=parseEnv(text),pool=database(env.DATABASE_URL_UNPOOLED);
const changes={};
try{
  if(!env.APP_DATA_REGION)throw new Error('Set APP_DATA_REGION to the verified Neon project region before provisioning');
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    for(const [role,key] of [['mizan_api_v1','APP_DATABASE_URL'],['mizan_identity_v1','AUTH_DATABASE_URL'],['mizan_scanner_v1','SCANNER_DATABASE_URL']]){
      const previous=(await c.query('SELECT rolbypassrls,rolsuper,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=$1',[role])).rows[0];
      let password;
      if(previous){
        if(previous.rolbypassrls||previous.rolsuper||previous.rolcreaterole||previous.rolcreatedb)throw new Error('Runtime role has excessive privileges: '+role);
        if(!env[key])throw new Error('Existing runtime role requires its existing credential; no automatic password rotation');
        password=new URL(env[key]).password;
      }else{
        password=randomBytes(32).toString('hex');
        // Only constant role identifiers and generated hex are interpolated.
        await c.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
      }
      const url=new URL(env.DATABASE_URL);url.username=role;url.password=password;changes[key]=url.toString();
    }
    await c.query(`GRANT USAGE ON SCHEMA public TO mizan_identity_v1;
      GRANT SELECT,INSERT,UPDATE,DELETE ON public.mizan_auth_users,public.mizan_auth_sessions,public.mizan_auth_accounts,
      public.mizan_auth_verifications,public.mizan_auth_two_factors,public.mizan_auth_rate_limits,public.mizan_auth_mfa_proofs TO mizan_identity_v1;
      GRANT USAGE ON SCHEMA mizan,mizan_private TO mizan_api_v1;
      GRANT SELECT ON mizan.app_users,mizan.user_sessions,mizan.tenants,mizan.memberships,mizan.membership_roles,mizan.access_grants,
      mizan.roles,mizan.permissions,mizan.role_permissions,mizan.currencies,mizan.legal_entities,mizan.entity_settings_versions,
      mizan.accounting_periods,mizan.audit_events TO mizan_api_v1;
      GRANT SELECT ON mizan.output_versions,mizan.reconciliations TO mizan_api_v1;
      GRANT SELECT ON mizan.processing_jobs,mizan.job_attempts TO mizan_api_v1;
      GRANT EXECUTE ON FUNCTION mizan_private.enqueue_source_scan(uuid,uuid,uuid,uuid,uuid,uuid),mizan_private.control_scan_job(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid) TO mizan_api_v1;
      GRANT USAGE ON SCHEMA mizan_private TO mizan_scanner_v1;
      GRANT EXECUTE ON FUNCTION mizan_private.claim_scan_job(text),mizan_private.finish_scan_job(uuid,text,text,text,text) TO mizan_scanner_v1;
      GRANT SELECT,INSERT ON mizan.source_files,mizan.import_templates,mizan.import_batches,mizan.source_rows,
      mizan.row_dispositions,mizan.row_transformations,mizan.quality_runs,mizan.quality_issues,mizan.dataset_versions,mizan.dataset_imports,
      mizan.accounts,mizan.trial_balance_rows,mizan.ledger_entries,mizan.mapping_versions,mizan.report_line_items,mizan.account_mappings,
      mizan.formula_versions,mizan.output_versions,mizan.output_datasets,mizan.report_lines,mizan.report_line_sources,
      mizan.metric_results,mizan.validation_results TO mizan_api_v1;
      GRANT SELECT,INSERT ON mizan.bank_accounts,mizan.bank_transactions,mizan.book_transactions,mizan.published_bank_balances,
      mizan.reconciliations,mizan.match_groups,mizan.match_group_members TO mizan_api_v1;
      GRANT SELECT ON mizan.allocations,mizan.matching_rule_versions TO mizan_api_v1;
      GRANT SELECT,INSERT ON mizan.reconciling_items,mizan.reconciliation_items,mizan.attachments,mizan.proposed_entries,mizan.proposed_entry_lines TO mizan_api_v1;
      GRANT EXECUTE ON FUNCTION mizan_private.publish_staged_dataset(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text) TO mizan_api_v1;
      GRANT EXECUTE ON FUNCTION mizan_private.publish_trial_balance_mapping(uuid,uuid,uuid,uuid,uuid,uuid) TO mizan_api_v1;
      GRANT EXECUTE ON FUNCTION mizan_private.check_reconciliation(uuid,uuid,uuid) TO mizan_api_v1;
      GRANT EXECUTE ON FUNCTION mizan_private.change_accounting_period(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid) TO mizan_api_v1;
      GRANT SELECT ON mizan.data_lifecycle_requests TO mizan_api_v1;
      GRANT EXECUTE ON FUNCTION mizan_private.scan_capacity_for_upload(uuid,uuid,uuid,uuid),mizan_private.billing_overview(uuid,uuid,uuid) TO mizan_api_v1;
      GRANT EXECUTE ON FUNCTION mizan_private.record_privacy_export(uuid,uuid,uuid,uuid,uuid,text,uuid) TO mizan_api_v1;
      GRANT EXECUTE ON FUNCTION mizan_private.retention_controls(uuid,uuid,uuid,uuid),mizan_private.retention_action(uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid,uuid) TO mizan_api_v1;
      GRANT SELECT ON mizan.support_requests,mizan.support_access_grants,mizan.support_access_events TO mizan_api_v1;
      GRANT EXECUTE ON FUNCTION mizan_private.support_action(uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid,uuid),
      mizan_private.support_grants_for_user(uuid,uuid),mizan_private.support_read_output(uuid,uuid,uuid,uuid,text,uuid),
      mizan_private.ownership_status(uuid,uuid,uuid),mizan_private.ownership_action(uuid,uuid,uuid,uuid,text,text,text,boolean,uuid,uuid) TO mizan_api_v1;
      GRANT EXECUTE ON FUNCTION mizan_private.change_lifecycle_request(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid) TO mizan_api_v1;
      GRANT EXECUTE ON FUNCTION mizan_private.create_output_comment(uuid,uuid,uuid,uuid,uuid,text,text,uuid,uuid[],uuid,uuid) TO mizan_api_v1;
      GRANT SELECT ON mizan.comments,mizan.notifications TO mizan_api_v1;
      GRANT UPDATE(read_at) ON mizan.notifications TO mizan_api_v1;
      GRANT UPDATE(status,clearance_source_row_id,decision_reason) ON mizan.reconciliation_items TO mizan_api_v1;
      GRANT UPDATE(id) ON mizan.match_groups TO mizan_api_v1;
      GRANT SELECT,INSERT ON mizan.match_decisions,mizan.allocations TO mizan_api_v1;
      GRANT UPDATE(status,decided_by,decided_at,decision_reason) ON mizan.match_groups TO mizan_api_v1;
      GRANT UPDATE(supervisor_override_by) ON mizan.match_groups TO mizan_api_v1;
      GRANT SELECT ON mizan.invitations,mizan.invitation_grants,mizan.review_submissions,mizan.review_decisions TO mizan_api_v1;
      GRANT EXECUTE ON FUNCTION mizan_private.create_invitation(uuid,uuid,uuid,text,integer,jsonb,text,text,uuid,uuid),
      mizan_private.accept_invitation(uuid,uuid,text,uuid),mizan_private.member_directory(uuid,uuid,uuid,uuid,uuid),
      mizan_private.revoke_membership(uuid,uuid,uuid,uuid,text,uuid,uuid),mizan_private.reviewer_directory(uuid,uuid,uuid,uuid,uuid),
      mizan_private.review_action(uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,text,text,uuid,uuid) TO mizan_api_v1;
      GRANT EXECUTE ON FUNCTION mizan_private.revoke_invitation(uuid,uuid,uuid,uuid,text,uuid,uuid),
      mizan_private.revoke_scoped_access(uuid,uuid,uuid,text,uuid,text,uuid,uuid) TO mizan_api_v1;
      GRANT EXECUTE ON FUNCTION mizan_private.restore_membership(uuid,uuid,uuid,uuid,text,uuid,uuid) TO mizan_api_v1;
      GRANT UPDATE(reversed_at,reversed_by,reversal_reason) ON mizan.allocations TO mizan_api_v1;
      GRANT UPDATE(content_fingerprint) ON mizan.output_versions TO mizan_api_v1;
      GRANT UPDATE(id) ON mizan.bank_transactions,mizan.book_transactions,mizan.accounting_periods TO mizan_api_v1;
      -- Trigger row locks require UPDATE privilege; identity guards prohibit changing these IDs.
      GRANT UPDATE(id) ON mizan.import_batches,mizan.dataset_versions,mizan.mapping_versions,mizan.output_versions TO mizan_api_v1;
      GRANT INSERT ON mizan.legal_entities,mizan.entity_settings_versions,mizan.accounting_periods,mizan.membership_roles TO mizan_api_v1;
      GRANT EXECUTE ON FUNCTION mizan.has_permission(uuid,uuid,uuid,text,uuid) TO mizan_api_v1;
      GRANT EXECUTE ON FUNCTION mizan_private.sync_identity_session(text,text),mizan_private.workspaces_for_user(uuid),
      mizan_private.workspace_context(uuid,uuid),mizan_private.append_audit(uuid,uuid,uuid,text,text,uuid,text,uuid,jsonb),
      mizan_private.create_workspace_once(uuid,uuid,text,text,boolean,uuid,uuid) TO mizan_api_v1;
      REVOKE EXECUTE ON FUNCTION mizan_private.create_workspace(uuid,uuid,text,text,boolean,uuid) FROM mizan_api_v1;`);
    await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  if(!env.BETTER_AUTH_SECRET)changes.BETTER_AUTH_SECRET=randomBytes(48).toString('hex');
  if(!env.SOURCE_ENCRYPTION_KEY)changes.SOURCE_ENCRYPTION_KEY=randomBytes(32).toString('hex');
  if(!env.APP_ORIGIN)changes.APP_ORIGIN='http://localhost:5174';
  let updated=text;
  for(const [key,value] of Object.entries(changes)){
    const line=key+'='+JSON.stringify(value),pattern=new RegExp('^'+key+'=.*$','m');
    updated=pattern.test(updated)?updated.replace(pattern,()=>line):updated.replace(/\s*$/,'')+'\n'+line+'\n';
  }
  await writeFile(path,updated);
  console.log('Backend runtime configured: separate non-owner, non-BYPASSRLS application, identity and scanner roles; secrets written only to .env.local');
}finally{await pool.end();}
