import { useEffect, useState, type CSSProperties } from "react";
import { useCopy, useFormat } from "@/lib/hooks";
import { useDemo } from "@/state/DemoProvider";
import { usePreferences } from "@/state/PreferencesProvider";
import { fixtures } from "@/data/repository";
import { Field, Select } from "@/components/ui/Field";
import { Callout } from "@/components/ui/Callout";
import type { AccountingPeriod, Entity } from "@/data/types";

/**
 * Entity / period context. Shown on every financial screen (SRS 13.2).
 * Changing the entity clears the period selection — the DemoProvider guarantees
 * a period from the previous entity is never kept (see selectEntity).
 */
export function ContextBar({ stacked = false }: { stacked?: boolean }) {
  const t = useCopy();
  const f = useFormat();
  const { locale } = usePreferences();
  const { currentPersona, repo, selectedEntityId, selectedPeriodId, selectEntity, selectPeriod, repoGeneration } = useDemo();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const canSelectFinancialContext =
    currentPersona !== null &&
    currentPersona.scopedEntityIds.length > 0 &&
    (currentPersona.permissions.includes("dashboard.view") || currentPersona.permissions.includes("entities.view"));

  useEffect(() => {
    let current = true;
    if (!canSelectFinancialContext) {
      setEntities([]);
      setPeriods([]);
      setLoadError(null);
      return () => {
        current = false;
      };
    }
    repo.getEntities().then((list) => {
      if (!current) return;
      setEntities(list);
      setLoadError(null);
    }).catch((error: unknown) => {
      if (current) setLoadError(error instanceof Error ? error : new Error(String(error)));
    });
    return () => {
      current = false;
    };
  }, [repo, repoGeneration, canSelectFinancialContext]);

  // Ensure a valid default selection exists for the persona's first entity.
  useEffect(() => {
    if (entities.length === 0) return;
    if (!selectedEntityId || !entities.some((e) => e.id === selectedEntityId)) {
      selectEntity(entities[0].id);
    }
  }, [entities, selectedEntityId, selectEntity]);

  useEffect(() => {
    let current = true;
    if (!canSelectFinancialContext || !selectedEntityId) {
      setPeriods([]);
      setLoadError(null);
      return;
    }
    repo.getPeriods(selectedEntityId).then((list) => {
      if (!current) return;
      setPeriods(list);
      setLoadError(null);
      // Clear an incompatible period; default to the latest period otherwise.
      if (!list.some((p) => p.id === selectedPeriodId)) {
        const latest = list[list.length - 1];
        if (latest) selectPeriod(latest.id);
      }
    }).catch((error: unknown) => {
      if (current) setLoadError(error instanceof Error ? error : new Error(String(error)));
    });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, repoGeneration, selectedEntityId, canSelectFinancialContext]);

  const entity = entities.find((e) => e.id === selectedEntityId) ?? null;
  const period = periods.find((p) => p.id === selectedPeriodId) ?? null;

  const containerStyle: CSSProperties = stacked
    ? { display: "flex", flexDirection: "column", gap: "var(--space-3)" }
    : { display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" };

  return (
    <div style={containerStyle} aria-label={t("shell.entityContext")}>
      {loadError && canSelectFinancialContext && (
        <Callout tone="danger" title={t("common.errorTitle")}>
          <p>{loadError.message}</p>
        </Callout>
      )}
      {!canSelectFinancialContext ? (
        currentPersona?.role === "subscriptionOwner" && (
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{t("guard.ownerNote")}</div>
        )
      ) : (
        <>
      <div style={{ minWidth: stacked ? undefined : 180 }}>
        <Field id={`ctx-entity-${stacked ? "m" : "d"}`} label={t("shell.entityContext")}>
          {({ inputId }) => (
            <Select
              id={inputId}
              value={selectedEntityId ?? ""}
              onChange={(e) => selectEntity(e.target.value)}
              options={entities.map((e) => ({ value: e.id, label: e.legalName[locale] }))}
            />
          )}
        </Field>
      </div>
      <div style={{ minWidth: stacked ? undefined : 150 }}>
        <Field id={`ctx-period-${stacked ? "m" : "d"}`} label={t("shell.periodContext")}>
          {({ inputId }) => (
            <Select
              id={inputId}
              value={selectedPeriodId ?? ""}
              onChange={(e) => selectPeriod(e.target.value)}
              options={periods.map((p) => ({ value: p.id, label: p.label[locale] }))}
            />
          )}
        </Field>
      </div>
      {entity && (
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
          <div>{t("shell.currencyContext")}: <span className="num-ltr">{entity.functionalCurrency}</span></div>
          {period && (
            <div className="num-ltr">
              {f.date(period.startDate)} — {f.date(period.endDate)}
            </div>
          )}
        </div>
      )}
        </>
      )}
      <span className="visually-hidden">{fixtures.tenant.name[locale]}</span>
    </div>
  );
}
