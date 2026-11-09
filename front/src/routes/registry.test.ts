import { describe, expect, it } from "vitest";
import routeManifest from "../../ROUTES.json";
import { ROUTES, findRouteByPath } from "@/routes/registry";

/**
 * Route-registry ↔ ROUTES.json reconciliation (Prompt FIX item 9) and the
 * fail-closed permission contract (item 6).
 */
describe("route registry access contract", () => {
  const permissioned = ROUTES.filter((route) => route.access === "permissioned");

  it("never leaves a permissioned route without at least one required permission", () => {
    // Fail closed: an empty permission list would otherwise read as "unrestricted".
    const openRoutes = permissioned.filter((route) => route.requiredPermissions.length === 0);
    expect(openRoutes.map((route) => route.path)).toEqual([]);
  });

  it("keeps every permissioned screen gated by an action permission", () => {
    for (const route of permissioned) {
      expect(route.requiredPermissions.length).toBeGreaterThan(0);
      expect(["none", "entity", "account"]).toContain(route.scope);
    }
    // Scope "none" is only for tenant-level admin/list screens whose repository
    // reads are themselves scope-filtered; every entity- or account-level screen
    // must still declare a scope.
    const unscoped = [...new Set(
      permissioned.filter((route) => route.scope === "none").map((route) => route.pageSlug),
    )].sort();
    expect(unscoped).toEqual(
      ["billing", "entities", "entity-periods", "integrations", "privacy", "team-access"].sort(),
    );
    for (const route of permissioned.filter((candidate) => candidate.scope !== "none")) {
      expect(route.requiredPermissions.length).toBeGreaterThan(0);
    }
  });

  it("keeps auth, public, and error routes outside the protected /app shell", () => {
    const outsideShell = ROUTES.filter((route) => !route.path.startsWith("/app/"));
    const expected = routeManifest.entries
      .flatMap((entry) => entry.routes)
      .filter((path) => !path.startsWith("/app/"))
      .sort();
    expect(outsideShell.map((route) => route.path).sort()).toEqual(expected);

    for (const path of ["/", "/pricing", "/auth/sign-in", "/auth/mfa", "/onboarding", "/403", "/404", "/session-expired"]) {
      expect(findRouteByPath(path)?.access).not.toBe("permissioned");
      expect(path.startsWith("/app/")).toBe(false);
    }
  });

  it("grants only identity-level access to non-financial app routes", () => {
    const authenticated = ROUTES.filter((route) => route.access === "authenticated");
    expect(authenticated.map((route) => route.path).sort()).toEqual(
      ["/app/notifications", "/app/profile", "/app/support", "/onboarding"].sort(),
    );
    for (const route of authenticated) {
      expect(route.path.startsWith("/app/overview")).toBe(false);
      expect(route.scope).toBe("none");
    }
  });

  it("registers unique ids and paths and resolves dynamic logical paths", () => {
    expect(new Set(ROUTES.map((route) => route.id)).size).toBe(ROUTES.length);
    expect(new Set(ROUTES.map((route) => route.path)).size).toBe(ROUTES.length);
    expect(findRouteByPath("/app/reconciliations/REC-1/matching")?.pageSlug).toBe("matching-workspace");
    expect(findRouteByPath("/app/settings/team")?.requiredPermissions).toContain("users.manage");
    expect(findRouteByPath("/app/settings/billing")?.requiredPermissions).toContain("subscription.manage");
    expect(findRouteByPath("/app/settings/billing")?.scope).toBe("none");
  });

  it("maps every manifest entry to a route definition", () => {
    const manifestPaths = new Set(routeManifest.entries.flatMap((entry) => entry.routes));
    expect(new Set(ROUTES.map((route) => route.path))).toEqual(manifestPaths);
  });
});
