/**
 * Centralized selectors / derived values.
 * Page components MUST read derived totals from here — never re-hardcode numbers.
 * All arithmetic is exact decimal (minor units), never binary floats.
 */
import { allocatedTotal, availableAmount } from "@/data/allocations";
import {
  CURRENCY_PRECISION,
  addStr,
  cmpStr,
  dec,
  formatDec,
  isZero,
  percentageVariance,
  subStr,
} from "@/lib/decimal";
import { adjustedBankBalance, adjustedBookBalance, unexplainedDifference } from "@/data/reconciliation";
import type {
  Allocation,
  BankTransaction,
  CurrencyCode,
  DashboardSnapshot,
  Entity,
  Reconciliation,
  SubscriptionState,
} from "@/data/types";

const zeroOf = (currency: CurrencyCode): string =>
  formatDec(dec("0", currency), CURRENCY_PRECISION[currency]);

/** Net profit margin with zero-denominator protection (SRS 8.2 → "Unavailable"). */
export function selectNetProfitMargin(snapshot: DashboardSnapshot): string | null {
  if (snapshot.netProfitMarginPct !== null) return snapshot.netProfitMarginPct;
  return null; // caller renders status.unavailable — never treat missing as zero (BRD 9.2)
}

/** Absolute variance between current and comparative periods (exact decimal). */
export function selectAbsoluteVariance(
  current: string,
  comparative: string,
  currency: CurrencyCode,
): string {
  return subStr(current, comparative, currency);
}

/** Percentage variance; null when the comparative base is zero (render "Unavailable"). */
export function selectPercentageVariance(
  current: string,
  comparative: string,
  currency: CurrencyCode,
): string | null {
  return percentageVariance(current, comparative, currency);
}

/** Per-transaction available (unallocated) amounts — single source of truth (FR-030). */
export function selectAvailableAmounts(
  transactions: BankTransaction[],
  allocations: Allocation[],
  currency: CurrencyCode,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tx of transactions) {
    out[tx.id] = availableAmount(tx, transactions, allocations, currency);
  }
  return out;
}

/** Sum of allocations against one transaction (exact). */
export function selectAllocatedTotal(
  transactionId: string,
  allocations: Allocation[],
  currency: CurrencyCode,
): string {
  return allocatedTotal(transactionId, allocations, currency);
}

/** Adjusted bank balance = statement balance + signed bank-side adjustments (SRS 9.5). */
export function selectAdjustedBankBalance(rec: Reconciliation): string {
  return adjustedBankBalance(rec);
}

/** Adjusted book balance = book balance + signed book-side adjustments (SRS 9.5). */
export function selectAdjustedBookBalance(rec: Reconciliation): string {
  return adjustedBookBalance(rec);
}

/**
 * Unexplained difference = adjusted bank − adjusted book (SRS 9.5).
 * Derived, not read from a stored field, so scenarios can't disagree with the math.
 */
export function selectUnexplainedDifference(rec: Reconciliation): string {
  return unexplainedDifference(rec);
}

/** Approval readiness of a reconciliation: unexplained difference must be zero. */
export function selectReconciliationReadyToApprove(rec: Reconciliation): boolean {
  return isZero(dec(selectUnexplainedDifference(rec), rec.currency));
}

/** Open (outstanding) items total, signed. */
export function selectOutstandingTotal(rec: Reconciliation): string {
  return rec.outstandingItems
    .filter((i) => i.status === "outstanding")
    .reduce((acc, i) => addStr(acc, i.amount, rec.currency), zeroOf(rec.currency));
}

/** Match-state counts for coverage display (FR-035). Coverage ≠ precision. */
export function selectMatchCounts(transactions: BankTransaction[]): Record<string, number> {
  const counts = { confirmedMatch: 0, suggestion: 0, ambiguous: 0, unmatched: 0, excluded: 0, total: transactions.length };
  for (const tx of transactions) {
    counts[tx.matchState] += 1;
  }
  return counts;
}

/** Matching coverage by count: confirmed ÷ total valid in-scope transactions. */
export function selectCoveragePct(transactions: BankTransaction[]): string | null {
  const counts = selectMatchCounts(transactions);
  if (counts.total === 0) return null; // do not fabricate 100% on empty data
  return ((counts.confirmedMatch / counts.total) * 100).toFixed(1);
}

/** Quota usage percent; null when the limit is zero (never divide by zero silently). */
export function selectQuotaUsagePct(sub: SubscriptionState): string | null {
  const limit = Number(sub.quota.limit);
  if (!Number.isFinite(limit) || limit === 0) return null;
  return ((Number(sub.quota.used) / limit) * 100).toFixed(1);
}

/** Entities the current persona may see (mock scope — real scope is server-side). */
export function selectAccessibleEntities(
  entities: Entity[],
  scopedEntityIds: string[],
): Entity[] {
  return entities.filter((e) => scopedEntityIds.includes(e.id));
}

/** Validate that a (entity, period) pair still exists — used to clear stale selections. */
export function selectPeriodBelongsToEntity(
  periods: { id: string; entityId: string }[],
  entityId: string,
  periodId: string | null,
): boolean {
  if (!periodId) return false;
  return periods.some((p) => p.id === periodId && p.entityId === entityId);
}

/** Reconciliation-vs-bank roll-forward check: opening + transactions = closing (SRS 9.1). */
export function selectBankRollForwardValid(rec: Reconciliation): boolean {
  const bankTxTotal = rec.transactions
    .filter((t) => t.side === "bank")
    .reduce((acc, t) => addStr(acc, t.amount, rec.currency), zeroOf(rec.currency));
  const derived = addStr(rec.openingBalance, bankTxTotal, rec.currency);
  return cmpStr(derived, rec.closingBalance, rec.currency) === 0;
}
