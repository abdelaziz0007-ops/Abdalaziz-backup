# Prompt FIX — Foundation Repair and Alignment Report

**Date:** 1 November 2026 · **Scope:** Prompt FIX (repair/align the existing Prompt 00
foundation) · **Stack preserved:** React 19 + TypeScript 5.8 + Vite 6 + React Router 7
(`HashRouter`), installed versions untouched.

This document reports what was actually inspected, changed, verified, and what remains
unverified. It does **not** claim production authorization, security certification, or a
complete accessibility audit. No network calls, uploads, payments, journal posting, or
email delivery exist in this prototype.

---

## 1. Resolved reference paths (item 1)

Manifest: `C:\Users\HP\OneDrive\Desktop\UIUX-Pro-Max-Frontend-Prompts-v2\uiux-pro-max-frontend-v2\REFERENCE-MANIFEST.json`

All ten `requiredFiles` were resolved and **verified byte- and SHA-256-identical** to the
manifest declarations (scripted `crypto.createHash("sha256")` comparison; no file was
missing, so no reference was invented).

| Reference | Resolved canonical path | Local project copy |
|---|---|---|
| BRD | `…\uiux-pro-max-frontend-v2\project-reference\BRD-FIN-001-EN.md` (26,323 B) | `BRD-FIN-001-EN.md` — identical |
| SRS | `…\project-reference\SRS-FIN-001-EN.md` (45,373 B) | `SRS-FIN-001-EN.md` — identical |
| Original design guide | `…\project-reference\DESIGN-SYSTEM.md` (42,468 B) | `DESIGN-SYSTEM.md` — identical |
| Semantic tokens (JSON) | `…\project-reference\design-tokens.json` (6,930 B) | `design-tokens.json` — identical |
| Tokens (CSS) | `…\project-reference\design-tokens.css` (6,291 B) | `design-tokens.css` — identical |
| Bilingual copy | `…\project-reference\ui-copy.json` (24,864 B) | `ui-copy.json` — **divergent, see below** |
| Fake data | `…\project-reference\fake-data.json` (21,640 B) | `fake-data.json` — identical |
| Route contract | `…\uiux-pro-max-frontend-v2\ROUTES.json` (12,678 B) | `ROUTES.json` — identical |
| Reviewed v2 MASTER | `…\design-system\financial-workspace\MASTER.md` (15,013 B) | `DESIGN-MASTER.md` — identical |
| Vendor skill | `…\vendor\ui-ux-pro-max\SKILL.md` (16,183 B) | read in place (not copied) |

**Documented divergence — `ui-copy.json`:** the local file (12,153 B) is the earlier
nested bilingual schema (`meta/app/shell/nav/routes/…` with per-key `{ar,en}` objects);
the handoff file (24,864 B) is a locale-rooted schema (`{en:…, ar:…}` with dotted keys
as literals). The two schemas are structurally incompatible, and every dotted route-title
key the app resolves (`routes.dashboard.title`, `nav.*`, `placeholder.*`, …) exists only
in the local schema. Adopting the handoff file as-is would break `src/lib/copy.ts` and
all screen titles. The local file is therefore retained intentionally; the swap is a
planned, isolated copy-migration task (not a blocker for Prompt 01 page work) and must be
done together with `copy.ts`, not by overwriting one file.

The vendor skill's searchable guidance (accessibility, forms, navigation, tables,
minimal-enterprise direction) was reused for the shell/nav/table work; no freshly
generated palettes or competing token sets were introduced. Canonical token values come
from `design-tokens.css`/`design-tokens.json`; `src/global.css` only declares **aliases**
(`--color-primary: var(--action-primary-bg)`, etc.) so component code keeps readable
names while original values remain authoritative (including the dark-theme overrides
already present in the token file).

## 2. Preservation and rollback (item 2)

- The existing scaffold, `HashRouter` strategy, and all reusable components
  (`Badge`, `Button`, `Callout`, `Card`, `DataTable`, `EmptyState`, `Field`) were
  preserved; no application was deleted or restarted.
