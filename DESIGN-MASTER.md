# Financial Workspace — UI/UX Pro Max Design Master

**Version 2.0 · 1 November 2026 · Proposed implementation baseline**

## 1. Authority and Context

This master applies UI/UX Pro Max to the existing financial reporting and reconciliation product. It supplements, rather than replaces, the BRD and SRS. Financial truth comes from `project-reference/fake-data.json`. Canonical semantic token values come from `project-reference/design-tokens.json` and `.css`.

Design retrieval order: read this master, then `pages/<page-slug>.md` for the requested interface. Page briefs specialize hierarchy, layout, interaction, and responsive behavior; they do not override financial rules, access scopes, token values, or accessibility requirements.

The original design guide is retained as detailed component documentation. This v2 master resolves design-process questions; original component details remain applicable where consistent. Generic search output never authorizes changing a financial requirement or inventing product data.

**Observed implementation stack:** `D:/MYPROJECT/package.json` was read on 1 November 2026 and identifies React, TypeScript, React Router, and Vite. Preserve the actual versions/lockfile installed by the project. This handoff neither changes that application nor requires a framework migration. The skill's React recommendations may describe a newer minor version: apply compatible patterns, not automatic upgrades.

## 2. Actual Skill Use and Synthesis

Pinned source: `nextlevelbuilder/ui-ux-pro-max-skill`, commit `3a13158ff1f32156cbe144108de48eda2ecaed9a`. A portable skill snapshot with scripts/data/references and MIT license is bundled in `vendor/ui-ux-pro-max/`. It is not installed into a global user profile.

Two design-system searches were executed before synthesis. The Financial Dashboard candidate matched the industry but coupled an OLED-only style with an enterprise marketing pattern. A narrower enterprise-accounting query returned a general SaaS candidate with a suitable simple public-page structure, but glass effects were not a good fit for dense financial work. Neither raw candidate was promoted to the master.

A focused style search returned the active **Minimalism & Swiss Style** entry, which explicitly fits enterprise applications, dashboards, SaaS, and professional tools. Adopt its hierarchy, restrained decoration, grid discipline, contrast, and low-motion approach. Keep this project's established token palette, rounded control accessibility, bilingual fonts, and documented component contracts rather than copying an illustrative monochrome palette or zero-radius sample.

Focused searches also returned applicable authentication, form-error, focus-obscuring, drag-alternative, badge wrapping, navigation, contrast, and cumulative-change chart guidance. The React table-sorting query returned zero results; its single narrower retry returned stable-list-key and long-list guidance. Sorting behavior is therefore supported by the skill's quick reference, not misrepresented as a React search match. The table-domain result concerned responsive table handling. The chart search also returned trading candlesticks; that result is excluded because the product has no OHLC scope.

Raw outputs and result identities are retained in `skill-evidence/`. Applicability decisions are recorded separately. The evidence is design guidance, not certification or measured product performance.

## 3. Product-Specific Visual Direction

**Precise, calm, evidence-led enterprise finance.** Use opaque panels, clean typography, measured whitespace, clear totals, and unmistakable status language. The main visual hierarchy is identity/context → readiness/problem → financial evidence → next permitted action.

- Keep the existing navy primary actions, teal confirmed/valid states, amber suggestions/warnings, red blockers/destructive actions, and violet review states.
- Avoid decorative glow, translucent financial tables, saturated backgrounds behind amounts, stock-market visuals, and gradients used to disguise missing hierarchy.
- Use one consistent outline SVG family, such as the project's existing SVG kit or Lucide if already available. No structural emoji icons; do not invent official bank or partner logos.
- One primary task per screen; secondary actions remain visibly subordinate. A complex workspace may have contextual decisions, but never multiple competing primary CTAs without scope separation.
- Rounded values remain 8px controls, 12px panels, 16px dialogs. Use a 4px base spacing rhythm with 16/24/32px section tiers; no arbitrary per-screen palette or shadow system.
- Marketing pages share the same brand but use their own public navigation and reading composition. Do not apply hero/testimonial layouts to operational workspaces.

## 4. Foundations to Reuse

