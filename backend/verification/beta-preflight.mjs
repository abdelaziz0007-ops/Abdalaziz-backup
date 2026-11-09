import {fileURLToPath} from 'node:url';
import {S3Client,HeadBucketCommand} from '@aws-sdk/client-s3';
import {loadEnv} from 'vite';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {runtimeConfig} from '../server/runtime-config.mjs';
import {database} from '../server/database.mjs';
const local=process.argv.includes('--local');
if(local)for(const [key,value] of Object.entries(loadEnv('development',fileURLToPath(new URL('..',import.meta.url)),'')))if(process.env[key]===undefined)process.env[key]=value;
const checks=[];
async function check(name,fn){try{const detail=await fn();checks.push({name,ok:true,detail});}catch(error){checks.push({name,ok:false,detail: error.safeMessage || 'Check failed; verify configuration and service availability'});}}
await check('production configuration',()=>{try{runtimeConfig({...process.env,APP_PROFILE:'production'});return 'Required values present; service connectivity is checked separately';}catch(e){throw {safeMessage:e.message};}});
for(const key of ['APP_DATABASE_URL','AUTH_DATABASE_URL','SCANNER_DATABASE_URL'])await check(key+' least privilege',async()=>{
 if(!process.env[key])throw {safeMessage:'Missing '+key};
 const pool=database(process.env[key]);try{
  const {rows}=await pool.query('SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user');
  if(!rows.length||Object.values(rows[0]).some(Boolean))throw {safeMessage:'Runtime role has excessive privileges'};
  return 'Connected with restricted role';
 }finally{await pool.end();}
});
await check('migration checksums',async()=>{
 if(!process.env.DATABASE_URL_UNPOOLED)throw {safeMessage:'Run with migration-owner DATABASE_URL_UNPOOLED in a secure administrative session'};
 const pool=database(process.env.DATABASE_URL_UNPOOLED);try{
  const rows=(await pool.query('SELECT name,sha256 FROM mizan.schema_migrations')).rows;
  const dir=new URL('../migrations/',import.meta.url);
  const names=(await readdir(dir)).filter(n=>/^\d+_.+\.sql$/.test(n));
  for(const name of names){const hash=createHash('sha256').update((await readFile(new URL(name,dir),'utf8')).replaceAll('\r\n','\n')).digest('hex');if(!rows.some(r=>r.name===name&&r.sha256===hash))throw {safeMessage:'Missing or changed migration: '+name};}
  return names.length+' migrations match';
 }finally{await pool.end();}
});
await check('isolated parser image',async()=>{
 if(!/^sha256:[0-9a-f]{64}$/.test(process.env.IMPORT_PREVIEW_IMAGE||''))throw {safeMessage:'Missing pinned IMPORT_PREVIEW_IMAGE'};
 await promisify(execFile)('docker',['--context','default','image','inspect',process.env.IMPORT_PREVIEW_IMAGE],{timeout:10000,windowsHide:true});return 'Local image exists';
});
await check('private source storage configuration',async()=>{const keys=['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_ENDPOINT_URL_S3','AWS_REGION','SOURCE_ENCRYPTION_KEY'];const missing=keys.filter(k=>!process.env[k]);if(missing.length)throw {safeMessage:'Missing '+missing.join(', ')};const client=new S3Client({region:process.env.AWS_REGION,endpoint:process.env.AWS_ENDPOINT_URL_S3,forcePathStyle:true});try{await client.send(new HeadBucketCommand({Bucket:'financial-sources'}),{abortSignal:AbortSignal.timeout(15000)});return 'Private bucket reachable; encrypted roundtrip still requires acceptance';}finally{client.destroy();}});
await check('email configuration',()=>{if(!process.env.RESEND_API_KEY||!process.env.MAIL_FROM)throw {safeMessage:'Missing RESEND_API_KEY and/or MAIL_FROM'};return 'Configured; real delivery not yet accepted';});
await check('malware scanner configuration',()=>{if(!process.env.CLAMAV_HOST&&!process.env.CLAMAV_SOCKET)throw {safeMessage:'Missing CLAMAV_HOST or CLAMAV_SOCKET'};return 'Configured; signatures and quarantine still require acceptance';});
console.log(JSON.stringify({checkedAt:new Date().toISOString(),mode:'read-only; no accounts or financial data created',checks,infrastructureChecksPassed:checks.every(c=>c.ok),releaseReady:false,acceptanceRequired:['Real email verification and reset','Real account MFA and tenant isolation','Clean file scan and isolated import','Malware quarantine','Backup restoration','Public HTTPS smoke']},null,2));
if(checks.some(c=>!c.ok))process.exitCode=1;
