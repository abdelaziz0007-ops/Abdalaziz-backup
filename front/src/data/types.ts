/** Shared domain types for the mock layer. Fixtures mirror SRS §6 logical model (subset). */
import type copyRaw from "../../ui-copy.json";
import type dataRaw from "../../fake-data.json";

export type Locale = "ar" | "en";
export type Direction = "rtl" | "ltr";
export type Theme = "light" | "dark";
export type Density = "comfortable" | "compact";
export type Numerals = "latn" | "arab";

export type CurrencyCode = "SAR" | "USD" | "BHD";

export type PersonaId = "maya" | "omar" | "lina" | "noor";

export type ScenarioId =
  | "baseline"
  | "partialAllocation"
  | "blockedQuality"
  | "staleReviewVersion"
  | "unexplainedDifference250"
  | "lockedReconciliation"
  | "quotaReached"
  | "providerUnavailable"
  | "emptyEntity";

export type LatencyPreset = "none" | "fast" | "slow";
export type ErrorMode = "none" | "random" | "provider";

export type WorkflowStatus =
  | "draft"
  | "readyForReview"
  | "underReview"
  | "approvedLocked"
  | "rejected";

export type MatchState = "confirmedMatch" | "suggestion" | "ambiguous" | "unmatched" | "excluded";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "needsReview";

export type Permission =
  | "dashboard.view"
  | "entities.view"
  | "imports.manage"
  | "quality.view"
  | "mapping.edit"
  | "reports.view"
  | "reports.prepare"
  | "sources.view"
  | "reconciliations.view"
  | "reconciliations.prepare"
  | "subscription.view"
  | "reviews.approve"
  | "reviews.submit"
  | "audit.view"
  | "settings.view"
  | "subscription.manage"
  | "users.manage"
  | "entities.manage"
  | "bankAccounts.manage"
  | "privacy.export";

export type LocalizedText = { ar: string; en: string };

export interface CurrencyDef {
  code: CurrencyCode;
  precision: number;
  symbol: LocalizedText;
}

export interface Entity {
  id: string;
  legalName: LocalizedText;
  functionalCurrency: CurrencyCode;
  fiscalYearStartMonth: number;
  framework?: LocalizedText;
  access: PersonaId[];
}

export interface AccountingPeriod {
  id: string;
  entityId: string;
  label: LocalizedText;
  startDate: string;
  endDate: string;
  status: WorkflowStatus | "locked";
}

export interface Persona {
  id: PersonaId;
  name: LocalizedText;
  role: "preparer" | "approver" | "subscriptionOwner" | "entityAdmin";
  permissions: Permission[];
  /** Mock scope only — SRS FR-002/003 enforce real scope server-side. */
  scopedEntityIds: string[];
  scopedAccountIds: string[];
}

export interface ImportJob {
  id: string;
  type: LocalizedText;
  status: JobStatus;
  progressPct: number;
  startedAt?: string;
  finishedAt?: string;
}

export interface DashboardSnapshot {
  entityId: string;
  periodId: string;
  currency: CurrencyCode;
  netRevenue: string | null;
  netProfit: string | null;
  netProfitMarginPct: string | null;
  currentAssets: string | null;
  currentLiabilities: string | null;
  currentRatio: string | null;
  unmappedAccountsCount: number;
  openItemsCount: number;
  openItemsValue: string;
  pendingReviewsCount: number;
  jobs: ImportJob[];
}

export interface BankTransaction {
  id: string;
  side: "bank" | "book";
  entityId: string;
  accountId: string;
  currency: CurrencyCode;
  date: string;
  description: LocalizedText;
  reference: string;
  amount: string; // signed exact decimal string; cash perspective (SRS 9.1)
  matchState: MatchState;
  ruleId: string | null;
  /** availableAmount = amount − sum(allocations) — computed via selectors, never duplicated */
  allocatedAmount?: string;
}