| Foundation | Project rule |
|---|---|
| Primary action light | Background #172554, text #FFFFFF |
| Primary action dark | Background #BFDBFE, text #172554 |
| Canvas light / dark | #F1F5F9 / #020617 |
| Panel light / dark | #FFFFFF / #0F172A |
| Primary text light / dark | #0F172A / #F8FAFC |
| Supporting text light / dark | #475569 / #CBD5E1 |
| Control boundary light / dark | #64748B / #94A3B8 |
| Focus light / dark | #2563EB / #93C5FD |
| Text sizes | Body 16px; financial table 14px minimum; caption 12px only for non-critical metadata |
| Type hierarchy | 32/44 page heading; 24/36 section; 20/30 panel; 16/26 body; 14/24 table/support |
| Fonts | Existing system Latin stack; Noto Sans Arabic intended with Tahoma/Arial fallback; no forced web-font download |
| Desktop shell | 248px sidebar; 64px top bar; up to 1440px general content; wide reconciliation may expand |
| Comfortable / compact rows | 48px / 40px desktop; compact mode never shrinks the font |
| Controls | 40px comfortable, 36px compact desktop; 44px touch target product goal |
| Motion | 120ms hover, 180ms ordinary state, 240ms drawer as contextual defaults; no animated money counters |

Use semantic CSS variables, not these raw values in components. Existing 38 color-pair checks are included as token evidence; they do not cover every actual rendered interaction state.

## 5. Accessibility and Interaction — Highest Priority

Apply the skill's accessibility and interaction priorities before decorative styling. The web/desktop quick reference is the applicable source. Native iOS pt/Android dp and gesture guidance is not automatically a requirement for this web application.

- Normal text contrast at least 4.5:1; large text and applicable essential non-text controls/marks at least 3:1. Verify actual foreground/background pairs in each theme, not only token names.
- Keep a visible focus outline, preferably the project's 3px ring with offset. Sticky headers, footers, drawers, banners, and table regions must not hide the focused control.
- 44×44 CSS px touch targets are this project's product goal. Distinguish that from WCAG's web minimum and its exceptions; compact desktop appearance may use expanded hit regions without overlap.
- Visible labels, appropriate native inputs, localized help, inline errors, and a focusable linked error summary after multi-error submission. Do not move focus on every keystroke or blur.
- Password managers, paste, whole-code OTP entry, and a recovery alternative. No blocking paste or cognitive puzzle.
- All drag interactions have browse/button/keyboard alternatives. Hover-only evidence and gestures are insufficient for financial decisions.
- Modal: explicit label, inert background, focus containment, safe initial focus, close/cancel where allowed, return focus. Non-modal inspector: no artificial focus trap. Choose semantics intentionally.
- Announce status/count changes as contextual phrases in a small number of live regions. Avoid rapid timer announcements, competing alerts, or toasts as the sole critical-error explanation.
- Read-only is not disabled. A blocked action includes a visible reason and a usable recovery path; not a tooltip on an unfocusable button.
- Reflow at 320 CSS px and 400% zoom where applicable. A financial table may retain necessary two-dimensional scrolling inside a named region; the whole page must not overflow horizontally.
- Preserve browser zoom and system shortcuts. Support keyboard-only use, text enlargement, forced colors, reduced motion, and landscape layout.

## 6. Dense Tables, Charts, and Financial Evidence

- Use semantic tables, captions, associated headers, stable IDs, sortable header buttons, and `aria-sort`. Text and numbers do not become generic grids unless an actual grid interaction model is needed and tested.
- Amounts use tabular figures and directional isolation; full amounts, sign, unit/currency, and column meanings remain available. Never ellipsize monetary values.
- Status labels/chips wrap or disclose overflow accessibly; avoid shrinking Arabic labels to fit a fixed pill.
- Selection is explicit. Separate selection, navigation, and approval targets; never approve by clicking a row.
- Show denominator and valid scope for coverage. Coverage is not matching precision. Count and absolute-value coverage are distinct.
- Use bar/line charts for appropriate comparisons/trends, with units, exact-value access, and accessible tables. Cumulative signed changes may use a waterfall/bridge only when the components genuinely add to the total.
- No candlesticks, trading heatmaps, invented benchmarks, or decorations unrelated to supplied data. Bars use a meaningful zero baseline; missing is not zero.
- Meaning is not color-only. Favorable/adverse status is metric-specific; a positive expense variance is not automatically green.
- Page readiness and workflow approval are distinct from numerical balance. A zero residual does not approve a reconciliation.

## 7. Responsive, Bilingual, and Performance Rules

