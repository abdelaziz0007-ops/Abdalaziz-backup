# Bank reconciliation intake — draft vertical

Extends the real authenticated `/#/workspace`, alongside [financial intake](BACKEND-FINANCIAL-V2.md). This is a persisted bank reconciliation **draft** workflow, not completion of the SRS bank matching/review lifecycle.

## Delivered

- Enroll a bank account against an asset ledger code in the entity's functional currency. Enrollment requires both entity administration and entity-level import permission with recent MFA. An existing ledger of another type is rejected; a ledger already attached to a bank cannot be enrolled twice. The identifier is AES-256-GCM encrypted; account listing returns its last four characters only.
- Import paired bank-statement and book-ledger CSVs with explicitly supplied opening/closing balances, period, cutoff, bank and cash-increase-positive sign convention. The server checks live permissions for that specific bank and pins period settings/currency.
- Save actual source files encrypted in the existing private Neon bucket, download/decrypt/hash-verify them, and preserve normalized source rows, trial versions of both datasets, bank/book transactions, quality evidence, one reconciliation and draft output version in a single database transaction.
- References and descriptions are encrypted in transaction fields **and** normalized source-row metadata. Original complete CSV bytes remain in encrypted object storage. Reference lookup hashes use a keyed HMAC scoped to the bank. Read APIs decrypt references/descriptions only after checking that reconciliation's bank permission.
- Generate conservative suggestions using the same signed amount, posting date and nonempty normalized reference. Duplicate candidates are explicitly ambiguous; missing references, different dates/references and opposite signs do not produce suggestions. Suggestions do not confirm or allocate money. Member evidence includes source row IDs and row numbers.
- Preserve all previous drafts. Identical files/balances/cutoff/bank/period reuse the same draft; changed input creates another version. Successful writes join the existing serialized audit chain.
- Arabic/English connected forms upload both actual files and show closing balances, **raw unadjusted difference**, stored suggestions, original row evidence and source hashes after reload. No demonstration fallback is used.

## CSV contract

```csv
rowId,postingDate,reference,description,signedAmount,runningBalance
b1,2026-01-02,REF1,Deposit,100,1100
```

Each file is UTF-8, at most 256 KiB, up to 1,000 transactions; a header-only file represents no activity. `rowId` must be unique within the file. Dates must be valid ISO calendar dates, ascending and within period start/cutoff. Quoted commas and escaped quotes are supported; embedded newlines and malformed quoting are rejected. Amounts are decimal strings checked with the database currency precision and BigInt arithmetic, including zero/three-decimal currencies. Zero-value transactions are rejected. Running balances are optional but must reconcile row by row when supplied. Both source totals must satisfy opening + signed movements = closing. CSV names/references with spreadsheet formula prefixes are rejected; values are never evaluated.

The selected sign policy requires **cash increases positive and decreases negative on both sides**. Bank files using credit/debit signs from the bank's perspective must be normalized deliberately before upload. No sign convention, decimal separator, date format, FX rate or period completeness is inferred silently.

Candidate expansion is capped at 10,000 members before uploads/writes; excessive repeated references return a validation error rather than constructing an unbounded cross product. This first matcher does not search date windows, fuzzy descriptions, grouped totals or partial allocations. A suggested one-to-many group with identical candidate amounts represents ambiguity, not an assertion that its candidate totals reconcile.

## Boundaries retained

All sources remain quarantined and datasets/output versions stay draft. `bank_complete`/`book_complete` remain false. Source scanning and independent completeness validation are blocking. The reconciliation `residual` check remains blocking even when the closing difference is zero: suggestions have not been reviewed, matched or adjusted. There is no fabricated adjusted balance or automatic journal.

Confirmation/unmatching, partial/group allocations, reconciling-item lifecycle, proposed/posted entries, independent approval, exports, antivirus scanning, asynchronous workers, XLSX/PDF ingestion, direct banking integrations and public deployment remain later batches. This delivery grants no runtime INSERT/UPDATE on allocations and no UPDATE on match status. SELECT/INSERT is limited to the bank tables used; UPDATE(id) on match groups exists solely for existing trigger row locks, while identity guards prohibit changing IDs. Existing financial and identity roles/settings are preserved.

Object storage and Postgres are not one distributed transaction. Failed commits may leave encrypted unreferenced objects; see the retention/key-backup limitations in the financial intake document. Original files are not publicly downloadable. The current app remains loopback-only.

## Verification

`npm run build` and `npm test` cover the existing app plus exact bank rollforwards, calendar/precision checks, ambiguity, zero activity, malformed CSV and bounded candidate expansion.

`npm run backend:test:bank` is gated to `codex-bank-*` disposable Neon branches. It exercises actual signup/MFA, bank enrollment/encryption, paired storage and normalized imports, idempotency/version preservation, invalid-input denial, no-activity handling, cross-tenant denial and a bank-only grant inside the same entity. It uploads both files through the Arabic browser, checks reload and five viewport widths. Synthetic records are never copied to production. Evidence is in `verification/bank-api.json` and `verification/bank-workspace-ar.png`.

`verification/backend-production.mjs` checks real production health/auth, restricted role/RLS for financial and bank tables, private storage reads/anonymous denial and server secrets absent from built frontend assets. Production verification is read-only.

Final verification: 70 unit tests, nine real API/browser checks and five production read-only checks. Earlier attempts encountered a session request returning 500, intermittent production auth probes returning 500, and an existing Excel roundtrip exceeding its 15-second timeout while the browser was running. Subsequent session/auth checks and the complete API/browser run passed; rerunning the full unit suite after closing the browser passed without increasing timeouts or weakening assertions. A fresh production server start passed all five read-only checks. The intermittent auth errors' root cause was not established; the server now logs error categories without message bodies or credentials for further diagnosis. The production bundle retains the existing large ExcelJS chunk warning.
