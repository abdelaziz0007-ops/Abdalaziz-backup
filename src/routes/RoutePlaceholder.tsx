import { useCopy } from "@/lib/hooks";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";
import { useDemo } from "@/state/DemoProvider";
import type { RouteDef } from "@/routes/registry";

/**
 * Labeled placeholder for a registered route. Every screen in the pack gets an
 * entry now; later prompts replace the placeholder body with the real interface
 * WITHOUT touching the shell, tokens, or mock layer.
 */
export function RoutePlaceholder({ route }: { route: RouteDef }) {
  const t = useCopy();
  const { scenario } = useDemo();
  const localizedTitle = t(route.titleKey);
  const title = localizedTitle === route.titleKey ? route.pageSlug : localizedTitle;

  return (
    <div className="stack">
      <header className="stack-sm">
        <div className="row-wrap">
          <h1>{title}</h1>
          <Badge tone="info" label={t("placeholder.badge")} />
          {route.stage === "S" && <Badge tone="accent" label={t("common.subsequentRelease")} />}
        </div>
      </header>

      <Card>
        <p style={{ color: "var(--color-text-secondary)" }}>{t("placeholder.description")}</p>
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "max-content 1fr",
            gap: "var(--space-2) var(--space-4)",
            fontSize: "var(--font-size-sm)",
            margin: 0,
          }}
        >
          <dt style={{ color: "var(--color-text-muted)" }}>route.id</dt>
          <dd className="num-ltr" style={{ margin: 0 }}>{route.id}</dd>
          <dt style={{ color: "var(--color-text-muted)" }}>path</dt>
          <dd className="num-ltr" style={{ margin: 0 }}>{route.path}</dd>
          <dt style={{ color: "var(--color-text-muted)" }}>scenario</dt>
          <dd className="num-ltr" style={{ margin: 0 }}>{scenario}</dd>
        </dl>
      </Card>

      {route.stage === "S" && (
        <Callout tone="neutral" title={t("common.subsequentRelease")}>
          {t("common.disabledNotConfigured")}
        </Callout>
      )}
    </div>
  );
}
