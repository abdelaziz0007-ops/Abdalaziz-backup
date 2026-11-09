-- PostgreSQL CHECK permits NULL: document mandatory conditional evidence explicitly.
ALTER TABLE mizan.accounting_periods ADD CONSTRAINT period_reopening_reason_required
 CHECK(predecessor_id IS NULL OR (reopen_reason IS NOT NULL AND length(trim(reopen_reason))>0));
ALTER TABLE mizan.output_versions ADD CONSTRAINT output_reopening_reason_required
 CHECK(predecessor_id IS NULL OR (reopen_reason IS NOT NULL AND length(trim(reopen_reason))>0));
ALTER TABLE mizan.output_versions ADD CONSTRAINT submitted_fingerprint_required
 CHECK(status NOT IN ('under_review','approved_locked') OR (submitted_fingerprint IS NOT NULL AND submitted_fingerprint=content_fingerprint AND submitted_at IS NOT NULL));
ALTER TABLE mizan.allocations ADD CONSTRAINT reversal_evidence_required
 CHECK((reversed_at IS NULL AND reversed_by IS NULL AND reversal_reason IS NULL)
 OR (reversed_at IS NOT NULL AND reversed_by IS NOT NULL AND reversal_reason IS NOT NULL AND length(trim(reversal_reason))>0));
ALTER TABLE mizan.reconciliation_items ADD CONSTRAINT item_decision_reason_required
 CHECK(status='outstanding' OR (decision_reason IS NOT NULL AND length(trim(decision_reason))>0));
ALTER TABLE mizan.review_submissions ADD CONSTRAINT withdrawal_reason_required
 CHECK(withdrawn_at IS NULL OR (withdrawal_reason IS NOT NULL AND length(trim(withdrawal_reason))>0));
