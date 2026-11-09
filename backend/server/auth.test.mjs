import {it,expect,vi,afterEach} from 'vitest';
import {authOptions} from './auth.mjs';
afterEach(()=>vi.unstubAllEnvs());
it('enforces verified email, secure cookies and revoked sessions for production recovery',()=>{
 vi.stubEnv('APP_PROFILE','production');vi.stubEnv('RESEND_API_KEY','');vi.stubEnv('MAIL_FROM','');
 const options=authOptions({},'https://mizan.example','unit-test-only');
 expect(options.emailAndPassword.requireEmailVerification).toBe(true);
 expect(options.emailAndPassword.revokeSessionsOnPasswordReset).toBe(true);
 expect(options.advanced.defaultCookieAttributes).toMatchObject({secure:true,httpOnly:true,sameSite:'lax'});
 expect(options.rateLimit.storage).toBe('database');expect(options.rateLimit.customRules['/request-password-reset'].max).toBe(3);
 expect(options.emailAndPassword.sendResetPassword).toBeUndefined();
});
it('registers real delivery callbacks only when a provider is configured',()=>{
 vi.stubEnv('RESEND_API_KEY','unit-test-only');vi.stubEnv('MAIL_FROM','sender');
 const options=authOptions({},'https://mizan.example','unit-test-only');
 expect(options.emailAndPassword.sendResetPassword).toBeTypeOf('function');
 expect(options.emailVerification.sendVerificationEmail).toBeTypeOf('function');
 expect(options.emailVerification.autoSignInAfterVerification).toBe(false);
});
