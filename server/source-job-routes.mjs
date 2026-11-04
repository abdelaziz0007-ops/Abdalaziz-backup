import express from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {hash} from './financial-core.mjs';
import {sourceStorage} from './financial-storage.mjs';
import {insert} from './financial-routes.mjs';
export function mountSourceJobRoutes(router,{scoped,audit,result,HttpError}){
 const base='/tenants/:tenantId/entities/:entityId',storage=sourceStorage(),max=50*1024*1024;
 const missing=()=>new HttpError(404,'RESOURCE_NOT_FOUND','Source or job not found in this scope');
 const failure=e=>e.code==='P0002'?missing():e.code==='54000'?new HttpError(409,'JOB_CAPACITY_REACHED','Workspace processing capacity is full; wait or cancel an existing job'):e;
 router.post(base+'/source-files',async(req,_res,next)=>{
  try{
   if(req.headers['content-type']!=='application/octet-stream')throw new HttpError(415,'UPLOAD_CONTENT_TYPE','Use application/octet-stream for source uploads');
   const length=Number(req.headers['content-length']);if(!Number.isInteger(length)||length<1||length>max)throw new HttpError(413,'UPLOAD_SIZE_LIMIT','Provide a source file between 1 byte and 50 MiB');
   await scoped(req,req.params.tenantId,req.params.entityId,'imports.manage',async()=>null,{fresh:true});next();
  }catch(error){next(failure(error));}
 },express.raw({type:'application/octet-stream',limit:max}),async(req,res,next)=>{
  try{
   let name;try{name=decodeURIComponent(String(req.headers['x-upload-name']||''));}catch{throw new HttpError(422,'UPLOAD_NAME_INVALID','The upload file name encoding is invalid');}
   const fileName=z.string().min(1).max(200).regex(/^[^/\\\u0000-\u001f]+\.(csv|xlsx)$/i).parse(name),plain=req.body;
   if(!Buffer.isBuffer(plain)||plain.length===0||plain.length>max)throw new HttpError(413,'UPLOAD_SIZE_LIMIT','Source exceeds the upload limit');
   const xlsx=fileName.toLowerCase().endsWith('.xlsx');if(xlsx&&!plain.subarray(0,4).equals(Buffer.from([80,75,3,4])))throw new HttpError(422,'SOURCE_TYPE_MISMATCH','XLSX requires a ZIP signature; workbook structure is checked after scanning');
   if(!xlsx){let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(plain);}catch{throw new HttpError(422,'SOURCE_ENCODING','CSV must be valid UTF-8');}if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text))throw new HttpError(422,'SOURCE_TYPE_MISMATCH','CSV contains unsupported binary content');}
   const {tenantId:t,entityId:e}=req.params;result(req,res,await scoped(req,t,e,'imports.manage',async c=>{
    if(!storage)throw new HttpError(503,'SOURCE_STORAGE_UNAVAILABLE','Private encrypted source storage is not configured');
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,42))',[e]);const digest=hash(plain);
    let source=(await c.query('SELECT id,deleted_at,scan_status FROM mizan.source_files WHERE tenant_id=$1 AND entity_id=$2 AND sha256=$3',[t,e,digest])).rows[0];
    const reused=Boolean(source);if(source&&(source.deleted_at||['infected','rejected'].includes(source.scan_status)))throw new HttpError(409,'SOURCE_UNAVAILABLE','This source cannot be reused');
    if(!source){const id=randomUUID(),key=`${t}/${e}/${id}.mzn`;await storage.put(key,plain);await storage.verify(key,digest);await insert(c,'source_files',{id,tenant_id:t,entity_id:e,sha256:digest,original_name:fileName,media_type:xlsx?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv',byte_size:plain.length,object_key:key,object_version:'1',encryption_key_reference:'source-v1',uploaded_by:req.principal.id,scan_status:'quarantined'});source={id};await audit(c,req,t,e,'source.uploaded','source_file',id,'Encrypted original uploaded for scanning',{byteSize:plain.length,format:xlsx?'xlsx':'csv'});}
    const scan=(await c.query('SELECT mizan_private.enqueue_source_scan($1,$2,$3,$4,$5,$6) AS value',[req.principal.id,req.principal.sessionId,t,e,source.id,req.requestId])).rows[0].value;return {...scan,reusedSource:reused};
   },{fresh:true}),201);
  }catch(error){next(failure(error));}
 });
 router.get(base+'/source-files',async(req,res,next)=>{try{result(req,res,await scoped(req,req.params.tenantId,req.params.entityId,'imports.manage',async c=>(await c.query('SELECT id,original_name,media_type,byte_size::text,scan_status,scanned_at,scanner_version,scan_job_id,created_at FROM mizan.source_files WHERE tenant_id=$1 AND entity_id=$2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100',[req.params.tenantId,req.params.entityId])).rows));}catch(error){next(failure(error));}});
 router.post(base+'/source-files/:sourceId/scan',async(req,res,next)=>{try{z.object({}).strict().parse(req.body);const id=z.uuid().parse(req.params.sourceId);result(req,res,await scoped(req,req.params.tenantId,req.params.entityId,'imports.manage',async c=>(await c.query('SELECT mizan_private.enqueue_source_scan($1,$2,$3,$4,$5,$6) AS value',[req.principal.id,req.principal.sessionId,req.params.tenantId,req.params.entityId,id,req.requestId])).rows[0].value,{fresh:true}));}catch(error){next(failure(error));}});
 router.get(base+'/jobs/:jobId',async(req,res,next)=>{
  try{const id=z.uuid().parse(req.params.jobId),{tenantId:t,entityId:e}=req.params;result(req,res,await scoped(req,t,e,'imports.manage',async c=>{
   const job=(await c.query("SELECT id,job_type,status,progress::text,attempt_count,cancel_requested_at,started_at,finished_at,trace_id,error_code,input_references->>'sourceId' AS source_id FROM mizan.processing_jobs WHERE tenant_id=$1 AND entity_id=$2 AND id=$3 AND job_type='file_scan'",[t,e,id])).rows[0];if(!job)throw missing();
   return {...job,attempts:(await c.query('SELECT attempt_number,worker_identifier,started_at,finished_at,error_code FROM mizan.job_attempts WHERE tenant_id=$1 AND entity_id=$2 AND job_id=$3 ORDER BY attempt_number',[t,e,id])).rows};
  }));}catch(error){next(failure(error));}
 });
 router.post(base+'/jobs/:jobId/:action',async(req,res,next)=>{
  try{const id=z.uuid().parse(req.params.jobId),action=z.enum(['cancel','retry']).parse(req.params.action),data=z.object({reason:z.string().trim().min(8).max(500),requestKey:z.uuid()}).strict().parse(req.body),{tenantId:t,entityId:e}=req.params;
   result(req,res,await scoped(req,t,e,'imports.manage',async c=>(await c.query('SELECT mizan_private.control_scan_job($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value',[req.principal.id,req.principal.sessionId,t,e,id,action,data.reason,data.requestKey,req.requestId])).rows[0].value,{fresh:true}));
  }catch(error){next(failure(error));}
 });
}
