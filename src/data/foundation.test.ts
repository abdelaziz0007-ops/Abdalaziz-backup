import { describe, expect, it } from "vitest";
import routeManifest from "../../ROUTES.json";
import { addAllocation, availableAmount, validateAllocations } from "@/data/allocations";
import { canonicalQualityScenario, canonicalSource, fixtures } from "@/data/schemaAdapter";
import { createRepository } from "@/data/repository";
import { evaluateApprovalPredicates, unexplainedDifference } from "@/data/reconciliation";
import { selectAccessibleEntities, selectAdjustedBankBalance, selectAdjustedBookBalance, selectBankRollForwardValid } from "@/data/selectors";
import { addStr, sumStr } from "@/lib/decimal";
import { findRouteByPath, ROUTES } from "@/routes/registry";
import type { Allocation } from "@/data/types";

const noLatency = { latency: "none" as const, errorMode: "none" as const };

describe("canonical Atlas/Cedar fixtures", () => {
  it("preserves the trial-balance and report totals without a balancing plug", () => {
    expect(sumStr(canonicalSource.trialBalance.map((row) => row.signedDebitBalance), "USD")).toBe("0.00");

    const report = canonicalSource.financialReports;
    expect(report.current.netRevenue).toBe("128000.00");
    expect(report.current.netProfit).toBe("21500.00");
    expect(report.position.totalAssets).toBe("332200.00");
    expect(addStr(report.position.totalLiabilities, report.position.totalEquity, "USD")).toBe("332200.00");
    expect(report.position.totalLiabilities).toBe("143000.00");
    expect(report.position.totalEquity).toBe("189200.00");
    expect(canonicalSource.trialBalance.some((row) => row.accountCode === "9999")).toBe(false);
  });

  it("preserves six bank and eight book movements and their closing balances", () => {
    const reconciliation = canonicalSource.reconciliation;
    expect(reconciliation.bankTransactions).toHaveLength(6);
    expect(reconciliation.bookTransactions).toHaveLength(8);
    expect(
      addStr(reconciliation.bankOpeningBalance, sumStr(reconciliation.bankTransactions.map((row) => row.amount), "USD"), "USD"),
    ).toBe("100000.00");
    expect(reconciliation.bankClosingBalance).toBe("100000.00");
    expect(
      addStr(reconciliation.bookOpeningBalance, sumStr(reconciliation.bookTransactions.map((row) => row.amount), "USD"), "USD"),
    ).toBe("102200.00");
    expect(reconciliation.bookClosingBalance).toBe("102200.00");
  });

  it("derives both adjusted balances and zero residual while leaving the fee unposted", () => {
    const reconciliation = fixtures.reconciliation;
    expect(selectAdjustedBankBalance(reconciliation)).toBe("102000.00");
    expect(selectAdjustedBookBalance(reconciliation)).toBe("102000.00");
    expect(unexplainedDifference(reconciliation)).toBe("0.00");
    expect(selectBankRollForwardValid(reconciliation)).toBe(true);
    expect(canonicalSource.proposedJournal.status).toBe("notPosted");
    expect(reconciliation.proposedAdjustments[0]?.amount).toBe("-200.00");
    expect(reconciliation.proposedAdjustments[0]?.status).toBe("proposed");
    expect(fixtures.reports.find((report) => report.type === "incomeStatement")?.contentFingerprint).toContain("128000.00");
    expect(canonicalSource.financialReports.current.netProfit).toBe("21500.00");
  });

  it("retains canonical identities and returns no entities for an empty scope", () => {
    expect(fixtures.entities.map((entity) => entity.id)).toEqual(["ENT-ATLAS", "ENT-CEDAR"]);
    expect(fixtures.personas.find((persona) => persona.id === "maya")?.scopedEntityIds).toEqual(["ENT-ATLAS"]);
    expect(fixtures.personas.find((persona) => persona.id === "lina")?.scopedEntityIds).toEqual([]);
    expect(selectAccessibleEntities(fixtures.entities, [])).toEqual([]);
  });
});

