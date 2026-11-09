import { useCopy } from "@/lib/hooks";

/**
 * Persistent "Demo — synthetic data" indicator (top bar).
 * Always visible so no screen can be mistaken for a production system.
 */
export function DemoIndicator() {
  const t = useCopy();
  return (
    <span
      title={t("app.demoNotice")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        padding: "2px var(--space-2)",
        borderRadius: "var(--radius-full)",
        border: "1px dashed var(--color-accent)",
        background: "var(--color-accent-subtle)",
        color: "var(--color-accent)",
        fontSize: "var(--font-size-xs)",
        fontWeight: "var(--font-weight-medium)",
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden="true">◈</span>
      {t("app.demoBadge")}
    </span>
  );
}
