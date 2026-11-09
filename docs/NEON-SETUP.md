# Neon Postgres integration — 3 November 2026

> بعد إعادة تنظيم المشروع، تُشغّل أوامر Neon والخادم وDocker الواردة هنا من داخل `backend`. ثبّت تبعيات `front` أيضًا عند تشغيل الواجهة أو بنائها. راجع [أوامر التشغيل الحالية](plan.md#التشغيل-والتحقق).

The existing React/Vite app now has a local Node/Express server and a real Postgres financial snapshot archive. This is a single-operator setup, not a public multi-user deployment. The API and frontend listen on loopback only; demo personas are not production identities.

The subsequent SRS schema phase adds 107 normalized business tables, with versioned migrations and database constraints. See [DATABASE-SRS.md](DATABASE-SRS.md) for the full field dictionary, FR-001–045 storage mapping, verification and remaining service work. The snapshot API remains separate from this normalized schema.

## Infrastructure

- Organization: `org-polished-night-45641130`
- Project: `ancient-wildflower-70048078`
- Target branch: `production`
- Declared service: Postgres only, in `neon.ts`
- `.neon` and `.env.local` are ignored. Never commit connection strings.

`neon init -y --org-id org-polished-night-45641130 --project-id ancient-wildflower-70048078 --branch production --services postgres` created the config. `neon deploy` verified the policy and pulled `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and `NEON_BRANCH` into `.env.local` after browser authentication.

The app uses `pg` on its long-lived Node server, a small reusable pool and certificate/hostname verification. No database credential enters the browser. The direct connection is used for migration; the app uses `DATABASE_URL`. Driver guidance: https://neon.com/docs/connect/choose-connection.

## Run

```powershell
npm install
neon deploy
npm run db:migrate
npm run build
npm start
```

Open `http://localhost:5174/#/app/overview`. For development use `npm run dev`. Set `PORT` to use another local port. `npm run preview` is a static preview only and does not provide the database API.

The additive, idempotent migration is versioned in `migrations/001_financial_snapshots.sql`. It was tested on `codex-persistence-check` before application to production. That test branch expires after seven days under the generated branch policy.

## Save and restore

Use **Save & restore / الحفظ والاسترجاع** in the top bar. Each explicit save inserts an independent snapshot. The archive lists the latest 30 snapshots for the selected entity and scenario. Restore loads the saved source periods, opens the saved active period, and restores its planning state.

Included: active trial balance, other imported periods for the entity, source provenance, budget, trade-item snapshot, scenario assumptions, supplemental cash-cycle inputs, management notes and assigned owners. Balances remain decimal strings in JSONB. Server validation rejects unbalanced or duplicate account sources, invalid amounts, overpaid invoices and cross-entity datasets.

Excluded: bank matching/approval decisions, temporary import previews, session event history, account credentials, and display preferences. Saving is manual; unsaved work is still lost on reload. Restoring replaces the saved categories in the current session. Restored statements remain drafts and do not become approved outputs.

The server enforces loopback binding, host/origin validation, an HttpOnly SameSite local-session cookie, a request token, JSON body limits and parameterized SQL. These are local safeguards, not multi-user authorization. Before any public deployment, add real authentication, server-side tenant/role authorization, TLS and appropriate operational controls. Do not change the bind address to expose this server as-is.

## Verification

`npm test` includes snapshot-boundary tests. `verification/neon-e2e.cjs` drives the built app in Chrome, imports synthetic source periods, writes to production Postgres, reloads, restores and checks exact results and notes. It verifies rejected API requests and responsive widths. Only synthetic snapshot IDs created by that run are removed. See `verification/neon-e2e.json` for the result.

The project still has the existing ExcelJS bundle-size warning and eight moderate transitive dependency audit warnings; no forced dependency downgrade was applied.
