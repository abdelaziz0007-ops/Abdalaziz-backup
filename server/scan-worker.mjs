import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {database} from './database.mjs';
import {sourceStorage} from './financial-storage.mjs';
import {scanSource} from './clamav-client.mjs';
export async function runScanOnce({pool,storage,workerId}){
 const job=(await pool.query('SELECT mizan_private.claim_scan_job($1) AS value',[workerId])).rows[0].value;if(!job)return {claimed:false};
 let outcome='failed',version=null,error=null;
 try{
  if(!storage)throw Object.assign(Error(),{code:'SOURCE_STORAGE_UNAVAILABLE'});
  const size=Number(job.byteSize);if(!Number.isSafeInteger(size)||size<1||size>50*1024*1024)throw Object.assign(Error(),{code:'SCAN_SIZE_INVALID'});
  let plain;try{plain=await storage.read(job.objectKey,job.sha256,size);}catch{throw Object.assign(Error(),{code:'SOURCE_INTEGRITY_UNAVAILABLE'});}
  try{const scan=await scanSource(plain);outcome=scan.status;version=scan.scannerVersion;}finally{plain.fill(0);}
 }catch(e){error=/^[A-Z0-9_]{3,80}$/.test(e.code??'')?e.code:'SCAN_FAILED';}
 const final=(await pool.query('SELECT mizan_private.finish_scan_job($1,$2,$3,$4,$5) AS value',[job.jobId,job.leaseToken,outcome,version,error])).rows[0].value;
 return {claimed:true,...final,traceId:job.traceId};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const env=parseEnv(await readFile('.env.local','utf8'));
 // The worker process receives no owner/application/identity DB URL in its environment.
 for(const key of ['SOURCE_ENCRYPTION_KEY','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_ENDPOINT_URL_S3','AWS_REGION','CLAMAV_SOCKET','CLAMAV_HOST','CLAMAV_PORT','CLAMAV_TIMEOUT_MS','CLAMAV_MAX_SIGNATURE_AGE_HOURS'])if(process.env[key]===undefined&&env[key]!==undefined)process.env[key]=env[key];
 const connection=process.env.SCANNER_DATABASE_URL||env.SCANNER_DATABASE_URL;if(!connection)throw Error('Run backend:setup to configure the dedicated scanner role');
 for(const key of ['DATABASE_URL','DATABASE_URL_UNPOOLED','APP_DATABASE_URL','AUTH_DATABASE_URL','BETTER_AUTH_SECRET'])delete process.env[key];
 const pool=database(connection),storage=sourceStorage(),workerId='scanner-'+randomUUID();let stop=false;
 process.on('SIGINT',()=>{stop=true;});process.on('SIGTERM',()=>{stop=true;});
 try{
  do{const result=await runScanOnce({pool,storage,workerId});console.log(JSON.stringify(result));if(process.argv.includes('--once'))break;if(!stop)await new Promise(resolve=>setTimeout(resolve,5000));}while(!stop);
 }finally{await pool.end();}
}
