# OmniFlow UI Roadmap

Status: proposed  
Scope: progressive visual-system work only; no product logic, API, database, Supabase, or workflow changes

## Design Foundation v1

Status: **Complete** (2026-09-25)

- Select
- Dialog / Sheet
- Badge / StatusBadge
- Input / Textarea
- Button
- Card
- PageHeader / ResourceHeader

The global validation covered the 5 Phase 0 reference pages (Dashboard, WordPress blog-post form, Projects, Project detail, and the Add Content Stream dialog) in light and dark at 1440 and 390 px. No page overflows horizontally, each page has one `h1`, and no regression was found against `docs/ui-baseline/`.

One cross-component fix came out of it: the Select menu now uses `shadow-sm` and a `--border` ring, per the dropdown rule, instead of `shadow-md` and `ring-foreground/10`.

Page-level debt stays in each batch section below and is migrated page by page.

## Phase 0 — Audit

- [x] Audit existing design documentation
- [x] Audit global CSS variables and Tailwind 4 theme mapping
- [x] Audit typography and font loading
- [x] Audit spacing usage and page containers
- [x] Audit radius and shadow variants
- [x] Audit shared cards, buttons, forms, badges, tables, overlays, and states
- [x] Audit application shell and navigation source
- [x] Identify hardcoded and non-semantic color usage
- [x] Inspect the visual reference and separate transferable app patterns from landing-page decoration
- [x] Validate public authentication UI at 1440 px and 390 px with Playwright
- [x] Validate representative authenticated pages at 1440, 1280, 1024, 768, and 390 px
- [x] Capture baseline screenshots for dashboard, a form, a table, a detail page, and a dialog
- [x] Verify light and existing dark themes with real product data

Exit criterion: authenticated visual baselines exist and the remaining audit gaps are recorded per component.

### Authenticated Baseline (2026-09-24)

Captured against `next dev` on `http://localhost:3000` (not `127.0.0.1`: Next 16 dev blocks cross-origin dev assets, so the page never hydrates) with a real account. Stored in `docs/ui-baseline/<reference>/<theme>-<width>.png`:

- light + dark at 1440 and 390 px (20 screenshots), with computed-style metrics in `audit.json` and scroll-container heights in `scroll.json`;
- light only at 1280, 1024, and 768 px (15 screenshots); dark was checked at those widths by metrics and produced an identical layout, so it is not stored. Layout checks are in `breakpoints.json`.

Pages that scroll inside the app shell were captured by growing the viewport to the scroll container's height; dialogs are captured at viewport size. The Next dev indicator is hidden in captures.

| Reference | Route                                     |
| --------- | ----------------------------------------- |
| Dashboard | `/dashboard`                              |
| Form      | `/wordpress/blog-post`                    |
| Table     | `/projects` (card grid, no real table)    |
| Detail    | `/projects/[id]`                          |
| Dialog    | Add Content Stream, from `/projects/[id]` |

Recorded gaps, per component (observations only, no fix scoped yet):

- **Page header:** four different page-title treatments — dashboard hero card 28/700, projects header card 28/700 plus a second "Workspace / Your content projects" 22/600 heading, WordPress centered icon + 24/600, project detail back-arrow + 20/600. Section headings range from 22/600 (dashboard) to 14/600 (form cards) to 14/500 (detail cards).
- **Page width:** dashboard and projects use full content width; form (~560 px) and detail (~600 px) are narrow centered columns with large empty areas at 1440 px.
- **Select:** triggers are ~32 px tall on desktop next to 40 px `Input`s (form, dialog); long values truncate in the dialog ("No WordPress ca…"). _Resolved by the Select batch._
- **Dialog:** no shadow (relies on overlay blur only); at 390 px it spans the full viewport width with 16 px radius on edges touching the screen; title is 16/500, lighter than card titles.
- **Card:** hero/header cards carry a visible shadow and gradient while all other cards are flat; WordPress form sections 01 and 05 have a highlighted primary border, 02–04 do not.
- **Labels:** two metric-label styles side by side (Title Case `text-label` in KPI cards vs uppercase tracking-wide 12 px in Weekly Progress and the form summary).
- **Dashboard:** credits shown twice (header pill and greeting badge); KPI grid is 4 + 3 with an empty slot at 1440 px; "Today's Priorities" wraps to two lines at 1440 px; quick-action cards have inconsistent icon alignment and the corner arrow collides with "Pinterest History".
- **Projects:** brand-profile preview shows raw Markdown (`# Brand Profile — … ##`); "New Project" is an outline button, not primary; cards have unequal content height.
- **Sub-12 px text:** sidebar group labels 9–10 px, "SOON" 10 px, form step numbers 11 px, "Preview" badges 10 px (already tracked in Phase 1).
- **Primary submit placement:** "Generate Article" sits right-aligned outside the form column at 1440 px.
- **Dark mode:** token map is consistent across all five references; no light-only surfaces found.

#### Breakpoints 1280 / 1024 / 768

No horizontal page overflow, no hard-clipped text, and no control covered by another element at any width, in either theme (the only hits were false positives: the Select's 1×1 hidden native inputs and the dialog's `sr-only` "Close" label). The dialog stays 384 px wide, centered, and fully inside the viewport at all three widths.

- **Navigation:** the 256 px desktop sidebar stays visible down to 768 px (`md`); the "Open menu" sheet only takes over below 768 px. At 768 px the content area is 512 px wide.
- **Dashboard:** KPI grid 4 → 4 → 3 columns (7 cards, always a trailing gap); Weekly Progress keeps 4 columns at every width, so at 768 px its labels wrap and "240 € / 1000 €" breaks over two lines; "Today's Priorities" wraps at 1280 and 1024 px, "Home Decor DE" wraps at 1024 and 768 px; quick actions go 5 → 5 → 2 columns (one orphan card at 768 px); Recent activity titles truncate with an ellipsis at 768 px.
- **Form:** the form column is 608 px at 1280/1024 px and 448 px at 768 px. At 768 px, Article Settings keeps three selects in 350 px ("None (…"), and the Category select and Generation Summary values truncate with an ellipsis. "Generate Article" still sits outside the form column's right edge.
- **Projects:** 3 → 3 → 2 columns; project names truncate with an ellipsis from 1024 px down.
- **Detail:** single ~600 px column at every width; the two stat cards stay side by side.
- **Touch targets:** priority done toggles (16×16 px) and edit buttons (18×18 px) are under 24 px at every width; "Connect WordPress" is a 20 px tall inline link.

#### Playwright status

`tests/playwright/ui-foundations.spec.ts` now runs green against the authenticated session: **30 passed, 10 skipped, 0 failed** (chromium + mobile-chrome, `PLAYWRIGHT_BASE_URL=http://localhost:3000`). Only stale selectors were updated, no application code changed:

- sidebar links are scoped to the sidebar (`complementary`) on desktop and to the "Navigation" sheet on mobile, where the sidebar is hidden by design;
- the mobile shell smoke check asserts the "Open menu" button instead of the hidden OmniFlow brand link;
- the "Pins Created" KPI is targeted through its card link;
- the priority project badge matches `/^No project/`, because the trigger text also includes the Select icon glyph;
- the priority edit test locates the list item by position and the field by `textbox` role, because while editing the title lives in the input value and a `hasText` filter no longer matches.

Residual test debt:

- **Pending product decision:** "Pins Created" appears twice on the dashboard (the all-time KPI card and the weekly tile in Weekly Progress). The "exactly once" rule was moved out of the metrics-strip test into a separate `test.fixme` ("Pins Created" renders exactly once), and both elements were left in place. Resolve the product question, then either delete that fixme or re-enable it.
- The priority edit `<input>` has no accessible name (no label or `aria-label`). It is reachable (autofocused, `textbox` role) but unnamed for screen readers. The app was not changed in Phase 0; fix it with the dashboard page rollout.
- ~~Playwright's default `baseURL` is `http://127.0.0.1:3000`~~ Resolved in the Select batch: `playwright.config.ts` now defaults to `http://localhost:3000`. `PLAYWRIGHT_BASE_URL` still overrides it.
- The spec file was already not Prettier-clean at HEAD (long test titles and `expect` chains). The lines edited here are compliant, and the file was not reformatted wholesale.
- Whole-repo ESLint is blocked only by the pre-existing `.claude/hooks/graphify-reminder.js` CommonJS `require()` imports (out of scope, untouched).

## Phase 1 — Design Tokens

- [x] Map the approved blue-first palette to existing semantic CSS variables
- [x] Preserve and rebalance the existing dark token map
- [x] Add explicit hover and soft semantic tokens where opacity is currently composed ad hoc
- [x] Consolidate typography on Inter Variable and retain Geist Mono for technical values
- [x] Add official type-role utilities
- [ ] Remove unsupported 9–11 px text roles during page rollout
- [x] Consolidate radius roles to 6 / 8 / 10 / 14 / 16 px plus full
- [x] Consolidate shadows to `xs`, `sm`, and `md`
- [x] Document the existing Tailwind spacing scale as the sole spacing source
- [x] Add global reduced-motion behavior
- [ ] Add shared motion duration/easing tokens when overlays are standardized
- [ ] Define a small z-index scale for sticky, dropdown, overlay, and toast layers

Exit criterion: tokens compile in both themes and no feature logic changes appear in the diff.

## Phase 2 — Core Components

- [x] Button: primary, secondary, outline, ghost, destructive, link, icon; sm/default/lg
- [x] Input and Textarea: shared height, radius, focus, disabled, read-only, and invalid states
- [ ] Add a reusable success state when a consuming form requires it
- [x] Select: align geometry and menu styling with inputs (2026-09-24, see "Select Batch" below)
- [ ] Combobox: align geometry and menu styling with inputs
- [ ] Checkbox, Radio, and Switch: shared semantic and focus behavior
- [x] Badge and StatusBadge: neutral, primary, success, warning, danger, purple (2026-09-25, see "Badge Batch" below)
- [x] Card: compact and standard density (reference surface finalized 2026-09-25, see "Card Batch" below)
- [ ] Replace repeated feature-level surface recipes during page rollout
- [ ] Tooltip: create or standardize one shared primitive
- [ ] Dropdown and Popover: align radius, item height, shadow, selection, and destructive actions
- [x] Dialog and Sheet: align overlay, radius, spacing, widths, close affordance, and motion (2026-09-24, see "Dialog and Sheet Batch" below)
- [ ] Table: align header, row, hover, selected, sort, action, and mobile behavior
- [ ] PageState: merge the duplicate EmptyState visual pattern
- [x] PageHeader: official title, description, action, spacing, and responsive wrapping (2026-09-25, see "PageHeader and ResourceHeader Batch" below)
- [x] ResourceHeader: resource title, back action, status, description, metadata, and actions (2026-09-25, same batch)

Exit criterion: a lightweight component showcase or representative route demonstrates all states in light/dark and keyboard navigation.

## Phase 3 — Application Shell

Status: **Complete** (2026-09-25, branch `feature/ui-application-shell-v1`), except page-dialog focus, which is tracked per page.

### Application Shell v1 — Complete

