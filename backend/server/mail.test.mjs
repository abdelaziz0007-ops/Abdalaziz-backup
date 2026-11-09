import {it,expect} from 'vitest';
import {sendAuthEmail,mailConfigured} from './mail.mjs';
it('fails closed without configuration and rejects off-site links before transport',async()=>{
 expect(mailConfigured({})).toBe(false);
 await expect(sendAuthEmail({to:'recipient',url:'https://mizan.example/link',purpose:'verify'},{env:{}})).rejects.toThrow('not configured');
 await expect(sendAuthEmail({to:'recipient',url:'https://evil.example/link',purpose:'reset'},{env:{RESEND_API_KEY:'unit-test-only',MAIL_FROM:'sender',APP_ORIGIN:'https://mizan.example'},fetcher:()=>{throw Error('must not send');}})).rejects.toThrow('origin rejected');
});
it('uses server-side credentials, a stable idempotency key and rejects provider failures',async()=>{
 const env={RESEND_API_KEY:'unit-test-only',MAIL_FROM:'sender',APP_ORIGIN:'https://mizan.example'};
 const message={to:'recipient',url:'https://mizan.example/api/auth/verify-email?token=unit-test',purpose:'verify'};
 const calls=[];const fetcher=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({id:'receipt'})};};
 await sendAuthEmail(message,{env,fetcher});await sendAuthEmail(message,{env,fetcher});
 expect(calls[0].url).toBe('https://api.resend.com/emails');expect(calls[0].options.headers['Idempotency-Key']).toBe(calls[1].options.headers['Idempotency-Key']);
 expect(JSON.parse(calls[0].options.body).text).toContain(message.url);
 await expect(sendAuthEmail(message,{env,fetcher:async()=>({ok:false})})).rejects.toThrow('did not accept');
});
