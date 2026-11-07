import {useEffect,useState} from 'react';
import {backend} from '@/lib/backend-client';
import {Button} from '@/components/ui/Button';
import {Notice,useLanguage} from '@/components/WorkspaceUI';

interface BankDataset {
  id:string; version:number; period_id:string; data_type:string; currency_code:string;
  start_date:string; end_date:string; bank_account_id:string; bank_label:string; closing:string;
}

export function PublishedBankPair({base,onCreated}:{base:string;onCreated:(id:string,reused:boolean)=>void}) {
  const l=useLanguage();
  const [open,setOpen]=useState(false);
  const [datasets,setDatasets]=useState<BankDataset[]>([]);
  const [bankId,setBankId]=useState('');
  const [bookId,setBookId]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const bank=datasets.find(dataset=>dataset.id===bankId);
  const books=bank ? datasets.filter(dataset=>dataset.data_type==='bank_ledger'
    && dataset.period_id===bank.period_id && dataset.bank_account_id===bank.bank_account_id
    && dataset.currency_code===bank.currency_code) : [];
  useEffect(()=>{
    if(!open)return;
    let active=true;
    setError('');setDatasets([]);setBankId('');setBookId('');setConfirmed(false);
    backend<BankDataset[]>(base+'/published-bank-datasets')
      .then(values=>{if(active)setDatasets(values);})
      .catch(reason=>{if(active)setError(reason instanceof Error?reason.message:String(reason));});
    return()=>{active=false;};
  },[base,open]);
  const option=(dataset:BankDataset)=> <option key={dataset.id} value={dataset.id}>
    {dataset.bank_label} · {dataset.start_date} – {dataset.end_date} · v{dataset.version} · {dataset.closing} {dataset.currency_code}
  </option>;
  async function save() {
    setBusy(true);setError('');
    try {
      const draft=await backend<{id:string;reused:boolean}>(base+'/reconciliations/from-published',
        {bankDatasetId:bankId,bookDatasetId:bookId,confirmation:true});
      onCreated(draft.id,draft.reused);
    } catch(reason) {setError(reason instanceof Error?reason.message:String(reason));}
    finally {setBusy(false);}
  }
  return <details onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>{l('إنشاء تسوية من بيانات منشورة','Create reconciliation from published datasets')}</summary>
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
      <label className="row"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/>
        {l('أؤكد اختيار الإصدارين لإنشاء مسودة التسوية.','I confirm these two versions for the reconciliation draft.')}
      </label>
      {error&&<Notice tone="danger">{error}</Notice>}
      <Button type="submit" disabled={busy||!bankId||!bookId||!confirmed}>{l('إنشاء مسودة التسوية','Create reconciliation draft')}</Button>
    </form>}
  </details>;
}
