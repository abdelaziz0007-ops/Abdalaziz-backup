-- Generated from installed Better Auth 1.7.15 with its MFA plugin.
create table "mizan_auth_users" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null, "twoFactorEnabled" boolean);

create table "mizan_auth_sessions" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "mizan_auth_users" ("id") on delete cascade);

create table "mizan_auth_accounts" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "mizan_auth_users" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);

create table "mizan_auth_verifications" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table "mizan_auth_two_factors" ("id" text not null primary key, "secret" text not null, "backupCodes" text not null, "userId" text not null references "mizan_auth_users" ("id") on delete cascade, "verified" boolean, "failedVerificationCount" integer, "lockedUntil" timestamptz);

create table "mizan_auth_rate_limits" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);

create index "mizan_auth_sessions_userId_idx" on "mizan_auth_sessions" ("userId");

create index "mizan_auth_accounts_userId_idx" on "mizan_auth_accounts" ("userId");

create index "mizan_auth_verifications_identifier_idx" on "mizan_auth_verifications" ("identifier");

create index "mizan_auth_two_factors_secret_idx" on "mizan_auth_two_factors" ("secret");

create index "mizan_auth_two_factors_userId_idx" on "mizan_auth_two_factors" ("userId");
CREATE TABLE public.mizan_auth_mfa_proofs (
    session_token_hash text PRIMARY KEY,user_id text NOT NULL REFERENCES public.mizan_auth_users(id) ON DELETE CASCADE,
    verified_at timestamptz NOT NULL,expires_at timestamptz NOT NULL
  );
  REVOKE ALL ON public.mizan_auth_users,public.mizan_auth_sessions,public.mizan_auth_accounts,
    public.mizan_auth_verifications,public.mizan_auth_two_factors,public.mizan_auth_rate_limits,public.mizan_auth_mfa_proofs FROM PUBLIC;