- A pre-edit snapshot of the Prompt 00 state (42 files) exists at
  `C:\Users\HP\.copilot\session-state\f1a3022c-e06e-4d1c-be36-a49e694f0eec\files\foundation-rollback`.
  Rolling back = copy that directory's contents over the project root (it contains the
  root references, `package*.json`, and the full `src/` tree as they were before the
  alignment edits).
- No unrelated files were modified and no unrelated Node service was terminated. The
  Vite dev server on `http://localhost:5174/` was left running throughout.

**Files changed or created relative to the rollback snapshot**

| Status | File | Change |
|---|---|---|
| modified | `src/lib/decimal.ts` | `percentageVariance` ×100 fix (defect 1) |
| modified | `src/lib/format.ts` | bidi-mark stripping in dates (defect 2) |
| modified | `src/shell/AppShell.tsx` | skip-link fix, `main` tabIndex, sidebar visibility, desktop padding, drawer focus return (defects 3, 6, 7) |
| modified | `src/shell/SidebarNav.tsx` | duplicate group-heading suppression (defect 8) |
| modified | `src/routes/RequirePermission.tsx` | fail-closed empty permission list (defect 4) |
| modified | `src/routes/pages/DashboardPage.tsx` | quota rendered as row counts, comment fix (defect 5) |
| new | `src/lib/decimal.test.ts` | 5 regression tests for variance |
| new | `src/routes/registry.test.ts` | 6 route-contract/access tests |
| modified | `src/lib/format.test.ts` | +4 date/bidi tests (9 total in file) |
| modified | `FOUNDATION-ALIGNMENT.md` | this report |
| created | `verification/vitest-report.json` + 12 `verify-*.png` | retained evidence |

Earlier foundation-alignment changes (documented previously, also covered by the
snapshot): `src/data/{schemaAdapter,repository,selectors,reconciliation,allocations,types}.ts`,
`src/data/foundation.test.ts`, `src/routes/{registry,AppRoutes,RoutePlaceholder}.tsx`,
`src/shell/{ContextBar,Breadcrumbs}.tsx`, `src/state/DemoProvider.tsx`, `src/lib/{copy,hooks}.ts`,
`src/global.css`, `ROUTES.json`, `DESIGN-MASTER.md`, `package.json` (added `test` script).

## 3. Canonical Atlas/Cedar/USD data (item 3)

The canonical `fake-data.json` is loaded through the documented schema adapter
(`src/data/schemaAdapter.ts`), which keeps stable IDs (`ENT-ATLAS`, `ENT-CEDAR`,
`USR-MAYA/OMAR/LINA/NOOR`, `BNK-001…006`, `LED-001…008`) and exact decimal strings.
No synthetic balancing plug exists (15 trial-balance rows, no 9999/rounding row).
Re-derived independently with scaled-integer arithmetic (not floats):

| Assertion | Result |
|---|---|
| Trial-balance signed sum | **0.00** ✓ |
| Net revenue | **128,000.00** ✓ |
| Net profit | **21,500.00** ✓ |
| Total assets | **332,200.00** = 143,000.00 liabilities + 189,200.00 equity ✓ |
| Bank / book movements | **6 / 8** ✓ |
| Bank roll-forward 100,000.00 + 0.00 | closing **100,000.00** ✓ |
| Book roll-forward 100,000.00 + 2,200.00 | closing **102,200.00** ✓ |
| Adjusted bank / book | **102,000.00 / 102,000.00** ✓ |
| Unexplained residual | **0.00** ✓ |
| Proposed fee journal (200.00) | `status: notPosted`; baseline reports unchanged ✓ |

Lina (`subscriptionOwner`, empty entity scope) receives **no financial content**: her
dashboard/reports/reconciliations render the access-denied state and repository reads
return scope-filtered empty results (identity ≠ permission). Her allowed
`/app/settings/billing` screen is an honest placeholder with no finance context.
`src/data/foundation.test.ts` locks all of the above, including the approval predicates
evaluated against the scenario-adjusted object, and allocation tests covering **negative
(outgoing) payments** with explicit rejection of invalid/excessive allocations (no
silent success).

