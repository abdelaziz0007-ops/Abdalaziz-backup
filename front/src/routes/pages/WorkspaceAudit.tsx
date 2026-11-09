import {useEffect,useState} from 'react';
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
  useEffect(()=>{
    let active=true;
    const query=new URLSearchParams(Object.entries(applied)).toString();
    setLoading(true);setError('');
    backend<AuditEvent[]>(path+(query?'?'+query:'')).then(data=>{
      if(active){setRows(data);setAllowed(true);}
    }).catch(e=>{
      if(!active)return;
      setRows([]);
      if(e instanceof BackendError&&[403,404].includes(e.status))setAllowed(false);
      else setError(e.message);
    }).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[path,revision,applied]);

  async function download(){
    setExporting(true);setError('');
    try {
      const {csv}=await backend<{csv:string;count:number}>(path+'/export',applied);
      const url=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));
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
        <Button type="button" disabled={loading||exporting||!rows.length} onClick={()=>void download()}>{l('تنزيل نتائج البحث CSV','Download results as CSV')}</Button></div>
    </form>
    <p>{l('يعرض الجدول أحدث 50 إجراءً مطابقًا. يمكن تنزيل ما يصل إلى 1000 إجراء مطابق بعد تحقق حديث بخطوتين.','The table shows the 50 most recent matching events. Download up to 1,000 matching events with recent two-step verification.')}</p>
    {loading?<p role="status">{l('جارٍ تحميل السجل…','Loading audit trail…')}</p>:<DataTable label={l('إجراءات التدقيق','Audit events')} rows={rows} rowKey={row=>row.id} columns={[
      {key:'time',header:l('الوقت','Time'),render:row=><bdi>{new Date(row.created_at).toLocaleString()}</bdi>},
      {key:'action',header:l('الإجراء','Action'),render:row=><>{actionNames[row.action]??row.action}<br/><bdi>{row.action}</bdi></>},
      {key:'object',header:l('العنصر','Object'),render:row=><span style={{overflowWrap:'anywhere'}}>{row.object_type}<br/><bdi>{row.object_id??'—'}</bdi></span>},
    ]}/>}
  </Panel>;
}
