# Backend completion target

The owner requested **all M and S requirements**, not just the launch subset. Email, payments, application hosting, file scanning, OCR and AI providers have not been selected. Adapters and configuration can be implemented, but unconfigured services and synthetic provider fixtures cannot be marked as live integrations.

`backend-requirements.json` tracks every FR, NFR and DR acceptance statement. `npm run backend:readiness` deliberately fails until every requirement has recorded verification evidence and no unfinished acceptance work. Existing schemas alone are not accepted as implemented workflows. Operational targets and accounting policies in SRS 1.0 are proposals; a measurement, approved configuration or provider contract cannot be invented to close an item.

## Completion sequence

1. Manual grouped/partial allocations, rejection, supervisor conflict override and full reversal history.
2. Scoped membership/invitations and independent review/withdrawal/rejection/approval/reopening; preserve all database approval gates.
3. Reconciling items, evidence, adjusted balances, proposed entries, carry-forward, explainable matching rules and quality denominators.
4. Isolated import/parser/scanner workers, XLSX/CSV preview/mapping, versioned templates, corrections, publication and reliable job cancellation/retry.
5. Complete financial calculations/comparatives/metrics/explanations, cash-flow prerequisites, budgets/dimensions and traceability.
6. Permissioned version-bound exports, comments/attachments/notifications, searchable audit, privacy/retention/support workflows.
7. Provider adapters for identity mail, payments, OCR, AI and read-only accounting sync; external API/webhook security, usage limits and quotas.
8. Deployment profiles, monitoring, restore/revocation/deletion exercises, security/performance/accessibility checks, requirement-by-requirement acceptance evidence.

This sequence is a working order, not a claim that any remaining requirement has been delivered. Verified coherent batches are committed and pushed regularly while the completion goal remains active.

## Manual allocation batch

`POST .../reconciliations/:id/manual-matches` accepts explicit pairs, positive decimal amounts, expected output fingerprint, request UUID, documented reason and optional explicit reference-conflict acknowledgment. It supports partial one-to-one, one-to-many and many-to-one groups. It does not search or approve many-to-many groups. The server locks the actual datasets/movements, sums all active allocations and rejects excess capacity atomically. Different banks/datasets/signs and duplicate pairs are rejected. A clear nonempty reference conflict requires both acknowledgment and a scoped `matches.override` grant; this cannot be supplied by spoofing an actor.

Each successful group stores immutable membership evidence, positive allocations, actor/reason, a decision and changed draft fingerprint. Request-key retries reuse the decision. Unmatching reverses all active allocations in that group and preserves earlier rows. Existing suggestions can be explicitly rejected without deleting related partial allocations. Source scanning, completeness and approval gates remain unchanged.

The connected workspace provides explicit pair selection, exact requested totals, reasons and override acknowledgment. Existing tables show allocated/remaining amounts and manual decisions. Evidence: `server/allocation-plan.test.mjs`, `verification/manual-allocation-api.json` and `verification/manual-allocation-workspace-ar.png`. Synthetic writes are restricted to `codex-backend-completion`.
