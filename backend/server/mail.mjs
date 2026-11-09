import {createHash} from 'node:crypto';
export function mailConfigured(env=process.env){return Boolean(env.RESEND_API_KEY && env.MAIL_FROM);}
export async function sendAuthEmail({to,url,purpose}, {env=process.env,fetcher=fetch}={}) {
  if (!mailConfigured(env)) throw Error('Email delivery is not configured');
  const target=new URL(url);
  if (target.origin !== env.APP_ORIGIN) throw Error('Email link origin rejected');
  const reset=purpose==='reset';
  const subject=reset?'Mizan — Reset your password / إعادة تعيين كلمة المرور':'Mizan — Verify your email / تأكيد البريد الإلكتروني';
  const text=(reset?'لإعادة تعيين كلمة المرور، افتح الرابط التالي.\nTo reset your password, open this link:\n':'لتأكيد بريدك الإلكتروني، افتح الرابط التالي.\nTo verify your email, open this link:\n')+url+'\n\nإذا لم تطلب ذلك، تجاهل الرسالة. / If you did not request this, ignore this email.';
  const response=await fetcher('https://api.resend.com/emails',{
    method:'POST',signal:AbortSignal.timeout(15000),
    headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':createHash('sha256').update(purpose+':'+to+':'+url).digest('hex')},
    body:JSON.stringify({from:env.MAIL_FROM,to:[to],subject,text})
  });
  if(!response.ok) throw Error('Email provider did not accept the message');
  const receipt=await response.json();
  if(!receipt.id) throw Error('Email provider returned no delivery receipt');
}
