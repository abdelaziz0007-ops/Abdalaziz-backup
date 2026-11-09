# Financial Platform Design System

**Version 1.0.0 · Proposed design baseline · 29 October 2026**

| Field | Value |
|---|---|
| Product | Financial reporting, analysis, and bank reconciliation SaaS |
| Source of truth for behavior | [SRS-FIN-001](references/SRS-FIN-001-EN.md) |
| Source of truth for business scope | [BRD-FIN-001](references/BRD-FIN-001-EN.md) |
| Documentation language | English, following the latest document-language preference |
| Product locales | Arabic-first RTL; English LTR |
| Themes | Light default; dark supported |
| Density | Comfortable default; compact desktop optional |
| Status | Ready for design review and implementation planning; brand choices require confirmation |

## 1. Deliverables and Boundaries

This system defines foundations, implementation tokens, reusable component contracts, product patterns, screen specifications, accessibility, localization, and governance.

- [Interactive visual reference](../front/index.html): foundations, components, financial reporting, reconciliation, import, and review examples; Arabic/English, light/dark, and density controls.
- [Design tokens](../front/design-tokens.json): structured primitives, semantic themes, dimensions, typography, motion, and layers.
- [CSS variables](../front/design-tokens.css): generated implementation variables.
- [Contrast audit](contrast-audit.json): computed contrast checks for 38 solid-color pairs.
- [UI content dictionary](../front/ui-copy.json): sample Arabic/English product language.
- [Handoff and validation](HANDOFF.md): delivery map, evidence, and implementation checklist.

The visual reference uses synthetic data and local demonstrations. It does not upload, process, approve, or transmit financial records. It is not a production application or a native Figma library. The component contracts below are the full specification; the visual reference illustrates representative components and core workflows rather than every permutation.

## 2. Design Intent

**Precise, calm, accountable.** The interface should feel like a reliable financial workspace. Emphasize the current entity, period, data quality, and next decision; avoid decorative financial imagery, excessive gradients, and badges without meaning.

1. **Evidence before confidence:** Every figure exposes provenance. A similarity score never implies correctness.
2. **Decisions remain explicit:** Suggestions, confirmed matches, and approved reconciliations have different states and language.
3. **Density serves comprehension:** Optimize for repeated review without hiding required labels or shrinking text excessively.
4. **No silent changes:** Preserve source values, disclose transformations, and invalidate stale approvals.
5. **Accessible by default:** Keyboard, screen-reader, localization, zoom, and contrast requirements are component contracts.
6. **Stable context:** Entity, period, currency, version, and status remain visible at financial decision points.

### Proposed visual identity

Use “Financial Workspace” as a neutral placeholder product name. The visual reference includes a simple geometric “F” monogram only as a temporary mark. Final company name, trademark review, logo, and brand ownership are open decisions.

- Navy communicates primary action and navigation.
- Teal indicates successful validation or confirmed matching, accompanied by text and an icon.
- Amber indicates warnings and unresolved suggestions.
- Red indicates blocking errors, destructive actions, or an unexplained difference.
- Violet indicates a human-review workflow, not a financial outcome.
- Neutral gray indicates drafts, inactivity, and secondary structure.

## 3. Token Architecture

### 3.1 Layers and ownership

1. **Primitive:** Raw palette and scale values, such as `navy.950`.
2. **Semantic:** Roles, such as `action.primary.bg` and `status.warning.fg`.
3. **Component:** Local aliases, such as a button background referencing `action.primary.bg`.

Product components consume semantic variables rather than hard-coded palette values. A component requiring a new color first requests a semantic role. Tokens are plain JSON with a documented schema; no DTCG interoperability claim is made.

Naming: lowercase dot-separated semantic names in JSON; hyphenated CSS variables. Example: `surface.panel` → `--surface-panel`. Primitive example: `--color-navy-950`.

### 3.2 Key light/dark pairs

| Role | Light | Dark | Usage |
|---|---|---|---|
| Canvas | #F1F5F9 | #020617 | Overall workspace |
| Panel | #FFFFFF | #0F172A | Cards, tables, dialogs |
| Subtle surface | #F8FAFC | #1E293B | Headers, grouped fields |
| Primary text | #0F172A | #F8FAFC | Titles, amounts, main content |
| Secondary text | #475569 | #CBD5E1 | Descriptions and metadata |
| Decorative border | #E2E8F0 | #334155 | Non-essential panel separation |
| Control boundary | #64748B | #94A3B8 | Input and secondary-button identification |
| Primary action | #172554 | #BFDBFE | One leading action per region |
| Primary action text | #FFFFFF | #172554 | On primary buttons |
| Focus ring | #2563EB | #93C5FD | Keyboard focus |
| Success foreground / background | #0F766E / #F0FDFA | #5EEAD4 / #042F2E | Valid, confirmed, complete |
| Warning foreground / background | #92400E / #FFFBEB | #FCD34D / #451A03 | Needs review, suggested |
| Danger foreground / background | #B91C1C / #FEF2F2 | #FCA5A5 / #450A0A | Blocking errors, destructive actions |
| Info foreground / background | #1D4ED8 / #EFF6FF | #93C5FD / #172554 | Processing and information |
| Review foreground / background | #6D28D9 / #F5F3FF | #C4B5FD / #2E1065 | Under human review |

