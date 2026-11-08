import {useEffect,useState} from 'react';
import {backend} from '@/lib/backend-client';
import {Button} from '@/components/ui/Button';
import {useLanguage} from '@/components/WorkspaceUI';

interface Dataset {id:string;version:number;currency_code:string;account_count:number}

export function ReopenFinancialOutput({base,id,periodId,fingerprint,onOpened}:{
  base:string;id:string;periodId:string;fingerprint:string;onOpened:(id:string)=>void;
}){
  const l=useLanguage();
  const [datasets,setDatasets]=useState<Dataset[]>([]),[dataset,setDataset]=useState('');
  const [reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    backend<Dataset[]>(base+'/datasets?status=published&periodId='+periodId).then(values=>{
      if(active)setDatasets(values);
    }).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[base,periodId]);
  async function reopen(){
    setBusy(true);setError('');
    try{
      const saved=await backend<{outputs:{id:string}[]}>(base+'/datasets/'+dataset+'/reports',{
        confirmation:confirmed,reopen:{predecessorId:id,expectedFingerprint:fingerprint,reason:reason.trim()},
      });
      onOpened(saved.outputs[0].id);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  return <form className="stack" onSubmit={event=>{event.preventDefault();void reopen();}}>
    <h4>{l('إعادة فتح التقرير المعتمد','Reopen the approved report')}</h4>
    {error&&<p role="alert" className="notice danger">{error}</p>}
    <label className="form-field">{l('ميزان المراجعة المنشور','Published trial balance')}
      <select value={dataset} disabled={busy} required onChange={event=>{setDataset(event.target.value);setConfirmed(false);}}>
        <option value="">{l('اختر ميزانًا للفترة نفسها','Select a trial balance for the same period')}</option>
        {datasets.map(item=><option key={item.id} value={item.id}>v{item.version} · {item.currency_code} · {item.account_count} {l('حساب','accounts')}</option>)}
      </select>
    </label>
    <label className="form-field">{l('سبب إعادة الفتح','Reason for reopening')}
      <textarea required minLength={8} maxLength={500} disabled={busy} value={reason} onChange={event=>setReason(event.target.value)}/>
    </label>
    <label className="row"><input type="checkbox" required checked={confirmed} disabled={busy||!dataset} onChange={event=>setConfirmed(event.target.checked)}/>
      {l('أؤكد أن الدخل والمصروفات تخص هذه الفترة وأن حقوق الملكية لا تشمل نتيجتها.','I confirm that income and expenses cover this period and equity excludes its earnings.')}
    </label>
    <Button type="submit" disabled={busy||!dataset||!confirmed||reason.trim().length<8}>{l('إنشاء مسودة بديلة','Create replacement draft')}</Button>
  </form>;
}
