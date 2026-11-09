/**
 * Typed in-memory repository for the prototype. It performs no network, upload,
 * payment, journal posting, or email operation. These checks are demonstrations,
 * not production authorization.
 */
import { addAllocation, validateAllocations } from "@/data/allocations";
import { canonicalQualityScenario, canonicalSource, fixtures } from "@/data/schemaAdapter";
import { evaluateApprovalPredicates, reconciliationFingerprint } from "@/data/reconciliation";
import { CURRENCY_PRECISION, dec, formatDec, subStr } from "@/lib/decimal";
import type {
  AccountingPeriod,
  Allocation,
  AuditEvent,
  DashboardSnapshot,
  Entity,
  ErrorMode,
  LatencyPreset,
  LocalizedText,
  Notification,
  Persona,
  PersonaId,
  Permission,
  QualityReport,
  Reconciliation,
  ReportVersion,
  ReviewState,
  ScenarioId,
  SubscriptionState,
} from "@/data/types";
import { MockAccessError, MockDataUnavailableError, MockRequestError } from "@/data/types";
import { makePeriod, type LocalDatasets } from './analytics';
import { calculateFinance } from './finance';

export { fixtures };

export interface RepoConfig {
  localDatasets?: LocalDatasets;
  activePeriodId?: string | null;
  scenario: ScenarioId;
  latency: LatencyPreset;
  errorMode: ErrorMode;
  personaId: PersonaId;
}

const LATENCY_MS: Record<LatencyPreset, number> = { none: 0, fast: 200, slow: 1200 };
let callCounter = 0;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function hasOnePermission(persona: Persona, permissions: Permission[]): boolean {
  return permissions.some((permission) => persona.permissions.includes(permission));
}

export class MockRepository {
  constructor(private readonly config: RepoConfig) {}

  private persona(): Persona {
    const persona = fixtures.personas.find((candidate) => candidate.id === this.config.personaId);
    if (!persona) throw new MockAccessError(`Unknown mock identity: ${this.config.personaId}`);
    return persona;
  }

  private requirePermission(permission: Permission): Persona {
    const persona = this.persona();
    if (!persona.permissions.includes(permission)) {
      throw new MockAccessError(`Permission denied: ${permission}`);
    }
    return persona;
  }

  private requireOnePermission(permissions: Permission[]): Persona {
    const persona = this.persona();
    if (!hasOnePermission(persona, permissions)) {
      throw new MockAccessError(`Permission denied: ${permissions.join(" or ")}`);
    }
    return persona;
  }

  private requireEntityScope(persona: Persona, entityId: string): Entity {
    if (!persona.scopedEntityIds.includes(entityId)) {
      throw new MockAccessError(`Entity scope denied: ${entityId}`);
    }
    const entity = fixtures.entities.find((candidate) => candidate.id === entityId);
    if (!entity) throw new MockDataUnavailableError(`Unknown entity: ${entityId}`);
    return entity;
  }

  private requireAccountScope(persona: Persona, entityId: string, accountId: string): void {
    this.requireEntityScope(persona, entityId);
    if (!persona.scopedAccountIds.includes(accountId)) {
      throw new MockAccessError(`Account scope denied: ${accountId}`);
    }
  }

  private requireAvailableDataset(entityId: string): void {
    if (!Object.prototype.hasOwnProperty.call(fixtures.dashboard, entityId) && !Object.values(this.config.localDatasets??{}).some(d=>d.entityId===entityId)) {
      throw new MockDataUnavailableError(`No financial dataset is available for entity ${entityId}`);
    }
  }

  private async request<T>(key: string, value: () => T): Promise<T> {
    const { latency, errorMode, scenario } = this.config;
    const delay = LATENCY_MS[latency];
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

    const call = callCounter++;
    const random = mulberry32(hashString(`${scenario}:${key}:${call % 3}`));
    if (errorMode === "provider") {
      throw new MockRequestError("provider", `Simulated provider outage for ${key}`);
    }
    if (errorMode === "random" && random() < 0.34) {
      throw new MockRequestError("random", `Simulated random failure for ${key}`);
    }
    return value();
  }