describe("mock access boundaries", () => {
  it("does not treat identity or billing access as permission to read financial data", async () => {
    const lina = createRepository({ ...noLatency, scenario: "baseline", personaId: "lina" });
    expect((await lina.getCurrentPersona()).id).toBe("lina");
    await expect(lina.getEntities()).rejects.toThrow("Permission denied");
    await expect(lina.getPeriods("ENT-ATLAS")).rejects.toThrow("Permission denied");
    await expect(lina.getDashboard("ENT-ATLAS", "PER-ENT-ATLAS-2026-10")).rejects.toThrow("Permission denied");
    await expect(lina.getQualityReport("ENT-ATLAS")).rejects.toThrow("Permission denied");
    await expect(lina.getReconciliation("ENT-ATLAS")).rejects.toThrow("Permission denied");
    await expect(lina.getReports("ENT-ATLAS")).rejects.toThrow("Permission denied");
    await expect(lina.getReviewState("ENT-ATLAS")).rejects.toThrow("Permission denied");
    await expect(lina.getAuditEvents("ENT-ATLAS")).rejects.toThrow("Permission denied");
    expect(await lina.getSubscription()).toEqual(fixtures.subscription);
    expect(await lina.getNotifications()).toEqual([]);
    expect(await lina.evaluateApprovalGate("lina", "ENT-ATLAS", "BANK-4821")).toEqual({
      allowed: false,
      reasonKey: "gate.permission",
    });
  });

  it("checks entity and bank-account scope rather than falling back to Atlas", async () => {
    const maya = createRepository({ ...noLatency, scenario: "baseline", personaId: "maya" });
    await expect(maya.getDashboard("ENT-CEDAR", "PER-ENT-CEDAR-2026-10")).rejects.toThrow("Entity scope denied");
    await expect(maya.getReconciliation("ENT-CEDAR")).rejects.toThrow("Entity scope denied");

    const noor = createRepository({ ...noLatency, scenario: "baseline", personaId: "noor" });
    expect((await noor.getEntities()).map((entity) => entity.id)).toContain("ENT-CEDAR");
    await expect(noor.getDashboard("ENT-CEDAR", "PER-ENT-CEDAR-2026-10")).rejects.toThrow("No financial dataset");
  });
});

describe("approval readiness", () => {
  const omar = fixtures.personas.find((persona) => persona.id === "omar");
  if (!omar) throw new Error("Canonical approver fixture is missing");

  it("allows only a current, complete, independent, in-scope review with zero derived residual and no lock", () => {
    const reconciliation = structuredClone(fixtures.reconciliation);
    reconciliation.status = "underReview";
    const review = structuredClone(fixtures.review);
    const quality = structuredClone(fixtures.quality);
    const blockingQuality = {
      ...canonicalQualityScenario,
      counts: { recordsRead: 1, accepted: 0, rejected: 1, excluded: 0 },
    };

    expect(evaluateApprovalPredicates(omar, reconciliation, quality, review)).toEqual({ allowed: true, reasonKey: null });
    expect(evaluateApprovalPredicates({ ...omar, scopedAccountIds: [] }, reconciliation, quality, review).reasonKey).toBe("gate.scope");
    expect(evaluateApprovalPredicates(omar, { ...reconciliation, completeBookDataset: false }, quality, review).reasonKey).toBe("gate.incompleteDataset");
    expect(evaluateApprovalPredicates(omar, reconciliation, blockingQuality, review).reasonKey).toBe("gate.blockingQuality");
    expect(evaluateApprovalPredicates(omar, reconciliation, quality, { ...review, reviewedVersion: 2 }).reasonKey).toBe("gate.staleVersion");
    expect(evaluateApprovalPredicates(omar, reconciliation, quality, { ...review, submittedBy: "omar" }).reasonKey).toBe("gate.selfApproval");
    expect(evaluateApprovalPredicates(omar, { ...reconciliation, status: "approvedLocked" }, quality, review).reasonKey).toBe("gate.locked");
    expect(evaluateApprovalPredicates(omar, { ...reconciliation, status: "draft" }, quality, review).reasonKey).toBe("gate.notReady");
  });

  it("uses changed source inputs for the nonzero-difference scenario", async () => {
    const repo = createRepository({ ...noLatency, scenario: "unexplainedDifference250", personaId: "omar" });
    const reconciliation = await repo.getReconciliation("ENT-ATLAS");
    expect(reconciliation.closingBalance).toBe("99750.00");
    expect(reconciliation.transactions.find((transaction) => transaction.id === "BNK-006")?.amount).toBe("-450.00");
    expect(unexplainedDifference(reconciliation)).toBe("-250.00");
    expect((await repo.evaluateApprovalGate("omar", "ENT-ATLAS", "BANK-4821")).reasonKey).toBe("gate.unexplainedDifference");
  });

  it("enforces quality, version, and lock predicates regardless of scenario labels", async () => {
    const blocked = createRepository({ ...noLatency, scenario: "blockedQuality", personaId: "omar" });
    expect((await blocked.evaluateApprovalGate("omar", "ENT-ATLAS", "BANK-4821")).reasonKey).toBe("gate.blockingQuality");

    const stale = createRepository({ ...noLatency, scenario: "staleReviewVersion", personaId: "omar" });
    expect((await stale.evaluateApprovalGate("omar", "ENT-ATLAS", "BANK-4821")).reasonKey).toBe("gate.staleVersion");

    const locked = createRepository({ ...noLatency, scenario: "lockedReconciliation", personaId: "omar" });
    expect((await locked.evaluateApprovalGate("omar", "ENT-ATLAS", "BANK-4821")).reasonKey).toBe("gate.locked");

    const baseline = createRepository({ ...noLatency, scenario: "baseline", personaId: "omar" });
    expect((await baseline.evaluateApprovalGate("omar", "ENT-ATLAS", "BANK-4821")).reasonKey).toBe("gate.notReady");
  });
});

