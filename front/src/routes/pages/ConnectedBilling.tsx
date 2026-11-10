import {useEffect,useState} from 'react';
import {backend} from '@/lib/backend-client';
import {Button} from '@/components/ui/Button';
import {Panel,useLanguage} from '@/components/WorkspaceUI';
interface Billing {subscription:null|{id:string;status:string;periodStart:string|null;periodEnd:string|null;endedAt:string|null;plan:{name:string;code:string;version:number;limits:Record<string,unknown>;priceAmount:string|null;priceCurrency:string|null;interval:string|null;published:boolean}};acceptedScans:string;activeJobs:number;invoices:{id:string;currency_code:string;total:string;status:string;period_start:string;period_end:string}[];paymentEnabled:boolean}
export function ConnectedBilling({tenant}:{tenant:string}){
 const l=useLanguage(),[data,setData]=useState<Billing|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0),[loading,setLoading]=useState(false);
 useEffect(()=>{let live=true;setData(null);setLoading(true);setError('');backend<Billing>('/tenants/'+tenant+'/billing').then(v=>{if(live)setData(v);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[tenant,revision]);
 const sub=data?.subscription,limit=sub?.plan.limits.scan_jobs_per_period;
 const status:Record<string,string>={trial:l('تجريبي','Trial'),active:l('فعال','Active'),past_due:l('متأخر الدفع','Past due'),suspended:l('موقوف','Suspended'),cancelled:l('ملغى','Cancelled'),draft:l('مسودة','Draft'),open:l('مفتوحة','Open'),paid:l('مدفوعة','Paid'),void:l('ملغاة','Void'),uncollectible:l('متعذرة التحصيل','Uncollectible')};
 return <div className="stack"><Panel title={l('الاشتراك والاستخدام','Subscription and usage')} action={<Button disabled={loading} onClick={()=>setRevision(v=>v+1)}>{l('تحديث','Refresh')}</Button>}>
 {error&&<p role="alert" className="notice danger">{error}</p>}{loading&&<p role="status">{l('جارٍ تحميل السجل الفعلي…','Loading saved records…')}</p>}
 {data&&!sub&&<p>{l('لا يوجد اشتراك مسجل لهذه المساحة. حدود التشغيل الحالية: 10 مهام في الطابور أو التنفيذ، وعمليتا فحص متزامنتان. لا توجد رسوم أو حصة دورية معتمدة هنا.','No subscription is recorded for this workspace. Current operational limits: 10 queued or running jobs and two concurrent scans. No charges or periodic allowance are configured here.')}</p>}
 {sub&&<div className="stack"><h3>{sub.plan.name} · v{sub.plan.version}</h3><p>{status[sub.status]??sub.status}</p><p>{l('فترة الاشتراك','Subscription period')}: <bdi>{sub.periodStart?new Date(sub.periodStart).toLocaleString():'—'} — {sub.periodEnd?new Date(sub.periodEnd).toLocaleString():'—'}</bdi></p>{sub.plan.priceAmount!==null&&<p>{l('سعر الخطة المسجل','Recorded plan price')}: <bdi>{sub.plan.priceAmount} {sub.plan.priceCurrency}</bdi> · {sub.plan.interval}</p>}
 <p>{l('مهام الفحص المقبولة في الفترة','Scan jobs accepted in this period')}: <bdi>{data?.acceptedScans} / {typeof limit==='number'||typeof limit==='string'?String(limit):l('غير مهيأ','Not configured')}</bdi></p>
 <p>{l('تُحتسب المهمة عند قبولها في الطابور؛ إعادة المحاولة لنفس المهمة لا تضيف وحدة، وإلغاء المهمة لا يسترد الوحدة. تُرفض المهام الجديدة عند نفاد الحصة أو انتهاء الاشتراك.','A job counts when accepted into the queue. Retrying the same job adds no unit; cancellation does not refund it. New jobs are rejected when the allowance is exhausted or the subscription expires.')}</p></div>}
 {data&&<p>{l('المهام المنتظرة أو الجارية الآن','Jobs queued or running now')}: {data.activeJobs}</p>}
 <p>{l('الدفع الإلكتروني وتغيير الخطة من الواجهة غير مفعّلين بعد. يعرض هذا القسم السجلات المحفوظة فقط.','Online payments and plan changes are not enabled yet. This section displays saved records only.')}</p>
 </Panel><Panel title={l('الفواتير المسجلة','Recorded invoices')}>
 {data?.invoices.length===0&&<p>{l('لا توجد فواتير مسجلة.','No invoices recorded.')}</p>}
 <ul className="stack">{data?.invoices.map(i=><li key={i.id}><bdi>{i.total} {i.currency_code}</bdi> · {status[i.status]??i.status}<p><bdi>{i.period_start} — {i.period_end}</bdi></p><small>{i.id}</small></li>)}</ul>
 <p>{l('تُعرض أحدث 100 فاتورة.','Shows the latest 100 invoices.')}</p>
 </Panel></div>;
}