- **Sidebar:** 240 px from `lg`, 40 px items, 16 px icons, 10 px radius, 12 px section labels, `--selected` + `--primary-hover` active state, `aria-current="page"` on the single most specific match, "Soon" as `Badge`.
- **Topbar:** 56 px below `lg`, 64 px from `lg`, opaque `--sidebar` surface and border, 16 / 24 / 32 px gutters.
- **PageContainer:** `default` 1280 px and `narrow` 672 px, 16 / 24 / 32 px gutters.
- **Mobile navigation:** 288 px Sheet, 44 px targets, visible Close, closes only when a link is chosen.
- **Responsive shell:** desktop shell from 1024 px (`lg`). 19 private routes checked at 1440 / 1280 / 1024 / 768 / 390 in light and dark: all 200, correct shell geometry, no page overflow, no clipped element outside a scroll region.
- **Focus restoration (mobile):** Escape, Close, overlay, and link navigation all return focus to "Open menu". The initial focus is the brand link. The user menu returns focus to its trigger on Escape.

Global validation fixes: when two nav links prefix-matched (`/wordpress` and `/wordpress/history`), both were highlighted and both got `aria-current`. Only the longest match is active now. The decorative "O" logo tile is `aria-hidden`, so the brand link reads "OmniFlow AI Content OS".

- [x] Apply canvas and surface tokens (shell: sidebar, topbar, mobile sheet)
- [x] Standardize sidebar width, item geometry, section labels, and active state
- [x] Standardize topbar height, spacing, border, and responsive behavior
- [x] Align `PageContainer`, `PageHeader`, and `ResourceHeader`
- [x] Verify mobile sheet navigation and 44 px touch targets
- [x] Verify focus order and focus restoration for the mobile navigation
- [ ] Focus restoration after page dialogs (tracked in the Dialog batch, fixed per page)

Exit criterion: all private routes inherit one stable shell at every target width.

### Application Shell v1 — Batch 1

Changed: `components/layout/sidebar.tsx`, `topbar.tsx`, `mobile-nav.tsx`, `user-menu.tsx` (trigger only), `components/ui/page-container.tsx`, `app/(dashboard)/layout.tsx`. No route, navigation item, or product behavior changed.

- **Sidebar:** 256 → 240 px (DESIGN target; the longest row, "Facebook" + "Soon", still fits). Opaque `--sidebar` surface, full `--sidebar-border`, no shadow. Items 40 px (44 px in the mobile sheet), 14 px text, 16 px icons, 12 px gap, 10 px radius. Active: `--selected` fill, `--primary` icon, `--primary-hover` label (5.4:1 in both themes; `--primary` was 4.1 / 4.3:1), `aria-current="page"`, and no more left indicator bar. Hover `--surface-muted`. Section and group labels 10 → 12 px at full `--muted-foreground` (4.8:1). "Soon" is `Badge variant="outline"`. Brand row 72 → 56/64 px, aligned with the topbar. Flat brand mark (no gradient or shadow), and the 9 px uppercase "AI CONTENT OS" tagline is now 12 px "AI Content OS". `nav` is labelled "Main".
- **Topbar:** 72 → 56 px below `lg`, 64 px from `lg`. Same surface and border as the sidebar (it used to be translucent `bg-background/80` with `backdrop-blur`). Gutters 16 / 24 / 32 px, matching `PageContainer`. Below `lg` it shows the menu trigger and brand. The credits pill is `Badge variant="neutral"` with tabular figures. The avatar is 32 px inside a 44 px touch target below `lg`.
- **PageContainer:** already used by every `(dashboard)` route, with `default` (1280 px) and `narrow` (672 px) matching DESIGN. Only change: the 24 px tablet gutter (`md:px-6 lg:px-8`, which was 32 px from `md`). No new variant. Nothing needs one: at 1440 px the default content is 1200 px wide, under the 1280 px cap.
- **Navigation breakpoint `md` → `lg`.** At 768 px the old shell left 512 px of content next to the sidebar (KPI grid in 3 cramped columns). Now the sheet takes over below 1024 px, so 768 px gets the full width (720 px inside the gutters). At 1024 px the sidebar leaves 784 px, which is enough for every baseline page.
- **Mobile sheet:** 288 px wide, `--sidebar` surface, standard close button (44 × 44) turned back on so touch screen-reader users have a dismiss control. It closes only when a link is activated: it used to close on any click, including group toggles and disabled "Soon" rows.
- **Layout:** `h-screen` → `h-dvh`, so mobile browser bars no longer cut off the bottom of the fixed shell.

Validation (dev server, authenticated real data, Playwright scripts in the session scratchpad):

| Width | Sidebar | Topbar | Content (dashboard) | Gutter | Menu trigger | Overflow |
| ----- | ------- | ------ | ------------------- | ------ | ------------ | -------- |
| 1440  | 240     | 64     | 1200                | 32     | hidden       | none     |
| 1280  | 240     | 64     | 1040                | 32     | hidden       | none     |
| 1024  | 240     | 64     | 784                 | 32     | hidden       | none     |
| 768   | sheet   | 56     | 768                 | 24     | 44 × 44      | none     |
| 390   | sheet   | 56     | 390                 | 16     | 44 × 44      | none     |

- Pages: Dashboard, Projects, Project detail, WordPress blog post, in light and dark at every width above. Narrow pages stay 672 px from 1024 px up.
- Focus: opening the sheet by keyboard focuses the brand link. Escape, the close button, a backdrop click, and link navigation all return focus to "Open menu". Group toggles and disabled rows keep the sheet open. On desktop, Tab goes brand → Dashboard → Projects (`aria-current`) → Research → Pinterest toggle → items, with a visible 2 px ring.
- Dark: navy `--sidebar` (`#0f1828`) for the sidebar, topbar, and sheet, never pure black. Active fill `#17375f`.
- Tests: `ui-foundations.spec.ts` 30 passed / 10 skipped (only a breakpoint comment was updated). TypeScript, production build, `git diff --check`, and ESLint/Prettier on changed files pass.

New debt found (out of scope, not fixed):

- The dashboard greeting card still repeats the credits already shown in the topbar (known from Phase 0, dashboard rollout).
- "Research" sits alone between Workspace and Pinterest with no section label (IA decision in `docs/DECISIONS.md`, left as is).
- **Page-level horizontal scroll at 390 px** inside `<main>` (the document itself does not overflow): `/research` (433 px), `/wordpress/history` (571 px), `/wordpress/categories` (532 px), `/wordpress/[id]` (515 px, article table). The widths are identical on `cea0cb5` without the shell changes, and the shell does not change the 390 px content width. Fix with each page rollout or the Data UI phase.
- History rows (`/history`, `/wordpress/history`) wrap metadata word by word at 390 px. Data UI phase.

## Phase 4 — Data Components

- [x] KPI cards and tabular figures (Data Metrics v1)
- [x] Filters and search bars (Data UI v1, batch 1)
- [x] Data tables and row actions (Data UI v1, batch 1)
- [x] Pagination (Data UI v1, batch 1)
- [x] Bulk actions (Actions & Status v1)
- [x] Progress indicators (Data Metrics v1)
- [x] Workflow statuses (Actions & Status v1)
- [ ] Chart palette, grid, axes, legend, tooltip, loading, empty, and error states
- [ ] Accessible chart summaries and data alternatives

Exit criterion: Pinterest and WordPress history screens share the same data-component language.

### Data UI v1 — Batch 1 (Table, Filters, Pagination)

Status: **Complete** (2026-09-25, branch `feature/ui-data-v1`). No query, param, selection, or action logic changed.

#### Data UI v1 — Batch 1 Complete

- **Table:** 40 px / 12 px / 600 header, 44 px rows, 12 px padding, horizontal separators, `surface-muted` hover, `selected` rows, `aria-sort` styling. It scrolls inside its own container at 390 px.
- **DataList:** used for History and WordPress History (not tabular). Single bordered surface, title first, trailing badges, `Checkbox` selection, named always-visible actions, stacked rows on phones.
- **Filters:** shared `FilterBar` on History, WordPress History, and Boards. Named group, search, and selects, 2-column grid on phones, no local height overrides.
- **Pagination:** one shared component behind the three existing wrappers. Named `nav`, `rel` links, filters kept in URLs, disabled ends are `aria-disabled` buttons.

Global validation: `/history`, `/history?page=2`, `/wordpress/history`, `/boards`, `/boards/[id]` (row-action trigger), and `/admin/bypass`, at 1440 / 1024 / 768 / 390 in light and dark. No document-level overflow on these routes. Filtered pagination (`?language=en`, `?status=completed`) keeps the filter on Next and Previous, and works by keyboard. Filter comboboxes expose their name and their selected value separately (`combobox "Project": Crochet Blog EN`). KPI cards, Progress, and Charts are not started.

Audit: `Table` has one consumer, `/admin/bypass` (currently empty). History, WordPress History, and Boards were custom card stacks, each with its own checkbox (sr-only input + hand-drawn SVG, no visible focus), hover-only row actions (invisible on touch and to keyboard users), and 11 px metadata. The three pagination components were copies that differed only by route. `FilterBar` was exported but unused. The filters carried `h-9` / `text-sm` / `placeholder:…/40` overrides: dead at 40 px on desktop, 36 px (below the touch target) on mobile. Projects and Categories are not tabular and were left alone.

- **Table** (`components/ui/table.tsx`, API unchanged): 40 px header, 12 px / 600 muted, `aria-sort` column in foreground, 44 px rows, 12 px padding, `--border` separators, `--surface-muted` hover, `--selected` for `aria-selected` / `data-state=selected`, `--surface-muted` footer. Validated by rendering its exact classes on `/admin/bypass` in both themes: at 390 px it scrolls inside its container and the page does not overflow.
- **DataList** (new, `components/shared/data-list`): History and WordPress History are now one bordered list with separators. Title first, badges trailing, 59 px rows from 768 px up (WordPress History used to reach 75 px at 1024). The rows use the `Checkbox` primitive (44 / 32 px target, named per row, visible focus), a `--selected` row state, and always-visible ghost `icon-sm` actions named per row ("Actions for …", "Delete article: …"). Metadata is 12 px with hidden separators. Board cards use the same checkbox: always visible below `lg`, and from `lg` shown on hover or keyboard focus.
- **Filters** (`FilterBar`, `FilterBarSearch`, `filterSelectClass`): adopted by the History, WordPress History, and Boards filters. The component is now a `role="group"` named "Filters", without a box. The search has an accessible name. Selects are named, 160 px, with a 2-column grid below `sm`. Language and Status show their name instead of "all". The dead height overrides are removed.
- **Pagination** (`components/shared/pagination`): one server component. `HistoryPagination`, `WordPressHistoryPagination`, and `BoardPagination` keep their exports as thin wrappers. It is a named `nav` with `rel` links, and the disabled end is an `aria-disabled` button (previously a link at 40 % opacity with `pointer-events-none`).
- **Loading:** `TableSkeleton` and the two History `loading.tsx` files follow the new list and filter geometry.

| Width | History row | Filters                          | Pagination | Overflow                                     |
| ----- | ----------- | -------------------------------- | ---------- | -------------------------------------------- |
| 1440  | 59 px       | 40 px, search 320 + 4 × 160      | 36 px      | none                                         |
| 1024  | 59 px       | 40 px, wraps on WordPress        | 36 px      | none                                         |
| 768   | 59 px       | 40 px                            | 36 px      | none                                         |
| 390   | 103–131 px  | 44 px, search row + 2 × 175 grid | 44 px      | none (WordPress History was 571 px, now 390) |

- Keyboard: Space toggles a row checkbox, and the selection bar count updates. Enter opens row menus, and Escape returns focus to the row's trigger. Next / Previous navigate with filters kept (`/history?page=2` → Previous goes to `/history`).
- Dark: separators `#28364a` on `#111a2b` (1.4:1, not glaring), selected `#17375f`, and metadata 5.5:1 on selected rows.
- Tests: `ui-foundations.spec.ts` 30 passed / 10 skipped. TypeScript, production build, `git diff --check`, and Prettier/ESLint on changed files pass. `content-streams.spec.ts` was not run because it writes to the database.

