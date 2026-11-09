import {useEffect,useRef,useState} from 'react';
import {backend,backendDownload} from '@/lib/backend-client';
import {Button} from '@/components/ui/Button';
import {useLanguage} from '@/components/WorkspaceUI';

interface FileRef {id:string;name:string}
interface Comment {id:string;body:string;author_id:string;parent_id:string|null;created_at:string;attachments:FileRef[]}
interface Discussion {can_comment:boolean;comments:Comment[];unread:number;files:FileRef[]}

export function OutputComments({base,id,fingerprint,actorId}:{base:string;id:string;fingerprint:string;actorId:string}){
  const l=useLanguage(),path=base+'/outputs/'+id+'/comments';
  const [discussion,setDiscussion]=useState<Discussion|null>(null),[body,setBody]=useState(''),[parentId,setParentId]=useState<string|null>(null);
  const [attachmentIds,setAttachmentIds]=useState<string[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const pending=useRef<{signature:string;key:string}|null>(null);
  useEffect(()=>{
    let active=true;
    backend<Discussion>(path).then(data=>{if(active)setDiscussion(data);}).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[path,revision]);
  async function send(){
    const payload={body:body.trim(),parentId,attachmentIds,expectedFingerprint:fingerprint},signature=JSON.stringify(payload);
    if(pending.current?.signature!==signature)pending.current={signature,key:crypto.randomUUID()};
    setBusy(true);setError('');
    try{
      await backend(path,{...payload,requestKey:pending.current.key});
      pending.current=null;setBody('');setParentId(null);setAttachmentIds([]);setRevision(value=>value+1);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  async function markRead(){
    setBusy(true);setError('');
    try{await backend(path+'/read',{});setRevision(value=>value+1);}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  async function downloadAttachment(comment:Comment,file:FileRef){
    setBusy(true);setError('');
    try{await backendDownload(path+'/'+comment.id+'/attachments/'+file.id+'/download',{},file.name);}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  return <section className="stack">
    <h4>{l('تعليقات هذا الإصدار','Comments for this version')}</h4>
    {error&&<p className="notice danger" role="alert">{error}</p>}
    {!discussion&&!error&&<p role="status">{l('تحميل التعليقات…','Loading comments…')}</p>}
    {!!discussion?.unread&&<div className="row"><span>{l('إشعارات تعليقات غير مقروءة','Unread comment notifications')} · {discussion.unread}</span>
      <Button disabled={busy} onClick={()=>void markRead()}>{l('تحديد كمقروء','Mark as read')}</Button></div>}
    {discussion?.comments.length===0&&<p>{l('لا توجد تعليقات لهذا الإصدار.','This version has no comments.')}</p>}
    {discussion?.comments.map(comment=><article className="stack" key={comment.id}>
      <small>{comment.author_id===actorId?l('أنت','You'):l('عضو مخوّل','Authorized member')} · <bdi>{new Date(comment.created_at).toLocaleString()}</bdi>
        {comment.parent_id&&' · '+l('رد','Reply')}</small>
      <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{comment.body}</p>
      {comment.attachments.length>0&&<ul>{comment.attachments.map(file=><li key={file.id}>
        <Button disabled={busy} onClick={()=>void downloadAttachment(comment,file)}>{l('تنزيل','Download')} {file.name}</Button>
      </li>)}</ul>}
      {discussion.can_comment&&<Button disabled={busy} onClick={()=>setParentId(comment.id)}>{l('رد','Reply')}</Button>}
    </article>)}
    {discussion?.can_comment&&<form className="stack" onSubmit={event=>{event.preventDefault();void send();}}>
      {parentId&&<div className="row"><span>{l('الرد على تعليق محفوظ','Replying to a saved comment')}</span>
        <Button type="button" disabled={busy} onClick={()=>setParentId(null)}>{l('إلغاء الرد','Cancel reply')}</Button></div>}
      <label className="form-field">{l('تعليق للمراجعة','Review comment')}<textarea value={body} required maxLength={2000} disabled={busy} onChange={event=>setBody(event.target.value)}/></label>
      {discussion.files.length>0&&<label className="form-field">{l('مرفقات من ملفاتك المفحوصة (حتى 5)','Attachments from your scanned uploads (up to 5)')}
        <select multiple value={attachmentIds} disabled={busy} onChange={event=>setAttachmentIds(Array.from(event.target.selectedOptions,option=>option.value))}>
          {discussion.files.map(file=><option key={file.id} value={file.id}>{file.name}</option>)}
        </select></label>}
      <Button type="submit" disabled={busy||!body.trim()||attachmentIds.length>5}>{l('إضافة تعليق','Add comment')}</Button>
    </form>}
  </section>;
}
