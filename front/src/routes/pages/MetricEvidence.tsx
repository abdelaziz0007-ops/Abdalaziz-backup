import {useState} from 'react';
import {backend} from '@/lib/backend-client';
import {Button} from '@/components/ui/Button';
import {useLanguage} from '@/components/WorkspaceUI';
interface Contribution{accountId:string;accountCode:string;sourceRowId:string;rowNumber:number;sourceSha256:string;contribution:string}
interface Evidence{available:boolean;reason?:string;complete?:boolean;withheldRows?:number;components:{code:string;savedTotal:string|null;recomputedTotal:string|null;matchesSavedTotal:boolean|null;rows:Contribution[]}[]}
const names:Record<string,[string,string]>={revenue:['الإيرادات','Revenue'],cost:['تكلفة الإيرادات','Cost'],net_profit:['صافي الربح','Net profit'],current_assets:['الأصول المتداولة','Current assets'],current_liabilities:['الالتزامات المتداولة','Current liabilities'],assets:['الأصول','Assets'],liabilities:['الالتزامات','Liabilities']};
export function MetricEvidence({base,reportId,metricId}:{base:string;reportId:string;metricId:string}){
 const l=useLanguage(),[data,setData]=useState<Evidence|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){setBusy(true);setError('');try{setData(await backend<Evidence>(base+'/reports/'+reportId+'/metrics/'+metricId+'/sources'));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 return <details><summary>{l('الحسابات المكونة للمؤشر','Contributing accounts')}</summary>
  <p>{l('الأدلة من ميزان المراجعة وربط الحسابات المثبت على هذا الإصدار. لا تتضمن تفاصيل الحركات المحاسبية.','Evidence uses the trial balance and account mapping frozen on this version. It does not provide ledger transaction detail.')}</p>
  <Button type="button" disabled={busy} onClick={()=>void load()}>{busy?l('جارٍ التحميل…','Loading…'):l('عرض الأدلة','Show evidence')}</Button>
  {error&&<p role="alert">{error}</p>}
  {data&&!data.available&&<p role="status">{l('تتبع الحسابات غير متاح لهذه المعادلة أو لبياناتها المحفوظة.','Account evidence is unavailable for this formula or its saved inputs.')}</p>}
  {data?.available&&<>{!data.complete&&<p role="status">{l('الدليل غير مكتمل أو لا يطابق القيم المحفوظة؛ يلزم التحقق قبل الاعتماد.','Evidence is incomplete or does not match saved totals; verify before approval.')}</p>}
   {!!data.withheldRows&&<p>{l('صفوف حُجبت لعدم اجتياز الفحص أو لحذف المصدر','Rows withheld because scanning has not passed or the source was deleted')}: {data.withheldRows}</p>}
   {data.components.map(c=><section className="stack" key={c.code}><h4>{names[c.code]?l(...names[c.code]):c.code}</h4>
    <p>{l('الإجمالي المحفوظ','Saved total')}: <bdi>{c.savedTotal??'—'}</bdi> · {l('مجموع المساهمات','Sum of contributions')}: <bdi>{c.recomputedTotal??'—'}</bdi> · {c.matchesSavedTotal===true?l('متطابق','Matches'):c.matchesSavedTotal===false?l('غير متطابق','Mismatch'):l('غير قابل للتحقق','Unverified')}</p>
    <ul>{c.rows.map(r=><li key={r.sourceRowId+':'+r.accountId}>{l('الحساب','Account')} <bdi>{r.accountCode}</bdi> · {l('صف المصدر','Source row')} {r.rowNumber} · <bdi>{r.contribution}</bdi><details><summary>{l('بصمة ملف المصدر','Source file fingerprint')}</summary><bdi style={{overflowWrap:'anywhere'}}>{r.sourceSha256}</bdi></details></li>)}</ul>
   </section>)}
  </>}
 </details>;
}
