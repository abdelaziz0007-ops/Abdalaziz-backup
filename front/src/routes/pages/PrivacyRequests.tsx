import {RetentionControls} from './RetentionControls';
import {useEffect,useRef,useState} from 'react';
import {backend,backendDownload,BackendError} from '@/lib/backend-client';
import {Button} from '@/components/ui/Button';
import {Panel,useLanguage} from '@/components/WorkspaceUI';

type RequestType='export'|'delete';
type Decision='authorize'|'reject';
interface PrivacyRequest {
  id:string;request_type:RequestType|'terminate';status:string;requested_by:string;created_at:string;reason:string;decision_reason:string|null;
}

export function PrivacyRequests({tenant,entity,actorId,onSaved}:{tenant:string;entity?:string;actorId:string;onSaved:()=>void}){
  const l=useLanguage();
  const base='/tenants/'+tenant+(entity?'/entities/'+entity:'')+'/data-lifecycle';
  const [items,setItems]=useState<PrivacyRequest[]|null>(null),[denied,setDenied]=useState(false);
  const [type,setType]=useState<RequestType>('export'),[reason,setReason]=useState('');
  const [selected,setSelected]=useState(''),[decision,setDecision]=useState<Decision>('authorize'),[decisionReason,setDecisionReason]=useState('');
  const [revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const pending=useRef<{signature:string;key:string}|null>(null);
  const decisions=items?.filter(item=>item.status==='requested'&&item.requested_by!==actorId)??[];
  const typeLabels:Record<PrivacyRequest['request_type'],string>={
    export:l('تصدير البيانات','Data export'),delete:l('حذف البيانات','Data deletion'),terminate:l('إنهاء الخدمة','Service termination'),
  };
  const statuses:Record<string,[string,string]>={requested:['بانتظار القرار','Awaiting decision'],authorized:['مصرّح بالتنفيذ','Authorized'],partially_completed:['مكتمل جزئياً','Partially completed'],rejected:['مرفوض','Rejected']};
  useEffect(()=>{
    let active=true;
    backend<PrivacyRequest[]>(base).then(rows=>{if(active)setItems(rows);}).catch(e=>{
      if(!active)return;
      if(e instanceof BackendError&&[403,404].includes(e.status))setDenied(true);
      else setError(e.message);
    });
    return()=>{active=false;};
  },[base,revision]);
  async function exportStructured(id:string){
    setBusy(true);setError('');
    try{await backendDownload(base+'/'+id+'/structured-export',{},'mizan-partial-financial-export-'+id+'.json');setRevision(v=>v+1);onSaved();}
    catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  async function save(isDecision:boolean){
    const path=isDecision?base+'/'+selected+'/decision':base;
    const data=isDecision?{action:decision,reason:decisionReason.trim()}:{type,reason:reason.trim()};
    const signature=JSON.stringify([path,data]);
    if(pending.current?.signature!==signature)pending.current={signature,key:crypto.randomUUID()};
    setBusy(true);setError('');
    try{
      await backend(path,{...data,requestKey:pending.current.key});
      pending.current=null;setReason('');setSelected('');setDecisionReason('');setRevision(value=>value+1);onSaved();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  if(denied||!items&&!error)return null;
  return <div className="stack"><RetentionControls key={base} tenant={tenant} entity={entity} actorId={actorId}/><Panel title={entity?l('طلبات خصوصية المنشأة','Entity privacy requests'):l('طلبات خصوصية مساحة العمل','Workspace privacy requests')}>
    <p>{l('يسجّل هذا المسار الطلب وقرار المراجع المستقل. التصدير أو الحذف إجراء منفصل يخضع لسياسة الاحتفاظ.','This workflow records the request and the independent decision. Data export or deletion is a separate step governed by retention policy.')}</p>
    {error&&<p role="alert" className="notice danger">{error}</p>}
    <form className="stack" onSubmit={event=>{event.preventDefault();void save(false);}}>
      <label className="form-field">{l('نوع الطلب','Request type')}<select value={type} disabled={busy} onChange={event=>setType(event.target.value as RequestType)}>
        <option value="export">{typeLabels.export}</option><option value="delete">{typeLabels.delete}</option>
      </select></label>
      <label className="form-field">{l('سبب الطلب','Request reason')}<textarea value={reason} required minLength={8} maxLength={500} disabled={busy} onChange={event=>setReason(event.target.value)}/></label>
      <Button type="submit" disabled={busy||reason.trim().length<8}>{l('تسجيل الطلب','Submit request')}</Button>
    </form>
    {decisions.length>0&&<form className="stack" onSubmit={event=>{event.preventDefault();void save(true);}}>
      <label className="form-field">{l('طلب ينتظر قرارك','Request awaiting your decision')}<select value={selected} required disabled={busy} onChange={event=>setSelected(event.target.value)}>
        <option value="">{l('اختر طلبًا','Select a request')}</option>{decisions.map(item=><option key={item.id} value={item.id}>{typeLabels[item.request_type]} · {item.id.slice(0,8)}</option>)}
      </select></label>
      <label className="form-field">{l('القرار','Decision')}<select value={decision} disabled={busy} onChange={event=>setDecision(event.target.value as Decision)}>
        <option value="authorize">{l('التصريح بالطلب','Authorize request')}</option><option value="reject">{l('رفض الطلب','Reject request')}</option>
      </select></label>
      <label className="form-field">{l('سبب القرار','Decision reason')}<textarea value={decisionReason} required minLength={8} maxLength={500} disabled={busy} onChange={event=>setDecisionReason(event.target.value)}/></label>
      <Button type="submit" disabled={busy||!selected||decisionReason.trim().length<8}>{l('حفظ القرار','Save decision')}</Button>
    </form>}
    {items?.length===0&&<p>{l('لا توجد طلبات مسجلة.','No requests are recorded.')}</p>}
    {items&&items.length>0&&<ul className="stack">{items.map(item=><li key={item.id}>
      <strong>{typeLabels[item.request_type]}</strong> · {statuses[item.status]?l(...statuses[item.status]):item.status} · <bdi>{item.id.slice(0,8)} · {new Date(item.created_at).toLocaleString()}</bdi>
      <p>{item.reason}</p>{item.decision_reason&&<p>{item.decision_reason}</p>}
      {entity&&item.request_type==='export'&&['authorized','partially_completed'].includes(item.status)&&<div><p>{l('تنزيل جزئي للقوائم والمؤشرات والفترات والإعدادات بصيغة JSON. لا يشمل الملفات الأصلية أو بيانات الاستيراد أو التسويات أو نسخ المزوّدين. يحتاج صلاحية عرض وتصدير مالي؛ يبقى الطلب غير مكتمل.','Partial JSON download of statements, metrics, periods and settings. Excludes original files, import data, reconciliations and provider copies. Requires financial view and export permissions; the request remains incomplete.')}</p><Button disabled={busy} onClick={()=>void exportStructured(item.id)}>{l('تنزيل البيانات المالية المنظمة — جزئي','Download structured financial data — partial')}</Button></div>}
    </li>)}</ul>}
  </Panel></div>;
}
