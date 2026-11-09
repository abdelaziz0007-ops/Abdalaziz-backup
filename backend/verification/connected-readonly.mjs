import assert from 'node:assert/strict';
import {loadEnv} from 'vite';
import {database} from '../server/database.mjs';
import {visible} from '../server/notification-routes.mjs';
const env=loadEnv('development',process.cwd(),'');
const pool=database(env.APP_DATABASE_URL),checks=[];
const c=await pool.connect();
try{
 await c.query('BEGIN READ ONLY');
 await c.query("SELECT set_config('mizan.user_id','',true),set_config('mizan.tenant_id','',true),set_config('mizan.entity_ids','',true)");
 const codes=await c.query('SELECT code FROM mizan.permissions WHERE mizan.has_permission($1,$2,$3,code)',[null,null,null]);assert.equal(codes.rows.length,0);checks.push('No effective permissions without identity and scope');
 const banks=await c.query('SELECT b.id,p.code FROM mizan.bank_accounts b CROSS JOIN mizan.permissions p WHERE b.tenant_id=$1 AND b.entity_id=$2 AND mizan.has_permission($1,$2,$3,p.code,b.id)',[null,null,null]);assert.equal(banks.rows.length,0);checks.push('Bank permission query executes under restricted API role');
 const notifications=await c.query('SELECT n.id,n.entity_id,n.output_version_id,n.safe_template_code,n.created_at,n.read_at FROM mizan.notifications n WHERE '+visible+' ORDER BY n.created_at DESC,n.id DESC LIMIT 51 OFFSET $3',[null,null,0]);assert.equal(notifications.rows.length,0);checks.push('Unified inbox query executes and returns no data without scope');
 const counts=await c.query('SELECT count(*)::int AS count FROM mizan.notifications n WHERE '+visible+' AND n.read_at IS NULL',[null,null]);assert.equal(counts.rows[0].count,0);checks.push('Unread count is scope protected');
 const privileges=(await c.query("SELECT has_column_privilege(current_user,'mizan.notifications','read_at','UPDATE') AS allowed")).rows[0];assert.equal(privileges.allowed,true);checks.push('API role has existing read_at update privilege');
 await c.query('ROLLBACK');
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),readOnly:true,accountsCreated:0,checks,limitation:'No authenticated real-user workflow was exercised'},null,2));
}catch(e){await c.query('ROLLBACK');console.error(JSON.stringify({code:e.code??'CHECK_FAILED',name:e.name}));process.exitCode=1;}finally{c.release();await pool.end();}
