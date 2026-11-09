/**
 * Canonical v2 fixture -> OpenCode foundation schema adapter.
 * The source JSON remains the Atlas/Cedar handoff artifact; this adapter retains
 * its stable IDs and exact amounts while projecting only fields the scaffold uses.
 */
import source from "../../fake-data.json";
import { addStr, CURRENCY_PRECISION, dec, formatDec, subStr } from "@/lib/decimal";
import { reconciliationFingerprint } from "@/data/reconciliation";
import type {
  AccountingPeriod,
  Allocation,
  BankTransaction,
  CurrencyCode,
  DashboardSnapshot,
  Entity,
  Fixtures,
  LocalizedText,
  Persona,
  PersonaId,
  QualityIssue,
  ReconcilingItem,
  Reconciliation,
  ReportVersion,
  ReviewState,
} from "@/data/types";

const PERSONA_BY_USER_ID: Record<string, PersonaId> = {
  "USR-MAYA": "maya",
  "USR-OMAR": "omar",
  "USR-LINA": "lina",
  "USR-NOOR": "noor",
};

function currencyCode(value: string): CurrencyCode {
  if (value === "SAR" || value === "USD" || value === "BHD") return value;
  throw new Error(`Unsupported canonical currency: ${value}`);
}

function personaId(value: string): PersonaId {
  const id = PERSONA_BY_USER_ID[value];
  if (!id) throw new Error(`Unknown canonical user ID: ${value}`);
  return id;
}

function roleFor(roles: string[]): Persona["role"] {
  if (roles.includes("approver")) return "approver";
  if (roles.includes("preparer")) return "preparer";
  if (roles.includes("subscriptionOwner")) return "subscriptionOwner";
  if (roles.includes("entityAdmin") || roles.includes("tenantAdmin")) return "entityAdmin";
  throw new Error(`Unsupported canonical role: ${roles.join(", ")}`);
}

const PERMISSIONS_BY_PERSONA: Record<PersonaId, Persona["permissions"]> = {
  maya: [
    "dashboard.view", "entities.view", "imports.manage", "quality.view", "mapping.edit",
    "reports.view", "reports.prepare", "sources.view", "reconciliations.view",
    "reconciliations.prepare", "subscription.view", "reviews.submit", "audit.view", "settings.view",
  ],
  omar: [
    "dashboard.view", "entities.view", "quality.view", "reports.view", "sources.view",
    "reconciliations.view", "subscription.view", "reviews.approve", "audit.view", "settings.view",
  ],
  lina: ["subscription.manage", "users.manage"],
  noor: [
    "dashboard.view", "entities.view", "imports.manage", "quality.view", "mapping.edit",
    "reports.view", "reports.prepare", "sources.view", "reconciliations.view",
    "reconciliations.prepare", "subscription.view", "reviews.submit", "audit.view", "settings.view",
    "entities.manage", "bankAccounts.manage", "users.manage",
  ],
};

function periodId(entityId: string, period: string): string {
  return `PER-${entityId}-${period}`;
}

function monthLabel(value: string): LocalizedText {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 15));
  return {
    en: new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(date),
    ar: new Intl.DateTimeFormat("ar", { month: "long", year: "numeric", calendar: "gregory", timeZone: "UTC" }).format(date),
  };
}

function monthRange(value: string): { startDate: string; endDate: string } {
  const [year, month] = value.split("-").map(Number);
  const startDate = `${value}-01`;
  const endDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { startDate, endDate };
}

function ratio(numerator: string, denominator: string, currency: CurrencyCode): string {
  const left = dec(numerator, currency).units;
  const right = dec(denominator, currency).units;
  if (right === 0n) return "0.0000";
  const scale = 10_000n;
  const quotient = (left * scale) / right;
  const remainder = (left * scale) % right;
  const rounded = remainder * 2n >= right ? quotient + 1n : quotient;
  return formatDec({ units: rounded, scale: 4 }, 4);
}

function mapMatchState(status: string): BankTransaction["matchState"] {
  switch (status) {
    case "confirmed": return "confirmedMatch";
    case "suggested": return "suggestion";
    case "ambiguous": return "ambiguous";
    case "unmatched":
    case "outstanding": return "unmatched";
    case "excluded": return "excluded";
    default: throw new Error(`Unsupported canonical transaction status: ${status}`);
  }
}

