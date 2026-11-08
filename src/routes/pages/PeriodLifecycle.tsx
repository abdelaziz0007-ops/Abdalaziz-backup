import {useRef,useState} from 'react';
import {backend} from '@/lib/backend-client';
import {Button} from '@/components/ui/Button';
import {useLanguage} from '@/components/WorkspaceUI';

export interface PeriodVersion {
  id:string;start_date:string;end_date:string;status:string;version:number;
  predecessor_id:string|null;reopen_reason:string|null;is_latest:boolean;can_manage:boolean;
}

export function PeriodLifecycle({base,periods,onSaved,onError}:{
  base:string;periods:PeriodVersion[];onSaved:(action:'lock'|'reopen')=>void;onError:(error:unknown)=>void;
}){
  const l=useLanguage();
  const [id,setId]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false);
  const pending=useRef<{signature:string;key:string}|null>(null);
  const manageable=periods.filter(period=>period.can_manage&&period.is_latest&&['open','locked'].includes(period.status));
  const period=manageable.find(item=>item.id===id);
  const action=period?.status==='locked'?'reopen':'lock';
  async function save(){
    if(!period||reason.trim().length<8)return;
    const signature=JSON.stringify([id,action,reason.trim()]);
    if(pending.current?.signature!==signature)pending.current={signature,key:crypto.randomUUID()};
    setBusy(true);
    try{
      await backend(base+'/periods/'+id+'/'+action,{reason:reason.trim(),requestKey:pending.current.key});
      pending.current=null;setReason('');setId('');onSaved(action);
    }catch(error){onError(error);}
    finally{setBusy(false);}
  }
  if(!manageable.length)return null;
  return <form className="stack" onSubmit={event=>{event.preventDefault();void save();}}>
    <h4>{l('إقفال الفترة وإعادة فتحها','Lock and reopen periods')}</h4>
    <label className="form-field">{l('أحدث إصدار للفترة','Latest period version')}
      <select value={id} disabled={busy} required onChange={event=>{setId(event.target.value);setReason('');}}>
        <option value="">{l('اختر فترة','Select a period')}</option>
        {manageable.map(item=><option key={item.id} value={item.id}>{item.start_date} — {item.end_date} · v{item.version} · {item.status==='open'?l('مفتوحة','Open'):l('مقفلة','Locked')}</option>)}
      </select>
    </label>
    {period&&<>
      <p>{action==='lock'
        ?l('يوقف الإقفال تعديلات هذه الفترة، وتظل تقاريرها قابلة للعرض. أنهِ المراجعات النشطة أو اسحبها أولًا.','Locking freezes changes to this period. Its reports stay available. Finish or withdraw active reviews first.')
        :l('ستُنشأ فترة مفتوحة جديدة بالتواريخ نفسها. ارفع بيانات التصحيح إلى الإصدار الجديد.','A new open version will use the same dates. Import any corrections into the new version.')}</p>
      <label className="form-field">{l('سبب الإجراء','Reason for this action')}
        <textarea required minLength={8} maxLength={500} value={reason} disabled={busy} onChange={event=>setReason(event.target.value)}/>
      </label>
      <Button type="submit" disabled={busy||reason.trim().length<8}>{action==='lock'?l('إقفال هذه الفترة','Lock this period'):l('إعادة فتح كإصدار جديد','Reopen as a new version')}</Button>
    </>}
  </form>;
}
