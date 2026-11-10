import {z} from 'zod';
import {createHash} from 'node:crypto';

export const filters=z.object({
 action:z.string().trim().regex(/^[a-z0-9_.-]{1,80}$/i).optional(),
 objectId:z.uuid().optional(),from:z.iso.date().optional(),to:z.iso.date().optional(),
}).strict().refine(v=>!v.from||!v.to||v.from<=v.to,{message:'Start date must be on or before end date'});
export const auditLimits=Object.freeze({page:50,batch:1000,exportRows:50000,exportBytes:20*1024*1024});
const cursorSchema=z.object({time:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),id:z.uuid()}).strict();
export function encodeAuditCursor(row){return Buffer.from(JSON.stringify({time:row.cursor_time,id:row.id})).toString('base64url');}
export function decodeAuditCursor(value){
 if(typeof value!=='string'||value.length>240||!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Invalid audit cursor');
 const parsed=cursorSchema.parse(JSON.parse(Buffer.from(value,'base64url').toString('utf8')));
 if(!Number.isFinite(Date.parse(parsed.time)))throw Error('Invalid audit cursor');
 return parsed;
}
export async function auditRows(c,tenant,entities,filter,limit,cursor=null){
 return (await c.query(`
 SELECT id,created_at,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time,
 action,object_type,object_id,entity_id,actor_id,event_hash,previous_event_hash,redacted_metadata
 FROM mizan.audit_events WHERE tenant_id=$1 AND (entity_id IS NULL OR entity_id=ANY($2::uuid[]))
 AND ($3::text IS NULL OR starts_with(lower(action),lower($3)))
 AND ($4::uuid IS NULL OR object_id=$4)
 AND ($5::date IS NULL OR created_at>=($5::timestamp AT TIME ZONE 'UTC'))
 AND ($6::date IS NULL OR created_at<(($6::date+1)::timestamp AT TIME ZONE 'UTC'))
 AND ($8::timestamptz IS NULL OR (created_at,id)<($8::timestamptz,$9::uuid))
 ORDER BY created_at DESC,id DESC LIMIT $7
 `,[tenant,entities,filter.action??null,filter.objectId??null,filter.from??null,filter.to??null,limit,cursor?.time??null,cursor?.id??null])).rows;
}
const headers=['id','created_at','action','object_type','object_id','entity_id','actor_id','event_hash','previous_event_hash'];
export function auditCsv(rows,{header=true}={}){
 const cell=value=>{const text=value instanceof Date?value.toISOString():String(value??'');
 const safe=/^\s*[=+\-@\t\r\n]/u.test(text)?"'"+text:text;return '"'+safe.replaceAll('"','""')+'"';};
 return (header?'\ufeff'+headers.join(',')+'\r\n':'')+rows.map(row=>headers.map(field=>cell(field==='created_at'?(row.cursor_time??row.created_at):row[field])).join(',')+'\r\n').join('');
}
export async function collectAuditExport(read,{maxRows=auditLimits.exportRows,maxBytes=auditLimits.exportBytes,batch=auditLimits.batch,maxDurationMs=15000,now=()=>Date.now()}={}){
 const started=now(),chunks=[auditCsv([])];let bytes=Buffer.byteLength(chunks[0]),count=0,cursor=null;
 if(bytes>maxBytes)throw Error('AUDIT_EXPORT_LIMIT');
 for(;;){
  if(now()-started>=maxDurationMs)throw Error('AUDIT_EXPORT_LIMIT');
  const rows=await read(Math.min(batch,maxRows-count+1),cursor);
  if(now()-started>=maxDurationMs)throw Error('AUDIT_EXPORT_LIMIT');
  if(count+rows.length>maxRows)throw Error('AUDIT_EXPORT_LIMIT');
  if(!rows.length)break;
  const chunk=auditCsv(rows,{header:false});bytes+=Buffer.byteLength(chunk);
  if(bytes>maxBytes)throw Error('AUDIT_EXPORT_LIMIT');
  chunks.push(chunk);count+=rows.length;
  const last=rows.at(-1),next={time:last.cursor_time,id:last.id};
  if(cursor&&cursor.time===next.time&&cursor.id===next.id)throw Error('AUDIT_CURSOR_STALLED');
  cursor=next;
 }
 const csv=chunks.join('');
 return {csv,count,sha256:createHash('sha256').update(csv,'utf8').digest('hex'),byteSize:bytes};
}
export function mountAuditRoutes(router,{scoped,audit,result,HttpError}){
 const path='/tenants/:tenantId/audit';
 router.get(path,async(req,res,next)=>{try{
  const tenant=req.params.tenantId,filter=filters.parse(req.query);
  result(req,res,await scoped(req,tenant,null,'members.manage',(c,context)=>auditRows(c,tenant,context.entityIds,filter,50)));
 }catch(error){next(error);}});
 router.get(path+'/page',async(req,res,next)=>{try{
  const {cursor:raw,...rest}=req.query,filter=filters.parse(rest),tenant=req.params.tenantId;
  let cursor=null;try{if(raw!==undefined)cursor=decodeAuditCursor(raw);}catch{throw new HttpError(400,'INVALID_CURSOR','Invalid audit cursor');}
  const page=await scoped(req,tenant,null,'members.manage',async(c,context)=>{
   const found=await auditRows(c,tenant,context.entityIds,filter,auditLimits.page+1,cursor),rows=found.slice(0,auditLimits.page);
   return {rows,nextCursor:found.length>auditLimits.page?encodeAuditCursor(rows.at(-1)):null};
  });result(req,res,page);
 }catch(error){next(error);}});
 router.post(path+'/export',async(req,res,next)=>{try{
  const tenant=req.params.tenantId,filter=filters.parse(req.body);
  const exported=await scoped(req,tenant,null,'members.manage',async(c,context)=>{
   let file;try{file=await collectAuditExport((limit,cursor)=>auditRows(c,tenant,context.entityIds,filter,limit,cursor));}
   catch(error){if(error.message==='AUDIT_EXPORT_LIMIT')throw new HttpError(422,'AUDIT_EXPORT_LIMIT','Narrow filters: exports support up to 50,000 events, 20 MiB and a bounded processing time');throw error;}
   await audit(c,req,tenant,null,'audit.exported','tenant',tenant,'Exported scoped audit events',{count:file.count,filtered:Object.keys(filter).length>0,sha256:file.sha256,byteSize:file.byteSize});
   return file;
  },{fresh:true,snapshot:true});result(req,res,exported);
 }catch(error){next(error);}});
}