function workflowStatus(value: string): Reconciliation["status"] {
  if (
    value === "draft" ||
    value === "readyForReview" ||
    value === "underReview" ||
    value === "approvedLocked" ||
    value === "rejected"
  ) return value;
  throw new Error(`Unsupported canonical workflow status: ${value}`);
}

const canonical = source;
const atlas = canonical.entities.find((entity) => entity.id === "ENT-ATLAS");
const bankAccount = canonical.bankAccount;
const report = canonical.financialReports;
const sourceReconciliation = canonical.reconciliation;

if (!atlas || !bankAccount || sourceReconciliation.entityId !== atlas.id) {
  throw new Error("Canonical Atlas fixture is incomplete or internally inconsistent");
}

const personas: Persona[] = canonical.users.map((user) => {
  const id = personaId(user.id);
  return {
    id,
    name: user.name,
    role: roleFor(user.roles),
    permissions: PERMISSIONS_BY_PERSONA[id],
    scopedEntityIds: user.entityIds,
    scopedAccountIds: user.entityIds.includes(bankAccount.entityId) ? [bankAccount.id] : [],
  };
});

const entities: Entity[] = canonical.entities.map((entity) => {
  const id = entity.id;
  const access = personas.filter((persona) => persona.scopedEntityIds.includes(id)).map((persona) => persona.id);
  return {
    id,
    legalName: entity.name,
    functionalCurrency: currencyCode(entity.currency),
    fiscalYearStartMonth: Number(entity.fiscalYearStart.split("-")[0]),
    access,
  };
});

const currentPeriod = sourceReconciliation.period;
const comparativePeriod = report.comparative.period;
const periods: AccountingPeriod[] = [];
for (const entity of entities) {
  if (entity.id !== atlas.id) continue;
  for (const month of [comparativePeriod, currentPeriod]) {
    const range = monthRange(month);
    periods.push({
      id: periodId(entity.id, month),
      entityId: entity.id,
      label: monthLabel(month),
      ...range,
      status: "draft",
    });
  }
}

const matchesByTransaction = new Map<string, string>();
for (const match of sourceReconciliation.initialConfirmedMatches) {
  const bankId = match.bankIds[0];
  const bookId = match.bookIds[0];
  if (bankId && bookId) {
    matchesByTransaction.set(bankId, match.rule);
    matchesByTransaction.set(bookId, match.rule);
  }
}
if (sourceReconciliation.suggestedGroup.bankIds[0]) {
  matchesByTransaction.set(sourceReconciliation.suggestedGroup.bankIds[0], sourceReconciliation.suggestedGroup.rule);
  for (const id of sourceReconciliation.suggestedGroup.bookIds) {
    matchesByTransaction.set(id, sourceReconciliation.suggestedGroup.rule);
  }
}

function mapTransaction(transaction: typeof sourceReconciliation.bankTransactions[number], side: "bank" | "book"): BankTransaction {
  return {
    id: transaction.id,
    side,
    entityId: transaction.entityId,
    accountId: transaction.bankAccountId,
    currency: currencyCode(transaction.currency),
    date: transaction.date,
    description: transaction.description,
    reference: transaction.reference,
    amount: transaction.amount,
    matchState: mapMatchState(transaction.initialStatus),
    ruleId: matchesByTransaction.get(transaction.id) ?? null,
  };
}

const transactions: BankTransaction[] = [
  ...sourceReconciliation.bankTransactions.map((transaction) => mapTransaction(transaction, "bank")),
  ...sourceReconciliation.bookTransactions.map((transaction) => mapTransaction(transaction, "book")),
];

const allocations: Allocation[] = sourceReconciliation.initialConfirmedMatches.flatMap((match) => {
  const bankId = match.bankIds[0];
  const bookId = match.bookIds[0];
  if (!bankId || !bookId) return [];
  return [{
    id: match.id,
    transactionId: bankId,
    against: bookId,
    allocatedAmount: match.amount,
    kind: "full",
    note: { en: `Rule ${match.rule}`, ar: `قاعدة ${match.rule}` },
  }];
});

