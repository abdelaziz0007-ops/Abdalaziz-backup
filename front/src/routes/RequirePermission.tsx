import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Permission } from "@/data/types";
import type { RouteAccess, RouteScope } from "@/routes/registry";
import { useCopy } from "@/lib/hooks";
import { Callout } from "@/components/ui/Callout";
import { useDemo } from "@/state/DemoProvider";
import { fixtures } from "@/data/repository";

export function RequirePermission({
  access,
  permissions,
  scope,
  children,
}: {
  access: RouteAccess;
  permissions: Permission[];
  scope: RouteScope;
  children: ReactNode;
}) {
  const t = useCopy();
  const { currentPersona, selectedEntityId } = useDemo();

  if (access === "public") return <>{children}</>;

  const hasIdentity = currentPersona !== null;
  // Fail closed: an empty permission list on a permissioned route grants nothing,
  // and a missing permission is never read as "no restriction".
  const hasPermission =
    permissions.length > 0 &&
    permissions.some((permission) => currentPersona?.permissions.includes(permission));
  const hasEntityScope = scope === "none" || (
    selectedEntityId !== null && currentPersona?.scopedEntityIds.includes(selectedEntityId) === true
  );
  const hasAccountScope = scope !== "account" || (
    selectedEntityId !== null &&
    currentPersona !== null &&
    currentPersona?.scopedEntityIds.includes(selectedEntityId) === true &&
    currentPersona.scopedAccountIds.includes(fixtures.reconciliation.bankAccountId)
  );

  if (hasIdentity && (access === "authenticated" || (hasPermission && hasEntityScope && hasAccountScope))) {
    return <>{children}</>;
  }

  return (
    <Callout
      tone="warning"
      title={t("guard.restrictedTitle")}
      actions={
        <Link to="/app/overview" style={{ fontSize: "var(--font-size-sm)" }}>
          {t("guard.backToOverview")}
        </Link>
      }
    >
      <p>{t("guard.restrictedBody")}</p>
      {currentPersona?.role === "subscriptionOwner" && <p>{t("guard.ownerNote")}</p>}
    </Callout>
  );
}
