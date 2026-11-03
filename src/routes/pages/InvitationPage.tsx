import {useEffect,useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {backend} from '@/lib/backend-client';
import {PublicLayout} from './PublicPages';
import {Button} from '@/components/ui/Button';
import {Panel,Notice,useLanguage} from '@/components/WorkspaceUI';
export function InvitationPage(){
 const {token=''}=useParams(),l=useLanguage(),navigate=useNavigate(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
 useEffect(()=>{if(!/^[0-9a-f]{64}$/.test(token)){setError(l('رابط الدعوة غير صالح.','Invalid invitation link.'));return;}sessionStorage.setItem('mizan.pending-invitation',token);backend<{mfaVerified:boolean}>('/me').then(v=>setReady(v.mfaVerified)).catch(()=>setReady(false));},[token]);
 async function accept(){setBusy(true);setError('');try{await backend('/invitations/accept',{token});sessionStorage.removeItem('mizan.pending-invitation');navigate('/workspace',{replace:true});}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 return <PublicLayout connected><div className="workspace-page"><Panel title={l('دعوة خاصة لمساحة عمل','Private workspace invitation')}><Notice>{l('هذه الدعوة أحادية الاستخدام ومحددة الصلاحية. يجب أن يطابق بريد حسابك بريد المستلم المقصود.','This invitation expires and can be accepted once. Your account email must match its intended addressee.')}</Notice>{error&&<p role="alert">{error}</p>}{ready?<Button variant="primary" disabled={busy} onClick={()=>void accept()}>{l('قبول الدعوة والصلاحيات المحددة','Accept invitation and scoped permissions')}</Button>:<><p>{l('سجل الدخول أو أنشئ حسابًا وفعّل المصادقة، ثم عد إلى الدعوة المحفوظة في مساحة العمل.','Sign in or create an account and enable MFA, then return to the saved invitation in your workspace.')}</p><Link to="/auth/sign-in">{l('تسجيل الدخول','Sign in')}</Link> · <Link to="/auth/sign-up">{l('إنشاء حساب','Create account')}</Link> · <Link to="/workspace">{l('تأكيد المصادقة','Verify MFA')}</Link></>}</Panel></div></PublicLayout>;
}
