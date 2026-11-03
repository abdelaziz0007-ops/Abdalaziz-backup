# Backend financial intake — draft vertical

The real `/#/workspace` now accepts an explicitly classified, period-specific CSV and persists the original source, normalized trial balance and three server-calculated draft outputs. This extends [the identity foundation](BACKEND-V1.md); it does not complete the SRS or provide certified accounts.

## Working flow

1. Sign in, verify MFA, choose a workspace/entity and an open period. Entity administration alone does not grant financial access: `imports.manage` and `outputs.prepare` are both required.
2. Download the CSV template. Columns are `accountCode,name,classification,signedDebitBalance`; UTF-8, at most 512 KiB and 1,000 unique accounts. Quoted commas are supported; multiline fields, malformed quoting, executable spreadsheet prefixes in names and invalid amounts are rejected.
3. Classify each account explicitly. Debits are positive, credits negative. Income/expenses must represent only the selected period. Equity must exclude those period earnings; the server includes them once. There is no automatic YTD conversion or currency conversion.
4. The server checks the actual period/settings/currency, exact monetary precision, limits and zero signed balance. It saves all rows or rolls back all database writes. Account type conflicts require correction rather than silent reclassification.
5. Private Neon bucket `financial-sources` holds AES-256-GCM encrypted original CSV bytes. Each random source key is authenticated as associated data; the server verifies a decrypt/download and SHA-256 match before committing metadata. No object credentials or original download URL enter the browser. Sources remain **quarantined**: structural CSV validation is not antivirus scanning.
6. A draft dataset, one-to-one account mapping, quality counts/dispositions and income statement, financial position and analysis are saved in the existing SRS tables. Statements include exact row-level contributions; analysis retains its formula version, input dataset/row references and unavailable reasons.
7. Reimporting identical bytes for the same period/algorithm reuses the dataset and outputs. Changed bytes create a new dataset/output version. Earlier rows/outputs remain available. Writes are serialized per entity and add a hash-linked audit event.

## Mathematics and limitations

All authoritative amounts use decimal strings and BigInt minor units based on the database currency catalog, including zero/three-decimal currencies. Gross profit and net profit subtract classified costs, operating expenses and tax from credit revenue. Assets include signed contra-asset balances. Equity includes period profit once. Source contributions reproduce every statement total. Ratios round half-even to two decimals; a nonpositive denominator is unavailable. Return on average assets remains unavailable without actual opening assets and an averaging policy.

There are no fabricated historical comparisons, cash flows, bank matches or annualizations. User-provided classifications and completeness require independent review. Mapping/formula/output versions remain unapproved. Blocking `completeness` and `malware_scan` validations prevent approval; the app has no endpoint that marks a source clean or publishes these datasets. Existing database review/publish gates are preserved. This batch does not implement a scanner, asynchronous worker, XLSX/PDF/OCR ingestion, mapping approval, bank matching, output approval, export, email recovery or public deployment.

## Configuration and operations

`neon.ts` declares one **private** bucket and preserves self-managed authentication and branch policy. `neon deploy` provisions it and pulls branch-specific `AWS_*` values. After branch checkout run `npm run backend:setup` to reconnect the restricted runtime roles to that database; it now grants SELECT/INSERT only on the financial tables used. UPDATE is limited to `id` on four parent tables so existing triggers can acquire row locks; identity guards reject identity changes. The runtime cannot change source scan status, publish datasets or change output status.

`SOURCE_ENCRYPTION_KEY` is a server-only 32-byte hex key generated once by setup. Preserve/back up this key securely with the environment: losing it makes originals unrecoverable. `source-v1` identifies this encryption scheme; automatic key rotation is not implemented. Existing auth/database settings are preserved. All credentials stay in ignored `.env.local` and are checked against production frontend build assets.

Object upload and Postgres commit cannot be one distributed transaction. An upload followed by database failure may leave an encrypted, unreferenced object. Unique keys prevent overwriting an existing original. Automatic orphan deletion is deliberately not implemented, because an uncertain commit must not cause evidence loss; a future cleanup worker must reconcile object keys against committed source records with a retention window. Object versions are application write-once keys, not a claim of S3 Object Lock.

The current server remains loopback-only. The legacy local snapshot archive and full demonstration are separate. The browser never uses owner database credentials. Draft financial files should not be shared as approved statements.

## Verification

- `npm run build` — typecheck and production bundle.
- `npm test` — includes exact calculation, provenance coefficients, currency precision, missing denominators and hostile/malformed CSV tests.
- `node verification/financial-api.mjs` — synthetic authenticated MFA fixtures gated to `codex-financial-*`, real Postgres/object storage writes, versions/idempotency, scoped denial, actual Arabic browser statements/drilldown/reload/responsiveness. Evidence: `verification/financial-api.json` and `verification/financial-workspace-ar.png`.
- `node verification/backend-production.mjs` — production read-only health/auth, RLS and secret-in-built-assets checks. No synthetic production accounts or financial rows.

Dependency audit currently reports eight moderate findings in the pre-existing ExcelJS dependency tree; no high/critical findings. The suggested automated fix would downgrade ExcelJS across a major release, so it was not applied blindly.

Official storage guidance checked: [Neon quickstart](https://neon.com/docs/storage/get-started), [installed storage skill](https://neon.com/.well-known/agent-skills/neon-object-storage/SKILL.md).
