import {useEffect,useState} from 'react';
import {backend} from '@/lib/backend-client';
import {Button} from '@/components/ui/Button';
import {Notice,useLanguage} from '@/components/WorkspaceUI';

interface BankDataset {
  id:string; version:number; period_id:string; data_type:string; currency_code:string;
  start_date:string; end_date:string; bank_account_id:string; bank_label:string; closing:string;
}

interface Reopen {
  predecessorId:string;expectedFingerprint:string;periodId:string;bankAccountId:string;
  oldBankDatasetId:string;oldBookDatasetId:string;
}
export function PublishedBankPair({base,onCreated,reopen}:{base:string;onCreated:(id:string,reused:boolean,outputId:string)=>void;reopen?:Reopen}) {
  const l=useLanguage();
  const [open,setOpen]=useState(false);
  const [datasets,setDatasets]=useState<BankDataset[]>([]);
  const [bankId,setBankId]=useState('');
  const [bookId,setBookId]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [reason,setReason]=useState('');
  const query=reopen?'?'+new URLSearchParams({periodId:reopen.periodId,bankAccountId:reopen.bankAccountId}):'';
  const oldBank=reopen?.oldBankDatasetId,oldBooks=reopen?.oldBookDatasetId;
  const bank=datasets.find(dataset=>dataset.id===bankId);
  const books=bank ? datasets.filter(dataset=>dataset.data_type==='bank_ledger'
    && dataset.period_id===bank.period_id && dataset.bank_account_id===bank.bank_account_id
    && dataset.currency_code===bank.currency_code) : [];
  useEffect(()=>{
    if(!open)return;
    let active=true;
    setError('');setDatasets([]);setBankId('');setBookId('');setConfirmed(false);
    backend<BankDataset[]>(base+'/published-bank-datasets'+query)
      .then(values=>{if(active)setDatasets(values.filter(item=>item.id!==oldBank&&item.id!==oldBooks));})
      .catch(reason=>{if(active)setError(reason instanceof Error?reason.message:String(reason));});
    return()=>{active=false;};
  },[base,open,query,oldBank,oldBooks]);
  const option=(dataset:BankDataset)=> <option key={dataset.id} value={dataset.id}>
    {dataset.bank_label} · {dataset.start_date} – {dataset.end_date} · v{dataset.version} · {dataset.closing} {dataset.currency_code}
  </option>;
  async function save() {
    setBusy(true);setError('');
    try {
      const draft=await backend<{id:string;reused:boolean;output_version_id:string}>(base+'/reconciliations/from-published',
        {bankDatasetId:bankId,bookDatasetId:bookId,confirmation:true,...(reopen?{reopen:{
          predecessorId:reopen.predecessorId,expectedFingerprint:reopen.expectedFingerprint,reason:reason.trim(),
        }}:{})});
      onCreated(draft.id,draft.reused,draft.output_version_id);
    } catch(reason) {setError(reason instanceof Error?reason.message:String(reason));}
    finally {setBusy(false);}
  }
  return <details onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>{reopen?l('إعادة فتح التسوية المعتمدة','Reopen the approved reconciliation'):l('إنشاء تسوية من بيانات منشورة','Create reconciliation from published datasets')}</summary>
    {open&&<form className="stack" onSubmit={event=>{event.preventDefault();void save();}}>
      <label className="form-field">{l('كشف البنك المنشور','Published bank statement')}
        <select value={bankId} required disabled={busy} onChange={event=>{setBankId(event.target.value);setBookId('');setConfirmed(false);}}>
          <option value="">{l('اختر كشفًا','Choose statement')}</option>
          {datasets.filter(dataset=>dataset.data_type==='bank_statement').map(option)}
        </select>
      </label>
      <label className="form-field">{l('دفتر البنك المنشور للحساب والفترة نفسيهما','Published bank ledger for the same account and period')}
        <select value={bookId} required disabled={busy||!bank} onChange={event=>{setBookId(event.target.value);setConfirmed(false);}}>
          <option value="">{l('اختر دفترًا','Choose ledger')}</option>{books.map(option)}
        </select>
      </label>
      {reopen&&<label className="form-field">{l('سبب إعادة الفتح','Reason for reopening')}
        <textarea required minLength={8} maxLength={500} disabled={busy} value={reason} onChange={event=>setReason(event.target.value)}/>
      </label>}
      <label className="row"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/>
        {l('أؤكد اختيار الإصدارين لإنشاء مسودة التسوية.','I confirm these two versions for the reconciliation draft.')}
      </label>
      {error&&<Notice tone="danger">{error}</Notice>}
      <Button type="submit" disabled={busy||!bankId||!bookId||!confirmed||Boolean(reopen&&reason.trim().length<8)}>
        {reopen?l('إنشاء مسودة بديلة','Create replacement draft'):l('إنشاء مسودة التسوية','Create reconciliation draft')}
      </Button>
    </form>}
  </details>;
}