Out of scope, documented:

- 390 px overflow, not caused by Data UI: `/wordpress/categories` (532 px, the "New Category" / "Import from WordPress" buttons in each project card header do not wrap), `/wordpress/[id]` (515 px, a `<table>` inside the generated article body, from article rendering), `/research` (433 px, a form row).
- Badge-like local components still inside the rows: `wordpress-usage-badge.tsx` (11 px, interactive) and `wp-send-status-badge.tsx`, already tracked under Badge.
- ~~Bulk selection bars still use `editorial/selection-action-bar.tsx` (13 px count, `xs` buttons), not the shared `BulkActions`.~~ Resolved in Actions & Status v1.
- No list offers sorting today, so `aria-sort` is only supported by the primitive.

### Data Metrics v1 (KPI Cards, Progress)

Status: **Complete** (2026-09-25, branch `feature/ui-data-metrics-v1`). Covers `MetricCard`, `MetricGrid`, `Progress`, and `ProgressMetric`. No metric, value, order, number format, link, or query changed. Charts are not started.

#### Audit

- No shared KPI or progress component existed. The 7 dashboard KPIs (`kpi-card.tsx`) were a hand-built surface (`border-border/60 bg-surface p-4`). Values were 18 px / 600 without tabular figures, "Preview" was a 10 px uppercase span, and link cards moved up on hover (`-translate-y-0.5`).
- There were four hand-drawn bars, none with `progressbar` semantics: KPI cards (6 px), Weekly Progress (4 px, a `--background` track inside `bg-muted/40` tiles), Active Project cards (6 px), and the trial banner (6 px).
- Weekly Progress labels were 12 px uppercase `tracking-wider` at `muted-foreground/70`, and values 16 px / 600. At 768 px the labels wrapped and "240 € / 1000 €" broke over two lines.
- On the project detail page, two stat cards used a 36 px icon tile, a 24 px / 600 value, and a 12 px label under it.
- Grids: the KPIs went 2 → 3 → 4 columns by viewport, so the 7 cards left one trailing empty slot at 1440 / 1024 / 390 px and two at 768 px.
- No trend or delta is displayed anywhere. `/credits` is a "Coming soon" empty state with no metrics. `/projects` cards only carry a metadata line, which is left alone.

#### Final pattern