Subtle borders are not sufficient to identify interactive controls; use the control-boundary token where the boundary is necessary. Status foregrounds work with their paired backgrounds. Do not reuse a foreground on arbitrary fills without checking contrast.

### 3.3 Chart colors

| Semantic series | Light | Dark | Persistent meaning |
|---|---|---|---|
| Bank / primary series | #1D4ED8 | #93C5FD | Bank side or first measure |
| Books / secondary series | #0F766E | #5EEAD4 | Book side or second measure |
| Comparative series | #6D28D9 | #C4B5FD | Comparative period |
| Exception series | #92400E | #FCD34D | Exceptions requiring attention |

Pair series with direct labels, symbols, or line patterns. A favorable variance is determined by metric semantics, not by its positive sign. Higher expenses are not automatically favorable. Diverging charts must include a zero reference.

## 4. Typography, Icons, and Imagery

### 4.1 Fonts

- Latin default: operating-system UI stack, including Segoe UI on Windows.
- Arabic intended face: Noto Sans Arabic; Tahoma and Arial fallbacks.
- Numbers and technical identifiers: Segoe UI or Arial with tabular numerals where available.
- No runtime font download is required by the reference. For exact cross-device consistency, package licensed font files and verify their license during implementation.
- Arabic uses normal letter spacing; never apply Latin uppercase tracking to Arabic.
- Review Arabic ascenders, descenders, vowel marks, and mixed-script line boxes before release.