const outstandingItems: ReconcilingItem[] = sourceReconciliation.reconcilingItems
  .filter((item) => item.side === "bank")
  .map((item) => ({
    id: item.id,
    type: item.kind === "depositInTransit" ? "depositInTransit" : "outstandingCheque",
    label: item.kind === "depositInTransit"
      ? { en: "Deposit in transit", ar: "إيداع بالطريق" }
      : { en: "Outstanding check", ar: "شيك معلق" },
    amount: item.signedAdjustment,
    originationDate: item.originDate,
    ageDays: 0,
    status: "outstanding",
  }));

const cashLine = canonical.proposedJournal.lines.find((line) => line.account.startsWith(bankAccount.ledgerAccountCode));
if (!cashLine || canonical.proposedJournal.status !== "notPosted") {
  throw new Error("Canonical proposed fee must remain an unposted cash-account adjustment");
}
const feeAdjustment = subStr(cashLine.debit, cashLine.credit, currencyCode(bankAccount.currency));

const reconciliation: Reconciliation = {
  id: sourceReconciliation.id,
  entityId: sourceReconciliation.entityId,
  periodId: periodId(sourceReconciliation.entityId, currentPeriod),
  bankAccountId: sourceReconciliation.bankAccountId,
  bankAccountLabel: bankAccount.displayName,
  currency: currencyCode(bankAccount.currency),
  cutoffDate: canonical.metadata.cutoffDate,
  version: sourceReconciliation.version,
  status: workflowStatus(sourceReconciliation.initialStatus),
  openingBalance: sourceReconciliation.bankOpeningBalance,
  bookOpeningBalance: sourceReconciliation.bookOpeningBalance,
  closingBalance: sourceReconciliation.bankClosingBalance,
  bookBalance: sourceReconciliation.bookClosingBalance,
  ruleVersion: sourceReconciliation.initialConfirmedMatches[0]?.ruleVersion ?? "unversioned",
  transactions,
  allocations,
  outstandingItems,
  proposedAdjustments: [{
    id: canonical.proposedJournal.id,
    side: "book",
    label: { en: "Unrecorded bank service fee", ar: "رسوم خدمة بنكية غير مسجلة" },
    amount: feeAdjustment,
    status: "proposed",
  }],
  completeBankDataset: sourceReconciliation.completeBankDataset,
  completeBookDataset: sourceReconciliation.completeBookDataset,
  preparerId: personaId(sourceReconciliation.preparerId),
  approverId: personaId(sourceReconciliation.approverId),
};

function snapshotFor(month: string, current: boolean): Omit<DashboardSnapshot, "entityId" | "periodId" | "currency"> {
  if (!current) {
    return {
      netRevenue: report.comparative.netRevenue,
      netProfit: report.comparative.netProfit,
      netProfitMarginPct: null,
      currentAssets: null,
      currentLiabilities: null,
      currentRatio: null,
      unmappedAccountsCount: 0,
      openItemsCount: 0,
      openItemsValue: formatDec(dec("0", "USD"), CURRENCY_PRECISION.USD),
      pendingReviewsCount: 0,
      jobs: [],
    };
  }
  const position = report.position;
  const openItems = outstandingItems.filter((item) => item.status === "outstanding");
  const openItemsValue = openItems.reduce(
    (total, item) => addStr(total, item.amount.startsWith("-") ? item.amount.slice(1) : item.amount, "USD"),
    formatDec(dec("0", "USD"), CURRENCY_PRECISION.USD),
  );
  const margin = report.current.netProfitMarginDisplay.replace("%", "");
  const currentSnapshot: Omit<DashboardSnapshot, "entityId" | "periodId" | "currency"> = {
    netRevenue: report.current.netRevenue,
    netProfit: report.current.netProfit,
    netProfitMarginPct: margin,
    currentAssets: position.currentAssets,
    currentLiabilities: position.currentLiabilities,
    currentRatio: ratio(position.currentAssets, position.currentLiabilities, "USD"),
    unmappedAccountsCount: canonical.trialBalance.filter((row) => !row.classification).length,
    openItemsCount: openItems.length,
    openItemsValue,
    pendingReviewsCount: report.status === "draft" ? 1 : 0,
    jobs: [],
  };
  if (month !== currentPeriod) throw new Error(`No dashboard source values for ${month}`);
  return currentSnapshot;
}

