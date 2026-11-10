import {OwnershipPanel} from './OwnershipPanel';
import {ConnectedSupport,SupportAccess} from './ConnectedSupport';
import {hasWorkspacePermission,hasAnyBankPermission,type WorkspaceAccess} from '@/lib/workspace-access';
import {ConnectedNotifications} from './ConnectedNotifications';
import {ConnectedShell,type WorkspaceSection} from '@/shell/ConnectedShell';
import {ConnectedAccount} from './ConnectedAccount';
import { useEffect,useState,type FormEvent } from 'react';
import { Link,useLocation,useNavigate,useSearchParams } from 'react-router-dom';
import { authClient } from '@/lib/auth-client';
import { backend,BackendError } from '@/lib/backend-client';
import { Button } from '@/components/ui/Button';
import { Notice,PageHeader,Panel,Status,Metric,useLanguage } from '@/components/WorkspaceUI';
import { PublicLayout } from './PublicPages';
import { DataTable } from '@/components/ui/DataTable';
import { ConnectedFinance } from './ConnectedFinance';
import { WorkspaceAudit } from './WorkspaceAudit';
import {PrivacyRequests} from './PrivacyRequests';
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
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[name,setName]=useState(''),[code,setCode]=useState(''),[backupMode,setBackupMode]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const signup=kind==='sign-up',mfa=kind==='mfa',recovery=kind==='password-recovery',reset=recovery&&location.pathname.endsWith('reset-password');
  const [resetToken]=useState(()=>new URLSearchParams(window.location.search).get('token')||new URLSearchParams(location.search).get('token')||'');
  useEffect(()=>{if(reset&&window.location.search)window.history.replaceState(null,'',window.location.pathname+window.location.hash);},[reset]);
  useEffect(()=>{setError('');setMessage('');setPassword('');setConfirmation('');},[location.pathname]);
  const callbackURL=window.location.origin+'/#/auth/sign-in';
  async function resend(){setBusy(true);setError('');try{const r=await authClient.sendVerificationEmail({email,callbackURL});if(r.error)throw Error(r.error.message);setMessage(l('إذا كان الحساب بحاجة للتأكيد، ستصلك رسالة تحقق.','If verification is needed, check your inbox.'));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  async function submit(e:FormEvent){
    e.preventDefault();setError('');setMessage('');setBusy(true);
    try{
      if(reset){if(!resetToken)throw Error(l('رابط إعادة التعيين غير صالح أو منتهي. اطلب رابطًا جديدًا.','Invalid or expired reset link. Request a new one.'));if(password!==confirmation)throw Error(l('كلمتا المرور غير متطابقتين.','Passwords do not match.'));const r=await authClient.resetPassword({newPassword:password,token:resetToken});if(r.error)throw Error(r.error.message);setPassword('');setConfirmation('');setMessage(l('تم تغيير كلمة المرور وإلغاء الجلسات السابقة. سجّل الدخول من جديد.','Password changed and previous sessions revoked. Sign in again.'));return;}
      if(recovery){const r=await authClient.requestPasswordReset({email,redirectTo:window.location.origin+'/#/auth/reset-password'});if(r.error)throw Error(r.error.message);setMessage(l('إذا كان البريد مرتبطًا بحساب، ستصلك رسالة لاستعادة كلمة المرور. تحقق من البريد غير المرغوب أيضًا.','If this email belongs to an account, check your inbox and spam folder for a reset link.'));return;}
      if(mfa){const response=backupMode?await authClient.twoFactor.verifyBackupCode({code}):await authClient.twoFactor.verifyTotp({code,trustDevice:false});if(response.error)throw new Error(response.error.message);}
      else if(signup){const response=await authClient.signUp.email({email,password,name,callbackURL});if(response.error)throw new Error(response.error.message);if(!response.data?.token){setPassword('');setMessage(l('راجع بريدك لتأكيد الحساب، ثم سجّل الدخول. يمكنك إعادة إرسال رسالة التأكيد أدناه.','Check your email to verify your account, then sign in. You can resend verification below.'));return;}}
      else{const response=await authClient.signIn.email({email,password,callbackURL});if(response.error)throw new Error(response.error.message);if(response.data&&'twoFactorRedirect' in response.data&&response.data.twoFactorRedirect){nav('/auth/mfa');return;}}
      nav('/workspace');
    }catch(e){setError(e instanceof Error?e.message:l('تعذر الاتصال. حاول مجددًا.','Unable to connect. Try again.'));}finally{setBusy(false);}
  }
  return <PublicLayout connected><div className="workspace-page" style={{maxWidth:520,margin:'0 auto'}}><PageHeader title={reset?l('إعداد كلمة مرور جديدة','Set a new password'):recovery?l('استعادة الوصول','Recover access'):mfa?l('التحقق بخطوتين','Two-factor verification'):signup?l('إنشاء حساب','Create an account'):l('تسجيل الدخول','Sign in')} description={l('حسابك الفعلي ومساحات عملك المحفوظة.','Your real account and saved workspaces.')}/><Panel title={l('الوصول الآمن','Secure access')}>
    <form className="stack" onSubmit={submit} key={location.pathname}>
      {error&&<Notice tone="danger"><p role="alert">{error}</p></Notice>}
      {message&&<Notice tone="success"><p role="status">{message}</p></Notice>}
      {mfa?<><label className="form-field">{backupMode?l('رمز الاسترداد','Recovery code'):l('رمز تطبيق المصادقة','Authenticator code')}<input required inputMode={backupMode?'text':'numeric'} autoComplete="one-time-code" pattern={backupMode?undefined:'[0-9]{6}'} maxLength={backupMode?64:6} value={code} onChange={e=>setCode(e.target.value)}/></label><Button type="button" variant="ghost" onClick={()=>{setBackupMode(!backupMode);setCode('');}}>{backupMode?l('استخدام تطبيق المصادقة','Use authenticator'):l('استخدام رمز استرداد','Use recovery code')}</Button></>:<>
        {signup&&<label className="form-field">{l('الاسم','Name')}<input required maxLength={200} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label>}
        {!reset&&<label className="form-field">{l('البريد الإلكتروني','Email')}<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label>}
        {(!recovery||reset)&&<><label className="form-field">{l('كلمة المرور','Password')}<input required type="password" minLength={12} maxLength={128} autoComplete={signup||reset?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label><p className="small muted">{l('12 حرفًا على الأقل. المصادقة الثنائية مطلوبة لمساحة العمل.','At least 12 characters. Two-factor authentication is required for the workspace.')}</p></>}
        {reset&&<label className="form-field">{l('تأكيد كلمة المرور','Confirm password')}<input required type="password" autoComplete="new-password" value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>}
      </>}
      <Button type="submit" variant="primary" disabled={busy}>{busy?l('جارٍ المتابعة…','Continuing…'):reset?l('حفظ كلمة المرور','Save password'):recovery?l('إرسال رابط الاستعادة','Send reset link'):mfa?l('تحقق ومتابعة','Verify and continue'):signup?l('إنشاء الحساب','Create account'):l('دخول','Sign in')}</Button>
      {!mfa&&!recovery&&<Button type="button" disabled={busy||!email} onClick={resend}>{l('إعادة إرسال تأكيد البريد','Resend email verification')}</Button>}
      <Link to={signup||recovery?'/auth/sign-in':'/auth/sign-up'}>{signup||recovery?l('العودة لتسجيل الدخول','Back to sign in'):l('إنشاء حساب جديد','Create a new account')}</Link><Link to="/auth/forgot-password">{l('استعادة الوصول','Recover access')}</Link>
    </form>
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
  const l=useLanguage(),nav=useNavigate(),[search,setSearch]=useSearchParams();
  const view=search.get('view')||'overview';
  const go=(next:string)=>{setSearch(previous=>{const params=new URLSearchParams(previous);params.set('view',next);params.delete('output');return params;});setError('');setMessage('');};
  const [me,setMe]=useState<Me|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const [workspaces,setWorkspaces]=useState<Workspace[]>([]),[tenant,setTenant]=useState(search.get('tenant')||''),[entities,setEntities]=useState<Entity[]>([]),[entity,setEntity]=useState(search.get('entity')||''),[periods,setPeriods]=useState<PeriodVersion[]>([]),[currencies,setCurrencies]=useState<Currency[]>([]),[security,setSecurity]=useState(false);
  type Access=WorkspaceAccess;
  const [access,setAccess]=useState<Access|null>(null),[tenantAccess,setTenantAccess]=useState<string[]>([]),[accessLoading,setAccessLoading]=useState(false);
  const [workspaceKey,setWorkspaceKey]=useState(()=>crypto.randomUUID());
  const [workspaceName,setWorkspaceName]=useState(''),[consent,setConsent]=useState(false),[entityName,setEntityName]=useState(''),[entityCode,setEntityCode]=useState(''),[currency,setCurrency]=useState('USD'),[framework,setFramework]=useState(''),[fiscalStart,setFiscalStart]=useState(1),[effective,setEffective]=useState(new Date().getFullYear()+'-01-01'),[preparer,setPreparer]=useState(false),[start,setStart]=useState(''),[end,setEnd]=useState('');
  async function refreshMe(){const value=await backend<Me>('/me');setMe(value);setSecurity(false);setRevision(r=>r+1);}
  const showError=(e:unknown)=>{if(e instanceof BackendError&&e.status===401){nav('/auth/sign-in',{replace:true});return;}if(e instanceof BackendError&&e.code==='MFA_REQUIRED')setSecurity(true);const messages:Record<string,[string,string]>={MFA_REQUIRED:['أكّد رمز المصادقة للمتابعة.','Verify your authenticator code to continue.'],PERMISSION_DENIED:['ليس لديك صلاحية لهذا الإجراء.','You do not have permission for this action.'],PERIOD_OVERLAP:['تتداخل هذه الفترة مع فترة محفوظة.','This date range overlaps a saved period.'],RESOURCE_NOT_FOUND:['مساحة العمل أو المنشأة غير متاحة لحسابك.','Workspace or entity unavailable to your account.']};setError(e instanceof BackendError&&messages[e.code]?l(...messages[e.code]):e instanceof Error?e.message:String(e));};
  useEffect(()=>{let live=true;backend<Me>('/me').then(value=>{if(live)setMe(value);}).catch(e=>{if(live)showError(e);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[revision]);
  useEffect(()=>{if(!me)return;let live=true;backend<Workspace[]>('/tenants').then(values=>{if(!live)return;setWorkspaces(values);setTenant(old=>values.some(w=>w.id===old)?old:values[0]?.id??'');}).catch(showError);backend<Currency[]>('/reference/currencies').then(values=>{if(live)setCurrencies(values);}).catch(showError);return()=>{live=false;};},[me?.user.id,revision]);
  useEffect(()=>{if(!tenant||!me?.mfaVerified||!workspaces.some(w=>w.id===tenant))return;let live=true;backend<Entity[]>(`/tenants/${tenant}/entities`).then(values=>{if(live){setEntities(values);setEntity(old=>values.some(e=>e.id===old)?old:values[0]?.id??'');}}).catch(e=>{if(live)showError(e);});return()=>{live=false;};},[tenant,workspaces,me?.mfaVerified,revision]);
  useEffect(()=>{if(!tenant||!entity||!me?.mfaVerified||!entities.some(e=>e.id===entity)){setPeriods([]);return;}let live=true;backend<PeriodVersion[]>(`/tenants/${tenant}/entities/${entity}/periods`).then(values=>{if(live)setPeriods(values);}).catch(e=>{if(live)showError(e);});return()=>{live=false;};},[tenant,entity,entities,me?.mfaVerified,revision]);
  useEffect(()=>{const handler=(event:Event)=>showError((event as CustomEvent<BackendError>).detail);window.addEventListener('mizan:backend-error',handler);return()=>window.removeEventListener('mizan:backend-error',handler);});
  useEffect(()=>{
    setAccess(previous=>previous?.tenantId===tenant&&previous.entityId===entity?previous:null);if(!tenant||!me?.mfaVerified||!workspaces.some(w=>w.id===tenant)){setTenantAccess([]);setAccessLoading(false);return;}
    let live=true;setAccessLoading(true);
    const validEntity=entities.some(value=>value.id===entity)?entity:'';
    const root='/tenants/'+tenant+'/access';
    Promise.all([backend<Access>(root),validEntity?backend<Access>(root+'?entityId='+encodeURIComponent(validEntity)):Promise.resolve(null)]).then(([tenantScope,entityScope])=>{if(live){setTenantAccess(tenantScope.permissions);setAccess(entityScope);}}).catch(e=>{if(live){setAccess(null);setTenantAccess([]);showError(e);}}).finally(()=>{if(live)setAccessLoading(false);});
    return()=>{live=false;};
  },[tenant,entity,entities,workspaces,me?.mfaVerified,revision]);
  useEffect(()=>{if(!me)return;setSearch(previous=>{const params=new URLSearchParams(previous);if(tenant)params.set('tenant',tenant);else params.delete('tenant');if(entity)params.set('entity',entity);else params.delete('entity');return params;},{replace:true});},[tenant,entity,me?.user.id]);
  async function action(fn:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await fn();setRevision(r=>r+1);}catch(e){showError(e);}finally{setBusy(false);}}
  async function createWorkspace(e:FormEvent){e.preventDefault();await action(async()=>{const value=await backend<{id:string}>('/tenants',{name:workspaceName,administrationConsent:consent,idempotencyKey:workspaceKey});setWorkspaceKey(crypto.randomUUID());setEntity('');setEntities([]);setTenant(value.id);setWorkspaceName('');setConsent(false);go('setup');setMessage(l('أُنشئت مساحة العمل وحُفظت صلاحيات إدارتك.','Workspace and explicit administration grants saved.'));});}
  async function createEntity(e:FormEvent){e.preventDefault();await action(async()=>{const created=await backend<{id:string}>(`/tenants/${tenant}/entities`,{code:entityCode,name:entityName,currency,framework,effectiveFrom:effective,fiscalYearStartMonth:fiscalStart,grantPreparerAccess:preparer});setEntity(created.id);setEntityName('');setEntityCode('');setMessage(l('حُفظت المنشأة وإعداداتها.','Entity and settings saved.'));});}
  async function createPeriod(e:FormEvent){e.preventDefault();await action(async()=>{await backend(`/tenants/${tenant}/entities/${entity}/periods`,{startDate:start,endDate:end});setStart('');setEnd('');setMessage(l('حُفظت الفترة المالية.','Accounting period saved.'));});}
  const can=(permission:string)=>hasWorkspacePermission(access,tenant,entity,permission);
  const canBank=(permission:string)=>hasAnyBankPermission(access,tenant,entity,permission);
  const hasEntity=Boolean(entity&&access?.entityId===entity&&access.tenantId===tenant);
  const sections:WorkspaceSection[]=[{id:'overview',ar:'نظرة عامة',en:'Overview',icon:'grid'},{id:'setup',ar:'المنشآت والفترات',en:'Entities & periods',icon:'settings'},
    ...(hasEntity&&can('imports.manage')?[{id:'sources',ar:'مركز البيانات',en:'Data center',icon:'upload'}]:[]),
    ...(hasEntity&&can('reports.view')?[{id:'finance',ar:'القوائم والتحليل',en:'Statements & analysis',icon:'chart'}]:[]),
    ...(hasEntity&&canBank('reports.view')?[{id:'bank',ar:'التسويات البنكية',en:'Bank reconciliation',icon:'bank'},{id:'review',ar:'المراجعة والاعتماد',en:'Reviews & approval',icon:'check'}]:[]),
    ...(hasEntity&&(canBank('members.manage')||tenantAccess.includes('members.manage'))?[{id:'team',ar:'الفريق والصلاحيات',en:'Team & access',icon:'users'}]:[]),
    ...(tenant&&(tenantAccess.includes('privacy.manage')||can('privacy.manage'))?[{id:'privacy',ar:'طلبات الخصوصية',en:'Privacy requests',icon:'shield'}]:[]),
    ...(tenant&&tenantAccess.includes('members.manage')?[{id:'audit',ar:'سجل التدقيق',en:'Audit trail',icon:'clock'}]:[]),
    ...(tenant?[{id:'notifications',ar:'الإشعارات',en:'Notifications',icon:'clock'}]:[]),
    ...(tenant?[{id:'support',ar:'طلبات الدعم',en:'Support requests',icon:'users'}]:[]),
    {id:'support-access',ar:'وصول الدعم المؤقت',en:'Temporary support access',icon:'shield'},
    ...(tenant?[{id:'ownership',ar:'ملكية المساحة',en:'Workspace ownership',icon:'shield'}]:[]),
    {id:'account',ar:'حسابي والأمان',en:'Account & security',icon:'shield'}];
  const allowed=sections.some(section=>section.id===view);
  const context=me?.mfaVerified?<div className="form-grid"><label className="form-field">{l('مساحة العمل','Workspace')}<select value={tenant} disabled={busy} onChange={e=>{setTenant(e.target.value);setEntity('');setEntities([]);setPeriods([]);setAccess(null);setTenantAccess([]);}}><option value="">{l('اختر مساحة عمل','Select workspace')}</option>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label className="form-field">{l('المنشأة','Entity')}<select value={entity} disabled={busy||!tenant} onChange={e=>{setEntity(e.target.value);setAccess(null);}}><option value="">{l('اختر منشأة','Select entity')}</option>{entities.map(e=><option key={e.id} value={e.id}>{e.name} · {e.code}</option>)}</select></label></div>:null;
  return <ConnectedShell sections={sections} active={view} onNavigate={go} context={context} userName={me?.user.name} busy={busy} onSignOut={()=>void action(async()=>{const result=await authClient.signOut();if(result.error)throw Error(result.error.message);setMe(null);nav('/auth/sign-in',{replace:true});})}><div className="workspace-page">
    <PageHeader title={l(sections.find(s=>s.id===view)?.ar??'مساحة العمل',sections.find(s=>s.id===view)?.en??'Workspace')} description={me?me.user.email:l('جارٍ التحقق من الجلسة…','Checking your session…')} actions={me?<Button onClick={()=>setSecurity(!security)}>{l('تأكيد المصادقة','Verify MFA')}</Button>:undefined}/>
    {error&&<Notice tone="danger"><p role="alert">{error}</p><Button onClick={()=>{setError('');setRevision(r=>r+1);}}>{l('إعادة المحاولة','Retry')}</Button></Notice>}{message&&<p role="status" className="notice success">{message}</p>}
    {loading&&<p role="status">{l('جارٍ التحميل…','Loading…')}</p>}
    {me&&(!me.mfaVerified||security)?<SecuritySetup me={me} onVerified={refreshMe}/>:me&&<>
      {sessionStorage.getItem('mizan.pending-invitation')&&<Notice><Link to={'/invitation/'+sessionStorage.getItem('mizan.pending-invitation')}>{l('متابعة الدعوة المحفوظة','Continue saved invitation')}</Link></Notice>}
      {accessLoading&&<p role="status">{l('جارٍ تحميل صلاحيات المنشأة…','Loading entity permissions…')}</p>}
      {!allowed&&!accessLoading&&<Notice>{l('هذا القسم غير متاح للنطاق أو الصلاحيات المحددة. اختر قسمًا من القائمة.','This section is unavailable for your selected scope or permissions. Choose a section from the navigation.')}<Button onClick={()=>go('overview')}>{l('النظرة العامة','Overview')}</Button></Notice>}
      {view==='overview'&&<div className="stack"><div className="connected-overview-grid"><Metric label={l('مساحات عملك','Your workspaces')} value={String(workspaces.length)} icon="grid"/><Metric label={l('المنشآت المتاحة','Available entities')} value={String(entities.length)} icon="bank"/><Metric label={l('الفترات المفتوحة','Open periods')} value={String(periods.filter(p=>p.status==='open').length)} icon="clock"/></div><Panel title={l('الخطوة التالية','Next step')}><p>{!tenant?l('أنشئ مساحة عمل لإدارة منشآتك وفتراتك المالية.','Create a workspace to manage your entities and financial periods.'):!entity?l('أضف منشأة أو اطلب من مدير المساحة منحك صلاحية منشأة.','Add an entity or ask your workspace administrator for entity access.'):!periods.length?l('أنشئ الفترة المالية قبل استيراد المصادر.','Create an accounting period before importing sources.'):l('ارفع مصادر الفترة من مركز البيانات، ثم راجع المخرجات وأرسلها للاعتماد.','Upload period sources in the data center, review the outputs, then submit them for approval.')}</p><div className="row-wrap"><Button onClick={()=>go('setup')}>{l('إعداد المنشآت والفترات','Set up entities & periods')}</Button>{hasEntity&&can('imports.manage')&&<Button variant="primary" onClick={()=>go('sources')}>{l('فتح مركز البيانات','Open data center')}</Button>}{hasEntity&&can('reports.view')&&<Button onClick={()=>go('finance')}>{l('عرض القوائم والتحليل','View statements & analysis')}</Button>}</div></Panel></div>}
      {view==='setup'&&<div className="stack">      <Panel title={l('إنشاء مساحة عمل','Create workspace')}><form className="stack" onSubmit={createWorkspace}><label className="form-field">{l('اسم مساحة العمل','Workspace name')}<input required minLength={2} maxLength={200} value={workspaceName} onChange={e=>{setWorkspaceName(e.target.value);setWorkspaceKey(crypto.randomUUID());}}/></label><label className="row"><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/>{l('أوافق على منحي إدارة المنشآت والأعضاء لهذه المساحة. صلاحيات المحتوى المالي تُمنح بشكل مستقل.','Grant me entity and membership administration for this workspace. Financial content permissions remain separate.')}</label><Button type="submit" disabled={busy} variant="primary">{l('إنشاء المساحة','Create workspace')}</Button></form></Panel>
      {tenant&&tenantAccess.includes('entities.manage')&&<Panel title={l('إضافة منشأة','Add entity')}><form className="stack" onSubmit={createEntity}><div className="form-grid"><label className="form-field">{l('اسم المنشأة','Entity name')}<input required value={entityName} onChange={e=>setEntityName(e.target.value)}/></label><label className="form-field">{l('رمز المنشأة','Entity code')}<input required value={entityCode} onChange={e=>setEntityCode(e.target.value)}/></label><label className="form-field">{l('العملة الوظيفية','Functional currency')}<select value={currency} onChange={e=>setCurrency(e.target.value)}>{currencies.map(c=><option value={c.code} key={c.code}>{c.code}</option>)}</select></label><label className="form-field">{l('الإطار المحاسبي','Accounting framework')}<input required value={framework} onChange={e=>setFramework(e.target.value)}/></label><label className="form-field">{l('شهر بداية السنة المالية','Fiscal year start month')}<input required type="number" min={1} max={12} value={fiscalStart} onChange={e=>setFiscalStart(Number(e.target.value))}/></label><label className="form-field">{l('سريان الإعدادات من','Settings effective from')}<input required type="date" value={effective} onChange={e=>setEffective(e.target.value)}/></label></div><label className="row"><input type="checkbox" checked={preparer} onChange={e=>setPreparer(e.target.checked)}/>{l('امنحني صلاحية إعداد وعرض البيانات المالية لهذه المنشأة.','Grant me financial preparation and viewing access for this entity.')}</label><Button type="submit" disabled={busy}>{l('حفظ المنشأة','Save entity')}</Button></form></Panel>}
      {tenant&&entity&&<Panel title={l('الفترات المالية','Accounting periods')}><DataTable label={l('الفترات المحفوظة','Saved periods')} rows={periods} rowKey={p=>p.id} columns={[{key:'start',header:l('البداية','Start'),render:p=><bdi>{p.start_date}</bdi>},{key:'end',header:l('النهاية','End'),render:p=><bdi>{p.end_date}</bdi>},{key:'status',header:l('الحالة','Status'),render:p=><Status value={p.status}/>},{key:'version',header:l('الإصدار','Version'),render:p=>p.version},{key:'reason',header:l('سبب إعادة الفتح','Reopening reason'),render:p=>p.reopen_reason??'—'}]}/>{can('entities.manage')&&<form className="stack" onSubmit={createPeriod}><div className="form-grid"><label className="form-field">{l('بداية الفترة','Period start')}<input type="date" required value={start} onChange={e=>setStart(e.target.value)}/></label><label className="form-field">{l('نهاية الفترة','Period end')}<input type="date" required value={end} onChange={e=>setEnd(e.target.value)}/></label></div><Button type="submit" disabled={busy}>{l('إنشاء الفترة','Create period')}</Button></form>}{can('entities.manage')&&<PeriodLifecycle key={tenant+entity} base={'/tenants/'+tenant+'/entities/'+entity} periods={periods} onError={showError} onSaved={action=>{setError('');setRevision(value=>value+1);setMessage(action==='lock'?l('أُقفلت الفترة.','The accounting period is locked.'):l('فُتحت الفترة بإصدار جديد.','The period was reopened as a new version.'));}}/>}</Panel>}
</div>}
      {allowed&&hasEntity&&view==='finance'&&<ConnectedFinance key={tenant+entity} tenant={tenant} entity={entity} periods={periods} canPrepare={can('outputs.prepare')} canImport={can('imports.manage')} onSaved={()=>setRevision(r=>r+1)}/>}
      {allowed&&hasEntity&&view==='bank'&&<ConnectedBank key={'bank'+tenant+entity} tenant={tenant} entity={entity} periods={periods} actor={me.user} can={(permission,bankId)=>hasWorkspacePermission(access,tenant,entity,permission,bankId)}/>}
      {allowed&&hasEntity&&view==='team'&&<AdministrationPanel key={'admin'+tenant+entity} tenant={tenant} entity={entity} actor={me.user}/>}
      {allowed&&hasEntity&&view==='review'&&<ReviewWorkspace key={'review'+tenant+entity} tenant={tenant} entity={entity} actor={me.user} initialOutput={search.get('output')??undefined}/>}
      {allowed&&hasEntity&&view==='sources'&&<SourceJobsPanel key={'sources'+tenant+entity} tenant={tenant} entity={entity} periods={periods}/>}
      {allowed&&view==='privacy'&&<>{hasEntity&&can('privacy.manage')&&<PrivacyRequests key={'privacy'+tenant+entity} tenant={tenant} entity={entity} actorId={me.user.id} onSaved={()=>setRevision(value=>value+1)}/>} {tenantAccess.includes('privacy.manage')&&<PrivacyRequests key={'privacy'+tenant} tenant={tenant} actorId={me.user.id} onSaved={()=>setRevision(value=>value+1)}/>}</>}
      {allowed&&view==='audit'&&<WorkspaceAudit key={tenant} tenant={tenant} revision={revision}/>}
      {allowed&&view==='notifications'&&<ConnectedNotifications key={tenant} tenant={tenant} onOpen={(entityId,outputId)=>{setEntity(entityId);setSearch(params=>{const next=new URLSearchParams(params);next.set('view','review');next.set('entity',entityId);next.set('output',outputId);return next;});}}/>}
      {allowed&&view==='support'&&<ConnectedSupport key={tenant+entity} tenant={tenant} entity={hasEntity?entity:undefined} actorId={me.user.id} canAuthorize={can('support.authorize')||tenantAccess.includes('support.authorize')}/>}
      {view==='support-access'&&<SupportAccess/>}
      {allowed&&view==='ownership'&&<OwnershipPanel key={tenant} tenant={tenant} actorId={me.user.id} onSaved={()=>setRevision(r=>r+1)}/>}
      {view==='account'&&<ConnectedAccount user={me.user} onSaved={refreshMe} onVerify={()=>setSecurity(true)}/>}
    </>}
  </div></ConnectedShell>;
}
