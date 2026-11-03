# Membership and independent review services

This batch extends the completion goal with authenticated invitations, scoped administration, live reviewer selection, fingerprint-bound submission, withdrawal, rejection and guarded approval. It does **not** make quarantined financial data approvable or claim that the complete backend is ready.

## Identity and authorization

An administrator explicitly chooses the invitation's permissions, entity/bank scopes, validity period (1–168 hours) and reason. Billing ownership still gives no automatic financial access. The invitation capability is a domain-separated HMAC, stored only as a SHA-256 hash. Email addresses are canonicalized before both hashing and retry lookup so case-only retries return the same valid private link. The current delivery mode is clearly labeled **manual private link; email is not configured**. No email or sensitive file is sent by tests.

Acceptance requires an actual authenticated account with recent MFA whose email matches the addressee. The invitation is locked and consumed once; wrong accounts, consumed/revoked/expired links and suspended memberships are not activated. It checks that the original inviter still administers every granted scope. Existing revoked memberships are not silently revived. Identity directory queries disclose names/email only to authorized administrators; preparers see only eligible independent reviewer names. Scope and membership revocation are audited and idempotent. Revoking an entire membership revokes its roles/grants and existing financial sessions, requiring reauthentication; it cannot remove the actor or workspace owner through that endpoint. Repeating an already-inactive removal under a fresh request key does not revoke unrelated later sessions.

Scoped grants/roles can be revoked only within the administrator's actual authority. Responses show permissions still effective through other grants; revoking one grant is not falsely represented as removing all access. Owner billing role transfer and self-administration removal remain separate workflows. Database/native password credentials are never directory fields.

## Review transitions

The preparer submits one exact output fingerprint to a different authorized reviewer. The same request key reuses its result, while changed content/actor is rejected. A reviewer may reject or request changes with a reason. Withdrawal preserves the old submission and creates a new explicit review-cycle fingerprint; prior validation facts are copied without removing failures, allowing resubmission without rewriting the old signature. Decisions record their actual actor and current MFA session. Combining preparer and approver permissions does not permit self-approval.

Approval passes through the original database review gates: independent reviewer, actual assigned submission, unchanged fingerprint, active MFA, scope/balance/mapping/completeness checks, complete published in-currency datasets, published financial mappings, reconciled bank balances and difference evidence. The normal API role still has **no UPDATE privilege on output status**, no INSERT privilege on review decisions and no ability to mark a source clean. Narrow security-definer functions perform the verified transition; only their explicit signatures are granted, with a fixed search path. The private operation ledger prevents request replay from duplicating decisions or notifications.

The connected Arabic/English UI shows the exact version's available figures, metric formulas and correct units, validation failures, eligible reviewer choices and decision history. Incomplete/quarantined outputs can receive review feedback but cannot be approved. Real invitation links survive the sign-in/MFA flow using session storage and are removed after acceptance. The reviewer screenshot intentionally excludes the administrator's private invitation-link field.

## Migrations and evidence

- Migration 010 adds narrowly scoped identity/review bridges and private request idempotency. Financial session revocation returns a dedicated authentication error rather than a role error.
- Migration 011 preserves the existing invitation guard's transaction-time contract (`accepted_at=now()`), while checking real expiry separately; it adds invitation/scope revocation and prevents repeat inactive membership removal. Applied migration 010 is unchanged.
- Migration 012 requires active tenant/entity scopes and serializes review transitions against closed periods. Frozen periods return a conflict without inserting a submission.
- Migration 013 adds explicit audited membership reactivation. Previously revoked grants/roles remain revoked; reactivation alone restores no financial access.
- `verification/review-membership-api.json`: 11 real authenticated API scenarios, including expired/revoked invitations, combined roles, quarantined approval denial, request-changes, withdrawal/resubmission, stale review and immediate session revocation.
- `verification/review-browser.json`: five real browser flows across five widths, with persisted history.
- `verification/administration-scope-api.json`: five authenticated scope/role revocation, period-freeze, reauthentication and explicit-reactivation scenarios.

The old single-operator snapshot archive is disabled by default. It requires explicit `LOCAL_DEMO_ARCHIVE=1` in development and refuses to start under `APP_PROFILE=production`. Existing snapshots are preserved. Its disabled status is distinguished from the authenticated workspace's database connection; a user may still use the real connected workspace. Production read-only checks verify signed-out archive requests receive 503.

Successful approval of scanned/published data, authorized reopening, period versioning, provider email/recovery activation and remaining lifecycle workflows are still tracked by `docs/backend-requirements.json`. These are not replaced by synthetic provider success or by this batch's rejection tests.