## 4. Defects found in the actual code and fixed (items 4–8)

Inspection of the real files (not assumed history) surfaced eight concrete defects:

1. **Variance shown as bare ratio** — `percentageVariance` re-scaled its ratio ×10^4
   result down by 10^2, dropping the ×100: revenue variance rendered `0.06%` instead of
   `6.67%`. Fixed in `src/lib/decimal.ts`; tests in `decimal.test.ts` (sign, zero base →
   `null`, large exact values, BHD 3-decimals).
2. **Garbled date range in RTL** — `Intl.DateTimeFormat` injects invisible U+200F/U+200E/
   U+061C marks into Arabic patterns; inside the LTR-isolated number box the October
   range rendered as `012026/10/31 — …`. `formatDate`/`formatDateTime` now strip bidi
   marks (locale order unchanged: `01/10/2026 — 31/10/2026`). Number output was verified
   clean (marks stripped only where Intl emits them).
3. **Skip link broke HashRouter** — clicking `#main-content` rewrote `location.hash`,
   navigated to `/main-content`, and rendered the 404 page (proved in-browser before the
   fix). Now `preventDefault` + focus/scroll to `<main id="main-content" tabIndex={-1}>`.
4. **Permission guard failed open** — `RequirePermission` treated an empty required-
   permission list as "unrestricted". Now fail-closed (`permissions.length > 0 && …`);
   `registry.test.ts` asserts no permissioned route has an empty list (none currently
   does, so no visible route changed).
5. **Quota shown as currency** — the subscription card formatted row counts (18,240 /
   100,000) as USD amounts with a wrong "SAR" comment. Now formatted as counts via
   `f.count()` with a corrected comment referencing the fixture's `usageUnit`.
6. **No desktop navigation at all (critical)** — the sidebar `<aside>` carried an inline
   `display: none` with no overriding desktop rule and the mobile toggle was also hidden
   at ≥1024px: computed result was 0 of 11 nav links visible and zero pointer navigation
   (confirmed via CDP `getComputedStyle` before the fix). Removed the inline `display:
   none`, removed the inline `padding-inline-start: 0`, and added
   `@media (min-width:1024px){ #main-content { padding-inline-start: var(--size-sidebar-width) } }`
   (logical property → mirrors in RTL). After fix: sidebar 248 px, 11/11 links visible,
   content column offset with no overlap.
7. **Drawer focus not restored** — the mobile drawer now focuses its close button on
   open, closes on Escape, and returns focus to the toggle that opened it (reviewed
   MASTER §5), via `navToggleRef`/`drawerReturnFocusRef`.
8. **Duplicate navigation labels** — five of seven sidebar groups rendered a heading
   identical to their single link's title ("التقارير / التقارير"). Group headings are
   now suppressed when they would only repeat the sole link (no copy invented; both
   languages checked).

Design direction (item 4) was followed throughout: token aliases instead of new
palettes, logical properties for RTL, skill guidance reused for navigation/forms/table/
a11y patterns; page-level layouts are deferred to the individual page prompts as
instructed.

## 5. Amount formatter (item 5)

`formatAmount` parses to exact decimal minor units per currency
(`CURRENCY_PRECISION`: USD/SAR 2, BHD 3) and formats once at the final render step, so
fractions are never appended twice. Tests (`src/lib/format.test.ts`, 9 tests) cover:
English USD `125000.00` → `125,000.00`; negative (`−1,234.50`), zero, and a 21-digit
large value; Arabic-Indic separators/numerals (`١٢٥٬٠٠٠٫٠٠`); three-decimal BHD
(`1,234.567`) without changing USD precision; and rejection of over-precise input.
Baseline currency behavior is unchanged.

## 6. Route registry reconciliation (item 9)

