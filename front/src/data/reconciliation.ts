import { addStr, dec, isZero, subStr } from "@/lib/decimal";
import type { Persona, QualityReport, Reconciliation, ReviewState } from "@/data/types";

export function adjustedBankBalance(reconciliation: Reconciliation): string {
  return reconciliation.outstandingItems
    .filter((item) => item.status !== "cleared")
    .map((item) => item.amount)
    .concat(
      reconciliation.proposedAdjustments
        .filter((adjustment) => adjustment.side === "bank" && adjustment.status !== "recorded")
        .map((adjustment) => adjustment.amount),
    )
    .reduce((balance, amount) => addStr(balance, amount, reconciliation.currency), reconciliation.closingBalance);
}

export function adjustedBookBalance(reconciliation: Reconciliation): string {
  return reconciliation.proposedAdjustments
    .filter((adjustment) => adjustment.side === "book" && adjustment.status !== "recorded")
    .map((adjustment) => adjustment.amount)
    .reduce((balance, amount) => addStr(balance, amount, reconciliation.currency), reconciliation.bookBalance);
}

export function unexplainedDifference(reconciliation: Reconciliation): string {
  return subStr(adjustedBankBalance(reconciliation), adjustedBookBalance(reconciliation), reconciliation.currency);
}

/** Fingerprint the current source-derived reconciliation, not a stored display residual. */
export function reconciliationFingerprint(reconciliation: Reconciliation): string {
  const transactionState = reconciliation.transactions
    .map((transaction) => `${transaction.id}:${transaction.amount}:${transaction.matchState}`)
    .join("|");
  const outstandingState = reconciliation.outstandingItems
    .map((item) => `${item.id}:${item.amount}:${item.status}`)
    .join("|");
  const proposalState = reconciliation.proposedAdjustments
    .map((adjustment) => `${adjustment.id}:${adjustment.amount}:${adjustment.status}`)
    .join("|");
  return [
    reconciliation.id,
    reconciliation.version,
    reconciliation.entityId,
    reconciliation.bankAccountId,
    reconciliation.openingBalance,
    reconciliation.closingBalance,
    reconciliation.bookBalance,
    transactionState,
    outstandingState,
    proposalState,
  ].join(";");
}

export interface ApprovalGateResult {
  allowed: boolean;
  reasonKey: string | null;
}

export function evaluateApprovalPredicates(
  persona: Persona,
  reconciliation: Reconciliation,
  quality: QualityReport,
  review: ReviewState,
): ApprovalGateResult {
  if (!persona.permissions.includes("reviews.approve")) {
    return { allowed: false, reasonKey: "gate.permission" };
  }
  if (
    !persona.scopedEntityIds.includes(reconciliation.entityId) ||
    !persona.scopedAccountIds.includes(reconciliation.bankAccountId)
  ) {
    return { allowed: false, reasonKey: "gate.scope" };
  }
  if (reconciliation.preparerId === persona.id || review.submittedBy === persona.id) {
    return { allowed: false, reasonKey: "gate.selfApproval" };
  }
  if (
    review.submittedBy !== reconciliation.preparerId ||
    review.reviewer !== persona.id ||
    reconciliation.approverId !== persona.id
  ) {
    return { allowed: false, reasonKey: "gate.independentReviewer" };
  }
  const countsReconcile =
    quality.counts.accepted + quality.counts.rejected + quality.counts.excluded === quality.counts.recordsRead;
  if (quality.blocking.length > 0 || quality.counts.rejected > 0 || !countsReconcile) {
    return { allowed: false, reasonKey: "gate.blockingQuality" };
  }
  if (!reconciliation.completeBankDataset || !reconciliation.completeBookDataset) {
    return { allowed: false, reasonKey: "gate.incompleteDataset" };
  }

  const currentFingerprint = reconciliationFingerprint(reconciliation);
  if (
    review.reviewedVersion !== reconciliation.version ||
    review.currentVersion !== reconciliation.version ||
    review.reviewedVersionFingerprint !== currentFingerprint ||
    review.currentVersionFingerprint !== currentFingerprint
  ) {
    return { allowed: false, reasonKey: "gate.staleVersion" };
  }
  if (!isZero(dec(unexplainedDifference(reconciliation), reconciliation.currency))) {
    return { allowed: false, reasonKey: "gate.unexplainedDifference" };
  }
  if (reconciliation.status === "approvedLocked") {
    return { allowed: false, reasonKey: "gate.locked" };
  }
  if (reconciliation.status !== "readyForReview" && reconciliation.status !== "underReview") {
    return { allowed: false, reasonKey: "gate.notReady" };
  }
  return { allowed: true, reasonKey: null };
}
