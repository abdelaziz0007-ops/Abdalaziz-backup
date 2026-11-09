import {z} from 'zod';
import {sourceStorage} from './financial-storage.mjs';

const input=z.object({
  expectedFingerprint:z.string().regex(/^[a-f0-9]{64}$/),body:z.string().trim().min(1).max(2000),
  parentId:z.uuid().nullable().default(null),attachmentIds:z.array(z.uuid()).max(5).default([]),requestKey:z.uuid(),
}).strict();

export function mountOutputCommentRoutes(router,{scoped,result,audit,HttpError,storage=sourceStorage()}){
  const path='/tenants/:tenantId/entities/:entityId/outputs/:outputId/comments';
  async function readable(c,t,e,id,actor){
    const {rows:[output]}=await c.query(`
      SELECT mizan.has_permission($1,$2,$4,'comments.create',r.bank_account_id) AS can_comment
      FROM mizan.output_versions v LEFT JOIN mizan.reconciliations r
        ON (r.tenant_id,r.entity_id,r.output_version_id)=(v.tenant_id,v.entity_id,v.id)
      WHERE (v.tenant_id,v.entity_id,v.id)=($1,$2,$3)
        AND (v.output_type<>'reconciliation' OR r.id IS NOT NULL)
        AND mizan.has_permission($1,$2,$4,'reports.view',r.bank_account_id)
    `,[t,e,id,actor]);
    if(!output)throw new HttpError(404,'RESOURCE_NOT_FOUND','Output version is unavailable');
    return output;
  }
  router.get(path,async(req,res,next)=>{
    try{
      const {tenantId:t,entityId:e,outputId:id}=req.params;
      z.uuid().parse(id);
      const response=await scoped(req,t,e,null,async c=>{
        const actor=req.principal.id;
        const {can_comment}=await readable(c,t,e,id,actor);
        const {rows:comments}=await c.query(`
          SELECT c.id,c.body,c.author_id,c.parent_id,c.created_at,
            (SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.original_name) ORDER BY a.created_at),'[]')
             FROM mizan.attachments a JOIN mizan.source_files f ON (f.tenant_id,f.entity_id,f.id)=(a.tenant_id,a.entity_id,a.source_file_id)
             WHERE (a.tenant_id,a.entity_id,a.comment_id)=(c.tenant_id,c.entity_id,c.id)
               AND f.deleted_at IS NULL AND f.scan_status='clean') AS attachments
          FROM mizan.comments c WHERE (c.tenant_id,c.entity_id,c.output_version_id)=($1,$2,$3)
          ORDER BY c.created_at DESC,c.id DESC LIMIT 100
        `,[t,e,id]);
        const {rows:[badge]}=await c.query(`
          SELECT count(*)::int AS unread FROM mizan.notifications WHERE (tenant_id,entity_id,output_version_id,recipient_id)=($1,$2,$3,$4)
            AND notification_type='output_comment' AND read_at IS NULL
        `,[t,e,id,actor]);
        const files=can_comment?(await c.query(`
          SELECT f.id,f.original_name AS name FROM mizan.source_files f JOIN mizan.processing_jobs j
            ON (j.tenant_id,j.entity_id,j.id)=(f.tenant_id,f.entity_id,f.scan_job_id)
          WHERE (f.tenant_id,f.entity_id,f.uploaded_by)=($1,$2,$3) AND f.deleted_at IS NULL AND f.scan_status='clean'
            AND f.scanned_at IS NOT NULL AND j.job_type='file_scan' AND j.status='succeeded' AND j.input_references->>'sourceId'=f.id::text
          ORDER BY f.created_at DESC,f.id LIMIT 50
        `,[t,e,actor])).rows:[];
        return {can_comment,comments,unread:badge.unread,files};
      });
      result(req,res,response);
    }catch(error){next(error);}
  });
  router.post(path,async(req,res,next)=>{
    try{
      const {tenantId:t,entityId:e,outputId:id}=req.params;
      z.uuid().parse(id);
      const data=input.parse(req.body);
      const value=await scoped(req,t,e,null,async c=>{
        const {id:actor,sessionId}=req.principal;
        await readable(c,t,e,id,actor);
        return (await c.query(`SELECT mizan_private.create_output_comment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS value`,
          [actor,sessionId,t,e,id,data.expectedFingerprint,data.body,data.parentId,data.attachmentIds,data.requestKey,req.requestId])).rows[0].value;
      },{fresh:true});
      result(req,res,value,value.reused?200:201);
    }catch(error){next(error);}
  });
  router.post(path+'/read',async(req,res,next)=>{
    try{
      const {tenantId:t,entityId:e,outputId:id}=req.params;
      z.uuid().parse(id);
      const value=await scoped(req,t,e,null,async c=>{
        const actor=req.principal.id;
        await readable(c,t,e,id,actor);
        const {rowCount}=await c.query(`
          UPDATE mizan.notifications SET read_at=clock_timestamp() WHERE (tenant_id,entity_id,output_version_id,recipient_id)=($1,$2,$3,$4)
            AND notification_type='output_comment' AND read_at IS NULL
        `,[t,e,id,actor]);
        return {read:rowCount};
      });
      result(req,res,value);
    }catch(error){next(error);}
  });
  router.post(path+'/:commentId/attachments/:sourceId/download',async(req,res,next)=>{
    try{
      const {tenantId:t,entityId:e,outputId:id,commentId,sourceId}=req.params;
      z.uuid().parse(id);z.uuid().parse(commentId);z.uuid().parse(sourceId);
      const file=await scoped(req,t,e,null,async c=>{
        await readable(c,t,e,id,req.principal.id);
        if(!storage)throw new HttpError(503,'SOURCE_STORAGE_UNAVAILABLE','Private source storage is not configured');
        const {rows:[source]}=await c.query(`
          SELECT f.object_key,f.sha256,f.byte_size,f.original_name
          FROM mizan.comments c JOIN mizan.attachments a ON (a.tenant_id,a.entity_id,a.comment_id)=(c.tenant_id,c.entity_id,c.id)
          JOIN mizan.source_files f ON (f.tenant_id,f.entity_id,f.id)=(a.tenant_id,a.entity_id,a.source_file_id)
          JOIN mizan.processing_jobs j ON (j.tenant_id,j.entity_id,j.id)=(f.tenant_id,f.entity_id,f.scan_job_id)
          WHERE (c.tenant_id,c.entity_id,c.output_version_id,c.id,f.id)=($1,$2,$3,$4,$5)
            AND f.deleted_at IS NULL AND f.scan_status='clean' AND f.scanned_at IS NOT NULL
            AND j.job_type='file_scan' AND j.status='succeeded' AND j.input_references->>'sourceId'=f.id::text
        `,[t,e,id,commentId,sourceId]);
        if(!source)throw new HttpError(404,'RESOURCE_NOT_FOUND','Scanned attachment is unavailable for this comment');
        const bytes=await storage.read(source.object_key,source.sha256,Number(source.byte_size));
        await audit(c,req,t,e,'comment.attachment_downloaded','output',id,'Downloaded a scanned comment attachment',{commentId,sourceId});
        return {bytes,name:source.original_name};
      },{fresh:true});
      res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
        .attachment(file.name).type('application/octet-stream').send(file.bytes);
    }catch(error){next(error);}
  });
}