`src/routes/registry.ts` derives every route from `ROUTES.json` (single source of
truth); `registry.test.ts` asserts a 1:1 path set match, unique ids/paths, dynamic
logical path resolution, and that auth (`/auth/*`), onboarding, public (`/`, `/pricing`,
legal, support), and error routes (`/403`, `/404`, `/session-expired`) live **outside**
the protected `/app` shell. The existing `HashRouter` strategy is preserved; the
documented mapping is logical path `/app/overview` → browser URL
`http://host/#/app/overview` (the `#` segment carries the logical path unchanged).
Future screens remain honest `RoutePlaceholder` entries labeled "coming in a later
release"; `integrations` stays stage "S" because ROUTES.json describes it as "only
local subsequent-release configuration preview".

## 7. Verification performed (item 10)

Repeatable commands (both green at report time):

```
npm.cmd test            # vitest run → 5 files, 34 tests passed
npm.cmd run build       # tsc --noEmit && vite build → success
npx vitest run --reporter=json --outputFile=verification/vitest-report.json
```

Browser verification used locally installed headless Chrome via the DevTools protocol
(port 9222); no browser-policy restriction was bypassed. Retained evidence in
`verification/`:

| Evidence | Result |
|---|---|
| `verify-01-overview-ar.png` | revenue 128,000.00, profit 21,500.00, variance **6.67%** (old 0.06% gone), range `01/10/2026 — 31/10/2026`, quota as counts, no bidi marks |
| `verify-02/03/07-…-denied.png` | Lina denied on reports/overview/reconciliations; no financial leakage in DOM or screenshots |
| `verify-08-lina-billing-allowed.png` | billing placeholder allowed, no finance context |
| `verify-04-sign-in-public.png`, `verify-06-pricing-public.png`, `verify-05-403.png`, `verify-09-not-found.png` | public/auth/error routes render outside the shell; 404 title "الصفحة غير موجودة" |
| `verify-10-desktop-shell-sidebar.png` | desktop 1440px: sidebar 248 px, 11/11 links, no content overlap; nav click → `#/app/reports` with `aria-current` |
| `verify-11/12-mobile-…png` | 375px: no horizontal scroll, drawer `aria-modal=true` labelled "القائمة الرئيسية", focus on "إغلاق القائمة", Escape closes and returns focus to "فتح القائمة" |
| keyboard probe (CDP `Input`) | first Tab stop = skip link; activating it keeps `#/app/overview` and focuses `#main-content` |
| `verification/vitest-report.json` | machine-readable test report |

Pre-fix screenshots (`maya-dashboard.png`, `check-overview.png`, legacy
`lina-reports-denied.png`) were retained deliberately as before-evidence.

## 8. Remaining limitations (honestly unverified)

- **Not verified:** screen-reader announcement order/labels (no SR audit), full WCAG
  contrast matrix, 320 px width / 400 % zoom reflow, the dark theme in-browser, and
  production security (this is a local mock; there is no backend to secure).
- Nav items are **not permission-filtered**: a restricted persona sees the same nav
  list and receives the in-page access-denied state instead (Lina verified: no data
  leaks; a future prompt may filter nav by permission for less noise).
- `DemoControls` is fixed at the bottom-inline-start corner; on short viewports it can
  overlap the sidebar's last items.
- The subscription `usageUnit` string ("Successfully imported transaction rows") is
  English-only inside the Arabic UI; the fixture provides no translation and none was
  invented.
- `npm audit` advisories were not assessed in this run.
- The local vs handoff `ui-copy.json` schema divergence (section 1) still needs a
  deliberate copy-migration if/when the handoff copy is adopted.
- Route access checks are prototype-level guards on mock data, not authorization.

## 9. Readiness for Prompt 01

**Ready.** The foundation passes type-check, production build, and 34 regression tests;
canonical Atlas/Cedar figures are verified and locked by tests; the shell (desktop and
mobile), access guard, formatting, and route registry are verified in a real browser.
Prompt 01 (`sign-in`) can replace its `RoutePlaceholder` body without touching the
shell, tokens, mock layer, or tests. No uploads, payments, email, or journal posting
exist, and none were performed.
