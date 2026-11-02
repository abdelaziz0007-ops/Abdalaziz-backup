import { useEffect, useRef, useState } from "react";
import { useCopy } from "@/lib/hooks";
import { useDemo, PERSONA_IDS, SCENARIO_IDS } from "@/state/DemoProvider";
import { usePreferences } from "@/state/PreferencesProvider";
import { fixtures } from "@/data/repository";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";
import { Icon } from '@/components/WorkspaceUI';
import type { Density, ErrorMode, LatencyPreset, Locale, Numerals, Theme } from "@/data/types";

/**
 * Demo Controls — prototype chrome, NOT a production admin feature.
 * Persona, scenario, simulated latency/error, and reset live here.
 * Reset restores demo state only; locale/theme/density preferences persist.
 */
export function DemoControls() {
  const t = useCopy();
  const demo = useDemo();
  const prefs = usePreferences();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Toggle: fixed bottom-inline-start so it never collides with content */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="demo-controls-panel"
        className="demo-menu-trigger"
        title={t("demo.title")}
        aria-label={t("demo.title")}

      >
        <Icon name="settings" size={18}/><span className="demo-trigger-label">{t("demo.title")}</span>
      </button>

      {open && (
        <div
          id="demo-controls-panel"
          className="demo-settings-panel"
          role="dialog"
          aria-label={t("demo.title")}
          style={{
            position: "fixed",
            insetBlockStart: "80px",
            insetInlineEnd: 0,
            zIndex: "var(--z-drawer)",
            width: "min(400px, 100vw)",
            maxHeight: "85vh",
            overflowY: "auto",
            background: "var(--color-surface-raised)",
            borderInlineEnd: "1px solid var(--color-border-default)",
            borderBlockStart: "1px solid var(--color-border-default)",
            borderStartStartRadius: "var(--radius-lg)",
            borderStartEndRadius: "var(--radius-lg)",
            borderTop: "4px solid var(--color-accent)",
            boxShadow: "var(--shadow-lg)",
            padding: "var(--space-5)",
          }}
        >
          <div className="row" style={{ marginBlockEnd: "var(--space-2)" }}>
            <h2 style={{ flex: "1 1 auto", fontSize: "var(--font-size-lg)" }}>{t("demo.title")}</h2>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("demo.close")}
              style={{
                minHeight: "44px",
                minWidth: "44px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border-default)",
                background: "var(--color-surface-raised)",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
          <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBlockEnd: "var(--space-4)" }}>
            {t("demo.subtitle")} {t("app.demoNotice")}
          </p>

          <div className="stack">
            <Field id="demo-persona" label={t("demo.persona")}>
              {({ inputId }) => (
                <Select
                  id={inputId}
                  value={demo.personaId}
                  onChange={(e) => demo.setPersonaId(e.target.value as typeof demo.personaId)}
                  options={PERSONA_IDS.map((id) => ({
                    value: id,
                    label: `${t(`personas.${id}`)} — ${fixtures.personas.find((p) => p.id === id)?.name[prefs.locale] ?? ""}`,
                  }))}
                />
              )}
            </Field>

            <Field id="demo-scenario" label={t("demo.scenario")}>
              {({ inputId }) => (
                <Select
                  id={inputId}
                  value={demo.scenario}
                  onChange={(e) => demo.setScenario(e.target.value as typeof demo.scenario)}
                  options={SCENARIO_IDS.map((id) => ({ value: id, label: t(`scenarios.${id}`) }))}
                />
              )}
            </Field>

            <Field id="demo-latency" label={t("demo.latency")}>
              {({ inputId }) => (
                <Select
                  id={inputId}
                  value={demo.latency}
                  onChange={(e) => demo.setLatency(e.target.value as LatencyPreset)}
                  options={[
                    { value: "none", label: t("demo.latencyNone") },
                    { value: "fast", label: t("demo.latencyFast") },
                    { value: "slow", label: t("demo.latencySlow") },
                  ]}
                />
              )}
            </Field>

            <Field id="demo-error" label={t("demo.errorMode")}>
              {({ inputId }) => (
                <Select
                  id={inputId}
                  value={demo.errorMode}
                  onChange={(e) => demo.setErrorMode(e.target.value as ErrorMode)}
                  options={[
                    { value: "none", label: t("demo.errorNone") },
                    { value: "random", label: t("demo.errorRandom") },
                    { value: "provider", label: t("demo.errorProvider") },
                  ]}
                />
              )}
            </Field>

            <hr style={{ border: 0, borderBlockStart: "1px solid var(--color-border-subtle)", margin: "var(--space-2) 0" }} />

            {/* Display preferences (persist across reset) */}
            <div className="row-wrap">
              <Field id="pref-locale" label={t("shell.language")}>
                {({ inputId }) => (
                  <Select
                    id={inputId}
                    value={prefs.locale}
                    onChange={(e) => prefs.setLocale(e.target.value as Locale)}
                    options={[
                      { value: "ar", label: "العربية (RTL)" },
                      { value: "en", label: "English (LTR)" },
                    ]}
                  />
                )}
              </Field>
              <Field id="pref-numerals" label={t("shell.numerals")}>
                {({ inputId }) => (
                  <Select
                    id={inputId}
                    value={prefs.numerals}
                    onChange={(e) => prefs.setNumerals(e.target.value as Numerals)}
                    options={[
                      { value: "latn", label: t("shell.numeralsLatn") },
                      { value: "arab", label: t("shell.numeralsArab") },
                    ]}
                  />
                )}
              </Field>
              <Field id="pref-theme" label={t("shell.theme")}>
                {({ inputId }) => (
                  <Select
                    id={inputId}
                    value={prefs.theme}
                    onChange={(e) => prefs.setTheme(e.target.value as Theme)}
                    options={[
                      { value: "light", label: t("shell.themeLight") },
                      { value: "dark", label: t("shell.themeDark") },
                    ]}
                  />
                )}
              </Field>
              <Field id="pref-density" label={t("shell.density")}>
                {({ inputId }) => (
                  <Select
                    id={inputId}
                    value={prefs.density}
                    onChange={(e) => prefs.setDensity(e.target.value as Density)}
                    options={[
                      { value: "comfortable", label: t("shell.densityComfortable") },
                      { value: "compact", label: t("shell.densityCompact") },
                    ]}
                  />
                )}
              </Field>
            </div>

            <hr style={{ border: 0, borderBlockStart: "1px solid var(--color-border-subtle)", margin: "var(--space-2) 0" }} />

            <div className="stack-sm">
              <Button
                variant="danger"
                onClick={() => {
                  demo.resetDemo();
                }}
              >
                {t("demo.reset")}
              </Button>
              <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{t("demo.resetHint")}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
