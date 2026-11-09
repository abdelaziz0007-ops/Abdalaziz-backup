import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProductShell } from "@/shell/ProductShell";
import { ROUTES } from "@/routes/registry";
import { RequirePermission } from "@/routes/RequirePermission";
import { ReportsLibrary,StatementPage,SourceInspector } from '@/routes/pages/FinancePages';
import { lazy, Suspense } from 'react';
const FinancialStudio=lazy(()=>import('@/routes/pages/FinancialStudio').then(module=>({default:module.FinancialStudio})));
const ExecutiveReport=lazy(()=>import('@/routes/pages/ExecutiveReport').then(module=>({default:module.ExecutiveReport})));
const ConnectedAuth=lazy(()=>import('@/routes/pages/ConnectedPages').then(module=>({default:module.ConnectedAuth})));
const ConnectedWorkspace=lazy(()=>import('@/routes/pages/ConnectedPages').then(module=>({default:module.ConnectedWorkspace})));
import { OperationalOverview } from '@/routes/pages/OperationalOverview';
import {InvitationPage} from '@/routes/pages/InvitationPage';
import { ImportsPage,ImportPreview,QualityPage,MappingPage } from '@/routes/pages/DataPages';
import { MatchingPage,OutstandingPage,ProposedEntriesPage,ReconciliationSetup,ReconciliationStatement,ReconciliationsList,ReviewPage } from '@/routes/pages/ReconciliationPages';
import { AuditPage,BillingPage,EntitiesPage,NotificationsPage,PolicyPage,ProfilePage,TeamPage } from '@/routes/pages/SupportPages';
import { AuthPage,HelpPage,LandingPage,LegalPage,OnboardingPage,PricingPage,RecoveryPage } from '@/routes/pages/PublicPages';
import { NotFoundPage } from "@/routes/pages/NotFoundPage";

function routeElement(route: (typeof ROUTES)[number]) {
  const pages:Record<string,React.ReactNode>={overview:<OperationalOverview/>, 'financial-analysis':<FinancialStudio/>, 'executive-pack':<ExecutiveReport/>, 'reports-library':<ReportsLibrary/>, 'income-statement':<StatementPage/>, 'financial-position':<StatementPage position/>, 'source-inspector':<SourceInspector/>, imports:<ImportsPage/>, 'import-preview':<ImportPreview/>, 'data-quality':<QualityPage/>, 'account-mapping':<MappingPage/>, 'reconciliations-list':<ReconciliationsList/>, 'reconciliation-setup':<ReconciliationSetup/>, 'matching-workspace':<MatchingPage/>, 'reconciliation-statement':<ReconciliationStatement/>, 'outstanding-items':<OutstandingPage/>, 'proposed-entries':<ProposedEntriesPage/>, 'review-inbox':<ReviewPage/>, 'review-detail':<ReviewPage detail/>, 'audit-trail':<AuditPage/>, entities:<EntitiesPage/>, 'team-access':<TeamPage/>, billing:<BillingPage/>, 'profile-notifications':route.path.endsWith('notifications')?<NotificationsPage/>:<ProfilePage/>, 'public-landing':<LandingPage/>, 'public-pricing':<PricingPage/>, 'legal-center':<LegalPage/>, 'help-support':<HelpPage/>, onboarding:<OnboardingPage/>, 'recovery-states':<RecoveryPage/>};
  const page=pages[route.pageSlug]??(['sign-in','sign-up','mfa','password-recovery'].includes(route.pageSlug)?<ConnectedAuth kind={route.pageSlug}/>:['bank-policies','entity-periods','privacy','integrations'].includes(route.pageSlug)?<PolicyPage kind={route.pageSlug}/>:<AuthPage kind={route.pageSlug}/>);
  return (
    <RequirePermission access={route.access} permissions={route.requiredPermissions} scope={route.scope}>
      <Suspense fallback={<p role="status">جارٍ تحميل الواجهة / Loading…</p>}>{page}</Suspense>
    </RequirePermission>
  );
}

/**
 * Logical routes remain those in ROUTES.json. HashRouter maps e.g.
 * /app/overview to /#/app/overview without changing the existing router strategy.
 */
export function AppRoutes() {
  const demoEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === 'true';
  const shellRoutes = ROUTES.filter((route) => route.path.startsWith("/app/"));
  const outerRoutes = ROUTES.filter((route) => !route.path.startsWith("/app/"));

  return (
    <HashRouter>
      <Routes>
        <Route path="/workspace" element={<Suspense fallback={<p role="status">جارٍ التحميل…</p>}><ConnectedWorkspace/></Suspense>}/>
        <Route path="/invitation/:token" element={<InvitationPage/>}/>
        {outerRoutes.map((route) => (
          <Route
            key={route.id}
            path={route.path}
            element={!demoEnabled&&['onboarding','recovery-states'].includes(route.pageSlug)?<Navigate to="/workspace" replace />:routeElement(route)}
          />
        ))}
        <Route path="/app" element={demoEnabled?<ProductShell />:<Navigate to="/workspace" replace />}>
          <Route index element={<Navigate to="overview" replace />} />
          {shellRoutes.map((route) => (
            <Route
              key={route.id}
              path={route.path.slice("/app/".length)}
              element={routeElement(route)}
            />
          ))}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </HashRouter>
  );
}
