import { Link, useLocation } from "react-router-dom";
import { findRouteByPath, NAV_GROUPS } from "@/routes/registry";
import { useCopy } from "@/lib/hooks";

/**
 * Breadcrumbs. Mirrors automatically in RTL (separators are logical).
 * Numeric path segments (IDs) render inside LTR isolates via the num-ltr class.
 */
export function Breadcrumbs() {
  const t = useCopy();
  const location = useLocation();
  const route = findRouteByPath(location.pathname);

  const groupLabel = route ? t(NAV_GROUPS.find((g) => g.id === route.navGroup)?.labelKey ?? "nav.overview") : t("nav.overview");
  const pageTitle = route ? t(route.titleKey) : t("routes.notFound.title");

  return (
    <nav aria-label={t("shell.breadcrumb")} style={{ minWidth: 0 }}>
      <ol className="row-wrap" style={{ gap: "var(--space-1)", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
        <li>
          <Link to="/app/overview">{t("nav.overview")}</Link>
        </li>
        {route && route.navGroup !== "overview" && (
          <>
            <li aria-hidden="true" style={{ color: "var(--color-border-strong)" }}>
              {breadcrumbSeparator}
            </li>
            <li style={{ color: "var(--color-text-secondary)" }}>{groupLabel}</li>
          </>
        )}
        {route && route.pageSlug !== "overview" && (
          <>
            <li aria-hidden="true" style={{ color: "var(--color-border-strong)" }}>
              {breadcrumbSeparator}
            </li>
            <li>
              <span aria-current="page" style={{ color: "var(--color-text-primary)", fontWeight: "var(--font-weight-medium)" }}>
                {pageTitle}
              </span>
            </li>
          </>
        )}
        {!route && (
          <>
            <li aria-hidden="true" style={{ color: "var(--color-border-strong)" }}>
              {breadcrumbSeparator}
            </li>
            <li aria-current="page" style={{ color: "var(--color-text-primary)" }}>
              {pageTitle}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}

/* Chevron points toward the reading direction; CSS logical styles keep it
 * correct in both locales — implemented as a simple mid-dot-safe chevron. */
const breadcrumbSeparator = "›";
