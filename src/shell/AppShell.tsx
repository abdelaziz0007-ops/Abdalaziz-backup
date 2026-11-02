import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { SidebarNav } from "@/shell/SidebarNav";
import { DemoControls } from "@/shell/DemoControls";
import { DemoIndicator } from "@/shell/DemoIndicator";
import { Breadcrumbs } from "@/shell/Breadcrumbs";
import { ContextBar } from "@/shell/ContextBar";
import { NotificationsMenu } from "@/shell/NotificationsMenu";
import { UserMenu } from "@/shell/UserMenu";
import { useCopy } from "@/lib/hooks";
import { useDemo } from "@/state/DemoProvider";
import { usePreferences } from "@/state/PreferencesProvider";
import { Button } from "@/components/ui/Button";

const SIDEBAR_WIDTH = "var(--size-sidebar-width)";
const TOPBAR_HEIGHT = "var(--size-topbar-height)";

export function AppShell() {
  const t = useCopy();
  const location = useLocation();
  const { currentPersona } = useDemo();
  const { theme, setTheme, density, setDensity, locale, setLocale } = usePreferences();
  const [navOpen, setNavOpen] = useState(false);
  const [personaName, setPersonaName] = useState<string>("");
  const navCloseRef = useRef<HTMLButtonElement>(null);
  const navToggleRef = useRef<HTMLButtonElement>(null);
  const drawerReturnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setPersonaName(currentPersona ? currentPersona.name[locale] : "");
  }, [currentPersona, locale]);

  // Close the mobile drawer on route change.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  // Focus the close button when the drawer opens; Esc closes; focus returns to the
  // control that opened it (reviewed MASTER §5 — modal focus must be restored).
  useEffect(() => {
    if (!navOpen) {
      const previous = drawerReturnFocusRef.current;
      drawerReturnFocusRef.current = null;
      if (previous && document.contains(previous)) previous.focus();
      return;
    }
    const active = document.activeElement;
    drawerReturnFocusRef.current =
      active instanceof HTMLElement && active !== document.body && active !== document.documentElement
        ? active
        : navToggleRef.current;
    navCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-surface-canvas)" }}>
      <a
        href="#main-content"
        onClick={(event) => {
          // HashRouter owns location.hash: a bare fragment link would rewrite the
          // route to /main-content and render 404 instead of moving focus.
          event.preventDefault();
          const target = document.getElementById("main-content");
          if (target instanceof HTMLElement) {
            target.focus();
            target.scrollIntoView({ block: "start" });
          }
        }}
        style={{
          position: "absolute",
          insetInlineStart: "-9999px",
          top: 0,
          padding: "var(--space-2) var(--space-4)",
          background: "var(--color-surface-raised)",
          zIndex: "var(--z-drawer)",
        }}
        onFocus={(e) => {
          e.currentTarget.style.insetInlineStart = "var(--space-4)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.insetInlineStart = "-9999px";
        }}
      >
        {t("shell.skipToContent")}
      </a>

      {/* Top bar — 64px */}
      <header
        style={{
          position: "fixed",
          insetBlockStart: 0,
          insetInline: 0,
          height: TOPBAR_HEIGHT,
          background: "var(--color-surface-raised)",
          borderBlockEnd: "1px solid var(--color-border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          paddingInline: "var(--space-4)",
          zIndex: "var(--z-sticky)",
        }}
      >
        <button
          ref={navToggleRef}
          type="button"
          className="fw-mobile-only"
          onClick={() => setNavOpen(true)}
          aria-label={t("shell.openNav")}
          aria-expanded={navOpen}
          aria-controls="mobile-nav-drawer"
          style={{
            minHeight: "var(--size-control-height)",
            paddingInline: "var(--space-3)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border-default)",
            background: "var(--color-surface-raised)",
            cursor: "pointer",
            display: "none",
          }}
        >
          <span aria-hidden="true">☰</span> {t("shell.openNav")}
        </button>

        <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <Breadcrumbs />
        </div>

        <div className="fw-desktop-only" style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <ContextBar />
        </div>

        <NotificationsMenu />
        <DemoIndicator />

        {/* Locale / theme / density — compact icon-ish buttons with accessible names */}
        <div className="row" style={{ gap: "var(--space-1)" }}>
          <Button
            variant="ghost"
            onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
            aria-label={t("shell.language")}
            title={t("shell.language")}
          >
            {locale === "ar" ? "EN" : "ع"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            aria-label={theme === "light" ? t("shell.themeDark") : t("shell.themeLight")}
            title={t("shell.theme")}
          >
            <span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span>
          </Button>
          <Button
            variant="ghost"
            onClick={() => setDensity(density === "comfortable" ? "compact" : "comfortable")}
            aria-label={t("shell.density")}
            title={t("shell.density")}
          >
            <span aria-hidden="true">≡</span>
          </Button>
        </div>

        <UserMenu personaName={personaName} />
      </header>

      {/* Sidebar — 248px, desktop only.
          NOTE: this element previously carried an inline `display: none` with no
          overriding desktop rule, so at >=1024px neither the sidebar nor the mobile
          toggle was visible and the workspace had no pointer navigation at all. */}
      <aside
        className="fw-desktop-only"
        style={{
          position: "fixed",
          insetBlockStart: TOPBAR_HEIGHT,
          insetInlineStart: 0,
          width: SIDEBAR_WIDTH,
          height: `calc(100vh - ${TOPBAR_HEIGHT})`,
          background: "var(--color-surface-raised)",
          borderInlineEnd: "1px solid var(--color-border-subtle)",
          overflowY: "auto",
        }}
      >
        <SidebarNav />
      </aside>

      {/* Mobile drawer */}
      {navOpen && (
        <div
          id="mobile-nav-drawer"
          className="fw-mobile-only"
          style={{ position: "fixed", inset: 0, zIndex: "var(--z-drawer)", display: "none" }}
        >
          <div
            onClick={() => setNavOpen(false)}
            style={{ position: "absolute", inset: 0, background: "var(--color-surface-overlay)" }}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("shell.mainNav")}
            style={{
              position: "absolute",
              insetBlock: 0,
              insetInlineStart: 0,
              width: "min(320px, 85vw)",
              background: "var(--color-surface-raised)",
              boxShadow: "var(--shadow-lg)",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="row" style={{ padding: "var(--space-3) var(--space-4)", borderBlockEnd: "1px solid var(--color-border-subtle)" }}>
              <h2 style={{ flex: "1 1 auto", fontSize: "var(--font-size-md)" }}>{t("shell.mainNav")}</h2>
              <button
                ref={navCloseRef}
                type="button"
                onClick={() => setNavOpen(false)}
                aria-label={t("shell.closeNav")}
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
            <SidebarNav onNavigate={() => setNavOpen(false)} />
            <div style={{ padding: "var(--space-4)", borderBlockStart: "1px solid var(--color-border-subtle)" }}>
              <ContextBar stacked />
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <main
        id="main-content"
        tabIndex={-1}
        style={{
          paddingBlockStart: TOPBAR_HEIGHT,
        }}
      >
        <div
          className="fw-content"
          style={{
            padding: "var(--space-6)",
            maxWidth: "1280px",
            marginInline: "auto",
          }}
        >
          <Outlet />
        </div>
      </main>

      <DemoControls />

      <style>{mediaQueryCss}</style>
    </div>
  );
}

/* Visibility helpers: the same nodes are reused across breakpoints to keep a
 * single DOM (no duplicate landmarks for screen readers). */
const mediaQueryCss = `
  .fw-mobile-only { display: none !important; }
  @media (max-width: 1023px) {
    .fw-mobile-only { display: inline-flex !important; }
    .fw-mobile-only[style*="position: fixed"] { display: block !important; }
    .fw-desktop-only { display: none !important; }
    .fw-content { padding: var(--space-4) !important; }
  }
  @media (min-width: 1024px) {
    /* The fixed 248px sidebar sits above the canvas; offset the content column by its
       width so financial evidence is never covered. Logical property → mirrors in RTL. */
    #main-content { padding-inline-start: var(--size-sidebar-width); }
  }
  @media (pointer: coarse) {
    button { min-height: 44px; }
  }
`;