  async getCurrentPersona(): Promise<Persona> {
    return this.request("persona", () => structuredClone(this.persona()));
  }

  async getEntities(): Promise<Entity[]> {
    const persona = this.requireOnePermission(["entities.view", "dashboard.view"]);
    return this.request("entities", () =>
      structuredClone(fixtures.entities.filter((entity) => persona.scopedEntityIds.includes(entity.id))),
    );
  }

  async getPeriods(entityId: string): Promise<AccountingPeriod[]> {
    const persona = this.requirePermission("dashboard.view");
    this.requireEntityScope(persona, entityId);
    return this.request("periods", () =>
      structuredClone([...fixtures.periods.filter(period=>period.entityId===entityId&&!this.config.localDatasets?.[period.id]),...Object.values(this.config.localDatasets??{}).filter(d=>d.entityId===entityId).map(makePeriod)].sort((a,b)=>a.startDate.localeCompare(b.startDate))),
    );
  }

  async getDashboard(entityId: string, periodId: string): Promise<DashboardSnapshot> {
    const persona = this.requirePermission("dashboard.view");
    this.requireEntityScope(persona, entityId);
    this.requireAvailableDataset(entityId);
    const local=this.config.localDatasets?.[periodId];
    const period = local?.entityId===entityId ? makePeriod(local) : fixtures.periods.find((candidate) => candidate.id === periodId && candidate.entityId === entityId);
    if (!period) throw new MockAccessError(`Period is outside entity scope: ${periodId}`);

    return this.request("dashboard", () => {
      if(local?.entityId===entityId){const v=calculateFinance(local.rows);return {entityId,periodId,currency:'USD',netRevenue:v.netRevenue,netProfit:v.netProfit,netProfitMarginPct:v.netMargin,currentAssets:v.currentAssets,currentLiabilities:v.currentLiabilities,currentRatio:v.currentRatio,unmappedAccountsCount:0,openItemsCount:0,openItemsValue:'0.00',pendingReviewsCount:2,jobs:[]} as DashboardSnapshot;}
      const entity = fixtures.entities.find((candidate) => candidate.id === entityId);
      if (!entity) throw new MockDataUnavailableError(`Unknown entity: ${entityId}`);
      const base = fixtures.dashboard[entityId]?.[periodId];
      if (!base) throw new MockDataUnavailableError(`No dashboard source values for period ${periodId}`);

      const snapshot: DashboardSnapshot = {
        ...structuredClone(base),
        entityId,
        periodId,
        currency: entity.functionalCurrency,
      };
      if (this.config.scenario === "emptyEntity") {
        return {
          ...snapshot,
          netRevenue: null,
          netProfit: null,
          netProfitMarginPct: null,
          currentAssets: null,
          currentLiabilities: null,
          currentRatio: null,
          unmappedAccountsCount: 0,
          openItemsCount: 0,
          openItemsValue: formatDec(dec("0", entity.functionalCurrency), CURRENCY_PRECISION[entity.functionalCurrency]),
          pendingReviewsCount: 0,
          jobs: [],
        };
      }
      if (this.config.scenario === "quotaReached") {
        snapshot.jobs = [
          ...snapshot.jobs,
          {
            id: "job_quota_rejected",
            type: { ar: "استيراد كشف بنكي جديد", en: "New bank statement import" },
            status: "failed",
            progressPct: 0,
            finishedAt: "2026-10-29T14:05:00Z",
          },
        ];
      }
      return snapshot;
    });
  }

