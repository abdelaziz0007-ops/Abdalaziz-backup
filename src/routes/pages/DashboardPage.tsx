import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCopy, useFormat } from "@/lib/hooks";
import { useDemo } from "@/state/DemoProvider";
import { usePreferences } from "@/state/PreferencesProvider";
import { useAsync } from "@/lib/useAsync";
import { Card } from "@/components/ui/Card";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { EmptyState } from "@/components/ui/EmptyState";
import { DataTable } from "@/components/ui/DataTable";
import {
  selectAbsoluteVariance,
  selectNetProfitMargin,
  selectPercentageVariance,
  selectQuotaUsagePct,
} from "@/data/selectors";
import type { DashboardSnapshot, ImportJob } from "@/data/types";

const jobTone: Record<string, Tone> = {
  completed: "success",
  running: "info",
  queued: "neutral",
  failed: "danger",
  needsReview: "warning",
};

const jobLabelKey: Record<string, string> = {
  completed: "status.confirmedMatch",
  running: "status.underReview",
  queued: "status.draft",
  failed: "status.blocking",
  needsReview: "status.warning",
};

/**
 * Entity & period dashboard (SRS 13.1, screen 1). Built on the mock repository
 * and centralized selectors — no hard-coded totals in this component.
 */
export function DashboardPage() {
  const t = useCopy();
  const f = useFormat();
  const { locale } = usePreferences();
  const { repo, selectedEntityId, selectedPeriodId, repoGeneration, scenario } = useDemo();

  const snapshot = useAsync<DashboardSnapshot | null>(async () => {
    if (!selectedEntityId || !selectedPeriodId) return null;
    return repo.getDashboard(selectedEntityId, selectedPeriodId);
  }, [repo, selectedEntityId, selectedPeriodId, repoGeneration]);

  const quality = useAsync(
    () => selectedEntityId ? repo.getQualityReport(selectedEntityId) : Promise.resolve(null),
    [repo, selectedEntityId, repoGeneration],
  );
  const subscription = useAsync(() => repo.getSubscription(), [repo, repoGeneration]);
  const entities = useAsync(() => repo.getEntities(), [repo, repoGeneration]);
  const periods = useAsync(
    () => selectedEntityId ? repo.getPeriods(selectedEntityId) : Promise.resolve([]),
    [repo, selectedEntityId, repoGeneration],
  );
  const comparative = useAsync<DashboardSnapshot | null>(async () => {
    if (!selectedEntityId || periods.status !== "success" || !periods.data) return null;
    const idx = periods.data.findIndex((p) => p.id === selectedPeriodId);
    const prev = idx > 0 ? periods.data[idx - 1] : null;
    if (!prev) return null;
    return repo.getDashboard(selectedEntityId, prev.id);
  }, [repo, selectedEntityId, selectedPeriodId, repoGeneration, periods.status, periods.data]);

  const entity = entities.data?.find((candidate) => candidate.id === selectedEntityId) ?? null;
  const period = periods.data?.find((candidate) => candidate.id === selectedPeriodId) ?? null;

  const previousPeriod = useMemo(() => {
    if (!periods.data || !selectedEntityId) return null;
    const idx = periods.data.findIndex((candidate) => candidate.id === selectedPeriodId);
    return idx > 0 ? periods.data[idx - 1] : null;
  }, [periods.data, selectedEntityId, selectedPeriodId]);

  if (!selectedEntityId || !selectedPeriodId) {
    return <EmptyState title={t("common.emptyTitle")} description={t("shell.entityContext")} />;
  }

  if (snapshot.status === "loading") {
    return <p style={{ color: "var(--color-text-muted)" }}>{t("common.loading")}</p>;
  }

  if (snapshot.status === "error" || !snapshot.data) {
    return (
      <Callout tone="danger" title={t("common.errorTitle")}>
        <p>{t("common.errorBody")}</p>
        <button
          type="button"
          onClick={snapshot.reload}
          style={{
            minHeight: "var(--size-control-height)",
            paddingInline: "var(--space-4)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border-default)",
            background: "var(--color-surface-raised)",
            cursor: "pointer",
          }}
        >
          {t("common.retry")}
        </button>
      </Callout>
    );
  }

  const snap = snapshot.data;
  const currency = snap.currency;
  const margin = selectNetProfitMargin(snap);
  const quotaPct = subscription.data ? selectQuotaUsagePct(subscription.data) : null;
  const blockingCount = quality.data?.blocking.length ?? 0;

  const revenueVarianceAbs =
    comparative.data && snap.netRevenue && comparative.data.netRevenue
      ? selectAbsoluteVariance(snap.netRevenue, comparative.data.netRevenue, currency)
      : null;
  const revenueVariancePct =
    comparative.data && snap.netRevenue && comparative.data.netRevenue
      ? selectPercentageVariance(snap.netRevenue, comparative.data.netRevenue, currency)
      : null;

  const isEmptyScenario = scenario === "emptyEntity" || (!snap.netRevenue && !snap.netProfit);

  return (
    <div className="stack">
      <header className="stack-sm">
        <div className="row-wrap">
          <h1>{t("routes.dashboard.title")}</h1>
          {period && <Badge tone={period.status === "approvedLocked" ? "success" : "info"} label={t(`status.${period.status}`)} />}
        </div>
        {entity && period && (
          <p className="row-wrap" style={{ color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)", margin: 0 }}>
            <span>{entity.legalName[locale]}</span>
            <span aria-hidden="true">·</span>
            <span>{period.label[locale]}</span>
            <span aria-hidden="true">·</span>
            <span className="num-ltr">{entity.functionalCurrency}</span>
            <span aria-hidden="true">·</span>
            {entity.framework && <span style={{ color: "var(--color-text-muted)" }}>{entity.framework[locale]}</span>}
          </p>
        )}
      </header>

      {blockingCount > 0 && (
        <Callout tone="danger" title={`${t("status.blocking")} — ${t("status.warning")}`}>
          <p>{t("common.errorBody")}</p>
          <Link to="/app/imports">{t("routes.imports.title")}</Link>
        </Callout>
      )}

      {isEmptyScenario ? (
        <Card>
          <EmptyState
            title={t("common.emptyTitle")}
            description={t("placeholder.description")}
            actions={<Link to="/app/imports">{t("routes.imports.title")}</Link>}
          />
        </Card>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            gap: "var(--space-4)",
          }}
        >
          <Card title={t("nav.reports")}>
            <dl className="stack-sm" style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <dt style={{ color: "var(--color-text-secondary)" }}>{locale === "ar" ? "صافي الإيرادات" : "Net revenue"}</dt>
                <dd className="num tabular" style={{ margin: 0, fontWeight: "var(--font-weight-medium)" }}>
                  {snap.netRevenue ? f.money(snap.netRevenue, currency) : t("status.unavailable")}
                </dd>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <dt style={{ color: "var(--color-text-secondary)" }}>{locale === "ar" ? "صافي الربح" : "Net profit"}</dt>
                <dd className="num tabular" style={{ margin: 0, fontWeight: "var(--font-weight-medium)" }}>
                  {snap.netProfit ? f.money(snap.netProfit, currency) : t("status.unavailable")}
                </dd>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <dt style={{ color: "var(--color-text-secondary)" }}>{locale === "ar" ? "هامش صافي الربح" : "Net profit margin"}</dt>
                <dd className="num tabular" style={{ margin: 0, fontWeight: "var(--font-weight-medium)" }}>
                  {margin ? f.percent(margin, 2) : t("status.unavailable")}
                </dd>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <dt style={{ color: "var(--color-text-secondary)" }}>{locale === "ar" ? "النسبة الجارية" : "Current ratio"}</dt>
                <dd className="num tabular" style={{ margin: 0, fontWeight: "var(--font-weight-medium)" }}>
                  {Number(snap.currentRatio) > 0 ? snap.currentRatio : t("status.unavailable")}
                </dd>
              </div>
            </dl>
            {revenueVarianceAbs !== null && previousPeriod && (
              <p style={{ marginTop: "var(--space-3)", fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
                {locale === "ar" ? "التغير عن" : "vs"} {previousPeriod.label[locale]}:{" "}
                <span className="num tabular">{f.amount(revenueVarianceAbs, currency)}</span> (
                <span className="num tabular">
                  {revenueVariancePct !== null ? `${revenueVariancePct}%` : t("status.unavailable")}
                </span>
                )
              </p>
            )}
          </Card>

          <Card title={t("common.unmappedAccounts")}>
            <p className="num tabular" style={{ fontSize: "var(--font-size-2xl)", margin: 0, fontWeight: "var(--font-weight-bold)" }}>
              {f.count(snap.unmappedAccountsCount)}
            </p>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
              {snap.unmappedAccountsCount > 0
                ? locale === "ar"
                  ? "تمنع الحسابات غير المُسندة اعتماد التقارير المتأثرة."
                  : "Unmapped accounts block approval of affected reports."
                : locale === "ar"
                  ? "كل الحسابات مُسندة."
                  : "All accounts are mapped."}
            </p>
          </Card>

          <Card title={t("common.openItems")}>
            <p className="num tabular" style={{ fontSize: "var(--font-size-2xl)", margin: 0, fontWeight: "var(--font-weight-bold)" }}>
              {f.count(snap.openItemsCount)}
            </p>
            <p className="num tabular" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", margin: 0 }}>
              {f.money(snap.openItemsValue, currency)}
            </p>
            <Link to="/app/reconciliations" style={{ fontSize: "var(--font-size-xs)" }}>
              {t("routes.reconciliationsList.title")}
            </Link>
          </Card>

          <Card title={t("common.pendingReviews")}>
            <p className="num tabular" style={{ fontSize: "var(--font-size-2xl)", margin: 0, fontWeight: "var(--font-weight-bold)" }}>
              {f.count(snap.pendingReviewsCount)}
            </p>
            <Link to="/app/reviews" style={{ fontSize: "var(--font-size-xs)" }}>
              {t("routes.reviewsInbox.title")}
            </Link>
          </Card>

          <Card title={t("common.quotaUsage")}>
            {subscription.status === "success" && subscription.data && (
              <>
                <p className="num tabular" style={{ fontSize: "var(--font-size-2xl)", margin: 0, fontWeight: "var(--font-weight-bold)" }}>
                  {quotaPct ? `${quotaPct}%` : t("status.unavailable")}
                </p>
                <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", margin: 0 }}>
                  {/* Canonical quota values are ROW COUNTS (see usageUnit), not money.
                      Rendering them as currency implied a monetary amount and a currency
                      that the fixture does not assert for this figure. */}
                  <span className="num tabular">{f.count(Number(subscription.data.quota.used))}</span>
                  {" / "}
                  <span className="num tabular">{f.count(Number(subscription.data.quota.limit))}</span>
                  {" — "}
                  {subscription.data.quota.unit[locale]}
                </p>
              </>
            )}
            <Link to="/app/settings/billing" style={{ fontSize: "var(--font-size-xs)" }}>
              {t("routes.subscription.title")}
            </Link>
          </Card>
        </div>
      )}

      <Card title={t("common.jobsTitle")}>
        {snap.jobs.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>{t("common.emptyTitle")}</p>
        ) : (
          <DataTable<ImportJob>
            label={t("common.jobsTitle")}
            rows={snap.jobs}
            rowKey={(j) => j.id}
            columns={[
              {
                key: "type",
                header: locale === "ar" ? "النوع" : "Type",
                render: (j) => j.type[locale],
              },
              {
                key: "status",
                header: locale === "ar" ? "الحالة" : "Status",
                render: (j) => (
                  <Badge
                    tone={jobTone[j.status] ?? "neutral"}
                    label={t(jobLabelKey[j.status] ?? "status.draft")}
                  />
                ),
              },
              {
                key: "progress",
                header: locale === "ar" ? "التقدم" : "Progress",
                numeric: true,
                render: (j) => `${j.progressPct}%`,
              },
              {
                key: "time",
                header: locale === "ar" ? "الوقت" : "Time",
                render: (j) => (
                  <time className="num-ltr" style={{ fontSize: "var(--font-size-xs)" }}>
                    {j.finishedAt ? f.dateTime(j.finishedAt) : j.startedAt ? f.dateTime(j.startedAt) : "—"}
                  </time>
                ),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
