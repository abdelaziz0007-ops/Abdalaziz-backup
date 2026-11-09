import routeManifest from "../../ROUTES.json";
import type { Permission } from "@/data/types";

export type NavGroupId =
  | "overview"
  | "dataImports"
  | "reports"
  | "reconciliations"
  | "reviews"
  | "auditTrail"
  | "settings";

export type RouteScope = "none" | "entity" | "account";
export type RouteAccess = "public" | "authenticated" | "permissioned";

export interface RouteDef {
  id: string;
  path: string;
  pageSlug: string;
  titleKey: string;
  navGroup: NavGroupId;
  requiredPermissions: Permission[];
  access: RouteAccess;
  scope: RouteScope;
  inSidebar: boolean;
  stage: "M" | "S";
}

const TITLE_KEYS: Record<string, string> = {
  overview: "routes.dashboard.title",
  entities: "routes.entities.title",
  imports: "routes.imports.title",
  "data-quality": "routes.quality.title",
  "account-mapping": "routes.mapping.title",
  "reports-library": "routes.reportsList.title",
  "income-statement": "routes.reportDetail.title",
  "financial-position": "routes.reportDetail.title",
  "financial-analysis": "routes.reportsList.title",
  "reconciliations-list": "routes.reconciliationsList.title",
  "reconciliation-setup": "routes.reconciliationDetail.title",
  "matching-workspace": "routes.reconciliationDetail.title",
  "reconciliation-statement": "routes.reconciliationDetail.title",
  "outstanding-items": "routes.reconciliationDetail.title",
  "proposed-entries": "routes.reconciliationDetail.title",
  "review-inbox": "routes.reviewsInbox.title",
  "review-detail": "routes.reviewsInbox.title",
  "audit-trail": "routes.audit.title",
  "team-access": "routes.users.title",
  "bank-policies": "routes.settings.title",
  "entity-periods": "routes.entities.title",
  billing: "routes.subscription.title",
  privacy: "routes.privacy.title",
  "profile-notifications": "routes.settings.title",
  integrations: "routes.integrations.title",
};

function routeAccess(path: string): RouteAccess {
  if (path.startsWith("/app/")) {
    return path === "/app/profile" || path === "/app/notifications" || path === "/app/support"
      ? "authenticated"
      : "permissioned";
  }
  return path === "/onboarding" ? "authenticated" : "public";
}

function routePermissions(pageSlug: string, path: string): Permission[] {
  if (path === "/app/overview") return ["dashboard.view"];
  if (pageSlug === "entities") return ["entities.view"];
  if (pageSlug === "imports") return ["imports.manage"];
  if (pageSlug === "import-preview") return ["imports.manage"];
  if (pageSlug === "data-quality") return ["quality.view"];
  if (pageSlug === "account-mapping") return ["mapping.edit"];
  if (["reports-library", "income-statement", "financial-position", "financial-analysis"].includes(pageSlug)) {
    return ["reports.view"];
  }
  if (pageSlug === 'executive-pack') return ['reports.view'];
  if (pageSlug === "source-inspector") return ["sources.view"];
  if (["reconciliations-list", "reconciliation-statement", "outstanding-items", "proposed-entries"].includes(pageSlug)) {
    return ["reconciliations.view"];
  }
  if (pageSlug === 'matching-workspace') return ['reconciliations.view'];
  if (pageSlug === 'reconciliation-setup') return ['reconciliations.prepare'];
  if (pageSlug === "review-inbox" || pageSlug === "review-detail") return ["reviews.approve", "reviews.submit"];
  if (pageSlug === "audit-trail") return ["audit.view"];
  if (pageSlug === "team-access") return ["users.manage"];
  if (pageSlug === "bank-policies") return ["bankAccounts.manage"];
  if (pageSlug === "entity-periods") return ["entities.manage"];
  if (pageSlug === "billing") return ["subscription.manage"];
  if (pageSlug === "privacy") return ["privacy.export"];
  if (pageSlug === "integrations") return ["settings.view"];
  return [];
}

