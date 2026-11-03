# Reconciling items and adjusted statements

The connected workspace now calculates signed bank/books adjustments, adjusted balances and the residual from saved outstanding items. Cleared/excluded items retain their history and do not affect balances. Origination date is immutable; age uses the selected reconciliation cutoff. Arithmetic equality is explicitly distinguished from source completeness, malware scanning and independent approval.

## API contracts

Under `/api/v1/tenants/:tenant/entities/:entity/reconciliations/:reconciliation`:

- `GET /statement`: authenticated bank-scoped reporting; exact decimal balances, item state/age/evidence status, unposted entry proposals and separate bank/books coverage denominators.
- `POST /items`: recent MFA, actual bank-scoped preparation permission, expected fingerprint, UUID request key, documented reason, explicit item type/date/signed amount/effect/owner, optional current source-row link and at least one supporting file. Only an active authorized owner and accessible nondeleted/noninfected evidence are accepted. The browser supports this actual workflow.
- `POST /items/:id/state`: terminal clearance/exclusion with reason. Clearance needs a distinct current movement on the adjustment side, same signed amount, no earlier than origination and no prior use as clearance evidence.
- `POST /items/carry-forward`: preserves item identity and origination; requires an outstanding item from an approved strictly earlier reconciliation of the same bank/currency. Duplicate inclusion is rejected. Successful scanned/approved carry-forward remains an acceptance gap until the scanning/publication lifecycle exists.
- `POST /proposed-entries`: at least two exact-currency lines, equal debits/credits and a net bank-ledger effect exactly matching the outstanding books adjustment. This creates a proposal, never a posted ledger entry. Existing proposals cannot be silently replaced.

Mutations serialize on the entity/output/period, reject frozen periods and stale fingerprints, evolve the draft fingerprint, retain failing validation facts and append an atomic hash-chained decision. The audit metadata binds each request key to actor, path, action and content. A retry returns its original result even after later draft edits; changed content with the same key conflicts. Normal application credentials still cannot approve outputs or mark sources clean.

Supporting files remain quarantined until an actual scanner succeeds. The statement reports only currently clean undeleted evidence as scanned. Migration 014 additionally checks current source/evidence availability during approval, and prevents allocation of movement capacity already classified as an outstanding difference. Existing applied migrations are unchanged. No original financial row is overwritten.

## Coverage and precision

Each side has transaction counts (fully matched, partly matched, unmatched, total), total absolute movement amount, active allocated absolute amount and remaining absolute amount. Fully matched count coverage and allocated amount coverage have separately displayed denominators. Reversed allocations are excluded. Zero denominators return null, not a fabricated 0%/100%. Independent ground truth is required for precision; coverage is never labeled precision. Amounts use BigInt decimal arithmetic, including values beyond JavaScript's safe integer range.

## Verification and remaining work

`server/reconciliation-statement.test.mjs` includes the SRS section 9.6 accounting reference, negative movements, cleared/excluded items, partial/reversed allocations, zero denominators, large exact values and inconsistent capacity rejection. `verification/reconciliation-items-api.mjs` exercises actual native accounts/MFA, encrypted source intake, atomic item mutations, balanced unposted proposals, capacity guards, clearance and guarded carry-forward. Its browser helper tests actual item creation, persisted values/history and five viewport widths. Synthetic writes are restricted to `codex-backend-completion`.

This batch does not close the full SRS. Remaining work includes independently scanned evidence upload/download; item correction/assignment workflows; successful publication, approval and approved carry-forward; version-preserving reopening; linking subsequently imported general-ledger entries with proof that the adjustment is already included; complete proposal lifecycle; approved matching rules, ground-truth quality estimation, worker isolation and performance/volume acceptance. Read `backend-requirements.json` for the overall release gate.