- **`Progress`** (`components/ui/progress.tsx`): 6 px, full radius, `--muted` track, `--primary` fill, value clamped to `[0, max]` (a non-finite value or max renders an empty track, never an invalid ARIA value), and a 200 ms width transition (none with reduced motion). It is always `role="progressbar"` with `aria-valuemin` / `aria-valuemax` / `aria-valuenow`, and it is named by its visible label. It has no semantic variants, because no consumer needs one yet.
- **`MetricCard`** (`components/shared/metric-card`): `Card` with 16 px padding and 12 px gaps. The label is `text-label` (13 / 18 px, 500, muted, in the product's own case, never uppercase). The value is `text-kpi` (30 / 34 px, 700, tabular). An optional secondary value ("/ 25") is 14 px, muted, and tabular, and wraps under the value when narrow. The optional top-right slot holds a `Badge`, a 16 px muted icon (no tile), or a 16 px arrow on link cards. An optional bar is pinned to the bottom. A link card is one `<a>` with a hover border and `shadow-sm`, no translation, and the 2 px ring + offset on focus.
- **`MetricGrid`**: columns follow the grid's own width (container query): 2 columns, then 3 from 576 px, then 4 from 896 px. The gap is 12 px, or 16 px from 3 columns. An incomplete last row is spread across the row instead of leaving empty slots. Spans come from the item count, so the order never changes.
- **`ProgressMetric`**: label and value on one line (both 13 px / 500; the value is in the foreground color and tabular, the target muted), with the bar under them.
- **Consumers:** dashboard KPIs (`kpi-card.tsx` → `MetricCard`, `command-center-section.tsx` → `MetricGrid`); Weekly Progress (now a `Card size="sm"` with 4 `ProgressMetric`, in 1 / 2 / 4 columns by width, without nested tiles); Active Project cards (progress block only); trial banner (bar only); project detail stat cards (`MetricCard` + icon, `MetricGrid`).

#### Validation

| Width | KPI grid                     | KPI card heights     | Weekly Progress | Project detail stats | Overflow |
| ----- | ---------------------------- | -------------------- | --------------- | -------------------- | -------- |
| 1440  | 4 + 3 (272 / 368 px)         | 120 / 98 px          | 4 columns       | 2 × 296 px           | none     |
| 1024  | 3 + 3 + 1 (229 / 720 px)     | 120 / 98 px          | 2 columns       | 2 × 296 px           | none     |
| 768   | 3 + 3 + 1 (229 / 720 px)     | 120 / 98 px          | 2 columns       | 2 × 304 px           | none     |
| 390   | 2 + 2 + 2 + 1 (173 / 358 px) | 162 / 142 / 116 / 98 | 1 column        | 2 × 173 px           | none     |

- Light and dark were checked at all four widths on `/dashboard` and `/projects/[id]`. In light, labels and secondary values have 4.79:1 contrast, the fill has 4.17:1 against the track, and the link arrow 3.49:1. In dark, the figures are 7.95:1, 5.64:1, and 5.74:1. The dark track (`#182235` on the card) is 1.09:1, visible without being bright.
- Accessibility: 9 named `progressbar`s on the dashboard, with `aria-valuetext` where the raw number reads poorly ("240 € of 1000 €"). Active Project bars are named "<project> progress" so the two are distinguishable. KPI links read "Pins Created 422", "Articles Generated 8", and "Projects 3". "Preview" is `Badge` text, not color only. Keyboard focus shows the ring on KPI links in both themes.
- Not seen live: the trial banner, because the test account is trial-exempt. It uses the same `Progress` and is covered by the type check and the build only.
- Tests: `ui-foundations.spec.ts` 30 passed / 10 skipped (chromium + mobile-chrome). TypeScript, production build (43 pages), `git diff --check`, and ESLint on the changed files pass. Prettier passes on the new and rewritten files. The 4 partially edited files were already not Prettier-clean at HEAD and were not reformatted wholesale.

#### Out of scope, documented

- The "Pins Created" duplication (KPI + Weekly Progress) is still a pending product decision; the `test.fixme` is unchanged.
- `pin-batch-review-dialog.tsx` diagnostics tiles (11 px labels) and the WordPress `article-form-summary.tsx` (11 px uppercase `dt`) are dialog/form summaries, not KPI cards. Migrate them with their pages.
- `project-progress-card` and `project-card` still translate on hover (Card debt above).
- At 390 px, 2-column KPI labels such as "Articles Generated" can take two lines, and "/ 1000 €" wraps under "240 €". Both are intended wraps, not overflow.
- Trend/delta: none exists. The rule is in DESIGN.md for when one is added.

### Charts v1 — Deferred

Status: **Deferred / Not implemented** (audit 2026-09-25, branch `feature/ui-charts-v1`). The two chart items above stay unchecked.

- Audit: no chart library is installed (no Recharts, Chart.js, D3, visx, Nivo, Tremor, or similar in `package.json`), no chart, chart wrapper, or data-drawing SVG exists in `app/` or `components/`, and there is no Analytics route. The Dashboard and Project detail show KPI cards and progress bars only (Data Metrics v1).
- The Analytics Dashboard is outside the current MVP (`docs/PROJECT.md`, `docs/TASKS.md`).
- Only the `--chart-1` … `--chart-5` tokens exist, unused. Their contrast was checked and recorded under "Chart palette" in `docs/DESIGN.md`, including the green / orange rule.
- Implementation is deferred until a real product need exists. No library, wrapper, demo page, or placeholder chart was added. When it starts, the axes, grid, tooltip, legend, heights, responsive behavior, and accessible summaries will be validated on real charts.

### Actions & Status v1 (Bulk actions, Workflow statuses)

Status: **Complete** (2026-09-25, branch `feature/ui-actions-status-v1`). Covers Bulk actions and Workflow statuses. No selection, deletion, confirmation, status value, query, or API logic changed.

#### Audit

- Bulk actions:
  - `components/shared/bulk-actions` existed but had no consumer.
  - The 4 bars used `editorial/selection-action-bar.tsx`: History, WordPress History, and Boards (Delete only), plus the Pinterest generation page `/pinterest/[id]` (Regenerate / Schedule / Export / Generate WordPress Article).
  - The bars had no accessible name, and the count read "1 Selected" in 13 px primary text.
  - Delete and Clear were `xs` (28 px on desktop).
  - The Select All / Select None / Invert toolbar was also `xs`.
  - After "Clear", keyboard focus fell back to `<body>`.
- Statuses: the real values come from `types/`:
  - generation / article: `pending`, `processing`, `completed`, `failed`;
  - WordPress publishing: `draft`, `scheduled`, `published`, `failed`;
  - content streams: `active`, `warming`, `paused`, `archived`;
  - dashboard mock projects: `on-track`, `at-risk`, `paused`;
  - generation "partial" (derived);
  - research: `failed`;
  - `StatusBadge` also knew `queued`, `generating`, `ready`, and `reviewing`.
- Before this batch there were 4 mapping helpers in `lib/utils/status.ts` plus a local map in `project-progress-card.tsx`. `StatusBadge` had no consumer. History, WordPress History, the Pinterest and WordPress detail pages, and `publish-control` rendered raw lowercase values. `content-stream-card` used `capitalize`. Research used a page-local `destructive` badge.
- Color-only statuses:
  - Dashboard Recent activity showed a colored dot with no text;
  - the WordPress form tinted content-stream name badges by status with no status text.

#### Final pattern

- **`BulkActions`**: named region, `--selected` surface, 14 px radius. "N selected" in 14 px / 500 tabular, then the `sm` actions, then a ghost "Clear" with its name. Includes an always-mounted status region and focus handling after Clear. `SelectionActionBar` is now a thin wrapper, so the 4 consumers keep their API. The Delete buttons and the Select All / None / Invert toolbar moved from `xs` to `sm`.
- **Statuses**:
  - `lib/utils/status.ts` is the single value → label / tone mapping, with a readable neutral fallback. `statusToVariant` (dots) derives from it.
  - `StatusBadge` now takes any stored value.
  - Migrated: History, WordPress History, `/pinterest/[id]` (including "Partial"), `/wordpress/[id]`, `publish-control`, `content-stream-card`, `project-progress-card` (local maps removed), and research "Failed".
  - `WpSendStatusBadge` stays specialized (it combines `wp_post_id`, `publish_status`, and the date). It uses the shared tones, and its labels are sentence case.
  - The 3 unused helpers (`statusToBadgeVariant`, `publishStatusToBadgeVariant`, `contentStreamStatusToBadgeVariant`) were removed.
- **Color-only fixes**:
  - Recent activity links now include the status as `sr-only` text ("Completed: …");
  - WordPress form stream badges read "Name · Status".
- The in-app Guide quotes the new "Sent as draft" label.

#### Validation

| Width | History / WP History / Boards bar | Pinterest bar (4 actions)       | Buttons | Overflow |
| ----- | --------------------------------- | ------------------------------- | ------- | -------- |
| 1440  | 1 row, 54 px                      | 1 row                           | 36 px   | none     |
| 1024  | 1 row                             | count / actions / Clear, 126 px | 36 px   | none     |
| 768   | 1 row                             | count / actions / Clear, 126 px | 36 px   | none     |
| 390   | 1 row, 62 px                      | count / wrapped actions / Clear | 44 px   | none     |

- Routes: `/history`, `/wordpress/history`, `/boards`, `/pinterest/[id]` (bar after selecting a row, client-side only), `/wordpress/[id]`, `/projects/[id]`, and `/dashboard`, in light and dark at all four widths. No document overflow.
- Status badge text contrast:
  - light: 5.10:1 ("At risk") to 9.56:1;
  - dark: 6.71:1 to 13.64:1.
- Keyboard:
  - Space on a row selects it, and the status region announces "1 selected";
  - Tab order inside the bar is Delete → Clear, with the focus ring visible;
  - Delete opens the existing confirmation dialog (closed with Escape; nothing was deleted);
  - Clear hides the bar and moves focus, with a visible ring, to the first row's checkbox.
- The status mapping was checked directly: all known values, plus `ON_HOLD` → "On hold", `needs-review` → "Needs review", empty / `null` → "Unknown", and prototype keys (`toString`, `__proto__`) all fall back safely.
- Tests (chromium + mobile-chrome):
  - `ui-foundations.spec.ts`: 30 passed / 10 skipped.
  - `pinterest-previews.spec.ts`: 2 passed / 2 skipped.
  - `wordpress-blog-post.spec.ts`: 14 passed / 4 skipped / 2 failed. Both failures are the same test, "Keyword mode still validates and submits an empty keyword client-side" ("Keyword is required" never appears).
- Known pre-existing failure: I ran the test again with all of this batch's changes temporarily removed (the code of `main` at `514b77d`), and it still fails. So it is not a regression from Actions & Status. It was not fixed here, and no form behavior was changed; it needs to be investigated separately. TypeScript, production build (43 pages), `git diff --check`, and ESLint on the changed files pass. Prettier passes on the new and rewritten files. `content-streams.spec.ts` was not run, because it writes to the database.

#### Out of scope, documented

- The pin quality-gate badge (`PASS` / `WARN` / `RECOMPOSE` / `FAIL`, uppercase, 10 px) lives inside `pin-diagnostic-badges.tsx`, a group of 10 px metadata chips (mode, angle, template). Migrate the whole group with the Pinterest page rollout.
- `WordPressUsageBadge` shows usage data and opens a menu (11 px interactive chip). It is not a status.
- The status filters (`history-filters`, `wordpress-history-filters`) and the content-stream form select still show raw values with `capitalize`. These belong to the Filters and forms work.
- Dashboard Recent activity shows the status to sighted users as a colored dot only. The text is `sr-only`, and a visible label is a dashboard-layout change.
- `xs` buttons remain in `image-versions-dialog.tsx` and `pin-detail-dialog.tsx` (dense in-dialog controls).
- `wordpress-blog-post.spec.ts` "Keyword is required": a pre-existing failure, to investigate separately.

## Phase 5 — Product States

- [x] Skeletons match final card, table, and form geometry (Product States v1)
- [x] Empty states use the canonical PageState pattern (Product States v1)
- [x] Error states include clear recovery paths (Product States v1: route error page; inline form errors, see below)
- [x] Success feedback uses consistent toast/inline treatment (audited in Product States v1: sonner toasts only, already on tokens; unchanged)
- [x] Disabled and read-only states are distinct (primitives: Input and Button batches; product-level "Soon" tiles: Product States v1)
- [x] Loading buttons preserve width and prevent duplicate actions (Final UI Polish, Batch 1)

Exit criterion: every representative workflow has defined loading, empty, error, success, and disabled presentations.

Phase 5 status: complete. Core states landed in Product States v1; loading buttons landed in Final UI Polish, Batch 1.

### Product States v1

Status: **Core states complete** (2026-09-25, branch `feature/ui-product-states-v1`): `PageState`, `EmptyState` wrapper, `PageSkeleton`, loading routes, error page, and unavailable states. Loading buttons are deferred to the final cleanup. No condition that decides whether a state shows, no filter, and no action changed.

#### Audit

| Class            | Where                                                                                                                                                                           | Before                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. Page-level    | `/credits`, `/settings` ("Coming soon"); `app/(dashboard)/error.tsx`; `/pinterest`, `/research`, `/wordpress/blog-post`, `/wordpress/categories`, `/boards` ("No projects yet") | Two primitives: `PageState` (2 consumers) and the older `EmptyState` (13 consumers). They differed in padding (`py-12` vs `py-20`), title (18 px vs 14 px / 500 `h3`), and description (14 px vs 13 px). The error page was hand-built, with no `h1`. "Coming soon" used `EmptyState`.                                                                                                                                   |
| B. Section-level | History, WordPress History, Boards (no data vs no results via `hasFilters`); Boards detail; research history; admin bypass list; dashboard Recent activity                      | No data and no results were already told apart by title, icon, and action ("Clear filters"). Only the rendering varied. Research history used an `h3` under its section's `h2`.                                                                                                                                                                                                                                          |
| C. Inline        | Submit or generation errors in `pin-form`, `pins-source-article-form`, `article-form`, `research-form`; `recompose-pin-dialog` errors; login / register errors                  | Each form hand-draws a `bg-destructive/5` box (sometimes `role="alert"`, a border, or a left accent). There is no shared Alert component.                                                                                                                                                                                                                                                                                |
| D. Loading       | 9 `loading.tsx` files, `DashboardSkeleton`, `TableSkeleton`, and `Skeleton` (`animate-pulse`, `bg-muted`)                                                                       | No `aria-busy` and no status message. The Dashboard skeleton showed 4 KPIs, 2 cards, and a small header, while the real page has a header card, an "Overview / Command Center" heading, 7 KPIs, and 5 quick actions. The Projects skeleton had a plain header and 36 px icons (real: a header card and 44 px icons). The Pinterest and blog-post skeletons used a wide container where the real page is narrow (672 px). |
| Unavailable      | WordPress hub "Soon" tiles; sidebar "Soon"                                                                                                                                      | The tiles stacked opacity (`opacity-60` + `/50` + `/40` text) and showed a 10 px uppercase "Soon". The sidebar already used `Badge outline`.                                                                                                                                                                                                                                                                             |
| Success          | 37 `toast.success`, 51 `toast.error`, 2 `toast.warning` (sonner)                                                                                                                | A single toaster on `--popover` / `--border` with lucide icons, so text and icon carry the meaning. No inline success panel exists.                                                                                                                                                                                                                                                                                      |

#### Final pattern

- **`PageState`** is the canonical page- and section-level state:
  - a compact block with a dashed `--border` outline, no fill, and `py-10`;
  - a 40 px tile holding a 20 px icon; the tile carries the tone: muted, `destructive-soft`, or `warning-soft`;
  - an 18 / 600 title with a `headingLevel` of 1, 2, or 3; a 14 px muted description; at most one existing action.
  - Variants: `empty`, `error`, `unavailable` (new, for "Coming soon"), `permission-denied`, `loading`.
- **`EmptyState`** keeps its API (`children` becomes the action) as a thin wrapper around an `empty` `PageState`. Its 13 callers are unchanged, apart from research history now using `headingLevel={3}`.
- **Page states**: `/credits` and `/settings` use `unavailable`. The route error page uses `PageState` `error` as its `h1`, with the existing "Try again" (`reset`) and no error details.
- **Loading**:
  - A new `PageSkeleton` wraps every `loading.tsx` in the page's own container (wide or narrow) with `aria-busy="true"` and one `role="status"` message ("Loading projects"). `Skeleton` is `aria-hidden` and stops pulsing with reduced motion.
  - The Dashboard, Projects, Pinterest, and blog-post skeletons were redrawn to match their pages. The History / WordPress History (Data UI v1), `/pinterest/[id]`, `/wordpress/[id]`, and hub skeletons keep their shapes.
- **Unavailable tiles**: dashed outline on the card surface, muted text at full token strength (no opacity), and "Soon" as `Badge variant="outline"`, like the sidebar.

#### Validation

- Skeletons: each `loading.tsx` was rendered through a temporary route, deleted afterwards and absent from the build, at 1440 / 1024 / 768 / 390 in light and dark (72 combinations). The skeleton container width equals the real page's at every width. Every skeleton has its status message, every skeleton block is `aria-hidden`, and nothing overflows. The Dashboard skeleton was compared side by side with the page, and the missing "Command Center" heading was added.
- States (64 combinations): `/credits`, `/settings`, no results on `/history?q=…`, `/wordpress/history?q=…`, and `/boards?search=…` (URL filters only), the `/wordpress` "Soon" tiles, and a temporary specimen for the error page, empty with an action, `permission-denied`, and `loading`.
  - All titles are 18 / 600; descriptions are 14 px, at 4.54:1 (light) and 8.55:1 (dark).
  - Actions are 36 px, and 44 px at 390.
  - No overflow.
  - Each page keeps exactly one `h1`, and the error page's `h1` is its title.
  - The "Soon" tiles went from 4.37:1 to 4.79:1 in light (7.27:1 in dark), at full opacity.
- Tests (chromium + mobile-chrome):
  - `ui-foundations.spec.ts`: 30 passed / 10 skipped.
  - `pinterest-previews.spec.ts`: 2 passed / 2 skipped.
  - `wordpress-blog-post.spec.ts`: 14 passed / 4 skipped / 2 failed. Only the known pre-existing "Keyword is required" test fails (see Actions & Status v1).
  - TypeScript, production build (43 pages), `git diff --check`, and ESLint on the changed files pass. Prettier passes on the new and rewritten files.
  - `content-streams.spec.ts` was not run, because it writes to the database.

#### Out of scope, documented

- Inline form errors (`pin-form`, `pins-source-article-form`, `article-form`, `research-form`, `recompose-pin-dialog`) still hand-draw their `bg-destructive/5` boxes. There is no shared Alert primitive to standardize them on; add one with the form rollout.
- Loading buttons (width preservation, duplicate submits) are not audited here, so the checklist item stays open.
- The `/pinterest/[id]` and `/wordpress/[id]` skeletons keep their approximate shapes, since the real pages are very long (up to 27,000 px).
- Card debt on the hub tiles (hover translation on the available tile) is unchanged.
- The known `wordpress-blog-post.spec.ts` "Keyword is required" failure is unchanged.
- `/wordpress/[id]` has two `h1`s: the page title plus the `h1` inside the generated article HTML. This page is untouched by this batch; fix it with the article rendering.

## Final UI Polish

Status: **Complete** (2026-09-25, branch `feature/ui-final-polish`): Batch 1, Batch 2, and the final global validation. It changes no business logic, API, database, or dependency.

### Batch 1 — shared and cross-component debt

Status: **Complete, pending review** (2026-09-25, branch `feature/ui-final-polish`). No validation rule, condition, request, or API changed.

#### Audit (debt still present on `main`)

| Debt              | Found                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inline alerts     | 11 hand-drawn boxes, with 5 different recipes (`bg-destructive/5`, `destructive-soft`, left accent border, a warning box, an info box) and `role="alert"` on only some. Where: login, register, `pin-form` ×2, `recompose-pin-dialog` ×3, `research-form`, `article-form`, `pins-source-article-form`, `delete-generations-dialog`. |
| Loading buttons   | 13 buttons swapped their content for a spinner or a longer label ("Generating... (can take up to a minute)"), so the width changed (up to about 150 px) and some lost their label. None set `aria-busy`.                                                                                                                            |
| Text < 12 px      | 41 uses: 1 at 9 px, 14 at 10 px, and 26 at 11 px, in Pinterest, WordPress-form, research, and history components.                                                                                                                                                                                                                   |
| `xs` buttons      | 3 left: the Image Versions "Use this" and delete buttons, and the Pin Detail "Copy". Hook presets and the keyword suggestion reproduced `xs` through `h-7 text-[11px]` overrides.                                                                                                                                                   |
| Fake badges       | Generation-mode tags on `pin-form`, the "Active" version tag (solid, 9 px, uppercase), and the board chip on pin cards. The diagnostic `Badge`s were forced to 10 px.                                                                                                                                                               |
| Height overrides  | `h-12` inputs and combobox, `h-11` inputs and selects, `h-9` selects and tag input, and `h-11 px-6 text-sm` submit buttons.                                                                                                                                                                                                         |
| Hover translation | `hover:-translate-y-0.5` on dashboard quick actions, project cards, project progress cards, and the WordPress hub tile.                                                                                                                                                                                                             |

#### Final pattern

- **`Alert`** (`components/ui/alert.tsx`): `danger` (default, `role="alert"`), `warning`, and `info`. No `success` variant, since success stays a toast. All 11 hand-drawn boxes moved to it; the `data-testid`s and the explicit `role="alert"` on `pin-form` are kept.
- **`<Button loading>`**: the spinner replaces the leading icon, or overlays hidden content when there is no icon. It sets `aria-busy` and keeps the width and label. It is used by all 13 loading buttons; `disabled` conditions are unchanged.
  - The two article forms keep their duration hint as a line next to the button ("Generation can take up to a minute.") instead of inside the label.
  - Login and register keep their "Signing in…" label: those buttons are full width, so the label cannot shift anything.
- **Small text**: every 9, 10, and 11 px text is now 12 px. Opacity-faded metadata (`/40`, `/50`, `/70`) went back to `--muted-foreground`, and the uppercase tracked summary labels are sentence case.
- **Sizes and badges**:
  - Form actions use `size="lg"` (submits) or `sm` (presets and the suggestion); the tag-input add button is an `icon` button with a name.
  - `xs` stays only for the dense Image Versions grid and the Pin Detail "Copy".
  - Generation-mode tags, "Active", and the board name are `Badge`s (primary/neutral/outline; the board truncates).
- **Heights**: the local overrides were removed, so inputs, selects, and the combobox follow the primitives (40 px, 44 px below `md`).
- **Hover**: cards change border and shadow only (`transition-[border-color,box-shadow] duration-150`).

#### Validation

- **Specimen** (temporary route, deleted, absent from the build): 6 button cases (lg/default/sm/xs, with and without an icon, children in a fragment or direct) × primary/outline × 1440/768/390 × light/dark. Every case holds its width and height exactly when loading, sets `aria-busy`, and shows one spinner inside the button. The three Alert variants measure 6.05 / 5.1 / 9.35:1 (light) and 7.66 / 6.79 / 10.29:1 (dark).
- **Routes** at 1440/768/390 in light and dark:
  - pages: `/dashboard`, `/projects`, `/wordpress`, `/pinterest`, `/research`, `/wordpress/blog-post` (Advanced Options open), `/pinterest/[id]`, `/history`, `/wordpress/categories`, `/wordpress?pinIds=…`, `/login`, `/register`;
  - no horizontal overflow and no visible text under 12 px;
  - inputs, selects, and the combobox are 40 px (44 px at 390);
  - every badge is 12 px at ≥ 5.1:1;
  - link cards have `transform: none` on hover.
- **Mocked submits**: Playwright intercepts every mutating `/api` call, so nothing reached the server.
  - Research, Generate Pins, and Generate Article (1440/390, light/dark): the button width changes by 0 px while loading and after the error, the label is unchanged, and `aria-busy="true"` is set. The error renders as `Alert` `role="alert"`.
  - Login (mocked Supabase 400): the `Alert` shows "Invalid login credentials".

### Batch 2 — page-specific debt

Status: **Complete, pending review** (2026-09-25, same branch). No business logic, request, API, stored content, or dependency changed.

#### Overflows (reproduced at 390 px inside `<main>`)

| Route                   | Before | Cause                                                                                                  | Fix                                                                                  |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `/research`             | 433 px | `grid-cols-[1fr_auto]` with a fixed 176 px Source select beside a Project select that could not shrink | One column below `sm`, `minmax(0,1fr)` from `sm`, both triggers full width on mobile |
| `/wordpress/categories` | 532 px | "Import from WordPress" and "New Category" did not wrap in each project header                         | The header and its actions wrap; the project name breaks                             |
| `/wordpress/[id]`       | 515 px | `<table>` inside the generated article                                                                 | Tables scroll inside themselves (`block overflow-x-auto`)                            |
| `/wordpress/history`    | —      | Already fixed by Data UI v1                                                                            | —                                                                                    |

#### Dialog focus

I audited 20 business dialogs, opened from their real trigger by keyboard and closed with both Escape and Cancel/Close, at 1440 and 390.

- **Working before this batch (14):**
  - History, Boards, and Projects deletes from a row menu; History bulk delete;
  - WordPress History row delete; research delete;
  - content stream Edit and Archive;
  - Schedule, Batch Review, pin Detail, Generate WordPress confirm;
  - category Import and Manage.
- **Broken, now fixed (3):**
  - Add content stream: the dialog remounted on close (`key` included `formOpen`). The key is now bumped only on open.
  - New Category (Categories page): `autoFocus` moved focus before the dialog recorded its opener. It now uses `initialFocus={ref}`.
  - New Category from the blog-post Select: the opener is a Select item that unmounts. The dialog now uses `finalFocus` on the Select trigger.
- **Not testable with the current data (3):** Image Versions, Change layout, admin bypass Remove. They are built like the working pin dialogs.
- The pin card (`role="button"`) handled Enter/Space for everything inside it: its checkbox and image actions opened the detail dialog instead of acting. It now reacts only when it is the target itself.

#### Headings and headers

- `/wordpress/[id]`: the article preview shifts its headings one level down (h1 → h2 …) for display only. Styles moved with them, so the article looks the same. The stored article and the exports are unchanged. The page now has a single `h1`.
- `/pinterest/[id]`, `/wordpress/[id]`, `/boards/[id]`, and `/projects/[id]` hand-built the same header: a 28 px back link, a 20 px title, and 12 px metadata. They now use `ResourceHeader`: a 22 / 28 px title, a 36 px back link (44 px on mobile), metadata, status, and actions. On `/projects/[id]`, the niche chip is a `Badge`.
- The 4 centred generator headers drifted (a 44/48/56 px tile, a 20/24 px title, different spacing). They now use one `GeneratorHeader` (see DESIGN.md). `CenteredHeaderSkeleton` follows the new title height.

#### Small controls

- **Pin-card image actions:**
  - Change layout, Regenerate, and Versions are `Button`s (outline `sm` / `icon-sm`: 36 px, 44 px on mobile). Regenerate uses `loading`.
  - They are always visible below `lg`; from `lg` they appear on hover or keyboard focus.
- **Today Priorities:**
  - The per-priority project chip keeps its compact 28 px look with an invisible hit area of 36 px (44 px on mobile). The done toggle and edit pencil get the same.
  - "Add priority" is an outline `sm` `Button`.
  - The add form uses `Input`, the default `Select`, a `Button` submit, and an `icon` cancel.
- **Research history:** Retry and Delete were 26 px and hidden (`opacity-0`) even on touch and keyboard focus. They are now ghost `icon-sm` `Button`s, always visible below `lg`, and revealed on hover or focus from `lg`.

#### Validation

- **Routes** at 1440 / 768 / 390, light and dark:
  - pages: `/dashboard` (add form open), `/research`, `/wordpress/categories`, `/wordpress`, `/wordpress/blog-post`, `/pinterest`, `/pinterest/[id]`, `/wordpress/[id]`, `/projects/[id]`, `/boards/[id]`, `/wordpress?pinIds=…`;
  - no overflow in `<main>` or the document, and one `h1` per page;
  - back links are 36 px (44 px at 390);
  - no interactive control under 32 px (44 px at 390), apart from the standalone text links listed below.
- **Dialog focus:** 17 of 17 testable dialogs return focus to their opener after Escape and after Cancel/Close, at 1440 and 390.
- **Pin card:** Enter on Regenerate regenerates (a mocked request) and does not open the detail. Space on the checkbox checks it. Enter on the card still opens the detail.

### Final validation

The final validation found a few inconsistencies and fixed them:

- the niche chip on `/projects` cards was hand-drawn; it is now a `Badge`, like on `/projects/[id]`;
- the "Project actions" menu trigger was a native 32 px button; it is now a ghost `icon-sm` `Button`;
- the History "N of N pins used in WordPress" trigger (20 px) gets an invisible hit area of 36 px (44 px on mobile);
- four WordPress-form textareas forced `text-sm` (14 px on mobile, against the 15–16 px rule); the primitive size now applies.

After those fixes, 18 routes pass in light and dark at 1440 / 768 / 390 (108 combinations):

- `/dashboard`, `/projects`, `/projects/[id]`, `/research`, `/pinterest`, `/pinterest/[id]`, `/history`, `/boards`, `/boards/[id]`;
- `/wordpress`, `/wordpress/blog-post`, `/wordpress/history`, `/wordpress/categories`, `/wordpress/[id]`, `/credits`, `/settings`, `/login`, `/register`.

On every route:

- no document-level overflow and exactly one `h1`;
- no visible text under 12 px;
- no link-card hover transform;
- Card, Badge, Input, and Select geometry match on every page: cards have a 16 px radius, badges are 22 px tall with 12 px text, and inputs and selects are 40 px (44 px at 390).

The 17 testable business dialogs return focus to their opener.

### Remaining debt (deliberately out of scope)

- The known `wordpress-blog-post.spec.ts` failure "Keyword is required" (it also fails on `main`).
- Standalone text links 16–20 px tall: "View all projects" and "View all" on the Dashboard, "View on WordPress" on `/wordpress/[id]`, and "Connect WordPress" on `/projects/[id]`.
- At 390 px: the mobile top-bar logo link (32 px) and the Boards row links (38 px).
- On `/wordpress/[id]`, the send status ("Published · View on WordPress") appears in the header and again in the publish panel.
- Today Priorities edit mode: Save and Cancel are 18 px icon buttons 6 px apart (a mock-data preview).
- Dialog focus that needs data this account does not have: Image Versions, Change layout, and admin bypass Remove.
- Analytics and Charts (see "Charts v1 — Deferred").

## Phase 6 — Page Rollout

Roll out by shared impact, not by redesigning the whole application at once:

1. Authentication
2. Dashboard / Command Center
3. Projects and Boards
4. Research and generation forms
5. Pinterest history and detail
6. WordPress generation, history, categories, and detail
7. Guide, settings, credits, and admin surfaces

- [x] Authentication foundation proof: login/register use the standardized primitives and pass light/dark validation at 1440 px and 390 px

For each page:

- [ ] Use the shared shell and headers
- [ ] Replace local surface/control recipes with primitives
- [ ] Verify hierarchy and one-primary-action discipline
- [ ] Check 1440 / 1280 / 1024 / 768 / 390 px
- [ ] Check light/dark, keyboard, reduced motion, overflow, loading, empty, and error states
- [ ] Capture before/after screenshots

## Phase 7 — Polish

- [ ] Run a consistency audit across all routes
- [ ] Remove obsolete visual utilities and duplicate components
- [ ] Remove remaining direct palette utilities in favor of semantic variants
- [ ] Verify contrast and non-color state cues
- [ ] Verify icon family, size, and stroke consistency
- [ ] Verify motion timing and reduced motion
- [ ] Run visual regression checks without fragile pixel-perfect assertions
- [ ] Reconcile or archive superseded sections in older design documents

## First Implementation Batch

Recommended scope: **tokens plus four primitives**, with no page redesign.

Status: completed 2026-09-24. Login/register were validated in light/dark at 1440 and 390 px against a production build. Button focus-visible was corrected to a solid offset ring. ESLint is blocked only by the pre-existing `.claude/hooks/graphify-reminder.js` CommonJS imports, which are out of scope.

1. Update `app/globals.css` to the approved blue-first semantic palette while preserving the dark token structure.
2. Switch the root sans/heading mapping in `app/layout.tsx` to Inter Variable; keep Geist Mono.
3. Standardize `Button`, `Input`/`Textarea`, and `Card` geometry, focus, radius, and state styling.
4. Align `PageHeader` with the official page-title and description roles.
5. Update only the login/register screens as the first visual proof, because they are public, small, and can be validated without test credentials.
6. Capture light/dark screenshots at 1440 and 390 px, then run lint, production build, relevant tests, and `git diff --check`.

Deliberately excluded from this batch: sidebar redesign, dashboard layout changes, tables, charts, feature-form cleanup, and any product behavior.

## Select Batch

Status: completed 2026-09-24. Only `components/ui/select.tsx` changed, plus the Playwright default `baseURL`. The public API is unchanged: same exports, same props, `size` is still `sm | default`.

- **Default trigger:** mirrors `Input`: 44 px with 16 px text below `md`, 40 px with 14 px text from `md`, `rounded-md` (10 px), `border-input`, `bg-card`, `shadow-xs`, `pl-3 pr-2.5`, a `--ring` border plus a 3 px `ring/20` focus ring, `disabled:bg-muted opacity-60`, and the same invalid ring as Input. It has a subtle `hover:bg-surface-muted`.
- **`sm` trigger:** height (28 px), radius, and shadow unchanged, so the dashboard's priority project badges look the same.
- **Truncation:** `SelectValue` and the trigger have `min-w-0`, so long values end with an ellipsis before the chevron and never run under it.
- **Menu:** the popup gains 4 px padding, so the highlighted item no longer touches its edges. Items are 36 px below `md` and 32 px from `md` (previously 28 px), with 10 px left padding. The selected-item check uses `--primary`. The popup uses `shadow-sm` with a `--border` ring, per the dropdown rule (changed during the Foundation v1 validation; it was `shadow-md` with `ring-foreground/10`).
- **Validated:** `/wordpress/blog-post` and the Add Content Stream dialog in light and dark at 1440 and 390 px. Every Select matches its neighbouring Input in height, radius, and font size; chevron and text are centred (0 px offset), and nothing overflows. Keyboard open (Enter), arrow navigation, Escape (the dialog stays open), and focus return to the trigger were all verified.
- **Side effect, intended:** local `h-9`/`h-11` classes on `SelectTrigger` (History, Boards, Pinterest filters; Recompose dialog) never took effect, because the base height uses a `data-[size=default]` selector with higher specificity. Those triggers were 32 px and are now 40/44 px, which matches the 40 px search `Input` next to them. The dead `h-*` overrides are left in feature code for the page rollout to remove.
- **Tests:** `ui-foundations.spec.ts` 30 passed / 10 skipped without setting `PLAYWRIGHT_BASE_URL`. In `content-streams.spec.ts` and `wordpress-blog-post.spec.ts` (the data-writing "end to end" test was excluded), 10 tests fail identically with and without this change, so the failures are pre-existing:
  - `content-streams`: `gotoFirstProject()` clicks the first `a[href^="/projects/"]`, most likely "New Project" rather than a project detail link;
  - `wordpress-blog-post`: the Keyword input's native `required` blocks submit before the app's "Keyword is required" message can appear.

## Dialog and Sheet Batch

Status: completed 2026-09-24. Only `components/ui/dialog.tsx` and `components/ui/sheet.tsx` changed. The public API is unchanged: same exports and props (`showCloseButton`, `side`). Both files were also Prettier-formatted, matching the other primitives.

- **Overlay (both):** `bg-black/40` in light and `bg-black/60` in dark (was `bg-black/10`), with a 2 px backdrop blur (was 4 px) and a 200 ms fade.
- **Dialog surface:** `bg-popover`, a 1 px `--border` border (replaces `ring-foreground/10`), `shadow-md`, and 16 px radius (`rounded-xl`, unchanged). Padding is 20 px (`p-5`) at every width, with a 20 px gap between blocks. Motion: 200 ms ease-out fade and 95 % zoom (was 100 ms).
- **Dialog width:** the viewport gutter now comes from `w-[calc(100%-2rem)]`, and the default cap is a plain `max-w-sm`. A caller's `max-w-*` or `sm:max-w-*` narrows or widens the dialog without removing the 16 px mobile margin. Height is capped at `100dvh - 2rem` with internal scroll.
- **Header / title / description:** header `gap-1.5` with `pr-10`, so the title never runs under the close button. Title is 18/600, `leading-snug`, `--foreground` (was 16/500). Description is 14 px, `leading-normal`, muted.
- **Footer:** the muted band bleeds to the edges using `-mx-5 -mb-5`, matching the fixed `p-5`, with `px-5 py-4`. On mobile it stacks in reverse order; from `sm` it is a right-aligned row that can wrap.
- **Close button (both):** a ghost `icon` Button, 40 px (44 px below `md`), with a 16 px icon, muted colour and `hover:text-foreground`, 12 px from the corner. It keeps its accessible name "Close" and the Button's solid 2 px offset focus ring.
- **Sheet:** same overlay, border token, `shadow-md` (was `shadow-lg`), close button, and title/description roles as Dialog. Header and footer use `p-5`; the header has `pr-14` to clear the close button, and the footer has a top border. Top and bottom sheets are capped at `85dvh` with internal scroll. Left and right sheets keep `w-3/4` with `sm:max-w-sm`. The side variants and slide motion (200 ms) are unchanged.
- **Validated** (light/dark × 1440/390):
  - Add Content Stream dialog: 16 px margin on each side at 390 px, 16 px radius, 20 px padding, title clear of the close button (40 px, or 44 px on mobile), no horizontal overflow. The Selects from the Select batch still match the Name input.
  - Mobile navigation Sheet: 293 px at 390 px, 384 px at 1440 px (opened by script, because its trigger is `md:hidden`), border and overlay in both themes.
  - Keyboard: the focus trap holds (16 Tabs, focus never left the dialog), Escape and the close button both close it, and under `prefers-reduced-motion` the animation drops to ~0 ms through the global rule.
- **Tests:** `ui-foundations.spec.ts` 30 passed / 10 skipped, including the mobile navigation Sheet test. `content-streams.spec.ts` (excluding the data-writing "end to end" test) still shows its 8 pre-existing failures, all at `gotoFirstProject()` before any dialog opens. TypeScript, production build, `git diff --check`, and Prettier/ESLint on both files pass.

Side effects and migration debt found in this batch (not fixed here):

- **Local `max-w-md` / `max-w-lg` now apply on desktop.** Before, `sm:max-w-sm` silently overrode them, so every such dialog was 384 px. They now render at their intended width: Content Stream, Schedule, and Generate WordPress at 448 px; Image Versions and Pin Detail at 512 px. Dialogs that only set `sm:max-w-*` (Recompose, Pin Batch Review) are now capped at 384 px on viewports under 640 px (previously full width minus 32 px). Phones at 390 px are unaffected.
- **Focus does not return to the opener.** No dialog in the app uses `DialogTrigger`; they are all opened from a plain `Button` with controlled `open` state. After Escape or Close, focus falls back to `<body>`. This is identical before and after this batch. The mobile navigation Sheet, which does use `SheetTrigger`, returns focus correctly. Fix per dialog during page rollout, either by using `DialogTrigger` or by passing `finalFocus`.
- ~~**The mobile navigation Sheet's `w-64` has no effect.**~~ Resolved in Application Shell v1: the menu uses `data-[side=left]:w-72` (288 px).
- **The Sheet's header and footer are untested in real use.** ~~Close button~~ now used by the mobile navigation (Application Shell v1). The header and footer slots are still verified by code review only.

## Badge Batch

Status: completed 2026-09-25. Changed: `components/ui/badge.tsx`, `components/shared/status/status-badge.tsx`, `lib/utils/status.ts` (visual variant mapping only), and one variant in `components/wordpress/wp-send-status-badge.tsx`. The first three files were Prettier-formatted. The public API is stable: every existing variant name still works, and no status value, label, or rule changed.

**Inventory before:** 16 files used `Badge`, and every usage passed an explicit variant: `outline` ×12, `secondary` ×3, `success` ×3, `warning` ×1, `destructive` ×1, plus mapping helpers. Badges were 20 px tall, 12 px text, pill-shaped (`rounded-4xl`), with no border on the colored variants, and `default` was a solid blue fill. The shared `StatusBadge` is not imported anywhere yet. The real status mapping lives in `lib/utils/status.ts`, in `project-progress-card.tsx` (dashboard), and in `wp-send-status-badge.tsx`. No `Badge` is rendered as a link or button.

- **Primitive:** 22 px tall, 12 px / 500 text, 8 px padding, 6 px radius (`radius-xs`), 1 px border, 4 px icon gap, and 12 px icons. Soft variants use a tinted surface, semantic text, and a same-hue border at 20–25 %.
- **Official variants:** `neutral`, `primary`, `success`, `warning`, `danger`, `purple`, plus `outline` (neutral with no fill, for metadata). The old names are aliases: `default` → primary, now soft instead of a solid fill; `secondary` → neutral; `destructive` → danger. `ghost` and `link` are unchanged in role.
- **Contrast (12 px text on the badge surface):**
  - light: neutral 9.56, primary 5.39, success 7.20, warning 5.10, danger 6.05, purple 4.62, outline 10.46;
  - dark: 13.64, 5.42, 6.71, 6.79, 7.66, 4.95, 14.91.
  - To reach AA, the text uses `--primary-hover` and `--destructive-hover`. Success in light mode uses `--success` mixed with 22 % black, because no darker success token exists. No palette token changed.
- **StatusBadge:** uses the official names; the optional dot is 6 px (`size-1.5` passed to `StatusDot`, whose 8 px default is kept for the dashboard's standalone activity dots). `generating`/`processing`/`scheduled` → primary, `queued`/`reviewing` → neutral, `ready`/`published` → success, `failed` → danger.
- **Mapping changes (visual only):**
  - `processing` generation status: warning → primary;
  - `scheduled` publish status: warning (`publish-control`) and success (`WpSendStatusBadge`) → primary everywhere;
  - `paused` content stream stays neutral and `archived` stays outline;
  - `on-track` / `at-risk` remain success / warning.
- **Validated:** Dashboard (On Track, At Risk, credits), Project detail (Not connected), WordPress form (Connected), and History (completed, failed), in light and dark at 1440 and 390 px. All badges measured 12 px, 22 px tall, 6 px radius, with no clipping and no page overflow. `primary`, `purple`, and `outline` have no live data on these pages, so they were verified by rendering their exact classes in both themes.
- **Tests:** `ui-foundations.spec.ts` 30 passed / 10 skipped. TypeScript, production build, `git diff --check`, and ESLint on the changed files pass.

Local badge-like debt (not converted in this batch, migrate page by page):

- `pin-diagnostic-badges.tsx`: 8 `Badge variant="outline"` with `text-[10px]` overrides, which keep them below 12 px.
- Local spans that imitate badges instead of using `Badge`:
  - ~~dashboard KPI "Preview" (`kpi-card.tsx`, 10 px uppercase)~~ now `Badge variant="neutral"` (Data Metrics v1);
  - ~~sidebar "Soon" (10 px uppercase)~~ now `Badge variant="outline"` (Application Shell v1);
  - project card category chip (`project-card.tsx`, primary pill);
  - `wordpress-usage-badge.tsx` (11 px, and it is interactive: hover state, link);
  - `pin-form.tsx` 10 px pill;
  - `pin-table.tsx` 11 px chips.
- `project-progress-card.tsx` keeps its own status → variant map (`paused` → outline). Move it to `lib/utils/status.ts` when the dashboard is migrated.
- `content-stream-card.tsx` passes `capitalize`, while `history-table.tsx` and `publish-control.tsx` render raw lowercase values (`completed`, `failed`). Casing is left unchanged in this batch.

## Input and Textarea Batch

Status: completed 2026-09-25. The Phase 2 item was already checked by the first implementation batch. This batch verified that claim against Select and fixed the remaining gaps. Changed: `components/ui/input.tsx` (one class) and `components/wordpress/article-form-source.tsx` (one obsolete override, on two fields). `textarea.tsx` needed no change. `input.tsx` and `textarea.tsx` are Prettier-clean.

- **Already aligned:** both primitives match Select:
  - 44 px with 16 px text below `md`, 40 px with 14 px from `md` (Textarea has no fixed height: `min-h-24`, `field-sizing-content`, native resize);
  - 10 px radius (`rounded-md`), `border-input`, `bg-card`, `shadow-xs`, 12 px horizontal padding;
  - focus: `--ring` border plus a 3 px `ring/20`;
  - invalid: `--destructive` border plus a 3 px `destructive/15` ring (`/25` in dark);
  - read-only: `bg-surface-muted`;
  - disabled: `bg-muted`, `opacity-60`, not-allowed cursor.
- **Input fix:** removed `disabled:pointer-events-none`. It hid the not-allowed cursor on disabled Inputs, while Textarea and Select showed it. Disabled Inputs still cannot be edited or focused.
- **WordPress Keyword / URL fix:** removed the local `h-12 text-sm`. On desktop it was already cancelled by the primitive's `md:h-10 md:text-sm`, so only its mobile effect remained: 48 px with 14 px text, below the 16 px mobile rule. Both fields are now 44 px / 16 px on mobile and 40 px / 14 px on desktop. Their local muted surface and placeholder are unchanged (see debt).
- **Validated:**
  - Pages: `/wordpress/blog-post` (Keyword, Research Notes textarea, 7 Selects), the Add Content Stream dialog (Name, 3 number inputs, 3 Selects), `/login`, `/register`, and `/projects/[id]/edit` (Name, Description textarea, WordPress fields), in light and dark at 1440 and 390 px.
  - Every Input, Textarea, and Select measured the same height (Textarea excepted), font size, radius, padding, and shadow; there is no horizontal overflow.
  - Keyboard focus is `:focus-visible`, with the ring border and ring in both themes.
  - States were measured with transitions off:
    - invalid: red border and ring;
    - read-only: muted surface, full text, text cursor;
    - disabled: muted surface, 60 % opacity, not-allowed cursor.
  - Placeholder contrast at base styling: 4.79:1 light, 7.95:1 dark.
- **Tests:**
  - `ui-foundations.spec.ts` 30 passed / 10 skipped. In one earlier run a single test failed transiently, but the failing test was not captured; four later runs (1 plus `--repeat-each=3`, 90 passed) were clean.
  - `wordpress-blog-post.spec.ts`: 14 passed / 2 failed / 4 skipped. The failures are only the known "Keyword is required" case (native `required`).
  - TypeScript, production build, `git diff --check`, and ESLint on the changed files pass.

Local field debt (not changed, migrate page by page):

- `placeholder:text-muted-foreground/40` on 15 fields in 9 files drops placeholder contrast to about 1.7:1 in light and 2.3:1 in dark: `article-form-source.tsx` ×4, `article-form-advanced.tsx` ×3, `pin-form.tsx` ×3, `pins-source-article-form.tsx`, `research-form.tsx`, and the Boards, History, and WordPress History search filters.
- `h-12 text-sm` on Input in `pin-form.tsx` ×2 and `research-form.tsx`: 48 px with 14 px text on mobile. `h-11 text-sm` in `article-form-advanced.tsx`: 44 px but 14 px text on mobile.
- `h-9 text-sm` on the search Inputs in `board-filters.tsx`, `history-filters.tsx`, and `wordpress-history-filters.tsx`: 36 px with 14 px text on mobile (40 px on desktop, since `md:h-10` wins).
- `text-sm` on Textarea in `article-form-source.tsx` (Research Notes, Pasted Text) keeps 14 px text on mobile.
- `h-8` Input in `category-select.tsx` (inline new-category field): 32 px on mobile.
- `pin-form.tsx` read-only Language field overrides the surface with `bg-muted/40 cursor-default`.
- `FIELD_SURFACE_CLASS` and `SELECT_SURFACE_CLASS` (WordPress form) paint fields `bg-muted/70` instead of `bg-card`.

## Button Batch

Status: completed 2026-09-25. Only `components/ui/button.tsx` changed (and was Prettier-formatted). The public API is stable: same exports, the same 6 variants, and the same 8 sizes.

**Inventory:** 57 files import `Button` (93 JSX tags), and about 25 more links or elements use `buttonVariants` directly.

- Variants in use: `default` ×21, `outline` ×42, `ghost` ×18, `destructive` ×12. `secondary` and `link` are unused.
- Sizes in use: `default` ×48, `sm` ×23 (plus most `buttonVariants` links), `xs` ×9, `icon-sm` ×7, `icon` ×3, `icon-lg` ×2, `icon-xs` ×1.
- Local overrides are few: `h-11 px-6 text-sm` on 5 full-form submit buttons, `h-11` / `min-h-11` on 4 dialog or table actions, `h-9 px-3` on one `sm` button, and `max-md:size-11` on the Dialog/Sheet close buttons.
- There is no `loading` prop. 15 files use a local `Loader2` spinner, typically inside a button label.

Changes:

- **Disabled:** was `opacity-50` plus `pointer-events-none`, which gave a washed-out copy of the variant and hid the not-allowed cursor. Now disabled buttons keep full opacity and a muted look:
  - `default`, `secondary`, and `destructive`: `bg-muted`, `--muted-foreground` text, `--border` outline;
  - `outline`: card surface with muted text;
  - `ghost` and `link`: muted text only.

  They show a not-allowed cursor, have no shadow, and do not react to hover. The same styling applies to `aria-disabled`. Label contrast is 4.37–4.79:1 in light and 7.27–8.55:1 in dark (the Add Content Stream "Create" button was about 2:1 before).

- **Mobile touch target:** the 44 × 44 px minimum now applies below `md`, the same breakpoint as Input and Select (was `sm`), so buttons match fields between 640 and 767 px.
- **`sm`:** now 36 px (was 32 px), 13 px text (was 12 px), and a 10 px radius (was 8 px). `icon-sm` is now 36 px (was 32 px) with a 10 px radius.
- **`lg`:** 48 px below `md`, 44 px from `md`, with 15 px text and an 18 px icon.
- **Icon size:** each size now owns its default icon size: `xs` 12, `sm` / `icon-sm` 14, `default` / `icon` 16, `lg` / `icon-lg` 18 px. Before, a shared base `size-4` rule tied with the smaller rules and won, so `sm` and `xs` icons were 16 px, and `icon-lg` now also gets 18 px instead of 16 px. As before, the rule applies to any icon without a `size-*` class, so local `h-3.5 w-3.5` icons follow the button size.
- **`secondary`:** now has a `--border` outline and a neutral `hover:bg-muted` (the hover was the blue `bg-accent`).
- **`link`:** text uses `--primary-hover` (5.72:1 on the canvas; `--primary` was 4.33:1) and is underlined on hover and on `focus-visible`.
- **Unchanged:**
  - radius 10 px (`xs` / `icon-xs` keep 8 px as the compact exception) and weight 500;
  - primary `bg-primary` with `hover:bg-primary-hover` and `shadow-xs`;
  - the solid 2 px offset focus ring (red on destructive);
  - the `active` press, a 0.98 scale that is disabled under reduced motion.

Validated (light/dark × 1440/390):

- Add Content Stream dialog: Create (disabled), Cancel, and Close.
- `/wordpress/blog-post`: Generate Article and the icon-only Manage categories.
- `/login` and `/register`.
- A variant, disabled, and size strip rendered from the real `buttonVariants` output.
- Results:
  - every button is 40 px at 1440 px (the Generate Article override is 44 px) and at least 44 px at 390 px;
  - icons are vertically centred;
  - enabled contrast is ≥ 4.5:1 (primary 4.57 light / 6.70 dark, destructive 4.83 / 7.17);
  - hover changes the Cancel surface, the focus ring is visible, Enter on Cancel closes the dialog, and no page overflows horizontally.
- The dashboard has no `Button` instances (see debt).

Tests: `ui-foundations.spec.ts` 30 passed / 10 skipped. `content-streams.spec.ts` and `wordpress-blog-post.spec.ts` (excluding the data-writing test) show the same 10 known failures as before. TypeScript, production build, `git diff --check`, and Prettier/ESLint on the file pass.

Button debt (not changed, migrate page by page):

- The dashboard uses raw `<button>` elements with bespoke styles instead of `Button`: priority toggle, edit, save, and cancel; "Replace a priority"; quick actions.
- 5 submit buttons use `h-11 px-6 text-sm`, a hand-made large size with 14 px text and 44 px on mobile. Use `size="lg"` during rollout.
- Several `buttonVariants` links add manual icon spacing (`mr-1.5 h-3.5 w-3.5`) on top of the size's `gap`.
- There is no shared loading state. Pages swap in a local `Loader2` spinner, so button width can change while loading, against DESIGN.md's "loading must preserve width".
- `xs` (28 px, 12 px text) stays below the 13 px label guidance, as a documented compact exception for bulk and selection bars.
- In light mode, the unused `secondary` variant sits close to the disabled look (neutral fill). Revisit it if it gets adopted.

## Card Batch

Status: completed 2026-09-25. Only `components/ui/card.tsx` changed (and was Prettier-formatted). The public API is stable: same 7 exports, same `size` prop (`default` / `sm`), same `data-slot` attributes. No role, tabindex, or interaction was added.

**Inventory:** only 3 files use the primitive:

- `/login` and `/register`: `Card` + `CardHeader` + `CardContent`. The header holds a logo and a local `h1.text-card-title`, not `CardTitle`.
- `components/admin/bypass-email-form.tsx`: `CardTitle` overridden to `text-sm font-medium`.
- `CardDescription`, `CardAction`, and `CardFooter` have no consumers.

About 30 surfaces rebuild a card by hand (`rounded-xl|2xl border border-border/60 bg-card|bg-surface p-4…p-8`, sometimes `shadow-sm`). See the debt list below. They were not converted.

Changes:

- **Radius:** 16 px (`rounded-xl`, was 14 px `rounded-lg`), on the card, header, footer, and edge images. This matches the existing hand-built surfaces (`rounded-xl` and `rounded-2xl` both resolve to 16 px).
- **Unchanged surface:** `bg-card`, 1 px `--border`, and `shadow-xs`, with no gradient or glow.
- **Spacing:** one token, 24 px by default and 20 px with `size="sm"`. The card owns the vertical padding and the gap between sections, and each section pads horizontally only, so padding never doubles.
- **Header:**
  - Title and description gap 6 px. Title-to-action gap 16 px (was 6 px).
  - The title column is `minmax(0, 1fr)`, so long titles wrap instead of pushing the action out.
- **`CardAction`:**
  - Top right, spanning title and description.
  - `flex` with an 8 px gap for several actions.
  - A −6 px block margin centres a 36 px `sm` or `icon-sm` button on the 24 px title line. Before, it pushed the content down by 12 px.
- **`CardTitle`:** 18 / 24 px, weight 600, −0.01em, `--card-foreground`, and breaks long words. `size="sm"` keeps its explicit 16 / 20 px.
- **`CardDescription`:** 14 / 20 px, weight 400, `--muted-foreground`, contrast 4.79:1 in light and 7.95:1 in dark, and breaks long words.
- **`CardContent`:** horizontal padding and `min-w-0` only, with no typography, background, or layout imposed.
- **`CardFooter`:**
  - Was a tinted `bg-surface-muted` band with a `border-t` and its own padding.
  - Now it is plain: `flex flex-wrap items-center gap-3`, horizontal padding, and the card's bottom padding.
  - Add `border-t` to opt into a divider; it then gets the section spacing above it, like `border-b` on the header.
- **`Card`:** `min-w-0` so it can shrink inside grid and flex parents.

Validated (light/dark × 1440/390):

- `/login`, `/register`, and `/admin/bypass` (real primitive consumers).
- Dashboard, Projects, Project detail, and `/wordpress/blog-post`. They contain no `Card` instances; checked for no regression and no overflow.
- A specimen strip rendered from the real `Card` and `buttonVariants`: title only, title + description, title + icon action, long title + description + text action + footer, and `size="sm"`.
- Results:
  - radius 16 px, border `#E8EDF4` / `#28364A`, card to canvas 1.05:1 in light and 1.08:1 in dark (border carries the separation), `shadow-xs` only;
  - header top 24 px, header to content 24 px, action 16 px from the title and 24 px from the edges;
  - footer buttons wrap below the metadata at 390 px;
  - no horizontal overflow on any page or specimen.

Tests: `ui-foundations.spec.ts` 30 passed / 10 skipped. TypeScript, production build (43 pages), `git diff --check`, and Prettier/ESLint on the file pass. No other spec targets `Card`.

Card debt (not changed, migrate page by page):

1. Probably intentional:
   - Auth cards: the centred logo header and local `h1.text-card-title`, kept for the heading level.
   - Interactive link cards: `project-card`, `project-progress-card`, dashboard quick links, and WordPress hub tiles. They use a hover border, `shadow-sm`, and `-translate-y-0.5`. DESIGN.md calls card translation exceptional, so the product must confirm it. (`kpi-card` is now a `MetricCard`: hover border and `shadow-sm`, no translation.)
   - Row-like list items: history, research, and WordPress history rows, and `table-skeleton`. They are rows, not cards.
2. Legacy visual:
   - Translucent `border-border/60` on nearly all hand-built surfaces.
   - `shadow-sm` on form panels: guide, `wordpress/[id]`, `pin-form`, `research-form`, `pins-source-article-form`, and `article-form-advanced`.
   - `shadow-sm` plus a `bg-primary/10 blur-3xl` glow on `dashboard-header`, and `shadow-sm` on the projects header.
   - Mixed paddings: `p-4`, `p-5`, `p-6`, `p-6 sm:p-8`, and `px-5 py-6 sm:px-7 sm:py-8`.
   - The admin `CardTitle text-sm font-medium` override.
   - A nested `bg-background/60` panel inside `pin-form`.
3. To migrate to `Card`: Dashboard widgets (`today-priorities`, the activity list; `weekly-progress` done in Data Metrics v1), project detail sections (`content-streams-section`, `content-stream-card`), WordPress form sections and `publish-control` / `categories-manager` / `article-category-editor`, research and Pinterest forms, and the guide sections.

## PageHeader and ResourceHeader Batch

Status: completed 2026-09-25.

Files changed:

- `components/layout/page-header.tsx` and `components/shared/resource-header/resource-header.tsx` (both Prettier-formatted).
- One-prop call-site updates in the only two `ResourceHeader` consumers:
  - `app/(dashboard)/projects/page.tsx`: `size="page"`, and the sentence moved from `metadata` to `description`;
  - `components/dashboard/dashboard-header.tsx`: `size="page"`.

Both APIs only gained optional props; every existing prop keeps its meaning.

**Inventory:**

- **`PageHeader`:** 14 pages. Most pass title + description only. Boards passes one `outline sm` action.
- **`ResourceHeader`:** only Projects and the Dashboard greeting, both used as the main page header inside a `shadow-sm` card wrapper. The Dashboard also has a `bg-primary/10 blur-3xl` glow.
- **Local headers (not converted):**
  - Project detail: 28 px back link with no touch target, `h1` 20/600 truncated, a custom niche pill (`bg-primary/10 rounded-full`), a custom "Default" marker, and an `sm` Edit action.
  - WordPress Generator (`wordpress/page.tsx`, `article-form.tsx`, `pins-source-article-form.tsx`): a centred 24/600 hero on a 48 px `bg-primary/10` icon tile, with a 14 px description at `leading-relaxed`.
  - Section headings: project detail and categories use `h2 text-sm font-medium` (14/500), `article-form-section-card` uses `h2 text-sm font-semibold`, and Dashboard and Projects use an eyebrow plus `h2 text-section-title`.

**PageHeader changes:**

- Description is now 14 / 20 px muted (`text-body-secondary`); it was 15 / 22 px.
- Layout is now `flex-wrap` with `justify-between`, `gap-x-6 gap-y-4`, and a title column of `flex-[1_1_20rem]`. It was a `sm:` flex-row breakpoint. Actions now stay on the right while there is room, then wrap under the title, and wrap among themselves with an 8 px gap.
- The title breaks long words, and `data-slot` attributes were added.
- New optional props:
  - `eyebrow`: 13 / 18 px, 500, muted (`text-label`);
  - `icon`: a Lucide icon, 24 px, muted, `aria-hidden`, centred on the first title line, with no tile;
  - `className`.
- Unchanged: title 28 / 34 px, 700, `-0.02em`, `text-balance`; the `h1`; no surface. The page container still gives the 32 px gap below.

**ResourceHeader changes:**

- The default title is now 22 / 28 px, 600 (`text-section-title`); it was 28 / 34 px, 700. `size="page"` keeps 28 / 34 px, 700 for the two pages that still use it as a page header.
- New optional back link, set with `backHref` and `backLabel` (default "Back"):
  - a `Link` styled as a ghost `icon-sm` button, 36 px, or 44 px below `md`;
  - an 18 px `ArrowLeft` icon, muted, turning to foreground on hover;
  - the shared focus ring;
  - a negative margin centres it on the first title line, and `-ml-2` optically aligns the arrow with the content edge.
- New optional `description` prop, 14 / 20 px muted.
- `metadata` is now 12 / 17 px, 500, muted; it was 400.
- Title and status gap is now `gap-x-3 gap-y-2`, and the status wraps under a long title.
- The inner gap is now 8 px (was 12 px), actions use the same wrap model as `PageHeader`, and the long one-line JSX was reformatted.

**Validated (light/dark × 1440/390):**

- Real consumers: `/projects` (`ResourceHeader size="page"`), `/dashboard` (greeting), `/boards` (`PageHeader` + action), and `/credits` (`PageHeader`).
- Local headers, which are unchanged: Project detail and `/wordpress/blog-post`.
- A specimen strip rendered from the real components:
  - `PageHeader` simple;
  - `PageHeader` with eyebrow, icon, long title, long description, and 3 actions;
  - `ResourceHeader` with back link, success `Badge`, long title, description, metadata, and 2 actions;
  - `ResourceHeader size="page"`.
- Results:
  - At 1440 px, actions align flush right on the title's first line. At 390 px, they wrap under the description at 44–48 px and are never cut.
  - The back link is centred on the title line (36 px at 1440, 44 px at 390), and the status badge wraps under a long title.
  - Tab order is back link → Edit → Generate, each with a visible `focus-visible` ring.
  - There is one `h1` per page, and no horizontal overflow on any page or specimen.
  - Dark mode uses only tokens: title `#F5F7FA`, muted text `#A6B0C0`.

**Tests:** `ui-foundations.spec.ts` 30 passed / 10 skipped; its "ResourceHeader exposes metadata, status and actions in reading order" test is still an empty skipped placeholder. TypeScript, production build (43 pages), `git diff --check`, ESLint on the 4 files, and Prettier on the 2 primitives pass. The 2 call-site files were already not Prettier-formatted before this batch and were left unformatted to avoid unrelated diff noise.

Header debt (not changed, migrate page by page):

1. Intentional:
   - Section headers made of an eyebrow plus `h2 text-section-title` (Dashboard "Command Center", Projects "Your content projects").
   - The auth card headers.
2. Old design:
   - WordPress Generator's centred hero with the tinted icon tile. 3 copies of it exist.
   - The Project detail header: 20/600 title, 28 px back link, custom niche pill, and custom "Default" marker.
   - The `shadow-sm` card wrappers and glow around the Projects and Dashboard headers.
   - `h2 text-sm` section titles.
   - The Boards action's manual `mr-1.5 h-3.5 w-3.5` icon.
   - The Projects "New Project" override (`lg` + `min-h-11 px-4`).
3. Migrate later:
   - Projects and Dashboard → `PageHeader`, dropping the card wrapper and `size="page"`.
   - Project detail → `ResourceHeader` with `backHref`, a `Badge` for niche, language, and default, and actions.
   - WordPress Generator → `PageHeader` with `icon`, left-aligned.
   - Section `h2`s → a shared section-heading role (18/600 or 22/600) during rollout.

## Validation Matrix

| Batch           | Visual                     | Responsive              | Accessibility                          | Engineering                |
| --------------- | -------------------------- | ----------------------- | -------------------------------------- | -------------------------- |
| Tokens          | Light/dark palette sample  | N/A                     | Contrast pairs                         | Build + diff check         |
| Core primitives | All variants/states        | 390 / 768 / 1440        | Keyboard, focus, labels, 44 px touch   | Lint + build               |
| Shell           | Every nav state            | 390 / 768 / 1024 / 1440 | Focus order, accessible names          | Playwright smoke           |
| Data UI         | Table/chart/filter states  | 390 / 768 / 1280        | `aria-sort`, summaries, non-color cues | Relevant tests             |
| Page rollout    | Before/after route capture | All five target widths  | Page-level keyboard pass               | Lint + build + route smoke |

## Definition of Done

A UI batch is complete only when:

- it changes presentation without changing product behavior;
- shared tokens/primitives are used instead of duplicating styles;
- light and existing dark themes remain legible;
- keyboard focus and semantic states are visible;
- target widths have been visually inspected with no unintended page overflow;
- screenshots confirm the intended hierarchy and density;
- TypeScript/build, ESLint, relevant tests, and `git diff --check` pass;
- this roadmap is updated with completed items and any newly discovered visual debt.
