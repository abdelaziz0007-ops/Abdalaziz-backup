import {useEffect,useRef,useState} from 'react';
import {backend} from '@/lib/backend-client';
import {Button} from '@/components/ui/Button';
import {Panel,useLanguage} from '@/components/WorkspaceUI';
interface Hold{id:string;entity_id:string|null;reason:string;authority:string;authorized_by:string;review_due_at:string;released_at:string|null;release_reason:string|null}
interface Policy{id:string;policy_code:string;version:number;category:string;retention_days:number;trigger_event:string;legal_basis:string}
export function RetentionControls({tenant,entity,actorId}:{tenant:string;entity?:string;actorId:string}){
 const l=useLanguage(),base='/tenants/'+tenant+(entity?'/entities/'+entity:'')+'/retention';
 const [data,setData]=useState<{holds:Hold[];policies:Policy[]}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const [reason,setReason]=useState(''),[authority,setAuthority]=useState(''),[due,setDue]=useState(''),[releaseReason,setReleaseReason]=useState('');
 const [code,setCode]=useState(''),[category,setCategory]=useState('originals'),[days,setDays]=useState(''),[trigger,setTrigger]=useState('created_at'),[basis,setBasis]=useState(''),[policyReason,setPolicyReason]=useState('');
 const pending=useRef<{signature:string;key:string}|null>(null);
 useEffect(()=>{let live=true;setData(null);setError('');backend<{holds:Hold[];policies:Policy[]}>(base).then(v=>{if(live)setData(v);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[base,revision]);
 async function save(path:string,values:Record<string,unknown>){setBusy(true);setError('');const signature=JSON.stringify([base,path,values]);if(pending.current?.signature!==signature)pending.current={signature,key:crypto.randomUUID()};try{await backend(base+path,{...values,requestKey:pending.current.key});pending.current=null;setRevision(v=>v+1);setReason('');setReleaseReason('');setPolicyReason('');}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 const labels:Record<string,string>={originals:l('الملفات الأصلية','Original files'),derivatives:l('المخرجات المشتقة','Derived outputs'),indexes:l('الفهارس','Indexes'),providers:l('مزودو الخدمة','Providers'),audit:l('سجل التدقيق','Audit trail')};
 return <Panel title={l('الاحتفاظ والحجز القانوني','Retention and legal holds')}>
 {error&&<p role="alert" className="notice danger">{error}</p>}
 <p>{l('موعد المراجعة لا يلغي الحجز تلقائياً. يحتاج رفع الحجز إلى مسؤول خصوصية آخر. السياسات تسجل اختياركم ولا تشغّل حذفاً آلياً.','The review date does not automatically release a hold. Release requires another privacy administrator. Policies record your decision and do not run automatic deletion.')}</p>
 <form className="stack" onSubmit={e=>{e.preventDefault();void save('/hold',{reason,authority,reviewDueAt:new Date(due).toISOString()});}}>
 <fieldset disabled={busy}><legend>{l('إضافة حجز على النطاق الحالي','Place a hold on the current scope')}</legend>
 <label className="form-field">{l('مرجع السلطة أو القرار','Authority or decision reference')}<input required minLength={4} maxLength={500} value={authority} onChange={e=>setAuthority(e.target.value)}/></label>
 <label className="form-field">{l('سبب الحجز','Hold reason')}<textarea required minLength={8} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
 <label className="form-field">{l('موعد المراجعة بتوقيت جهازك','Review date in your device time zone')}<input type="datetime-local" required value={due} onChange={e=>setDue(e.target.value)}/></label>
 <Button type="submit" disabled={busy}>{l('تسجيل الحجز','Record hold')}</Button></fieldset></form>
 <p>{l('تعرض القائمة أحدث 200 حجز؛ وجود حجوزات أقدم يظل مؤثراً على منع الحذف.','The list shows the latest 200 holds; older active holds still block deletion.')}</p>
 {data&&data.holds.length===0&&<p>{l('لا توجد حجوزات مسجلة.','No holds recorded.')}</p>}
 <label className="form-field">{l('سبب رفع الحجز المحدد أدناه','Reason for releasing a hold below')}<textarea disabled={busy} minLength={8} maxLength={500} value={releaseReason} onChange={e=>setReleaseReason(e.target.value)}/></label>
 <ul className="stack">{data?.holds.map(h=><li key={h.id}><strong>{h.released_at?l('مرفوع','Released'):l('فعال','Active')}</strong> · {h.entity_id?l('منشأة','Entity'):l('مساحة العمل كاملة','Entire workspace')}<p>{h.reason}</p><p>{h.authority}</p><p>{l('موعد المراجعة','Review due')}: {new Date(h.review_due_at).toLocaleString()}{!h.released_at&&Date.parse(h.review_due_at)<Date.now()?' · '+l('تجاوز موعد المراجعة','Review overdue'):''}</p>{h.release_reason&&<p>{h.release_reason}</p>}{!h.released_at&&h.authorized_by!==actorId&&h.entity_id===(entity??null)&&<Button disabled={busy||releaseReason.trim().length<8} onClick={()=>void save('/'+h.id+'/release',{reason:releaseReason})}>{l('رفع هذا الحجز','Release this hold')}</Button>}</li>)}</ul>
 <h3>{l('سياسات الاحتفاظ الحالية','Current retention policies')}</h3>
 <ul>{data?.policies.map(p=><li key={p.id}>{p.policy_code} · v{p.version} · {labels[p.category]} · {p.retention_days} {l('يوماً','days')} · {p.trigger_event==='created_at'?l('من الإنشاء','from creation'):l('من إنهاء الخدمة','from service termination')}<p>{p.legal_basis}</p></li>)}</ul>
 {!entity&&<form className="stack" onSubmit={e=>{e.preventDefault();void save('/policy',{code,category,retentionDays:Number(days),triggerEvent:trigger,legalBasis:basis,reason:policyReason});}}><fieldset disabled={busy}><legend>{l('اعتماد نسخة سياسة جديدة','Approve a new policy version')}</legend>
 <label className="form-field">{l('رمز السياسة (أحرف إنجليزية صغيرة)','Policy code (lowercase Latin)')}<input required pattern="[a-z][a-z0-9_-]{2,39}" maxLength={40} value={code} onChange={e=>setCode(e.target.value)}/></label>
 <label className="form-field">{l('الفئة','Category')}<select value={category} onChange={e=>setCategory(e.target.value)}>{Object.entries(labels).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
 <label className="form-field">{l('مدة الاحتفاظ بالأيام','Retention in days')}<input type="number" required min={0} max={36500} step={1} value={days} onChange={e=>setDays(e.target.value)}/></label>
 <label className="form-field">{l('بداية الاحتساب','Retention starts')}<select value={trigger} onChange={e=>setTrigger(e.target.value)}><option value="created_at">{l('عند الإنشاء','At creation')}</option><option value="service_terminated">{l('عند إنهاء الخدمة','At service termination')}</option></select></label>
 <label className="form-field">{l('الأساس المعتمد للسياسة','Policy basis')}<textarea required minLength={8} maxLength={1000} value={basis} onChange={e=>setBasis(e.target.value)}/></label>
 <label className="form-field">{l('سبب اعتماد النسخة','Reason for approval')}<textarea required minLength={8} maxLength={500} value={policyReason} onChange={e=>setPolicyReason(e.target.value)}/></label>
 <Button type="submit" disabled={busy}>{l('اعتماد نسخة السياسة','Approve policy version')}</Button></fieldset></form>}
 </Panel>;
}
