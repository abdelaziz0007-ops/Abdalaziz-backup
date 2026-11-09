# Backend v1 — identity and workspace foundation

> بعد إعادة تنظيم المشروع، تُشغّل أوامر Neon والخادم وDocker الواردة هنا من داخل `backend`. ثبّت تبعيات `front` أيضًا عند تشغيل الواجهة أو بنائها. راجع [أوامر التشغيل الحالية](plan.md#التشغيل-والتحقق).

This delivery starts the real backend on the existing Node/Express host. It does **not** claim that all SRS workflows are finished. The normalized financial ingestion, calculation, bank matching, review and export write services remain the next implementation batches.

## Working flows

- Real email/password registration, sign-in and sign-out, backed by self-managed Better Auth **1.7.15**, with hashed passwords and live database sessions.
- TOTP MFA setup through QR/manual URI, verified enrollment, sign-in challenges and one-time recovery codes. There is no fixed demonstration OTP in this flow.
- Real account pages at `/#/auth/sign-up`, `/#/auth/sign-in`, `/#/auth/mfa` and `/#/workspace`.
- Workspace creation with explicit administration consent and an idempotency key.
- Legal entity creation with versioned currency, fiscal-year start, accounting framework and effective date.
- Explicit, optional preparation access for the creator. Billing ownership alone does not grant financial viewing or preparation.
- Accounting period creation, overlap protection and persistence across reload/sign-in.
- Permissioned report/reconciliation listing reads from the normalized SRS tables; empty results stay empty, with no Atlas/demo fallback.
- Serialized audit chain for workspace/entity/period mutations, in the same transactions as their writes.

The full existing financial demonstration remains at `/#/app/overview` and is explicitly separate from these real account records. Its single-operator snapshot archive is unchanged and is **not** a tenant-safe public API. Do not expose the current loopback server publicly.

## Why self-managed authentication

SRS FR-001 requires MFA for administrative and approval users. The installed Neon Auth skill identifies MFA as unavailable on Managed Auth and routes required-MFA implementations to self-managed Better Auth on the existing host. The installed 1.7.15 plugin was inspected and tested. Managed Neon Auth remains disabled in `neon.ts`; no working existing identity provider was replaced.

Sources: [Neon Auth skill](https://neon.com/.well-known/agent-skills/neon-auth/SKILL.md), [Better Auth MFA](https://better-auth.com/docs/plugins/2fa), [Express integration](https://better-auth.com/docs/integrations/express), [database migration generation](https://better-auth.com/docs/concepts/database).

## Configuration

`npm run backend:setup` applies the versioned migrations and provisions two separate login roles:

| Variable | Purpose |
|---|---|
| `DATABASE_URL_UNPOOLED` | Owner connection used only by migration/provisioning commands |
| `DATABASE_URL` | Existing local legacy archive connection; omit it from a future public runtime after removing that archive API |
| `APP_DATABASE_URL` | `mizan_api_v1`: non-owner, non-superuser, non-BYPASSRLS, no role/database creation; scoped application table access and a narrow helper-function allowlist |
| `AUTH_DATABASE_URL` | `mizan_identity_v1`: only the dedicated auth tables and MFA proof table |
| `BETTER_AUTH_SECRET` | High-entropy library encryption/signing secret, generated once; preserve it across restarts |
| `APP_ORIGIN` | Exact application origin, default `http://localhost:5174` |
| `APP_DATA_REGION` | Verified existing Neon region; this project is `aws-us-east-2` |

All credentials remain in ignored `.env.local`. Setup preserves existing credentials and refuses to rotate an existing role when its credential is missing. After a Neon checkout it rebuilds runtime URLs for that branch while preserving the roles/passwords. Startup rejects database-branch mismatches. Role passwords are generated in-process and never printed or embedded in SQL migrations.

```powershell
# After neon checkout or initial env pull, configure APP_DATA_REGION in .env.local.
npm run backend:setup
npm run build
npm run dev
```

No new Neon hosting service or public frontend deployment was created. The existing host listens on loopback only. Setting APP_ORIGIN does not change that bind address.

## Database changes

- `006_better_auth.sql`: generated with the installed library's `getMigrations` API; six explicitly named public auth tables plus `mizan_auth_mfa_proofs`. No application passwords are stored in the SRS `app_users` table.
- `007_backend_context.sql`: private verified-identity/session bridge, membership-derived workspace/entity scope, transactional audit head, explicit workspace enrollment. Privileged helpers pin `search_path=pg_catalog`, fully qualify tables and revoke PUBLIC execution.
- `008_workspace_idempotency.sql`: retry-safe workspace creation under an advisory transaction lock.
- `server/provision-runtime.mjs`: controlled role provisioning/grants, separate from versioned SQL because passwords are secrets.

The 107 SRS business tables and their prior data remain unchanged. Identity-provider subjects map to `mizan.app_users`; real native sessions map to `mizan.user_sessions`. MFA assurance is stored only after the library successfully verifies TOTP or a recovery code, bound to the current rotated session and checked against live identity/session state. Sign-out invalidates protected access; no browser JWT/localStorage workaround is used.

The runtime cannot read password hashes through its application connection. RLS is transaction-local on a single checked-out pg connection: `mizan.user_id`, `mizan.tenant_id`, and `mizan.entity_ids` come from verified server-side membership queries, never from body fields or demonstration personas. Each mutation applies action permissions. Workspace/entity/period setup also requires MFA verified within the last 15 minutes. Scoped entity/period/report APIs require MFA; the authenticated profile, currency catalog and workspace-name list remain available during MFA enrollment. Finer tenant policy configuration remains future work.

The identity and context helper credentials are trusted server infrastructure, not credentials to distribute to browsers. A stolen server identity credential can compromise its authority; role separation does not replace operational secret protection. Audit hashing helps detect chain inconsistencies but does not make a database-owner compromise tamper-proof.

## API contract

Business API success: `{ data, requestId }`. Business errors: `{ error: { code, message, fields? }, requestId }`. An `X-Request-ID` response header is emitted. Native auth endpoints retain Better Auth's response contract.

| Method | Endpoint | Protection / behavior |
|---|---|---|
| GET | `/api/v1/health` | Public connectivity health, no host/credential details |
| GET | `/api/v1/me` | Valid live session; safe profile and MFA state only |
| GET | `/api/v1/reference/currencies` | Authenticated reference currency catalog |
| GET | `/api/v1/tenants` | Active memberships only |
| POST | `/api/v1/tenants` | Recent MFA, explicit consent, UUID idempotency key; no repeated tenant/member/audit writes |
| GET | `/api/v1/tenants/:tenantId/entities` | Membership-derived visible entity list, maximum 100 |
| POST | `/api/v1/tenants/:tenantId/entities` | `entities.manage`, recent MFA; `members.manage` required for optional preparation grant |
| GET | `/api/v1/tenants/:tenantId/entities/:entityId/settings` | Valid entity scope; latest configuration version |
| GET | `/api/v1/tenants/:tenantId/entities/:entityId/periods` | Valid entity scope, maximum 100 |
| POST | `/api/v1/tenants/:tenantId/entities/:entityId/periods` | `entities.manage`, recent MFA; serialized overlap rejection |
| GET | `/api/v1/tenants/:tenantId/entities/:entityId/reports` | `reports.view`, matching tenant/entity, latest 50 |
| GET | `/api/v1/tenants/:tenantId/entities/:entityId/reconciliations` | Account-aware `reports.view` checks per result, latest 50 |
| GET | `/api/v1/tenants/:tenantId/audit` | `members.manage`, permitted entity scope, latest 50 |

Workspace input: `{ name, administrationConsent: true, idempotencyKey: UUID }`.

Entity input: `{ code, name, currency, framework, effectiveFrom: "YYYY-MM-DD", fiscalYearStartMonth: 1..12, grantPreparerAccess: boolean }`.

Period input: `{ startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD" }`.

Unknown body fields (including a supplied actor ID) are rejected. Unauthorized identifiers return 404. Unauthenticated access returns 401; MFA/action denial 403; conflicts 409; invalid business input 422; malformed JSON 400. JSON bodies are capped at 1 MB. Writes require the exact browser Origin. Authentication has database-backed request limiting. Scoped transactions bound statement and lock wait time; list reads are capped, but cursor pagination and multi-instance application request limiting are still pending.

## Verification and remaining work

Run full write tests **only on a `codex-backend-*` disposable branch**:

```powershell
npm run backend:test:api
npm run backend:test:browser
npm test -- --maxWorkers=1
```

The API suite covers actual signup, MFA enrollment/rotation, pre-MFA denial, persistence, idempotency, overlap rejection, unknown fields/actor spoofing, cross-origin denial, another real user's isolation, linked audit events, malformed JSON, sign-out/sign-in, backup-code recovery, non-bypass roles and blocked password-hash reads. Browser tests exercise Arabic forms, QR/TOTP enrollment, real organization/period creation, reload persistence, sign-out protection and five viewport widths. Synthetic accounts remain only on the expiring test branch. Production verification is read-only; no test user/password/company is seeded there.

Results: 14 API groups and 6 browser groups passed on the disposable branch; 4 production read-only checks passed. All 60 existing tests passed, and the 6 legacy financial workflow checks passed. CSV input now waits for a valid entity/period before staging, avoiding a preview lost during initial context selection; XLSX may still introduce new periods. The real XLSX roundtrip test has a specific 15-second I/O budget for library loading on Windows, with all calculation/formula assertions retained.

Password-reset email and email verification delivery are **not connected**; related send routes return an explicit unavailable response and send nothing. No mail provider was silently configured. MFA recovery codes work, but they do not reset a forgotten password. Public signup requires email verification/delivery and operational controls before public deployment.

Still pending: invitation acceptance and team administration, financial file storage/scanning and normalized ingestion, deterministic financial write services, matching/reconciliation mutations, independent review/approval APIs, exports/workers, billing, notifications, deletion/retention execution, deployment, pagination, full security/load/recovery acceptance. New real-account screens do not automatically migrate or publish the demonstration's financial data. The current backend is a working first foundation, not full SRS production acceptance.
