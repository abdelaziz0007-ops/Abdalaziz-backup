import {z} from 'zod';

const filters=z.object({
  action:z.string().trim().regex(/^[a-z0-9_.-]{1,80}$/i).optional(),
  objectId:z.uuid().optional(),
  from:z.iso.date().optional(),
  to:z.iso.date().optional(),
}).strict().refine(value=>!value.from||!value.to||value.from<=value.to,{message:'Start date must be on or before end date'});
const maximumExport=1000;

async function auditRows(c,tenant,entities,filter,limit){
  return (await c.query(`
    SELECT id,created_at,action,object_type,object_id,entity_id,actor_id,event_hash,previous_event_hash,redacted_metadata
    FROM mizan.audit_events WHERE tenant_id=$1 AND (entity_id IS NULL OR entity_id=ANY($2::uuid[]))
      AND ($3::text IS NULL OR starts_with(lower(action),lower($3)))
      AND ($4::uuid IS NULL OR object_id=$4)
      AND ($5::date IS NULL OR created_at>=($5::timestamp AT TIME ZONE 'UTC'))
      AND ($6::date IS NULL OR created_at<(($6::date+1)::timestamp AT TIME ZONE 'UTC'))
    ORDER BY created_at DESC,id DESC LIMIT $7
  `,[tenant,entities,filter.action??null,filter.objectId??null,filter.from??null,filter.to??null,limit])).rows;
}

function auditCsv(rows){
  const headers=['id','created_at','action','object_type','object_id','entity_id','actor_id','event_hash','previous_event_hash'];
  const cell=value=>{
    const text=value instanceof Date?value.toISOString():String(value??'');
    const safe=/^\s*[=+\-@\t\r\n]/u.test(text)?"'"+text:text;
    return '"'+safe.replaceAll('"','""')+'"';
  };
  return [headers.join(','),...rows.map(row=>headers.map(field=>cell(row[field])).join(','))].join('\r\n')+'\r\n';
}

export function mountAuditRoutes(router,{scoped,audit,result,HttpError}){
  const path='/tenants/:tenantId/audit';
  router.get(path,async(req,res,next)=>{
    try{
      const tenant=req.params.tenantId,filter=filters.parse(req.query);
      const rows=await scoped(req,tenant,null,'members.manage',(c,context)=>auditRows(c,tenant,context.entityIds,filter,50));
      result(req,res,rows);
    }catch(error){next(error);}
  });
  router.post(path+'/export',async(req,res,next)=>{
    try{
      const tenant=req.params.tenantId,filter=filters.parse(req.body);
      const exported=await scoped(req,tenant,null,'members.manage',async(c,context)=>{
        const rows=await auditRows(c,tenant,context.entityIds,filter,maximumExport+1);
        if(rows.length>maximumExport)throw new HttpError(422,'AUDIT_EXPORT_LIMIT','Narrow the date range or filters to export at most 1000 events');
        await audit(c,req,tenant,null,'audit.exported','tenant',tenant,'Exported scoped audit events',
          {count:rows.length,filtered:Object.keys(filter).length>0});
        return {csv:auditCsv(rows),count:rows.length};
      },{fresh:true});
      result(req,res,exported);
    }catch(error){next(error);}
  });
}