const dashboard: Fixtures["dashboard"] = {
  [atlas.id]: {
    [periodId(atlas.id, comparativePeriod)]: snapshotFor(comparativePeriod, false),
    [periodId(atlas.id, currentPeriod)]: snapshotFor(currentPeriod, true),
  },
};

const currentFingerprint = reconciliationFingerprint(reconciliation);
const review: ReviewState = {
  reviewedVersionFingerprint: currentFingerprint,
  currentVersionFingerprint: currentFingerprint,
  reviewedVersion: reconciliation.version,
  currentVersion: reconciliation.version,
  reviewer: reconciliation.approverId,
  submittedBy: reconciliation.preparerId,
  submittedAt: canonical.metadata.cutoffDate,
  comment: { en: "", ar: "" },
};

const reports: ReportVersion[] = [
  {
    id: "RPT-2026-10-INCOME",
    type: "incomeStatement",
    entityId: atlas.id,
    periodId: reconciliation.periodId,
    version: report.version,
    status: workflowStatus(report.status),
    contentFingerprint: `income:${report.version}:${report.current.netRevenue}:${report.current.netProfit}`,
    submittedBy: reconciliation.preparerId,
    approver: null,
  },
  {
    id: "RPT-2026-10-POSITION",
    type: "financialPosition",
    entityId: atlas.id,
    periodId: reconciliation.periodId,
    version: report.version,
    status: workflowStatus(report.status),
    contentFingerprint: `position:${report.version}:${report.position.totalAssets}:${report.position.totalEquity}`,
    submittedBy: reconciliation.preparerId,
    approver: null,
  },
];

const qualityIssue = (issue: typeof canonical.qualityScenario.issues[number]): QualityIssue => ({
  id: issue.id,
  code: issue.field,
  label: { en: issue.message, ar: issue.message },
  sourceRow: `${canonical.qualityScenario.file}:${issue.row ?? issue.rows?.join(",") ?? "unknown"}`,
});

export const canonicalQualityScenario = {
  blocking: canonical.qualityScenario.issues.filter((issue) => issue.severity === "blocking").map(qualityIssue),
  warnings: canonical.qualityScenario.issues.filter((issue) => issue.severity === "warning").map(qualityIssue),
};

export const fixtures: Fixtures = {
  meta: {
    version: canonical.metadata.schemaVersion,
    note: canonical.metadata.note,
  },
  tenant: {
    id: canonical.tenant.id,
    name: { en: canonical.tenant.name, ar: canonical.tenant.name },
  },
  currencies: {
    SAR: { code: "SAR", precision: 2, symbol: { en: "SAR", ar: "SAR" } },
    USD: { code: "USD", precision: 2, symbol: { en: "USD", ar: "USD" } },
    BHD: { code: "BHD", precision: 3, symbol: { en: "BHD", ar: "BHD" } },
  },
  entities,
  periods,
  personas,
  notifications: [],
  dashboard,
  reconciliation,
  quality: {
    blocking: [],
    warnings: [],
    counts: {
      recordsRead: transactions.length,
      accepted: transactions.length,
      rejected: 0,
      excluded: 0,
    },
  },
  reports,
  review,
  subscription: {
    plan: { en: canonical.subscription.plan, ar: canonical.subscription.plan },
    billingStatus: { en: "Demo only — no live billing", ar: "عرض توضيحي — لا توجد فوترة فعلية" },
    quota: {
      unit: { en: canonical.subscription.usageUnit, ar: canonical.subscription.usageUnit },
      limit: String(canonical.subscription.includedMonthlyRows),
      used: String(canonical.subscription.usedRows),
    },
    nextInvoice: { en: "No invoice issued; demo example only", ar: "لا توجد فاتورة صادرة؛ مثال توضيحي فقط" },
  },
  auditEvents: [],
};

export { source as canonicalSource };