Arabic RTL is default; English LTR, light/dark, comfortable/compact are global preferences. Use logical CSS, `lang`/`dir`, isolated mixed-script references, and normal Arabic letter spacing. Mirror directional controls, not amounts, source identities, logos, checks, or numerical meaning.

Test actual widths 375, 768, 1024, and 1440px from the skill workflow, plus 320px reflow and the project's 390/1280/1600px where useful. Stack to preserve task priority rather than shrinking everything. Long names, IDs, URLs, badges, errors, and translations must reflow. A shrinkable flex/grid child and `overflow-wrap:anywhere` may be appropriate for identifiers; do not `word-break:break-all` ordinary Arabic prose.

Reserve dimensions for loading content. Skeletons never imply financial zero. Split routes/components when useful, use stable record keys, and profile long lists before adding virtualization; verify accessibility if virtualized. Do not install heavy animation/chart libraries merely because a search result names them. Avoid decorative motion or entry staggering that delays access to data. Use reduced-motion alternatives and keep state transitions interruptible.

## 8. Immutable Financial and Access Rules

The demo fixture values are a data contract: Atlas and Cedar identities/scopes, USD, 128,000 revenue, 21,500 profit, 332,200 assets, 143,000 liabilities, 189,200 equity, 6 bank and 8 book movements, source-book balance 102,200, and both adjusted balances 102,000. Do not change these to fill the UI.

- Exact decimal/minor-unit math; sign handling supports incoming and outgoing transactions. Test formatting separately so `125000.00` never becomes `125,000.00.00`.
- No balancing plugs. A diagnostic nonzero branch must result from documented input changes, not changing a stored display-only residual.
- Preserve dataset/rule/mapping versions and source rows. Proposed fees are not posted and do not alter the unadjusted statements.
- Empty entity scopes mean no financial data. No fallback to the first entity; identity loading is not an access grant. Mock UI guards do not constitute production security.
- Approval requires actual action permission, entity/account scope, independent preparer/approver, current immutable version, completeness, no blocking quality error, derived zero residual where applicable, and an unlocked state. Apply these checks in every scenario, not only when its name suggests a failure.
- Stable deterministic scenario branches; do not activate full and partial allocations on the same amount simultaneously. Reject invalid allocations explicitly, never silently sanitize away a failed decision.

## 9. Required Per-Screen Build Cycle

1. Read the reference manifest and this master; resolve the page brief.
2. Inspect actual project files and reuse established shell/components and router. Avoid unrelated refactors or dependency upgrades.
3. Read the page's assigned skill evidence; use one focused search only for a distinct unresolved issue. Verify returned category/identity; retry once if empty/off-topic. Never persist unreviewed generator output over this master.
4. Implement only the requested page/component and its necessary shared support. Preserve working routes and canonical fixtures.
5. Exercise primary, keyboard, loading, empty, error, read-only, restricted, and domain-specific states. Verify locale/theme/mobile behavior.
6. Report files changed, interactions exercised, actual tests/screenshots, unresolved defects, and unavailable checks. Compilation or HTTP 200 is not browser verification.

## 10. Web Pre-Delivery Gate

Check UI with real DOM and rendered screenshots where available; retain evidence. Required checks: visible meaningful hierarchy; one coherent SVG language; no layout-shifting hover; no clipped amounts; accessible labels/errors; focus visible and unobscured; table/legend meaning without color; Arabic/English; independently verified light/dark; phone/tablet/desktop; reduced motion; keyboard recovery; appropriate empty/unavailable states; exact fixtures and locked-version behavior.

If browser policy prevents inspection, report it and leave visual checks unverified. Do not bypass the restriction or claim a visual review from code inspection. The current task rebuilds prompts and design references, not the application's frontend, so it does not certify that any interface has passed these gates.

## 11. Scope, Open Decisions, and Change Control

User-facing product name/mark are provisional. Accounting framework, jurisdiction, final pricing, production authentication, retention, font packaging, and later integrations remain unresolved as documented in BRD/SRS. Public marketing/legal pages are optional; no invented testimonials, certifications, or final contracts.

Change this master only through an explicit documented design change. Page briefs cannot smuggle in a new palette or permission model. The upstream skill's `--force` option must not be used without explicit authorization. Keep the original reference files intact; migrate through named adapters/aliases and a change report when existing OpenCode code uses a different schema.