Noto Arabic family reference: [Noto Fonts Arabic](https://notofonts.github.io/arabic/).

### 4.2 Type scale

| Token | Size / line height | Weight | Application |
|---|---|---|---|
| display | 40 / 52 px | 600 | Design reference or exceptional overview title |
| h1 | 32 / 44 px | 600 | Page title |
| h2 | 24 / 36 px | 600 | Section title |
| h3 | 20 / 30 px | 600 | Panel title |
| body | 16 / 26 px | 400 | Main explanations and forms |
| bodySmall | 14 / 24 px | 400 | Tables and supporting content |
| label | 14 / 22 px | 500 | Field and control labels |
| caption | 12 / 20 px | 400 | Non-critical metadata |
| metric | 32 / 44 px | 600 | Important financial values |

Use rem equivalents in production and respect browser zoom. Financial amounts and error instructions must not be reduced to caption text. Dense tables remain at least 14 px. Arabic line height may increase to 1.8 when needed without clipping controls.

### 4.3 Icons

Use a consistent 24 px outline grid, 1.75–2 px stroke, rounded joins. Render at 16, 20, or 24 px. Icons supplement labels. Icon-only controls require an accessible name and a 40 px desktop hit area, increasing to 44 px for touch. Tooltips do not replace accessible names.

Recommended semantic shapes: check for confirmed; warning triangle for suggestion; error circle for blocking issue; lock for approved version; file for source; clock for outstanding; link for allocation; shield for access control. Directional arrows mirror with locale; check marks, locks, document icons, and brand marks do not.

Do not use stock photos or illustrations inside financial decision workspaces. A small neutral empty-state illustration is optional and must not replace an explanation or action.

## 5. Spacing, Shape, Elevation, and Motion

### 5.1 Spacing

Base unit: 4 px. Supported steps: 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, and 96 px.

- Field label to control: 8 px.
- Control to help/error: 4–8 px.
- Related field gap: 16 px.
- Panel padding: 24 px desktop; 16 px mobile.
- Section gap: 32 px desktop; 24 px mobile.
- Page padding: 32 px desktop; 16 px mobile.
- Inline icon to label: 8 px.

### 5.2 Shape and borders

Radius: 4 px for small elements; 8 px for controls; 12 px for panels; 16 px for dialogs; pill only for statuses and chips. Use 1 px borders, 2 px active emphasis where needed, and a 3 px focus outline with 3 px offset.

### 5.3 Elevation and layers

Flat panels use borders. Use shadow-sm for minor elevation, shadow-md for dropdowns and drawers, and shadow-lg for modals. In dark mode, preserve border separation rather than relying on shadows.

Layer order: base 0; sticky 10; dropdown 20; drawer 30; modal 40; toast 50; tooltip 60. Native modal dialogs use the browser top layer. No unrelated element may obscure a modal’s focus or actions.

### 5.4 Motion

120 ms hover; 180 ms state transition; 240 ms drawer. Easing: `cubic-bezier(0.2, 0, 0, 1)`. Never animate monetary amounts while users compare them. No confetti, automatic carousels, or distracting financial-success effects. Honor reduced-motion preferences by removing non-essential movement and using static loading labels.

## 6. Layout and Responsive Behavior

### 6.1 Application shell

Desktop: 248 px sidebar, 64 px top bar, flexible content with a 1440 px preferred maximum. A 72 px collapsed sidebar is optional, but labels remain available to assistive technology. Wide reconciliation tables may use full available width.

Navigation: Overview; Data & Imports; Reports; Reconciliations; Reviews; Audit Trail; Settings. Billing and team management appear only to relevant roles. Always retain a clear current entity and period. Switching entity must prompt for unsaved changes and clear incompatible selections and cached figures.

### 6.2 Breakpoints

| Range | Grid / behavior |
|---|---|
| Below 640 px | 4-column conceptual grid, 16 px margin; navigation becomes a labeled menu; actions stack |
| 640–767 px | 8-column conceptual grid; cards may form two columns if labels remain readable |
| 768–1023 px | Compact navigation; forms remain one or two columns based on content |
| 1024–1279 px | Sidebar and desktop content; reconciliation may switch to one active pane |
| 1280 px and above | 12-column grid; two reconciliation panes and optional detail drawer |
| 1536 px and above | Centered general content; wide data workspaces may expand |

Gutters: 16 px mobile, 24 px desktop. Avoid fixed widths that prevent reflow at 320 CSS px. A genuinely two-dimensional financial table may scroll horizontally within a named region; the surrounding page must reflow.

### 6.3 Density

Comfortable: 48 px table rows, 40 px controls. Compact desktop: 40 px rows, 36 px controls, no font-size reduction. Touch: 56 px rows where interactive, 44 px minimum action targets. Density cannot remove mandatory source, currency, status, or error information.

## 7. Component Contract Convention

Every component defines anatomy, variants, states, keyboard behavior, content rules, and acceptance. Universal states: default, hover, focus-visible, pressed/selected, disabled, loading, error, and read-only where applicable. Disabled and read-only are distinct: read-only values remain legible and copyable; disabled actions have a nearby persistent explanation when the reason matters.

### C-01 Button and Icon Button

- Anatomy: optional leading icon, label, optional trailing icon; spinner replaces the icon during processing.
- Variants: primary, secondary, ghost, destructive; sizes 36/40/48 px.
- Label with a verb and object: “Upload files,” “Send for review,” “Reopen version.” Avoid generic “OK.”
- Loading preserves width, exposes busy state, and prevents repeated submission. A disabled button cannot be the sole place to discover a blocking error.
- Enter/Space activate native buttons; focus remains visible. Destructive actions use explicit confirmation for irreversible effects.

### C-02 Text Field, Amount Field, and Textarea

- Anatomy: persistent label, optional required indicator, control, unit/prefix, help, inline error.
- Types: text, email, search, reference, signed amount, multiline reason.
- Validate on blur and submit; avoid errors on untouched fields. On submit, focus an error summary linking to invalid fields.
- Amount inputs accept localized separators only under an explicit locale parser, reject ambiguous mixed formats, preserve sign, and show currency separately. Never silently strip meaningful characters or leading zeros from identifiers.
- Link help/error through `aria-describedby`; errors use `aria-invalid`. Do not use placeholder-only labels.

### C-03 Select and Searchable Combobox

- Use a native select for small lists. Large account/entity lists use a tested combobox with search, loading, no-results, and selected state.
- Keyboard: arrows navigate, Enter selects, Escape closes, typing searches. Preserve selected value when filtering.
- Account options show code and name; entity options show full entity name. No implicit cross-entity changes.
- Production custom combobox must follow the applicable WAI-ARIA pattern and be tested, not improvised from a generic div.

### C-04 Checkbox, Radio, and Switch

- Checkbox: independent or bulk selection, including indeterminate state.
- Radio: one of a visible set of mutually exclusive choices.
- Switch: immediate reversible preference, such as theme; not approval or deletion.
- The entire label is a target. Space toggles; arrows move through native radio groups. Bulk-selection text specifies whether it affects the current page or all filtered records.

### C-05 Date Range, Period, Currency, and Entity Context

- Keep accounting date separate from timestamp and bank value date.
- Period selector shows start and end, fiscal context, and closed state. Currency is an ISO code alongside localized formatting.
- Manual date entry is available; date pickers support keyboard access. Clarify interpretation before accepting ambiguous dates.
- Context change during unsaved work offers save, discard, or cancel; it never approves or overwrites data.

### C-06 File Uploader and Import Job

- Anatomy: labeled drop zone, browse button, accepted formats and limits, selected file list, per-file status, remove/retry controls.
- States: idle, dragging, selected, uploading, scanning, extracting, needs review, failed, ready, published, canceled.
- Drag-and-drop always has a keyboard-accessible browse alternative. Upload does not mean publication.
- Show filenames safely as text; no executable previews. Client validation supports usability; server validation remains authoritative.
- Progress is determinate only when measurable. Otherwise use a labeled indeterminate state. Retry references the same job and does not double charge.

### C-07 Data Table

- Anatomy: caption/title, filters, header, body, selection column when needed, pagination, totals, state region.
- Native table semantics by default; sortable headers use buttons and `aria-sort`. Row links and selection controls are separate targets.
- Numeric columns align consistently at the inline end; amounts use tabular digits and isolated LTR formatting. Preserve account codes as text.
- States: loading skeleton with accessible label, data, empty, no filter results, error, partial data, selected rows, locked/read-only.
- Frozen headers must not hide focused rows. Sticky account/amount columns need visible scroll cues without overlap.
- Pagination defaults to 25/50/100. Virtualization is an implementation option only after keyboard and screen-reader verification. State the total count and visible range.
- Bulk actions include a count and preview. No default selection of suggestions. Do not make the whole row an ambiguous approval target.

### C-08 Status Badge and Filter Chip

- Badge: non-interactive icon + text; no hover affordance. Chip: removable or selectable control with an accessible name.
- Financial states must use the vocabulary in Section 8, not ad hoc synonyms.
- Rounded badges do not carry uncalibrated numeric confidence. Multi-line labels must remain legible at zoom.

### C-09 Alert, Error Summary, Toast, and Progress

- Alert: persistent information with title, explanation, and corrective action. Blocking issues remain visible until resolved.
- Error summary: focused after invalid submission; links to each invalid field.
- Toast: transient confirmation for non-critical events only; polite live region; no sensitive account data. Critical actions never depend solely on toast content.
- Progress: label and count/percentage when known; use `aria-busy` on the affected region and announce milestones, not every percentage update.

### C-10 Tabs and Navigation

- Navigation links change pages; tabs switch related content in-place. Use the correct semantics.
- Tabs support arrows, Home/End, and Enter/Space in manual activation. Preserve logical focus order in RTL.
- Active navigation has text emphasis and a shape/indicator, not color alone. Breadcrumbs show meaningful hierarchy, excluding redundant full application trees.

### C-11 Dialog and Confirmation

- Sizes: 440/640/880 px maximum with 16 px mobile margins and an internally scrollable body when necessary.
- Anatomy: heading, description, consequences, optional required reason, cancel, explicit confirm.
- Move focus inside; make background inert; trap focus; Escape closes non-destructive dialogs; restore focus to the trigger.
- Initially focus the safe action for destructive operations. Never confirm on outside click or accidental Enter in a reason field.
- Approval confirmation shows entity, period, currency, version, preparer, blocking-check results, and whether entries are merely proposed.

### C-12 Drawer and Source Inspector

- Desktop 480 px; smaller screens full width. A contextual non-modal inspector allows continued work; a modal drawer must use full dialog focus behavior.
- Contents: source file, worksheet, row, original values, transformation, formula/rule version, actor, and link to authorized source.
- Scope every source link to the current permission context. Show “Source unavailable” rather than substitute another version.

### C-13 Tooltip and Popover

- Tooltip supports hover and focus, is dismissible with Escape, and contains short non-interactive help.
- Popover holds interactive details and needs predictable focus and close behavior.
- Required business restrictions and missing-data explanations remain visible without hover.

### C-14 Metric Card and Variance

- Anatomy: label, currency/unit, value or unavailable state, comparative period, variance, formula/source action.
- Display full values on detail/export; abbreviations such as 1.2M require an exact accessible value.
- Loading, unavailable, zero, stale, partial-period, and negative-base states differ.
- A green increase is allowed only when favorable under an approved metric definition. Use neutral text otherwise.

### C-15 Chart and Accessible Data View

- Required title, unit, period, labeled axes, legend, and exact-value table or summary.
- Bars begin at zero; negative values cross a marked zero baseline. Distinguish gaps from zero. Do not interpolate absent accounting periods silently.
- Bank/Books series retain semantic colors. Touch and keyboard users access data without hover.
- States: loading, empty, unavailable, partial, error. Comparisons explain different scopes. No decorative pie chart for many account categories.

### C-16 Reconciliation Match Card

- Shows bank and book members, signed amounts, date basis, references, rule, allocation, residual, and state.
- “Suggested match” remains amber until a permitted decision. An exact unique R-01 match may be confirmed by the engine but is not an approved reconciliation.
- Grouped suggestions show every member and total; approval is never preselected. Partial allocation shows allocated and remaining amounts explicitly.
- Accept, reject, and unmatch record actor and reason according to policy; locked items expose a reopening path, not an editable control.

### C-17 Reconciliation Summary

- Separate bank statement balance, book balance, each side’s adjustments, adjusted balances, and unexplained difference.
- Show full currency precision. A zero difference means “Balanced,” not “Approved.” Outstanding timing items remain visible.
- Blocking difference uses danger text and persistent explanation. Proposed journal entries have an explicit “Not posted” label.

### C-18 Mapping Editor and Quality Issue

- Mapping editor shows account code/name, current line item, proposed line item, unmapped state, mapping version, and impact preview.
- Quality issue shows severity, rule, file/row/field, original and parsed values, correction options, excluded-record count, and totals impact.
- User corrections never replace originals. Recalculate affected outputs and invalidate stale review readiness.

### C-19 Review Card, Timeline, and Version History

- Show preparer, version, data fingerprint/reference, checks, reviewer, decision time, and reason.
- Timeline is chronological, with absolute timestamp and timezone; relative time is supplementary.
- Cannot approve own work or an obsolete version. “Request changes” records a reason. Reopening creates a successor version and preserves the original.

### C-20 Empty State, Skeleton, and Error State

- Empty: describe what is missing and a permitted next action. Distinguish no data from no results after filtering.
- Skeleton reserves layout; do not show fake monetary zeros while loading.
- Error: describe impact, safe retry, and support reference without raw server traces or personal data.
- Permission denied never reveals whether a foreign entity/file exists. Stale data shows last update and what actions are blocked.

### C-21 Pagination, Search, and Filters

- Search labels its scope; use an explicit submit or a 300 ms debounce with announced results. Escape may clear only where documented.
- Filter chips are removable and expose a clear-all action. Preserve filters on returning from an inspector.
- Page changes retain meaningful focus; changing page size resets to a valid page. “Select all” is scoped and labeled.

### C-22 Subscription, Quota, and Access Banner

- Show plan, used and remaining units, reset date, and what the unit means.
- At limits, explain the blocked action and authorized upgrade path without deleting drafts.
- Support access banner shows purpose, expiry, and authorized scope. Mask sensitive identifiers by default.

## 8. Domain Status Language

| Domain | State | Visual treatment | User meaning |
|---|---|---|---|
| Import | Uploaded / scanning / extracting | Info + progress label | Not yet usable data |
| Import | Needs review | Warning + triangle | Parsing or quality requires a decision |
| Import | Failed | Danger + error icon | Import did not complete |
| Import | Ready | Neutral + file/check | Validated, awaiting publication |
| Import | Published | Success + check | Active dataset |
| Matching | Confirmed | Success + check | Transaction allocation confirmed |
| Matching | Suggested | Warning + triangle | Human review required |
| Matching | Ambiguous | Warning + multiple-candidate label | No unique candidate |
| Matching | Unmatched | Neutral + dash | No accepted allocation |
| Matching | Partially allocated | Info + explicit residual | Part remains available |
| Matching | Excluded | Neutral + reason | Retained but outside matching scope |
| Report/reconciliation | Draft | Neutral + file | Editable and not approved |
| Report/reconciliation | Ready for review | Info + arrow | Checks passed; awaiting review |
| Report/reconciliation | Under review | Review + user/clock | Awaiting reviewer decision |
| Report/reconciliation | Rejected / changes requested | Warning + return arrow | Reason and next action required |
| Report/reconciliation | Approved and locked | Success + lock | Version fixed by authorized approver |
| Report/reconciliation | Superseded | Neutral + version reference | Historical approved version retained |
| Reconciliation calculation | Balanced | Success + equality/check | Adjusted balances agree; not necessarily approved |
| Reconciliation calculation | Unexplained difference | Danger + amount | Final approval blocked |

Never collapse “Suggested,” “Confirmed,” “Balanced,” and “Approved” into one success state.

## 9. Financial Formatting and Localization

### 9.1 Numbers and dates

- Always show ISO currency code in context and exports. Two decimal places are sample USD formatting, not a global rule.
- Separate numerical value, currency, and locale formatting. Exact decimals remain a backend responsibility.
- Tables use full precision. Negatives use a minus sign or accounting parentheses under one explicit entity policy; do not mix conventions silently.
- Null displays “Unavailable / غير متاح”; zero displays a genuine zero; not applicable displays “Not applicable / لا ينطبق.”
- Percentage variance: disclose formula and zero/negative baseline behavior. Changes in percentages may require percentage-point units.
- Show absolute dates such as “31 Oct 2026 / 31 أكتوبر 2026”; avoid ambiguous 03/04. Timestamp detail includes timezone.
- Uploaded reference codes are text. Never translate, reshape, or remove leading zeros from them.

### 9.2 Bidirectional behavior

- Set page `lang` and `dir`; use logical CSS properties: inline-start/end, block-start/end.
- RTL sidebar moves to the right; forms and navigation follow reading order. DOM order remains semantic rather than being reversed with CSS alone.
- Wrap amounts and mixed references in directional isolation, for example `<bdi dir="ltr">USD 12,450.00</bdi>`.
- Numerical columns align at a consistent end edge. Chronological chart axes keep a documented, consistent time direction; do not silently reverse data series on locale change.
- Mirror directional chevrons and step progression, not checks, logos, locks, or chart values.
- Never truncate monetary amounts or essential error messages. Long Arabic labels wrap; identifiers may use an accessible copy control and full detail view.
- Allow at least 30–40% text expansion in layouts, then verify with real Arabic strings. Translation is semantic, not word-for-word abbreviation.

### 9.3 Content tone

Use short, direct, non-accusatory instructions. Say what happened, its effect, and how to proceed. Avoid “100% accurate,” “fraud detected,” and “AI approved.” Financial recommendations distinguish evidence, arithmetic, and hypotheses.

| English | Arabic | Context |
|---|---|---|
| Upload files | رفع الملفات | Import action |
| Review data issues | مراجعة مشكلات البيانات | Quality workflow |
| Suggested match | مطابقة مقترحة | Not confirmed |
| Confirmed match | مطابقة مؤكدة | Allocation confirmed |
| Remaining amount | المبلغ المتبقي | Partial allocation |
| Unexplained difference | فرق غير مفسر | Reconciliation block |
| Balanced, awaiting review | متوازنة، بانتظار المراجعة | Not approved |
| Send for review | إرسال للمراجعة | Preparer action |
| Approve and lock | اعتماد وإقفال | Independent approver action |
| You cannot approve your own work. | لا يمكنك اعتماد العمل الذي أعددته. | Segregation of duties |
| Data changed. Review the new version. | تغيرت البيانات. راجع الإصدار الجديد. | Stale approval |
| Proposed entry — not posted | قيد مقترح — لم يُرحّل | Journal proposal |
| Source unavailable | المصدر غير متاح | Inspector limitation |

## 10. Accessibility Acceptance

Target WCAG 2.2 AA for the product; meeting these design rules alone does not certify the implemented application.

- Normal text contrast ≥4.5:1; large text ≥3:1. Essential control boundaries, state indicators, and chart marks require applicable non-text contrast ≥3:1.
- A visible 3 px focus outline is this system’s design target; focus must not be hidden by sticky bars. It is not a statement that every focus-appearance rule is an AA criterion.
- Product hit-area target is 44×44 CSS px for touch. WCAG 2.2 AA minimum target sizing is a separate 24×24 rule with exceptions and spacing conditions; prefer the larger product target.
- Full keyboard operation, no keyboard traps, skip link, meaningful headings, and predictable return focus.
- Errors identified in text, not color alone; instructions persist. Use polite live announcements for progress and assertive alerts sparingly for newly blocking failures.
- Support 200% text enlargement and reflow at 400% zoom / 320 CSS px where applicable; preserve data-table navigation where two-dimensional layout is necessary.
- Authentication permits paste and password managers; avoid cognitive puzzles and unnecessarily short timeouts. Warn before session expiry and preserve non-sensitive work where permitted.
- Screen-reader checks include Arabic pronunciation, mixed references, table headers, statuses, dialogs, and errors.
- Forced-colors support must retain borders and focus. Reduced-motion preference disables non-essential animation.
- Financial approvals provide review, correction, and confirmation consistent with error-prevention needs.

References: [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum), and [Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).

## 11. Screen Specifications

Each screen inherits entity/period/currency context, permissions, loading/empty/error states, and source traceability. Below, “blocked” means a persistent explanation and a valid next action, not simply a disabled control.

| ID / screen | Required hierarchy and interactions | Critical states | SRS |
|---|---|---|---|
| S-01 Sign-in, recovery, MFA | Labeled credentials, password-manager support, MFA/recovery alternative, generic recovery confirmation | Invalid credentials, expired invitation, rate limit, revoked session | FR-001 |
| S-02 Tenant and entity setup | Entity name, fiscal year, functional currency, framework, roles; review before creation | Missing required policy, unauthorized entity creation | FR-002–004 |
| S-03 Overview | Current entity/period, task status, data readiness, next action; only available metrics | No imports, partial period, stale report, restricted access | FR-005, 018, 039 |
| S-04 Imports | Upload list, formats/limits, file preview, column mapping, scan/process states | Duplicate, overlap, invalid type, encrypted file, failed parsing | FR-006–014 |
| S-05 Data quality | Severity summary, issue table, source inspector, correction/exclusion preview | Critical block, warning acknowledged, changed totals, incomplete data | FR-011–012 |
| S-06 Account mapping | Code/name, mapped line item, unmapped filter, template version, impact preview | Unmapped material account, conflicting split, stale template | FR-015 |
| S-07 Financial report | Report identity, status/version, statement table, metric details, comparison, source actions | Zero denominator, missing input, partial scope, locked version | FR-016–024 |
| S-08 Reconciliation setup | Account/currency/cutoff, bank and book datasets, opening/closing balances, prior items | Currency mismatch, missing opening, failed roll-forward, overlapping period | FR-025–026 |
| S-09 Matching workspace | Two source panes, explicit selections, match evidence, allocations, residual, next exception | Confirmed, suggested, ambiguous, group, partial, conflict, locked | FR-027–031, 035 |
| S-10 Reconciliation statement | Both balance bridges, item classifications, evidence, residual, proposed entries | Balanced but unapproved, unexplained difference, outstanding timing items | FR-032–034 |
| S-11 Reviews | Queue, preparer, version, critical checks, decisions, confirmation dialog | Own work, stale version, rejected, approved/locked, reopening | FR-036–037 |
| S-12 Audit and history | Event filters, actor/action/time, object/version, source access | Restricted content, missing source, retained history | FR-040 |
| S-13 Team and access | Members, roles, entity/account scopes, invitation, revocation | Expired invite, lost permission, own administration restriction | FR-002–003, 043 |
| S-14 Billing and privacy | Plan/units/reset, invoices, export, retention and deletion requests | Quota reached, payment grace, legal hold, irreversible request | FR-041–042 |
| S-15 Integration settings | Provider authorization, scope, last sync, errors, disconnect | Expired authorization, duplicated events, provider outage | FR-044–045; subsequent release |

### Detailed pattern: import to publication

Steps: Files → Preview & map → Quality checks → Review & publish. Keep a file count and current job ID. Publishing requires an explicit action separate from upload. Show excluded records and totals impact before confirmation. A new upload never silently replaces an approved dataset.

### Detailed pattern: reconciliation workspace

Desktop uses bank and book panes with synchronized context, not forced synchronized scrolling. Selecting records reveals the match inspector. Keep total selected bank amount, total selected book amount, residual, reference/date evidence, and applied rule visible. For narrower screens, use labeled Bank/Books views and a persistent selected-count summary; never hide the opposite amount before confirmation.

For example: a USD 4,800 deposit against receipts of USD 3,000 and USD 1,800 remains a grouped suggestion pending review. Matching it does not approve the reconciliation. Rejecting a suggestion retains all source records. Partial allocation cannot exceed availability, including under concurrent edits.

### Detailed pattern: approval

Show critical checks first, then outstanding timing items, then proposed entries, then version and preparer. Only an independent authorized reviewer can approve. A balanced residual alone is insufficient if quality or completeness checks fail. The dialog reiterates that proposed entries are not posted. A stale version cannot be approved by refreshing only the visible status.

### Detailed pattern: source inspection

For a metric, show formula → mapped accounts → available source rows. For a match, show rule/version → allocations → both source records. If only a trial balance exists, expose that level rather than inventing journal-level detail. Downloads require permission and never reveal another tenant’s file existence.

## 12. Print and Export Design

- A4 portrait for statements; A4 landscape for wide reconciliation schedules. Repeat column headers across pages.
- Header: entity, report type, date range/cutoff, currency, status, and version.
- Footer: page number, generation timestamp, and document identifier; approval identity/time where authorized.
- Drafts show a visible “DRAFT / مسودة” label. Approved exports identify the fixed version; do not add a fake audit certification.
- Print uses a light palette independent of app theme. Confirm grayscale meaning with labels and symbols.
- Avoid clipped columns, split totals, orphan section headings, or hidden negative signs. Page-break rules keep subtotal groups together where practical.
- PDF and XLSX use the same exact values. Spreadsheet cell types preserve identifiers and prevent formula injection.
- Implementation must verify embedded fonts, Arabic shaping, selectable text, and accessible reading order with the chosen export engine.

## 13. Figma and Engineering Handoff

### Suggested Figma pages

`00 Cover & Changelog`, `01 Foundations`, `02 Tokens & Modes`, `03 Core Components`, `04 Financial Components`, `05 Product Patterns`, `06 Screens`, `07 Responsive & RTL`, `08 Accessibility`, `09 Deprecated`.

Collections: Primitives; Semantic Colors with Light/Dark modes; Dimensions; Typography; Motion. Map JSON names to Figma variables and styles. Keep locale content variants separate from theme modes. Do not create a variant for every record value.

Component naming examples: `Core/Button`, `Core/FormField`, `Data/Table`, `Finance/Metric`, `Reconciliation/MatchCard`, `Review/ApprovalDialog`. Component properties include size, emphasis, state, density, icon visibility, and read-only status. Use auto layout with start/end alignment and test RTL instances.

### Engineering contracts

- Prefer native semantic elements. Use a maintained accessible primitive library only after checking required behavior and license; this document mandates no framework.
- Provide controlled values and explicit callbacks for data entry; keep financial validation on the server.
- Component interfaces expose label, description, invalid state, disabled reason, loading status, locale, direction, and density where relevant.
- Use named events such as `requestMatch`, `submitForReview`, and `requestReopen`; no component directly assumes server approval.
- Store decimal amounts as authoritative exact representations; display formatting never recalculates financial truth with binary floats.
- Keep permission, status, and version errors as first-class results. Client-side permission hiding is not authorization.
- Load token CSS before component styles. Use logical properties. Define a print stylesheet and reduced-motion overrides.

## 14. Governance and Acceptance

Owners: Product Design owns patterns; Finance owns financial semantics; Engineering owns implementation; Security/Privacy own exposure controls; QA owns verification. Product signs off tradeoffs.

Versioning: patch for non-breaking clarification, minor for additive tokens/components, major for removed roles or changed behavior. Deprecated tokens remain documented with replacement and migration period. Each change includes rationale, impacted screens, locale/theme examples, accessibility effects, and approval evidence.

### Definition of done for a component

- All declared variants and applicable states documented and implemented.
- English/LTR and Arabic/RTL at comfortable and compact densities checked.
- Light/dark and forced-colors behavior verified.
- Keyboard and screen-reader semantics tested.
- Contrast verified for actual adjacent colors, including hover and focus.
- Long labels, missing data, zero, negative values, and large amounts tested.
- Mobile reflow and touch targets checked; focus not obscured.
- Error, permission, loading, read-only, and concurrency states demonstrated.
- Financial behavior reviewed against SRS; screenshots and test evidence retained.

### Required product acceptance scenarios

1. Ambiguous equal-amount candidates never look confirmed.
2. Grouped matches show all members and require a decision.
3. A zero unexplained difference appears balanced, not automatically approved.
4. A preparer cannot approve their own work; the reason remains visible.
5. Changed inputs invalidate the submitted version and identify the successor.
6. Missing ratio inputs never appear as zero or a misleading percentage.
7. Locked versions cannot be edited through inline controls.
8. Source inspection respects permissions and the available data granularity.
9. Retry and quota failures preserve valid draft work.
10. Arabic amounts/references remain unambiguous in UI and exports.

## 15. Assumptions Requiring Confirmation

| ID | Proposed choice | Confirmation needed |
|---|---|---|
| DS-A01 | Neutral placeholder name and monogram | Final brand name/logo and ownership |
| DS-A02 | Navy primary; teal/amber/red/violet semantics | Brand approval and actual rendered contrast |
| DS-A03 | Arabic-first product, English documentation | Default locale and date/numeral preferences |
| DS-A04 | Light default with dark support | Theme preference and release priority |
| DS-A05 | Noto Sans Arabic intended, system Latin stack | Licensed packaged fonts and target-device coverage |
| DS-A06 | Desktop-first financial work; mobile viewing/approval | Whether full mobile preparation is required |
| DS-A07 | Comfortable and compact modes | User testing with accountants |
| DS-A08 | Two-person approval retained from SRS | Customer staffing and any approved exception policy |
| DS-A09 | USD synthetic examples only | Launch currency, locale, and accounting convention |
| DS-A10 | Native Figma library not created in this package | Figma destination/access if requested later |
| DS-A11 | AI narrative and integrations are later-stage | Product release scope remains as specified in BRD/SRS |

This design system supplements the BRD/SRS; it does not approve their unresolved legal, accounting, retention, or operational decisions.