export interface Allocation {
  id: string;
  transactionId: string;
  /** Opposite-side transaction ID. Amounts are positive magnitudes, regardless of cash-flow sign. */
  against: string;
  allocatedAmount: string;
  kind: "partial" | "full";
  note: LocalizedText;
}

export interface ReconcilingItem {
  id: string;
  type: "outstandingCheque" | "depositInTransit" | "bookAdjustment" | "bankError" | "underInvestigation";
  label: LocalizedText;
  amount: string;
  originationDate: string;
  ageDays: number;
  status: "outstanding" | "cleared" | "classified";
}

export interface ProposedAdjustment {
  id: string;
  side: "bank" | "book";
  label: LocalizedText;
  amount: string;
  status: "proposed" | "approved" | "recorded";
  counterAccount?: string;
  evidence?: string;
}

export interface Reconciliation {
  id: string;
  entityId: string;
  periodId: string;
  bankAccountId: string;
  bankAccountLabel: LocalizedText;
  currency: CurrencyCode;
  cutoffDate: string;
  version: number;
  status: WorkflowStatus;
  openingBalance: string;
  bookOpeningBalance: string;
  closingBalance: string;
  bookBalance: string;
  ruleVersion: string;
  transactions: BankTransaction[];
  allocations: Allocation[];
  outstandingItems: ReconcilingItem[];
  proposedAdjustments: ProposedAdjustment[];
  completeBankDataset: boolean;
  completeBookDataset: boolean;
  preparerId: PersonaId;
  approverId: PersonaId;
}

export interface QualityIssue {
  id: string;
  code: string;
  label: LocalizedText;
  sourceRow: string;
}

export interface QualityReport {
  blocking: QualityIssue[];
  warnings: QualityIssue[];
  counts: { recordsRead: number; accepted: number; rejected: number; excluded: number };
}

export interface ReportVersion {
  id: string;
  type: "incomeStatement" | "financialPosition";
  entityId: string;
  periodId: string;
  version: number;
  status: WorkflowStatus;
  submittedAt?: string;
  contentFingerprint: string;
  submittedBy: PersonaId;
  approver: PersonaId | null;
}

export interface ReviewState {
  reviewedVersionFingerprint: string;
  currentVersionFingerprint: string;
  reviewedVersion: number;
  currentVersion: number;
  reviewer: PersonaId;
  submittedBy: PersonaId;
  submittedAt?: string;
  comment: LocalizedText;
}

export interface SubscriptionState {
  plan: LocalizedText;
  billingStatus: LocalizedText;
  quota: { unit: LocalizedText; limit: string; used: string };
  nextInvoice: LocalizedText;
}

export interface AuditEvent {
  id: string;
  time: string;
  actor: PersonaId;
  action: string;
  object: LocalizedText;
  entityId?: string;
}

export interface Notification {
  id: string;
  copyKey: string;
  time: string;
  tone: "success" | "warning" | "info";
}

/** Root shape of fake-data.json (fixtures). */
export interface Fixtures {
  meta: { version: string; note: string };
  tenant: { id: string; name: LocalizedText };
  currencies: Record<CurrencyCode, CurrencyDef>;
  entities: Entity[];
  periods: AccountingPeriod[];
  personas: Persona[];
  notifications: Notification[];
  dashboard: Record<string, Record<string, Omit<DashboardSnapshot, "entityId" | "periodId" | "currency">>>;
  reconciliation: Omit<Reconciliation, "currency"> & { currency: CurrencyCode };
  quality: QualityReport;
  reports: ReportVersion[];
  review: ReviewState;
  subscription: SubscriptionState;
  auditEvents: AuditEvent[];
}

export type CopyTree = typeof copyRaw;
export type DataTree = typeof dataRaw;

export class MockAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MockAccessError";
  }
}

export class MockDataUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MockDataUnavailableError";
  }
}

/** Error thrown by the mock repository for simulated failures. */
export class MockRequestError extends Error {
  constructor(
    public readonly kind: "provider" | "random",
    message: string,
  ) {
    super(message);
    this.name = "MockRequestError";
  }
}
