import { useEffect,useState,type FormEvent } from 'react';
import { Link,useLocation,useNavigate } from 'react-router-dom';
import { authClient } from '@/lib/auth-client';
import { backend,BackendError } from '@/lib/backend-client';
import { Button } from '@/components/ui/Button';
import { Notice,PageHeader,Panel,Status,useLanguage } from '@/components/WorkspaceUI';
import { PublicLayout } from './PublicPages';
import { DataTable } from '@/components/ui/DataTable';
import { ConnectedFinance } from './ConnectedFinance';
import { WorkspaceAudit } from './WorkspaceAudit';
import {PeriodLifecycle,type PeriodVersion} from './PeriodLifecycle';
import { ConnectedBank } from './ConnectedBank';
import {AdministrationPanel} from './AdministrationPanel';
import {ReviewWorkspace} from './ReviewWorkspace';
import {SourceJobsPanel} from './SourceJobsPanel';

interface Me {user:{id:string;name:string;email:string};mfaEnabled:boolean;mfaVerified:boolean;mfaVerifiedAt:string|null}
interface Workspace {id:string;name:string;region:string}
interface Entity {id:string;code:string;name:string;status:string}
interface Currency {code:string;name:string;minor_units:number}
export function ConnectedAuth({kind}:{kind:string}){
  const l=useLanguage(),nav=useNavigate(),location=useLocation();
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[code,setCode]=useState(''),[backupMode,setBackupMode]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const signup=kind==='sign-up',mfa=kind==='mfa',recovery=kind==='password-recovery';
  async function submit(e:FormEvent){
    e.preventDefault();setError('');setBusy(true);
    try{
      if(mfa){const response=backupMode?await authClient.twoFactor.verifyBackupCode({code}):await authClient.twoFactor.verifyTotp({code,trustDevice:false});if(response.error)throw new Error(response.error.message);}
      else if(signup){const response=await authClient.signUp.email({email,password,name});if(response.error)throw new Error(response.error.message);}
      else{const response=await authClient.signIn.email({email,password});if(response.error)throw new Error(response.error.message);if(response.data&&'twoFactorRedirect' in response.data&&response.data.twoFactorRedirect){nav('/auth/mfa');return;}}
      nav('/workspace');
    }catch(e){setError(e instanceof Error?e.message:l('تعذر الاتصال. حاول مجددًا.','Unable to connect. Try again.'));}finally{setBusy(false);}
  }
  return <PublicLayout connected><div className="workspace-page" style={{maxWidth:520,margin:'0 auto'}}><PageHeader title={recovery?l('استعادة الوصول','Recover access'):mfa?l('التحقق بخطوتين','Two-factor verification'):signup?l('إنشاء حساب','Create an account'):l('تسجيل الدخول','Sign in')} description={l('حسابك الفعلي ومساحات عملك المحفوظة.','Your real account and saved workspaces.')}/><Panel title={l('الوصول الآمن','Secure access')}>
    {recovery?<><Notice tone="warning">{l('خدمة بريد الاستعادة لم تُربط بعد. لا يُرسل هذا النموذج رسائل ولا يغيّر كلمات المرور. إذا فقدت تطبيق المصادقة، استخدم رموز الاسترداد التي حفظتها عند التفعيل.','Recovery email is not connected yet. This page sends no messages and changes no passwords. Keep your authenticator recovery codes safe.')}</Notice><Link to="/auth/sign-in">{l('العودة للدخول','Back to sign in')}</Link></>:<form className="stack" onSubmit={submit} key={location.pathname}>
      {error&&<Notice tone="danger"><p role="alert">{error}</p></Notice>}
      {mfa?<><label className="form-field">{backupMode?l('رمز الاسترداد','Recovery code'):l('رمز تطبيق المصادقة','Authenticator code')}<input required inputMode={backupMode?'text':'numeric'} autoComplete="one-time-code" pattern={backupMode?undefined:'[0-9]{6}'} maxLength={backupMode?64:6} value={code} onChange={e=>setCode(e.target.value)}/></label><p className="small muted">{l('استخدم الرمز الحالي من تطبيق المصادقة المرتبط بحسابك، أو رمز استرداد محفوظًا لم يُستخدم من قبل.','Use your current authenticator code, or an unused saved recovery code.')}</p><Button type="button" variant="ghost" onClick={()=>{setBackupMode(!backupMode);setCode('');}}>{backupMode?l('استخدام تطبيق المصادقة','Use authenticator'):l('استخدام رمز استرداد','Use recovery code')}</Button></>:<>
        {signup&&<label className="form-field">{l('الاسم','Name')}<input required autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label>}
        <label className="form-field">{l('البريد الإلكتروني','Email')}<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label>
        <label className="form-field">{l('كلمة المرور','Password')}<input required type="password" minLength={12} maxLength={128} autoComplete={signup?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <p className="small muted">{l('12 حرفًا على الأقل. ستُفعّل المصادقة الثنائية قبل إعداد مساحة العمل.','At least 12 characters. Enable two-factor authentication before workspace setup.')}</p>
      </>}
      <Button type="submit" variant="primary" disabled={busy}>{busy?l('جارٍ المتابعة…','Continuing…'):mfa?l('تحقق ومتابعة','Verify and continue'):signup?l('إنشاء الحساب','Create account'):l('دخول','Sign in')}</Button>
      <Link to={signup?'/auth/sign-in':'/auth/sign-up'}>{signup?l('لدي حساب بالفعل','I already have an account'):l('إنشاء حساب جديد','Create a new account')}</Link><Link to="/auth/forgot-password">{l('استعادة الوصول','Recover access')}</Link>
    </form>}
    <p style={{marginBlockStart:20}}><Link to="/app/overview">{l('استكشاف العرض التجريبي دون حساب','Explore the demonstration without an account')}</Link></p>
  </Panel></div></PublicLayout>;
}

function SecuritySetup({me,onVerified}:{me:Me;onVerified:()=>Promise<void>}){
  const l=useLanguage();const [password,setPassword]=useState(''),[code,setCode]=useState(''),[uri,setUri]=useState(''),[qr,setQr]=useState(''),[backup,setBackup]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function enable(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{
    const response=await authClient.twoFactor.enable({password});if(response.error)throw new Error(response.error.message);
    const data=response.data as {totpURI?:string;backupCodes?:string[]};
    if(!data.totpURI)throw new Error('Authenticator setup did not return a QR code');
    setUri(data.totpURI);setBackup(data.backupCodes??[]);setPassword('');
    const qrcode=await import('qrcode');setQr(await qrcode.toDataURL(data.totpURI,{width:240,margin:2}));
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  async function verify(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const response=await authClient.twoFactor.verifyTotp({code,trustDevice:false});if(response.error)throw new Error(response.error.message);setCode('');setUri('');setBackup([]);setQr('');await onVerified();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  return <Panel title={me.mfaEnabled?l('تأكيد رمز المصادقة','Confirm authenticator code'):l('فعّل المصادقة الثنائية','Enable two-factor authentication')}>
    <p>{l('تحمي هذه الخطوة إعدادات منشآتك وقراراتك المالية. استخدم تطبيق مصادقة يدعم TOTP.','Protect your entity settings and financial decisions with a TOTP authenticator app.')}</p>
    {error&&<Notice tone="danger"><p role="alert">{error}</p></Notice>}
    {!me.mfaEnabled&&!uri?<form className="stack" onSubmit={enable}><label className="form-field">{l('كلمة المرور لتأكيد الإعداد','Password to confirm setup')}<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><Button type="submit" disabled={busy}>{l('إعداد تطبيق المصادقة','Set up authenticator')}</Button></form>:<>
      {uri&&<>{qr&&<img src={qr} alt={l('رمز QR لإضافة حسابك إلى تطبيق المصادقة','QR code to add your account to an authenticator')} style={{maxWidth:'100%',display:'block'}}/>}
        <label className="form-field">{l('رابط الإعداد اليدوي — سري','Manual setup URI — secret')}<input readOnly value={uri} dir="ltr"/></label>
        <Notice tone="warning">{l('احفظ رموز الاسترداد التالية في مكان آمن قبل المتابعة. لا تشاركها مع أحد.','Save these recovery codes securely before continuing. Do not share them.')}</Notice><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{backup.join('\n')}</pre></>}
      <form className="stack" onSubmit={verify}><label className="form-field">{l('رمز تطبيق المصادقة','Authenticator code')}<input required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" value={code} maxLength={6} onChange={e=>setCode(e.target.value)}/></label><Button type="submit" disabled={busy} variant="primary">{l('تحقق ومتابعة','Verify and continue')}</Button></form>
    </>}
  </Panel>;
}

export function ConnectedWorkspace(){
  const l=useLanguage(),nav=useNavigate();
  const [me,setMe]=useState<Me|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const [workspaces,setWorkspaces]=useState<Workspace[]>([]),[tenant,setTenant]=useState(''),[entities,setEntities]=useState<Entity[]>([]),[entity,setEntity]=useState(''),[periods,setPeriods]=useState<PeriodVersion[]>([]),[currencies,setCurrencies]=useState<Currency[]>([]),[security,setSecurity]=useState(false);
  const [workspaceKey,setWorkspaceKey]=useState(()=>crypto.randomUUID());
  const [workspaceName,setWorkspaceName]=useState(''),[consent,setConsent]=useState(false),[entityName,setEntityName]=useState(''),[entityCode,setEntityCode]=useState(''),[currency,setCurrency]=useState('USD'),[framework,setFramework]=useState(''),[fiscalStart,setFiscalStart]=useState(1),[effective,setEffective]=useState(new Date().getFullYear()+'-01-01'),[preparer,setPreparer]=useState(false),[start,setStart]=useState(''),[end,setEnd]=useState('');
  async function refreshMe(){const value=await backend<Me>('/me');setMe(value);setSecurity(false);setRevision(r=>r+1);}
  const showError=(e:unknown)=>{if(e instanceof BackendError&&e.status===401){nav('/auth/sign-in',{replace:true});return;}if(e instanceof BackendError&&e.code==='MFA_REQUIRED')setSecurity(true);const messages:Record<string,[string,string]>={MFA_REQUIRED:['أكّد رمز المصادقة للمتابعة.','Verify your authenticator code to continue.'],PERMISSION_DENIED:['ليس لديك صلاحية لهذا الإجراء.','You do not have permission for this action.'],PERIOD_OVERLAP:['تتداخل هذه الفترة مع فترة محفوظة.','This date range overlaps a saved period.'],RESOURCE_NOT_FOUND:['مساحة العمل أو المنشأة غير متاحة لحسابك.','Workspace or entity unavailable to your account.']};setError(e instanceof BackendError&&messages[e.code]?l(...messages[e.code]):e instanceof Error?e.message:String(e));};
  useEffect(()=>{let live=true;backend<Me>('/me').then(value=>{if(live)setMe(value);}).catch(showError).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[]);
  useEffect(()=>{if(!me)return;let live=true;backend<Workspace[]>('/tenants').then(values=>{if(!live)return;setWorkspaces(values);setTenant(old=>values.some(w=>w.id===old)?old:values[0]?.id??'');}).catch(showError);backend<Currency[]>('/reference/currencies').then(values=>{if(live)setCurrencies(values);}).catch(showError);return()=>{live=false;};},[me?.user.id,revision]);
  useEffect(()=>{if(!tenant||!me?.mfaVerified)return;let live=true;backend<Entity[]>(`/tenants/${tenant}/entities`).then(values=>{if(live){setEntities(values);setEntity(old=>values.some(e=>e.id===old)?old:values[0]?.id??'');}}).catch(e=>{if(live)showError(e);});return()=>{live=false;};},[tenant,me?.mfaVerified,revision]);
  useEffect(()=>{setPeriods([]);if(!tenant||!entity)return;let live=true;backend<PeriodVersion[]>(`/tenants/${tenant}/entities/${entity}/periods`).then(values=>{if(live)setPeriods(values);}).catch(e=>{if(live)showError(e);});return()=>{live=false;};},[tenant,entity,revision]);
  async function action(fn:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await fn();setRevision(r=>r+1);}catch(e){showError(e);}finally{setBusy(false);}}
  async function createWorkspace(e:FormEvent){e.preventDefault();await action(async()=>{const value=await backend<{id:string}>('/tenants',{name:workspaceName,administrationConsent:consent,idempotencyKey:workspaceKey});setWorkspaceKey(crypto.randomUUID());setEntity('');setEntities([]);setTenant(value.id);setWorkspaceName('');setConsent(false);setMessage(l('أُنشئت مساحة العمل وحُفظت صلاحيات إدارتك.','Workspace and explicit administration grants saved.'));});}
  async function createEntity(e:FormEvent){e.preventDefault();await action(async()=>{await backend(`/tenants/${tenant}/entities`,{code:entityCode,name:entityName,currency,framework,effectiveFrom:effective,fiscalYearStartMonth:fiscalStart,grantPreparerAccess:preparer});setEntityName('');setEntityCode('');setMessage(l('حُفظت المنشأة وإعداداتها.','Entity and settings saved.'));});}
  async function createPeriod(e:FormEvent){e.preventDefault();await action(async()=>{await backend(`/tenants/${tenant}/entities/${entity}/periods`,{startDate:start,endDate:end});setStart('');setEnd('');setMessage(l('حُفظت الفترة المالية.','Accounting period saved.'));});}
  return <PublicLayout connected><div className="workspace-page"><PageHeader title={l('مساحة عملك','Your workspace')} description={me?`${me.user.name} · ${me.user.email}`:l('جارٍ التحقق من الجلسة…','Checking your session…')} actions={me?<><Button onClick={()=>setSecurity(!security)}>{l('تأكيد المصادقة','Verify MFA')}</Button><Button onClick={()=>action(async()=>{await authClient.signOut();nav('/auth/sign-in');})}>{l('تسجيل الخروج','Sign out')}</Button></>:undefined}/>
    {error&&<Notice tone="danger"><p role="alert">{error}</p></Notice>}{message&&<p role="status" className="notice success">{message}</p>}
    {loading&&<p role="status">{l('جارٍ التحميل…','Loading…')}</p>}
    {me&&(!me.mfaVerified||security)?<SecuritySetup me={me} onVerified={refreshMe}/>:me&&<>
      <Notice>{l('تُحفظ مساحات العمل والمنشآت والفترات في حسابك، وتبقى بعد إعادة تحميل الصفحة. بيانات العرض التجريبي مستقلة عن هذه المساحة.','Workspaces, entities and periods are saved to your account and survive reload. Demonstration data is separate from this workspace.')}</Notice>
      {sessionStorage.getItem('mizan.pending-invitation')&&<Notice><Link to={'/invitation/'+sessionStorage.getItem('mizan.pending-invitation')}>{l('متابعة الدعوة المحفوظة','Continue saved invitation')}</Link></Notice>}
      <div className="form-grid"><label className="form-field">{l('مساحة العمل','Workspace')}<select value={tenant} onChange={e=>{setTenant(e.target.value);setEntity('');setEntities([]);setPeriods([]);}}><option value="">{l('اختر مساحة عمل','Select workspace')}</option>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label className="form-field">{l('المنشأة','Entity')}<select value={entity} onChange={e=>setEntity(e.target.value)}><option value="">{l('اختر منشأة','Select entity')}</option>{entities.map(e=><option key={e.id} value={e.id}>{e.name} · {e.code}</option>)}</select></label></div>
      <Panel title={l('إنشاء مساحة عمل','Create workspace')}><form className="stack" onSubmit={createWorkspace}><label className="form-field">{l('اسم مساحة العمل','Workspace name')}<input required minLength={2} maxLength={200} value={workspaceName} onChange={e=>{setWorkspaceName(e.target.value);setWorkspaceKey(crypto.randomUUID());}}/></label><label className="row"><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/>{l('أوافق على منحي إدارة المنشآت والأعضاء لهذه المساحة. صلاحيات المحتوى المالي تُمنح بشكل مستقل.','Grant me entity and membership administration for this workspace. Financial content permissions remain separate.')}</label><Button type="submit" disabled={busy} variant="primary">{l('إنشاء المساحة','Create workspace')}</Button></form></Panel>
      {tenant&&<Panel title={l('إضافة منشأة','Add entity')}><form className="stack" onSubmit={createEntity}><div className="form-grid"><label className="form-field">{l('اسم المنشأة','Entity name')}<input required value={entityName} onChange={e=>setEntityName(e.target.value)}/></label><label className="form-field">{l('رمز المنشأة','Entity code')}<input required value={entityCode} onChange={e=>setEntityCode(e.target.value)}/></label><label className="form-field">{l('العملة الوظيفية','Functional currency')}<select value={currency} onChange={e=>setCurrency(e.target.value)}>{currencies.map(c=><option value={c.code} key={c.code}>{c.code}</option>)}</select></label><label className="form-field">{l('الإطار المحاسبي','Accounting framework')}<input required value={framework} onChange={e=>setFramework(e.target.value)}/></label><label className="form-field">{l('شهر بداية السنة المالية','Fiscal year start month')}<input required type="number" min={1} max={12} value={fiscalStart} onChange={e=>setFiscalStart(Number(e.target.value))}/></label><label className="form-field">{l('سريان الإعدادات من','Settings effective from')}<input required type="date" value={effective} onChange={e=>setEffective(e.target.value)}/></label></div><label className="row"><input type="checkbox" checked={preparer} onChange={e=>setPreparer(e.target.checked)}/>{l('امنحني صلاحية إعداد وعرض البيانات المالية لهذه المنشأة.','Grant me financial preparation and viewing access for this entity.')}</label><Button type="submit" disabled={busy}>{l('حفظ المنشأة','Save entity')}</Button></form></Panel>}
      {tenant&&entity&&<Panel title={l('الفترات المالية','Accounting periods')}><DataTable label={l('الفترات المحفوظة','Saved periods')} rows={periods} rowKey={p=>p.id} columns={[{key:'start',header:l('البداية','Start'),render:p=><bdi>{p.start_date}</bdi>},{key:'end',header:l('النهاية','End'),render:p=><bdi>{p.end_date}</bdi>},{key:'status',header:l('الحالة','Status'),render:p=><Status value={p.status}/>},{key:'version',header:l('الإصدار','Version'),render:p=>p.version},{key:'reason',header:l('سبب إعادة الفتح','Reopening reason'),render:p=>p.reopen_reason??'—'}]}/><form className="stack" onSubmit={createPeriod}><div className="form-grid"><label className="form-field">{l('بداية الفترة','Period start')}<input type="date" required value={start} onChange={e=>setStart(e.target.value)}/></label><label className="form-field">{l('نهاية الفترة','Period end')}<input type="date" required value={end} onChange={e=>setEnd(e.target.value)}/></label></div><Button type="submit" disabled={busy}>{l('إنشاء الفترة','Create period')}</Button></form><PeriodLifecycle key={tenant+entity} base={'/tenants/'+tenant+'/entities/'+entity} periods={periods} onError={showError} onSaved={action=>{setError('');setRevision(value=>value+1);setMessage(action==='lock'?l('أُقفلت الفترة.','The accounting period is locked.'):l('فُتحت الفترة بإصدار جديد.','The period was reopened as a new version.'));}}/></Panel>}
      {tenant&&entity&&<ConnectedFinance key={tenant+entity} tenant={tenant} entity={entity} periods={periods} onSaved={()=>setRevision(r=>r+1)}/>}
      {tenant&&entity&&<ConnectedBank key={'bank'+tenant+entity} tenant={tenant} entity={entity} periods={periods} actor={me.user}/>}
      {tenant&&entity&&<AdministrationPanel key={'admin'+tenant+entity} tenant={tenant} entity={entity} actor={me.user}/>}
      {tenant&&entity&&<ReviewWorkspace key={'review'+tenant+entity} tenant={tenant} entity={entity} actor={me.user}/>}
      {tenant&&entity&&<SourceJobsPanel key={'sources'+tenant+entity} tenant={tenant} entity={entity} periods={periods}/>}

      {tenant&&<WorkspaceAudit key={tenant} tenant={tenant} revision={revision}/>}
    </>}
  </div></PublicLayout>;
}
