import { CURRENCY_PRECISION, dec, formatDec, isZero } from "@/lib/decimal";
import type { Allocation, BankTransaction, CurrencyCode } from "@/data/types";

function absolute(units: bigint): bigint {
  return units < 0n ? -units : units;
}

function transactionMap(transactions: BankTransaction[]): Map<string, BankTransaction> {
  const result = new Map<string, BankTransaction>();
  for (const transaction of transactions) {
    if (result.has(transaction.id)) throw new Error(`Duplicate transaction ID: ${transaction.id}`);
    result.set(transaction.id, transaction);
  }
  return result;
}

/** Validate every allocation; no invalid decision is silently discarded. */
export function validateAllocations(
  transactions: BankTransaction[],
  allocations: Allocation[],
  currency: CurrencyCode,
): void {
  const byId = transactionMap(transactions);
  const consumed = new Map<string, bigint>();
  const allocationIds = new Set<string>();

  for (const allocation of allocations) {
    if (allocationIds.has(allocation.id)) throw new Error(`Duplicate allocation ID: ${allocation.id}`);
    allocationIds.add(allocation.id);

    const transaction = byId.get(allocation.transactionId);
    const against = byId.get(allocation.against);
    if (!transaction || !against) throw new Error(`Allocation ${allocation.id} references an unknown transaction`);
    if (transaction.id === against.id || transaction.side === against.side) {
      throw new Error(`Allocation ${allocation.id} must connect opposite transaction sides`);
    }
    if (
      transaction.entityId !== against.entityId ||
      transaction.accountId !== against.accountId ||
      transaction.currency !== against.currency ||
      transaction.currency !== currency
    ) {
      throw new Error(`Allocation ${allocation.id} crosses entity, account, or currency scope`);
    }

    const transactionAmount = dec(transaction.amount, currency);
    const againstAmount = dec(against.amount, currency);
    if (isZero(transactionAmount) || isZero(againstAmount) || (transactionAmount.units < 0n) !== (againstAmount.units < 0n)) {
      throw new Error(`Allocation ${allocation.id} has incompatible cash-flow signs`);
    }

    const amount = dec(allocation.allocatedAmount, currency);
    if (amount.units <= 0n) throw new Error(`Allocation ${allocation.id} must be a positive magnitude`);

    const transactionRemaining = absolute(transactionAmount.units) - (consumed.get(transaction.id) ?? 0n);
    const againstRemaining = absolute(againstAmount.units) - (consumed.get(against.id) ?? 0n);
    if (amount.units > transactionRemaining || amount.units > againstRemaining) {
      throw new Error(`Allocation ${allocation.id} exceeds available amount on one or both transactions`);
    }

    const isFull = amount.units === transactionRemaining && amount.units === againstRemaining;
    if (allocation.kind !== (isFull ? "full" : "partial")) {
      throw new Error(`Allocation ${allocation.id} has an incorrect full/partial classification`);
    }

    consumed.set(transaction.id, (consumed.get(transaction.id) ?? 0n) + amount.units);
    consumed.set(against.id, (consumed.get(against.id) ?? 0n) + amount.units);
  }
}

/** Add one allocation only after validating both transaction balances and scopes. */
export function addAllocation(
  transactions: BankTransaction[],
  allocations: Allocation[],
  allocation: Allocation,
  currency: CurrencyCode,
): Allocation[] {
  validateAllocations(transactions, allocations, currency);
  const next = [...allocations, allocation];
  validateAllocations(transactions, next, currency);
  return next;
}

/**
 * Return the signed remaining amount. Allocations are always positive magnitudes;
 * a payment therefore remains negative until its available amount is consumed.
 */
export function availableAmount(
  transaction: BankTransaction,
  transactions: BankTransaction[],
  allocations: Allocation[],
  currency: CurrencyCode,
): string {
  validateAllocations(transactions, allocations, currency);
  const byId = transactionMap(transactions);
  if (!byId.has(transaction.id)) throw new Error(`Unknown transaction ID: ${transaction.id}`);

  const used = allocations
    .filter((allocation) => allocation.transactionId === transaction.id || allocation.against === transaction.id)
    .reduce((total, allocation) => total + dec(allocation.allocatedAmount, currency).units, 0n);
  const amount = dec(transaction.amount, currency);
  const remaining = absolute(amount.units) - used;
  const signedRemaining = amount.units < 0n ? -remaining : remaining;
  return formatDec({ units: signedRemaining, scale: CURRENCY_PRECISION[currency] }, CURRENCY_PRECISION[currency]);
}

/** Sum allocated magnitude on either side of a match. */
export function allocatedTotal(
  transactionId: string,
  allocations: Allocation[],
  currency: CurrencyCode,
): string {
  const total = allocations
    .filter((allocation) => allocation.transactionId === transactionId || allocation.against === transactionId)
    .reduce((sum, allocation) => sum + dec(allocation.allocatedAmount, currency).units, 0n);
  return formatDec({ units: total, scale: CURRENCY_PRECISION[currency] }, CURRENCY_PRECISION[currency]);
}

export function allocationKind(
  transaction: BankTransaction,
  against: BankTransaction,
  amount: string,
  transactions: BankTransaction[],
  allocations: Allocation[],
  currency: CurrencyCode,
): Allocation["kind"] {
  const left = dec(availableAmount(transaction, transactions, allocations, currency), currency);
  const right = dec(availableAmount(against, transactions, allocations, currency), currency);
  const requested = dec(amount, currency);
  return requested.units > 0n && requested.units === absolute(left.units) && requested.units === absolute(right.units)
    ? "full"
    : "partial";
}
