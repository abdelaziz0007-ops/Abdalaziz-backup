import { NavLink } from "react-router-dom";
import { NAV_GROUPS } from "@/routes/registry";
import { useCopy } from "@/lib/hooks";

/**
 * Desktop sidebar (248px). On mobile it renders inside the drawer (AppShell).
 * Directional layout uses logical properties; RTL mirrors automatically.
 */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const t = useCopy();
  return (
    <nav aria-label={t("shell.mainNav")} style={{ padding: "var(--space-4) var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      {NAV_GROUPS.map((group) => {
        // Suppress a group heading that would only repeat its single link's title;
        // five of seven groups were rendering an identical label twice ("التقارير" /
        // "التقارير"), which the reviewed MASTER flags as navigation noise.
        const firstTitle = group.routes[0] ? t(group.routes[0].titleKey) : "";
        const showHeading = group.routes.length > 1 || t(group.labelKey) !== firstTitle;
        return (
        <div key={group.id}>
          {showHeading && (
          <h2
            style={{
              fontSize: "var(--font-size-xs)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--color-text-muted)",
              marginBlockEnd: "var(--space-2)",
              paddingInline: "var(--space-2)",
            }}
          >
            {t(group.labelKey)}
          </h2>
          )}
          <ul style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {group.routes.map((route) => (
              <li key={route.id}>
                <NavLink
                  to={route.path}
                  end={route.path === "/app/overview"}
                  onClick={onNavigate}
                  style={({ isActive }) => ({
                    display: "block",
                    padding: "var(--space-2) var(--space-3)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "var(--font-size-sm)",
                    fontWeight: isActive ? "var(--font-weight-medium)" : "var(--font-weight-regular)",
                    color: isActive ? "var(--color-on-primary)" : "var(--color-text-primary)",
                    background: isActive ? "var(--color-primary)" : "transparent",
                    textDecoration: "none",
                    minHeight: "var(--size-control-height)",
                  })}
                >
                  {t(route.titleKey)}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
        );
      })}
    </nav>
  );
}
