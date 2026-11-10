import {useEffect,useRef,useState} from 'react';
import {backend,BackendError} from '@/lib/backend-client';
import {Button} from '@/components/ui/Button';
import {DataTable} from '@/components/ui/DataTable';
import {Panel,useLanguage} from '@/components/WorkspaceUI';

interface AuditEvent {id:string;created_at:string;action:string;object_type:string;object_id:string|null}
interface Filter {action?:string;objectId?:string;from?:string;to?:string}

export function WorkspaceAudit({tenant,revision}:{tenant:string;revision:number}){
  const l=useLanguage(),path='/tenants/'+tenant+'/audit';
  const [draft,setDraft]=useState<Filter>({}),[applied,setApplied]=useState<Filter>({});
  const [rows,setRows]=useState<AuditEvent[]>([]),[allowed,setAllowed]=useState<boolean|null>(null);
  const [loading,setLoading]=useState(false),[exporting,setExporting]=useState(false),[error,setError]=useState('');
  const context=JSON.stringify([path,revision,applied]);
  const current=useRef(context);current.current=context;
  const [paging,setPaging]=useState<{context:string;history:(string|null)[]}>({context:'',history:[null]});
  const history=paging.context===context?paging.history:[null],cursor=history.at(-1)??null;
  const [nextCursor,setNextCursor]=useState<string|null>(null),[loaded,setLoaded]=useState('');
  const visibleRows=loaded===context?rows:[];
  useEffect(()=>{
    let active=true;
    const params=new URLSearchParams(Object.entries(applied));if(cursor)params.set('cursor',cursor);const query=params.toString();
    setLoading(true);setError('');setRows([]);setNextCursor(null);
    backend<{rows:AuditEvent[];nextCursor:string|null}>(path+'/page'+(query?'?'+query:'')).then(data=>{
      if(active){setRows(data.rows);setNextCursor(data.nextCursor);setLoaded(context);setAllowed(true);}
    }).catch(e=>{
      if(!active)return;
      setRows([]);
      if(e instanceof BackendError&&[403,404].includes(e.status))setAllowed(false);
      else setError(e.message);
    }).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[path,revision,applied,cursor,context]);

  async function download(){
    const requestedContext=context;setExporting(true);setError('');
    try {
      const {csv}=await backend<{csv:string;count:number}>(path+'/export',applied);
      if(current.current!==requestedContext)return;
      const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download='workspace-audit.csv';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setExporting(false);}
  }
  if(allowed===false||allowed===null&&!error)return null;
  const actionNames:Record<string,string>={
    'workspace.created':l('إنشاء مساحة عمل','Workspace created'),
    'entity.created':l('إضافة منشأة','Entity created'),
    'period.created':l('إنشاء فترة مالية','Period created'),
    'trial_balance.imported':l('استيراد ميزان مراجعة','Trial balance imported'),
    'review.approve':l('اعتماد نسخة','Version approved'),
    'audit.exported':l('تنزيل سجل التدقيق','Audit trail downloaded'),
  };
  return <Panel title={l('سجل تدقيق مساحة العمل','Workspace audit trail')}>
    {error&&<p role="alert" className="notice danger">{error}</p>}
    <form className="stack" onSubmit={event=>{
      event.preventDefault();
      setApplied(Object.fromEntries(Object.entries(draft).map(([field,value])=>[field,value.trim()]).filter(([,value])=>value)));
    }}>
      <div className="form-grid">
        <label className="form-field">{l('رمز الإجراء أو بدايته','Action code or prefix')}<input value={draft.action??''} maxLength={80} placeholder="review." onChange={event=>setDraft({...draft,action:event.target.value})}/></label>
        <label className="form-field">{l('معرّف العنصر','Object ID')}<input value={draft.objectId??''} maxLength={36} onChange={event=>setDraft({...draft,objectId:event.target.value})}/></label>
        <label className="form-field">{l('من تاريخ (UTC)','From date (UTC)')}<input type="date" value={draft.from??''} onChange={event=>setDraft({...draft,from:event.target.value})}/></label>
        <label className="form-field">{l('إلى تاريخ (UTC)','To date (UTC)')}<input type="date" value={draft.to??''} onChange={event=>setDraft({...draft,to:event.target.value})}/></label>
      </div>
      <div className="row"><Button type="submit" variant="primary" disabled={loading||exporting}>{l('بحث','Search')}</Button>
        <Button type="button" disabled={loading||exporting||!visibleRows.length} onClick={()=>void download()}>{l('تنزيل نتائج البحث CSV','Download results as CSV')}</Button></div>
    </form>
    <p>{l('يعرض الجدول 50 إجراءً في الصفحة. يمكن تصدير حتى 50 ألف إجراء و20 ميغابايت من نتائج البحث بعد تحقق حديث بخطوتين. لا تُقتطع النتائج عند تجاوز الحد.','Browse 50 events per page. Export up to 50,000 matching events and 20 MiB with recent two-step verification. Oversized exports are rejected without truncation.')}</p>
    {loading?<p role="status">{l('جارٍ تحميل السجل…','Loading audit trail…')}</p>:<DataTable label={l('إجراءات التدقيق','Audit events')} rows={visibleRows} rowKey={row=>row.id} columns={[
      {key:'time',header:l('الوقت','Time'),render:row=><bdi>{new Date(row.created_at).toLocaleString()}</bdi>},
      {key:'action',header:l('الإجراء','Action'),render:row=><>{actionNames[row.action]??row.action}<br/><bdi>{row.action}</bdi></>},
      {key:'object',header:l('العنصر','Object'),render:row=><span style={{overflowWrap:'anywhere'}}>{row.object_type}<br/><bdi>{row.object_id??'—'}</bdi></span>},
    ]}/>}
    <div className="row"><Button disabled={loading||history.length<=1} onClick={()=>setPaging({context,history:history.slice(0,-1)})}>{l('السابق','Previous')}</Button><span>{l('الصفحة','Page')} {history.length}</span><Button disabled={loading||!nextCursor||loaded!==context} onClick={()=>{if(nextCursor)setPaging({context,history:[...history,nextCursor]});}}>{l('التالي','Next')}</Button></div>
  </Panel>;
}