  async getQualityReport(entityId: string): Promise<QualityReport> {
    const persona = this.requirePermission("quality.view");
    this.requireEntityScope(persona, entityId);
    this.requireAvailableDataset(entityId);
    return this.request("quality", () => {
      if (this.config.scenario === "blockedQuality") {
        return {
          blocking: structuredClone(canonicalQualityScenario.blocking),
          warnings: structuredClone(canonicalQualityScenario.warnings),
          counts: { recordsRead: 1, accepted: 0, rejected: 1, excluded: 0 },
        };
      }
      const local=this.config.localDatasets?.[this.config.activePeriodId??''];
      return local?.entityId===entityId?{blocking:[],warnings:[],counts:{recordsRead:local.rows.length,accepted:local.rows.length,rejected:0,excluded:0}}:structuredClone(fixtures.quality);
    });
  }

  private scenarioReconciliation(): Reconciliation {
    const reconciliation = structuredClone(fixtures.reconciliation);
    if (this.config.scenario === "partialAllocation") {
      const scenario = canonicalSource.reconciliation.partialAllocationScenario;
      const bank = reconciliation.transactions.find((transaction) => transaction.id === scenario.bankId);
      const book = reconciliation.transactions.find((transaction) => transaction.id === scenario.bookId);
      if (!bank || !book) throw new MockDataUnavailableError("Canonical partial-allocation records are missing");
      const allocation: Allocation = {
        id: "ALLOC-PARTIAL-SCENARIO",
        transactionId: bank.id,
        against: book.id,
        allocatedAmount: scenario.allocated,
        kind: "partial",
        note: { ar: scenario.note, en: scenario.note },
      };
      reconciliation.allocations = addAllocation(
        reconciliation.transactions,
        reconciliation.allocations,
        allocation,
        reconciliation.currency,
      );
    }

    if (this.config.scenario === "unexplainedDifference250") {
      const fee = reconciliation.transactions.find((transaction) => transaction.id === "BNK-006");
      if (!fee) throw new MockDataUnavailableError("Canonical bank-fee transaction is missing");
      fee.amount = subStr(fee.amount, "250.00", reconciliation.currency);
      reconciliation.closingBalance = subStr(reconciliation.closingBalance, "250.00", reconciliation.currency);
      reconciliation.version += 1;
    }

    if (this.config.scenario === "lockedReconciliation") {
      reconciliation.status = "approvedLocked";
      reconciliation.version += 1;
    }

    validateAllocations(reconciliation.transactions, reconciliation.allocations, reconciliation.currency);
    return reconciliation;
  }

  async getReconciliation(entityId: string): Promise<Reconciliation> {
    const persona = this.requirePermission("reconciliations.view");
    this.requireAccountScope(persona, entityId, fixtures.reconciliation.bankAccountId);
    if (fixtures.reconciliation.entityId !== entityId) {
      throw new MockDataUnavailableError(`No reconciliation is available for entity ${entityId}`);
    }
    const reconciliation = this.scenarioReconciliation();
    return this.request("reconciliation", () => structuredClone(reconciliation));
  }

  async getReports(entityId: string): Promise<ReportVersion[]> {
    const persona = this.requirePermission("reports.view");
    this.requireEntityScope(persona, entityId);
    this.requireAvailableDataset(entityId);
    return this.request("reports", () =>
      structuredClone([...fixtures.reports.filter(report=>report.entityId===entityId&&!this.config.localDatasets?.[report.periodId]),...Object.entries(this.config.localDatasets??{}).filter(([,d])=>d.entityId===entityId).flatMap(([periodId,d])=>(['incomeStatement','financialPosition'] as const).map(type=>({id:`LOCAL-${type}-${periodId}`,type,entityId,periodId,version:d.revision,status:'draft' as const,contentFingerprint:`${periodId}:${d.revision}:${type}`,submittedBy:persona.id,approver:null})))]),
    );
  }

