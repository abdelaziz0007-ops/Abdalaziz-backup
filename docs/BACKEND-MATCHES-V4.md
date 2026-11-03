# Matching decisions on bank drafts

Extends [paired bank intake](BACKEND-BANK-V3.md). The real workspace can now confirm an unambiguous exact one-to-one suggestion, reverse it, and confirm it again without deleting history. This does not approve the reconciliation or make quarantined sources publishable.

## Decision contract

`POST /api/v1/tenants/:tenantId/entities/:entityId/reconciliations/:reconciliationId/matches/:groupId/confirm` and `/unmatch` accept only:

```json
{"requestKey":"a-client-generated-uuid","expectedVersion":0,"reason":"A documented reason of at least eight characters"}
```

Live authentication, verified MFA within 15 minutes and `outputs.prepare` on the reconciliation's actual bank are required. Request bodies cannot select an actor, amount, transaction pair or target bank. The server derives these from the selected reconciliation/group and rechecks the original reference hashes, dates, same signed amount, currency/dataset membership and remaining allocation capacity. Ambiguous/grouped/partial/reference-conflicting proposals cannot be confirmed by this endpoint.

Each action runs in one transaction under the existing entity advisory lock and locks the output, period, group and relevant movement records. A stale expected decision version returns 409. Editable statuses are draft/rejected/withdrawn and the accounting period must be open. Review-stage/locked outputs and locked periods reject new actions. Recent-MFA failures require the workspace's Verify MFA action; a replay never bypasses current identity/bank permission checks.

Confirmation changes the group and inserts one full positive allocation equal to the absolute signed movement; negative withdrawals therefore allocate their absolute value without changing their financial sign. It refuses any already allocated movement. Existing database guards independently serialize and bound allocations, including allocations from a competing group.

Unmatching reverses active allocations once with actor/time/reason, then changes the group to unmatched. It never deletes or rewrites the original allocation. Reconfirmation creates a new allocation and another decision. Match decisions and audit records retain all transitions.

The request key is bound to actor, action, group, expected version and normalized reason. Retrying the same request returns its original result, even if later decisions have occurred; clients then refresh current state. Reusing a key for changed content returns 409. Migration 009 adds an additive unique expression index on the tenant/entity/request key to prevent duplicate consumption; applied migration files are not edited.

## Fingerprints, evidence and display

Every successful decision changes the draft output fingerprint from its preceding fingerprint and the new decision evidence. Prior validation evidence stays append-only. Source-related checks are copied to the new fingerprint and the reconciliation residual check stays blocking. Read APIs display only checks for the current fingerprint. Matching does not alter the raw closing difference or claim an adjusted balance, zero residual or independent approval.

Intake reuse now looks up the immutable bank dataset's source request identity, rather than the mutable output fingerprint, so reuploading the same inputs after confirmation still returns the original draft.

The authenticated detail API returns active allocated/remaining absolute amounts for each original bank/book movement, allocation/reversal records and the latest 200 matching decisions. Remaining capacity accounts for active allocations of the same transaction across groups. The browser provides an explicit reason field and confirm/unmatch action, reuses an in-flight request key after an uncertain response, refreshes current state after success and preserves history on reload. Ambiguous proposals show a review requirement instead of a confirmation action.

## Permissions and boundaries

Runtime grants are narrow: INSERT on allocations/decisions; UPDATE only on allocation reversal fields, match decision/status fields and output fingerprint. UPDATE(id) exists on parent/movement/period tables solely for row locks; identity guards prevent changing IDs. No DELETE, source-scan override, dataset publication or output approval grant is added. The browser receives no database or storage credentials.

Manual disambiguation, partial/group matching, reference-conflict override, reconciling-item management, journals, independent approval, exports and antivirus scanning remain later work. Current matching decisions on a quarantined source are preparatory draft work. The current server remains loopback-only.

## Verification

`npm run backend:test:matches` requires a `codex-matches-*` branch. Real synthetic signup/MFA fixtures exercise exact and negative matches, retry idempotency, stale decisions, concurrent confirmation/unmatching, competing allocation capacity, bank-scoped denial, review freeze and locked periods. The Arabic browser confirms/unmatches with reasons, checks persisted history/remaining amounts, reload and five widths. Evidence: `verification/matches-api.json`, `verification/matches-workspace-ar.png`. Synthetic fixtures and locks remain only on the disposable branch.

`npm test` and `npm run build` cover the existing app. Production verification stays read-only and includes allocations/decision RLS. Current authentication probes and native MFA are checked again; no claim is made that the prior intermittent authentication issue's root cause has been fixed merely because subsequent probes pass.

The connected run passed 11 API/browser checks. An initial browser selector matched both the real group and the deliberately duplicated competing-group fixture; the selector was narrowed to the confirmed/unmatched state and the complete run passed. No backend assertion or allocation guard was weakened.

Final checks: 70 unit tests, successful production build, 11 connected matching checks and six read-only production checks. Migration 009 was applied to production after its isolated-branch test. The production runtime cannot change output approval status or source scan status; no synthetic accounts or financial writes were seeded there. The existing large ExcelJS bundle warning remains.
