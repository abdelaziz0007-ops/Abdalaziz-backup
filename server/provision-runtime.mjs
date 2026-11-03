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
    for(const [role,key] of [['mizan_api_v1','APP_DATABASE_URL'],['mizan_identity_v1','AUTH_DATABASE_URL']]){
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
      GRANT INSERT ON mizan.legal_entities,mizan.entity_settings_versions,mizan.accounting_periods,mizan.membership_roles TO mizan_api_v1;
      GRANT EXECUTE ON FUNCTION mizan.has_permission(uuid,uuid,uuid,text,uuid) TO mizan_api_v1;
      GRANT EXECUTE ON FUNCTION mizan_private.sync_identity_session(text,text),mizan_private.workspaces_for_user(uuid),
      mizan_private.workspace_context(uuid,uuid),mizan_private.append_audit(uuid,uuid,uuid,text,text,uuid,text,uuid,jsonb),
      mizan_private.create_workspace_once(uuid,uuid,text,text,boolean,uuid,uuid) TO mizan_api_v1;
      REVOKE EXECUTE ON FUNCTION mizan_private.create_workspace(uuid,uuid,text,text,boolean,uuid) FROM mizan_api_v1;`);
    await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  if(!env.BETTER_AUTH_SECRET)changes.BETTER_AUTH_SECRET=randomBytes(48).toString('hex');
  if(!env.APP_ORIGIN)changes.APP_ORIGIN='http://localhost:5174';
  let updated=text;
  for(const [key,value] of Object.entries(changes)){
    const line=key+'='+JSON.stringify(value),pattern=new RegExp('^'+key+'=.*$','m');
    updated=pattern.test(updated)?updated.replace(pattern,()=>line):updated.replace(/\s*$/,'')+'\n'+line+'\n';
  }
  await writeFile(path,updated);
  console.log('Backend runtime configured: separate non-owner, non-BYPASSRLS application and identity roles; secrets written only to .env.local');
}finally{await pool.end();}