function routeScope(pageSlug: string, path: string): RouteScope {
  if (pageSlug === "entities" || pageSlug === "team-access" ||
      pageSlug === "entity-periods" || pageSlug === "billing" || pageSlug === "privacy" ||
      pageSlug === "profile-notifications" || pageSlug === "integrations") return "none";
  if (["source-inspector", "reconciliations-list", "reconciliation-setup", "matching-workspace",
    "reconciliation-statement", "outstanding-items", "proposed-entries", "bank-policies"].includes(pageSlug)) {
    return "account";
  }
  return path.startsWith("/app/") ? "entity" : "none";
}

function navGroup(pageSlug: string): NavGroupId {
  if (pageSlug === "overview") return "overview";
  if (["imports", "import-preview", "data-quality", "account-mapping"].includes(pageSlug)) return "dataImports";
  if (["reports-library", "income-statement", "financial-position", "financial-analysis"].includes(pageSlug)) return "reports";
  if (["reconciliations-list", "reconciliation-setup", "matching-workspace", "reconciliation-statement",
    "outstanding-items", "proposed-entries"].includes(pageSlug)) return "reconciliations";
  if (["review-inbox", "review-detail"].includes(pageSlug)) return "reviews";
  if (pageSlug === "audit-trail") return "auditTrail";
  return "settings";
}

const SIDEBAR_PAGES = new Set([
  "overview",
  "imports",
  "data-quality",
  "account-mapping",
  "reports-library",
  "reconciliations-list",
  "review-inbox",
  "audit-trail",
  "entities",
  "team-access",
  "billing",
]);

function routeId(pageSlug: string, path: string, routeCount: number): string {
  if (routeCount === 1) return pageSlug;
  const suffix = path.split("/").filter(Boolean).map((part) => part.startsWith(":") ? "by-id" : part).join("-");
  return `${pageSlug}-${suffix || "root"}`;
}

export const ROUTES: RouteDef[] = routeManifest.entries.flatMap((entry) =>
  entry.routes.map((path) => {
    const access = routeAccess(path);
    return {
      id: routeId(entry.pageSlug, path, entry.routes.length),
      path,
      pageSlug: entry.pageSlug,
      titleKey: TITLE_KEYS[entry.pageSlug] ?? "placeholder.badge",
      navGroup: navGroup(entry.pageSlug),
      requiredPermissions: routePermissions(entry.pageSlug, path),
      access,
      scope: access === "permissioned" ? routeScope(entry.pageSlug, path) : "none",
      inSidebar: SIDEBAR_PAGES.has(entry.pageSlug) && path === entry.routes[0],
      stage: entry.pageSlug === "integrations" ? "S" : "M",
    };
  }),
);

export const NAV_GROUPS: Array<{ id: NavGroupId; labelKey: string; routes: RouteDef[] }> = [
  { id: "overview", labelKey: "nav.overview", routes: ROUTES.filter((route) => route.navGroup === "overview" && route.inSidebar) },
  { id: "dataImports", labelKey: "nav.dataImports", routes: ROUTES.filter((route) => route.navGroup === "dataImports" && route.inSidebar) },
  { id: "reports", labelKey: "nav.reports", routes: ROUTES.filter((route) => route.navGroup === "reports" && route.inSidebar) },
  { id: "reconciliations", labelKey: "nav.reconciliations", routes: ROUTES.filter((route) => route.navGroup === "reconciliations" && route.inSidebar) },
  { id: "reviews", labelKey: "nav.reviews", routes: ROUTES.filter((route) => route.navGroup === "reviews" && route.inSidebar) },
  { id: "auditTrail", labelKey: "nav.auditTrail", routes: ROUTES.filter((route) => route.navGroup === "auditTrail" && route.inSidebar) },
  { id: "settings", labelKey: "nav.settings", routes: ROUTES.filter((route) => route.navGroup === "settings" && route.inSidebar) },
];

export function findRouteByPath(pathname: string): RouteDef | undefined {
  const staticMatch = ROUTES.find((route) => route.path === pathname);
  if (staticMatch) return staticMatch;
  return ROUTES.find((route) => {
    if (!route.path.includes(":")) return false;
    const pattern = route.path
      .split("/")
      .map((segment) => segment.startsWith(":") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp(`^${pattern.join("/")}$`).test(pathname);
  });
}
