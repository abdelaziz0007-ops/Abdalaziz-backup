import {useRef,useState} from 'react';
import {backend} from '@/lib/backend-client';
import {Button} from '@/components/ui/Button';
import {Notice,useLanguage} from '@/components/WorkspaceUI';
interface Movement{id:string;source_row_id:string;source_file_id:string;row_id:string;signed_amount:string}
export function ReconcilingItemForm({base,id,fingerprint,currency,cutoff,actorId,transactions,onSaved}:{base:string;id:string;fingerprint:string;currency:string;cutoff:string;actorId:string;transactions:{bank:Movement[];books:Movement[]};onSaved:()=>void}){
 const l=useLanguage(),[type,setType]=useState('other'),[date,setDate]=useState(cutoff),[amount,setAmount]=useState(''),[side,setSide]=useState('none'),[source,setSource]=useState(''),[evidence,setEvidence]=useState(''),[description,setDescription]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const nonce=useRef<{body:string;key:string}|null>(null),rows=([...transactions.bank.map(r=>({...r,side:'bank'})),...transactions.books.map(r=>({...r,side:'books'}))]),files=[...new Map(rows.map(r=>[r.source_file_id,r])).values()];
 async function save(){
  setBusy(true);setError('');try{
   const body={expectedFingerprint:fingerprint,reason,itemType:type,originDate:date,signedAmount:amount,effectSide:side,ownerId:actorId,sourceRowId:source||null,description,evidenceSourceFileIds:[evidence]},encoded=JSON.stringify(body);
   if(nonce.current?.body!==encoded)nonce.current={body:encoded,key:crypto.randomUUID()};
   await backend(`${base}/reconciliations/${id}/items`,{...body,requestKey:nonce.current.key});onSaved();
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
 }
 return <details><summary>{l('إضافة بند فرق موثق','Add a documented difference')}</summary><form className="stack" onSubmit={e=>{e.preventDefault();void save();}}>
  <Notice>{l('أنت مالك متابعة هذا البند. اختر الأثر بإشارته صراحةً: يضاف المبلغ إلى جانب التسوية المختار. المصدر المحجور يصلح كدليل أولي؛ الاعتماد يحتاج دليلًا مفحوصًا.','You own this item’s follow-up. Choose the signed effect explicitly: the amount is added to the selected side. Quarantined evidence remains preliminary until scanned for approval.')}</Notice>
  <div className="form-grid"><label>{l('نوع بند الفرق','Difference type')}<select aria-label={l('نوع بند الفرق','Difference type')} value={type} onChange={e=>setType(e.target.value)}>{[['deposit_in_transit','إيداع بالطريق','Deposit in transit'],['outstanding_payment','دفعة معلقة','Outstanding payment'],['bank_fee','رسوم بنكية','Bank fee'],['interest_income','فوائد غير مسجلة','Unrecorded interest'],['bank_error','خطأ بنك','Bank error'],['book_error','خطأ دفتر','Book error'],['other','أخرى','Other']].map(([value,ar,en])=><option key={value} value={value}>{l(ar,en)}</option>)}</select></label>
  <label>{l('تاريخ نشأة البند','Item origination date')}<input aria-label={l('تاريخ نشأة البند','Item origination date')} required type="date" max={cutoff} value={date} onChange={e=>setDate(e.target.value)}/></label>
  <label>{l('المبلغ الموقّع','Signed adjustment')} · {currency}<input aria-label={l('المبلغ الموقّع للبند','Signed item amount')} required inputMode="decimal" maxLength={40} value={amount} onChange={e=>setAmount(e.target.value)}/></label>
  <label>{l('جانب أثر البند','Item adjustment side')}<select aria-label={l('جانب أثر البند','Item adjustment side')} value={side} onChange={e=>setSide(e.target.value)}><option value="none">{l('بدون أثر على الأرصدة','No balance effect')}</option><option value="bank">{l('إضافة إلى رصيد البنك','Add to bank balance')}</option><option value="books">{l('إضافة إلى رصيد الدفتر','Add to books balance')}</option></select></label>
  <label>{l('الحركة الداعمة للبند','Supporting item movement')}<select aria-label={l('الحركة الداعمة للبند','Supporting item movement')} value={source} onChange={e=>setSource(e.target.value)}><option value="">{l('بدون ربط حركة — الدليل إلزامي','No linked movement — evidence required')}</option>{rows.map(r=><option key={r.id} value={r.source_row_id}>{r.side==='bank'?l('البنك','Bank'):l('الدفتر','Books')} · {r.row_id} · {r.signed_amount}</option>)}</select></label>
  <label>{l('ملف الدليل الداعم','Supporting evidence file')}<select aria-label={l('ملف الدليل الداعم','Supporting evidence file')} required value={evidence} onChange={e=>setEvidence(e.target.value)}><option value="">{l('اختر مصدر الدليل','Select evidence source')}</option>{files.map(r=><option key={r.source_file_id} value={r.source_file_id}>{r.side==='bank'?l('كشف البنك المستورد','Imported bank statement'):l('دفتر البنك المستورد','Imported bank ledger')}</option>)}</select></label></div>
  <label>{l('وصف بند الفرق','Difference description')}<textarea aria-label={l('وصف بند الفرق','Difference description')} required minLength={8} maxLength={1000} value={description} onChange={e=>setDescription(e.target.value)}/></label>
  <label>{l('سبب تسجيل بند الفرق','Reason for recording difference')}<input aria-label={l('سبب تسجيل بند الفرق','Reason for recording difference')} required minLength={8} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
  {error&&<Notice tone="danger">{error}</Notice>}<Button type="submit" disabled={busy||!evidence||!amount||description.trim().length<8||reason.trim().length<8}>{busy?l('جارٍ الحفظ…','Saving…'):l('حفظ بند الفرق','Save difference item')}</Button>
 </form></details>;
}