  private scenarioReview(reconciliation: Reconciliation): ReviewState {
    const review = structuredClone(fixtures.review);
    const currentFingerprint = reconciliationFingerprint(reconciliation);
    review.currentVersionFingerprint = currentFingerprint;
    review.currentVersion = reconciliation.version;
    if (this.config.scenario === "staleReviewVersion") {
      review.reviewedVersionFingerprint = `${currentFingerprint}:previous`;
      review.reviewedVersion = reconciliation.version - 1;
    } else {
      review.reviewedVersionFingerprint = currentFingerprint;
      review.reviewedVersion = reconciliation.version;
    }
    return review;
  }

  async getReviewState(entityId: string): Promise<ReviewState> {
    const persona = this.requireOnePermission(["reviews.approve", "reviews.submit"]);
    this.requireEntityScope(persona, entityId);
    if (fixtures.reconciliation.entityId !== entityId) {
      throw new MockDataUnavailableError(`No review is available for entity ${entityId}`);
    }
    const reconciliation = this.scenarioReconciliation();
    return this.request("review", () => this.scenarioReview(reconciliation));
  }

  async evaluateApprovalGate(
    personaId: PersonaId,
    entityId: string,
    accountId: string,
  ): Promise<ApprovalGateResult> {
    const persona = fixtures.personas.find((candidate) => candidate.id === personaId);
    if (!persona || personaId !== this.config.personaId) {
      return { allowed: false, reasonKey: "gate.permission" };
    }
    if (!persona.permissions.includes("reviews.approve")) {
      return { allowed: false, reasonKey: "gate.permission" };
    }
    if (!persona.scopedEntityIds.includes(entityId) || !persona.scopedAccountIds.includes(accountId)) {
      return { allowed: false, reasonKey: "gate.scope" };
    }

    return this.request("approvalGate", () => {
      const reconciliation = this.scenarioReconciliation();
      if (reconciliation.entityId !== entityId || reconciliation.bankAccountId !== accountId) {
        return { allowed: false, reasonKey: "gate.scope" };
      }
      const quality = this.config.scenario === "blockedQuality"
        ? {
            blocking: canonicalQualityScenario.blocking,
            warnings: canonicalQualityScenario.warnings,
            counts: { recordsRead: 1, accepted: 0, rejected: 1, excluded: 0 },
          }
        : fixtures.quality;
      return evaluateApprovalPredicates(
        persona,
        reconciliation,
        quality,
        this.scenarioReview(reconciliation),
      );
    });
  }

  async getSubscription(): Promise<SubscriptionState> {
    this.requireOnePermission(["subscription.view", "subscription.manage"]);
    return this.request("subscription", () => {
      const subscription = structuredClone(fixtures.subscription);
      if (this.config.scenario === "quotaReached") {
        subscription.quota.used = subscription.quota.limit;
      }
      if (this.config.scenario === "providerUnavailable") {
        subscription.billingStatus = {
          ar: "تعذر الوصول إلى مزود الدفع — لا توجد معاملة فعلية",
          en: "Payment provider unavailable — no transaction was made",
        };
      }
      return subscription;
    });
  }

  async getAuditEvents(entityId: string): Promise<AuditEvent[]> {
    const persona = this.requirePermission("audit.view");
    this.requireEntityScope(persona, entityId);
    return this.request("audit", () =>
      structuredClone(fixtures.auditEvents.filter((event) => event.entityId === entityId)),
    );
  }

  async getNotifications(): Promise<Notification[]> {
    const persona = this.persona();
    return this.request("notifications", () => {
      if (persona.scopedEntityIds.length === 0) return [];
      return structuredClone(fixtures.notifications);
    });
  }
}

export type ReconciliationLike = Reconciliation;

export interface ApprovalGateResult {
  allowed: boolean;
  reasonKey: string | null;
}

export function createRepository(config: RepoConfig): MockRepository {
  return new MockRepository(config);
}

export function localize(text: LocalizedText, locale: "ar" | "en"): string {
  return text[locale];
}
