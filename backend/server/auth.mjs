import {mailConfigured,sendAuthEmail} from './mail.mjs';
import { betterAuth } from 'better-auth';
import { twoFactor } from 'better-auth/plugins';
import { createAuthMiddleware } from 'better-auth/api';
import { createHash } from 'node:crypto';

export const digest=value=>createHash('sha256').update(value).digest('hex');
export function authOptions(pool,origin,secret){
  const emailEnabled=mailConfigured();
  return {
    appName:'Mizan',baseURL:origin,basePath:'/api/auth',secret,database:pool,
    user:{modelName:'mizan_auth_users'},session:{modelName:'mizan_auth_sessions',expiresIn:60*60*24*7,cookieCache:{enabled:false}},
    account:{modelName:'mizan_auth_accounts'},verification:{modelName:'mizan_auth_verifications'},
    emailAndPassword:{enabled:true,minPasswordLength:12,maxPasswordLength:128,requireEmailVerification:emailEnabled || process.env.APP_PROFILE==='production',revokeSessionsOnPasswordReset:true,resetPasswordTokenExpiresIn:1800,...(emailEnabled?{sendResetPassword:async({user,url})=>sendAuthEmail({to:user.email,url,purpose:'reset'})}:{})},
    ...(emailEnabled?{emailVerification:{sendOnSignUp:true,sendOnSignIn:true,autoSignInAfterVerification:false,expiresIn:3600,sendVerificationEmail:async({user,url})=>sendAuthEmail({to:user.email,url,purpose:'verify'})}}:{}),
    trustedOrigins:[origin],advanced:{cookiePrefix:'mizan-auth',defaultCookieAttributes:{httpOnly:true,sameSite:'lax',secure:origin.startsWith('https://')}},
    rateLimit:{enabled:true,storage:'database',modelName:'mizan_auth_rate_limits',window:60,max:30,customRules:{'/sign-in/email':{window:60,max:5},'/sign-up/email':{window:60,max:3},'/request-password-reset':{window:60,max:3},'/send-verification-email':{window:60,max:3},'/two-factor/*':{window:60,max:5}}},
    plugins:[twoFactor({issuer:'Mizan',twoFactorTable:'mizan_auth_two_factors'})],
    logger:{disabled:true},
  };
}
export function createIdentity(pool,origin,secret){
  if(!secret||secret.length<32)throw new Error('Run npm run backend:setup to configure authentication');
  return betterAuth({...authOptions(pool,origin,secret),hooks:{after:createAuthMiddleware(async ctx=>{
    // Only a successful library-verified second factor can establish assurance.
    if(!['/two-factor/verify-totp','/two-factor/verify-backup-code'].includes(ctx.path))return;
    const returned=ctx.context.returned;
    if(!returned||typeof returned.token!=='string'||!returned.user)return;
    const token=ctx.context.newSession?.session?.token??returned.token;
    await pool.query(`INSERT INTO public.mizan_auth_mfa_proofs(session_token_hash,user_id,verified_at,expires_at)
      SELECT $1,s."userId",clock_timestamp(),s."expiresAt" FROM public.mizan_auth_sessions s
      JOIN public.mizan_auth_users u ON u.id=s."userId" WHERE s.token=$2 AND u."twoFactorEnabled"=true
      ON CONFLICT(session_token_hash) DO UPDATE SET verified_at=EXCLUDED.verified_at,expires_at=EXCLUDED.expires_at`,[digest(token),token]);
  })}});
}
