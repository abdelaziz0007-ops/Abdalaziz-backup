/** Typed access to ui-copy.json. Keys resolve dot-paths; missing keys fail loudly in dev. */
import copyRaw from "../../ui-copy.json";
import type { Locale } from "@/data/types";

export type CopyKey =
  | "app.name"
  | "app.demoBadge"
  | "app.demoNotice"
  | "shell.mainNav"
  | "shell.openNav"
  | "shell.closeNav"
  | "shell.skipToContent"
  | "shell.breadcrumb"
  | "shell.notifications"
  | "shell.notificationsEmpty"
  | "shell.userMenu"
  | "shell.signOutDemo"
  | "shell.entityContext"
  | "shell.periodContext"
  | "shell.currencyContext"
  | "shell.theme"
  | "shell.themeLight"
  | "shell.themeDark"
  | "shell.density"
  | "shell.densityComfortable"
  | "shell.densityCompact"
  | "shell.language"
  | "shell.numerals"
  | "shell.numeralsLatn"
  | "shell.numeralsArab"
  | "nav.overview"
  | "nav.dataImports"
  | "nav.reports"
  | "nav.reconciliations"
  | "nav.reviews"
  | "nav.auditTrail"
  | "nav.settings"
  | "routes.dashboard.title"
  | "routes.imports.title"
  | "routes.importWizard.title"
  | "routes.quality.title"
  | "routes.mapping.title"
  | "routes.reportsList.title"
  | "routes.reportDetail.title"
  | "routes.reconciliationsList.title"
  | "routes.reconciliationDetail.title"
  | "routes.reviewsInbox.title"
  | "routes.audit.title"
  | "routes.settings.title"
  | "routes.entities.title"
  | "routes.users.title"
  | "routes.subscription.title"
  | "routes.privacy.title"
  | "routes.integrations.title"
  | "routes.notFound.title"
  | "placeholder.badge"
  | "placeholder.description"
  | "demo.title"
  | "demo.subtitle"
  | "demo.persona"
  | "demo.scenario"
  | "demo.latency"
  | "demo.latencyNone"
  | "demo.latencyFast"
  | "demo.latencySlow"
  | "demo.errorMode"
  | "demo.errorNone"
  | "demo.errorRandom"
  | "demo.errorProvider"
  | "demo.reset"
  | "demo.resetHint"
  | "demo.open"
  | "demo.close"
  | "guard.restrictedTitle"
  | "guard.restrictedBody"
  | "guard.backToOverview"
  | "guard.ownerNote"
  | "status.confirmedMatch"
  | "status.suggestion"
  | "status.unmatched"
  | "status.excluded"
  | "status.draft"
  | "status.readyForReview"
  | "status.underReview"
  | "status.approvedLocked"
  | "status.rejected"
  | "status.blocking"
  | "status.warning"
  | "status.unavailable"
  | "common.loading"
  | "common.retry"
  | "common.errorTitle"
  | "common.errorBody"
  | "common.emptyTitle"
  | "common.unmappedAccounts"
  | "common.openItems"
  | "common.pendingReviews"
  | "common.quotaUsage"
  | "common.jobsTitle"
  | "common.viewAll"
  | "common.version"
  | "common.subsequentRelease"
  | "common.disabledNotConfigured";

type Leaf = { ar: string; en: string };
type Node = Leaf | { [key: string]: Node };

function resolve(path: string): Leaf | undefined {
  const parts = path.split(".");
  let node: Node | undefined = copyRaw as unknown as Node;
  for (let index = 0; index < parts.length; index += 1) {
    if (typeof node !== "object" || node === null || Array.isArray(node)) return undefined;
    const children = node as Record<string, Node>;
    const dottedKey = parts.slice(index).join(".");
    if (Object.prototype.hasOwnProperty.call(children, dottedKey)) {
      node = children[dottedKey];
      break;
    }
    node = children[parts[index]];
  }
  if (node && typeof node === "object" && "ar" in node && "en" in node) {
    return node as Leaf;
  }
  return undefined;
}

export function translate(key: string, locale: Locale): string {
  const leaf = resolve(key);
  if (!leaf) {
    if (import.meta.env.DEV) {
      console.warn(`[ui-copy] missing key: ${key}`);
    }
    return key;
  }
  return leaf[locale];
}

export function translateNamed(key: string, locale: Locale, name: string): string {
  return translate(key, locale).replace("{name}", name);
}

export { copyRaw };
