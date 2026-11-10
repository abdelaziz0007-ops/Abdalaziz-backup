import {useState} from 'react';
import {backend} from '@/lib/backend-client';
import {Button} from '@/components/ui/Button';
import {useLanguage} from '@/components/WorkspaceUI';
interface Pair{bankTransactionId:string;bookTransactionId:string;amount:string}
interface Suggestion{kind:string;anchorId:string;anchorSide:'bank'|'books';memberIds:string[];members:{side:string;id:string;rowNumber:number;amount:string}[];postingDate:string;total:string;residual:string;pairs:Pair[]}
interface Search{fingerprint:string;rule:string;searchComplete:boolean;unsearchedReasons:string[];suggestions:Suggestion[]}
export function GroupedSuggestions({base,id,fingerprint,currency,disabled,onChoose}:{base:string;id:string;fingerprint:string;currency:string;disabled:boolean;onChoose:(pairs:Pair[])=>void}){
 const l=useLanguage(),[data,setData]=useState<Search|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function search(){setBusy(true);setError('');setData(null);try{const next=await backend<Search>(base+'/reconciliations/'+id+'/grouped-suggestions');if(next.fingerprint!==fingerprint)throw Error(l('تغيرت التسوية؛ أعد تحميلها قبل البحث.','Reconciliation changed; reload before searching.'));setData(next);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 return <section className="stack" aria-label={l('اقتراحات مجمعة','Grouped suggestions')}>
  <p>{l('بحث استرشادي في المبالغ المتبقية: نفس التاريخ والمرجع واتجاه الحركة، ومجموع مطابق تمامًا. كل اقتراح يحتاج مراجعة؛ قد تتداخل البدائل.','Advisory search of remaining amounts: same date, reference and direction, with an exact total. Every suggestion requires review; alternatives may overlap.')}</p>
  <Button type="button" disabled={busy||disabled} onClick={()=>void search()}>{busy?l('جارٍ البحث…','Searching…'):l('البحث عن مطابقات مجمعة','Find grouped matches')}</Button>
  {error&&<p role="alert">{error}</p>}
  {data&&<><p>{l('حدود البحث: 1000 حركة لكل جانب، 12 مرشحًا لكل حركة، مجموعات من 2–4 حركات، 20 ألف خطوة و100 اقتراح. لا يشمل المراجع الفارغة أو التواريخ المختلفة.','Search limits: 1,000 rows per side, 12 candidates per movement, groups of 2–4, 20,000 steps and 100 suggestions. Empty references and different dates are excluded.')}</p>
  {!data.searchComplete&&<p role="status">{l('بلغ البحث أحد حدوده؛ النتائج غير شاملة. يمكنك متابعة المطابقة اليدوية.','A search limit was reached; results are incomplete. You can continue manually.')} <bdi>{data.unsearchedReasons.join(', ')}</bdi></p>}
  {!data.suggestions.length&&<p>{l('لم يُعثر على مجموعات ضمن القاعدة والحدود المذكورة.','No groups found within this rule and its limits.')}</p>}
  {data.suggestions.map((s,i)=><div key={i} className="stack"><p>{s.anchorSide==='bank'?l('حركة بنك مقابل عدة حركات دفتر','One bank movement to several book movements'):l('عدة حركات بنك مقابل حركة دفتر','Several bank movements to one book movement')} · <bdi>{s.postingDate}</bdi></p><ul>{s.members.map(m=><li key={m.side+':'+m.id}>{m.side==='bank'?l('البنك','Bank'):l('الدفتر','Books')} · {l('صف المصدر','Source row')} <bdi>{m.rowNumber} · {m.amount} {currency}</bdi></li>)}</ul><p>{l('المجموع','Total')}: <bdi>{s.total} {currency}</bdi> · {l('الفرق','Residual')}: <bdi>{s.residual}</bdi></p><Button type="button" disabled={disabled} onClick={()=>onChoose(s.pairs)}>{l('نقل إلى النموذج للمراجعة','Use in review form')}</Button></div>)}</>}
 </section>;
}