describe("allocation safety", () => {
  const transactions = fixtures.reconciliation.transactions;
  const usd = fixtures.reconciliation.currency;

  function allocation(
    id: string,
    transactionId: string,
    against: string,
    amount: string,
    kind: Allocation["kind"],
  ): Allocation {
    return { id, transactionId, against, allocatedAmount: amount, kind, note: { en: "", ar: "" } };
  }

  it("supports positive receipt allocations and leaves each side's residual visible", () => {
    const next = addAllocation(
      transactions,
      [],
      allocation("ALLOC-POS", "BNK-001", "LED-001", "1500.00", "partial"),
      usd,
    );
    expect(availableAmount(transactions[0]!, transactions, next, usd)).toBe("3300.00");
    expect(availableAmount(transactions[6]!, transactions, next, usd)).toBe("1500.00");
  });

  it("allocates negative outgoing payments by positive magnitude and preserves their sign", () => {
    const next = addAllocation(
      transactions,
      [],
      allocation("ALLOC-NEG", "BNK-002", "LED-003", "1000.00", "partial"),
      usd,
    );
    const bank = transactions.find((transaction) => transaction.id === "BNK-002")!;
    const book = transactions.find((transaction) => transaction.id === "LED-003")!;
    expect(availableAmount(bank, transactions, next, usd)).toBe("-1100.00");
    expect(availableAmount(book, transactions, next, usd)).toBe("-1100.00");
  });

  it("rejects invalid, mismatched, excessive, and double-consumed decisions explicitly", () => {
    const positive = transactions.find((transaction) => transaction.id === "BNK-001")!;
    const bookReceipt = transactions.find((transaction) => transaction.id === "LED-001")!;
    expect(() => addAllocation(
      transactions,
      [],
      allocation("BAD-SIGN", positive.id, bookReceipt.id, "-1.00", "partial"),
      usd,
    )).toThrow("positive magnitude");
    expect(() => addAllocation(
      transactions,
      [],
      allocation("BAD-SIDE", positive.id, "BNK-002", "100.00", "partial"),
      usd,
    )).toThrow("opposite transaction sides");
    expect(() => addAllocation(
      transactions,
      [],
      allocation("TOO-MUCH", positive.id, bookReceipt.id, "3000.01", "full"),
      usd,
    )).toThrow("exceeds available amount");

    const first = allocation("FIRST", positive.id, bookReceipt.id, "2000.00", "partial");
    const next = addAllocation(transactions, [], first, usd);
    expect(() => addAllocation(
      transactions,
      next,
      allocation("SECOND", positive.id, bookReceipt.id, "1000.01", "partial"),
      usd,
    )).toThrow("exceeds available amount");
    expect(() => validateAllocations(transactions, [first, first], usd)).toThrow("Duplicate allocation ID");
  });
});

describe("route manifest parity", () => {
  it("registers every logical path and keeps public/error routes outside the protected shell", () => {
    const expected = routeManifest.entries.flatMap((entry) => entry.routes).sort();
    const actual = ROUTES.map((route) => route.path).sort();
    expect(actual).toEqual(expected);
    expect(new Set(ROUTES.map((route) => route.id)).size).toBe(ROUTES.length);

    for (const path of ["/", "/auth/sign-in", "/403", "/404", "/session-expired"]) {
      expect(findRouteByPath(path)?.access).toBe("public");
      expect(path.startsWith("/app/")).toBe(false);
    }
    expect(findRouteByPath("/app/reports/REP-1/income-statement")?.pageSlug).toBe("income-statement");
  });
});
