# Remaining delivery work — 10 November 2026

The full M/S scope is **not complete**. This checklist separates implementation from provider setup and acceptance. No acceptance status should be upgraded solely because a schema or adapter exists.

## Latest update: audit and telemetry

Scoped audit pagination and bounded 50,000-event/20-MiB snapshot CSV export are implemented, with exact-byte SHA-256, processing limits and no silent truncation. HTTP trace IDs and privacy-safe JSON duration/status logs now include authentication and public routes. External alerts and live acceptance remain pending.

**New blocker:** the application database connection fails with PostgreSQL 28P01. Current preflight also fails identity/scanner role connectivity and migration verification; source storage remains reachable. Previous successful connection evidence is historical. Restore the correct branch credentials in backend/.env.local before integrated acceptance. No credentials were rotated and no new database was provisioned.

Validation: 123 backend tests passed as a suite, followed by 19 targeted tests including one new timeout test (124 unique); 63 frontend tests, TypeScript and production build passed. Live audit SQL verification failed before execution. See backend/verification/audit-readonly.json.

## Previous batch

- Advisory grouped matching for one-to-many and many-to-one, using exact remaining amounts, equal posting date, equal nonempty reference hash and matching signs. Search is bounded and discloses omitted search. Suggestions are not stored as confirmed matches.
- Review UI shows source row evidence, total and residual. Selecting a suggestion fills the manual form; saving still requires a reason and the existing transaction/permission/fingerprint/capacity checks. Alternatives may overlap. Manual matching now follows preparation permission; explicit reference conflicts still need supervisor authorization.
- Retired both direct CSV parsing endpoints with HTTP 410 SCANNED_IMPORT_REQUIRED, before their validation/database/storage handlers. Removed both direct upload forms. Use Sources → scan → isolated preview → review/publish → generate reports or pair bank datasets.
- Existing saved drafts and sources are retained. Historical verification scripts that create fixtures through the retired direct endpoints are no longer valid end-to-end acceptance scripts; port them to the scanned publication workflow before reuse.

## Confirmed operational blockers

Read-only preflight evidence: backend/verification/current-preflight.json.

| Item | Observed state | Required action |
| --- | --- | --- |
| Application, identity, scanner database roles | Current connectivity checks fail; application role returns 28P01 | Accept full workflows against the intended production branch |
| Migrations | Current verification blocked; 35 matched previously | Maintain production migration/rollback procedure |
| Private source bucket | Reachable | Verify encrypted roundtrip and restore |
| HTTPS origin | Local origin is not production HTTPS | Choose hosting/domain; public deployment remains deferred |
| Identity email | RESEND_API_KEY and/or MAIL_FROM absent | Configure a verified sender and server-side secret, then test delivery |
| File scanner | CLAMAV_HOST / CLAMAV_SOCKET absent | Deploy scanner and validate clean/infected cases |
| Isolated parser | IMPORT_PREVIEW_IMAGE absent; docker executable not available in this session | Install/provide runtime, build and pin parser image |
| Payment/OCR/AI/accounting provider | User has not selected providers | Select services before live integration and provider acceptance |

Do not place secret values in chat, git, or frontend environment variables.

## Implementation still open

The authoritative per-requirement backlog remains backend-requirements.json. Substantial items remain beyond external setup:

- Asynchronous import/parser/export lifecycle and large data handling.
- Full privacy export including files/providers, safe authorized deletion, retention execution, restore-time deletion replay.
- Plan administration, other quotas, payment event idempotency and invoices.
- Editable versioned account mapping and splits, metric source navigation, ledger drill-down, cash-flow supporting data/classification/reconciliation, budgets and cost centers.
- Complete reconciling-item evidence and ownership lifecycle, proposal linking and previously reconciled transaction reuse controls.
- Asynchronous audit exports beyond bounded synchronous limits, localized PDF typography, workflow email delivery.
- Read-only accounting sync, external API scope/rate/replay controls, OCR review and optional source-grounded AI narratives.

## Acceptance still open

Real account registration/verification/reset/MFA, two-party permissions and approval, live scan-to-publication and reconciliation, privacy/support/ownership flows, backup restore, load/performance, isolation matrix, accessibility/RTL/PDF and browser matrix. Production alerting and measured operational targets remain unproven.

## Previous batch validation

105 backend tests and 63 frontend tests passed. TypeScript passed. Production build passed with the existing ExcelJS chunk warning. The XLSX roundtrip test initially exceeded its 15-second deadline during concurrent build; rerunning the full frontend suite after the build passed without changing the timeout. Three grouped-search SQL statements executed in a read-only transaction with the application role and nonexistent scope. This validates SQL execution, not a positive authenticated journey. No accounts or financial data were created.
