import { readFile,writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { getMigrations } from 'better-auth/db/migration';
import { database } from './database.mjs';
import { authOptions } from './auth.mjs';
const env=parseEnv(await readFile('.env.local','utf8')),pool=database(env.DATABASE_URL_UNPOOLED);
try{
  const migration=await getMigrations(authOptions(pool,'http://localhost:5174','schema-generation-only-not-an-application-secret'));
  const sql=await migration.compileMigrations();
  if(!migration.toBeCreated.length)throw new Error('Generate on a branch without existing self-managed auth tables');
  await writeFile('migrations/006_better_auth.sql','-- Generated from installed Better Auth 1.7.15 with its MFA plugin.\n'+sql+'\n'+`CREATE TABLE public.mizan_auth_mfa_proofs (
    session_token_hash text PRIMARY KEY,user_id text NOT NULL REFERENCES public.mizan_auth_users(id) ON DELETE CASCADE,
    verified_at timestamptz NOT NULL,expires_at timestamptz NOT NULL
  );
  REVOKE ALL ON public.mizan_auth_users,public.mizan_auth_sessions,public.mizan_auth_accounts,
    public.mizan_auth_verifications,public.mizan_auth_two_factors,public.mizan_auth_rate_limits,public.mizan_auth_mfa_proofs FROM PUBLIC;
`);
  console.log('Generated versioned Better Auth migration; no schema was applied');
}finally{await pool.end();}
