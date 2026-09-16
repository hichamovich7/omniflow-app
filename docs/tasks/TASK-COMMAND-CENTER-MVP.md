# TASK-COMMAND-CENTER-MVP

Tracked in docs/TASKS.md as **TASK-FIX-038**. This file is the isolated planning
doc for that task, per the founder's request — docs/TASKS.md remains the
canonical active-task/roadmap record and is updated alongside this file.

---

## Goal

Add a first visual prototype of a "Command Center" view to the existing
`/dashboard` page, centralizing projects, goals, daily tasks, and results —
using mocked data only. No Supabase migration, no real business logic.

## Allowed files

* `app/(dashboard)/dashboard/page.tsx` — wire the new section in, keep every
  existing section (trial banner, quick actions, metrics, recent activity)
* `components/dashboard/*` — new presentational components
* `lib/dashboard/command-center-mock.ts` — single centralized mock data file
* `types/dashboard.ts` — types shaped for a future Supabase-backed swap
* `tests/playwright/ui-foundations.spec.ts` — smoke assertions
* `docs/UI_UX.md`, `docs/TASKS.md`, `docs/CHANGELOG.md`, `lib/guide/content.ts`

Explicitly out of scope: any Pinterest or WordPress generation logic, any
Supabase migration, any credits/business logic, any new dependency.

## Success criteria

* `/dashboard` renders a "Command Center" section with:
  1. A greeting header ("Good evening, {name}") with today's date and a short
     day summary.
  2. Four KPI cards: Monthly Revenue, Tasks Completed, Content Published,
     Digital Products.
  3. A "Today's Priorities" list (3 items).
  4. An "Active Projects" grid (3 cards: CrochetSal, Home Decor DE, POD), each
     showing status, progress %, main KPI, next action, and a progress bar.
  5. A compact "Weekly Progress" row (articles published, pins created,
     products launched, revenue progress).
* All data comes from one file (`lib/dashboard/command-center-mock.ts`).
* Dark mode and mobile/desktop responsive layouts both work.
* No existing route, component, or feature is broken.
* TypeScript, ESLint, and the production build all pass.

## Implementation plan

1. Add `types/dashboard.ts` (KPI/Priority/ProjectProgress/WeeklyProgress
   shapes) and `lib/dashboard/command-center-mock.ts` (the mock data).
2. Add small, single-purpose presentational components under
   `components/dashboard/`: `dashboard-header`, `kpi-card`,
   `today-priorities`, `project-progress-card`, `weekly-progress`, and a
   `command-center-section` composing them — matching the codebase's actual
   component convention (kebab-case files, plain `rounded-xl border
   border-border/60 bg-surface` div cards, the same tokens already used on
   this page's Quick Actions/Metrics blocks) rather than the underused shadcn
   `Card` primitive.
3. Extract the dashboard's existing hero (`ResourceHeader` in a decorated
   `rounded-2xl` panel) into `DashboardHeader`, adding a date and a mocked day
   summary line, while keeping its existing CTA buttons unchanged.
4. Insert `<CommandCenterSection />` right after the header, before the trial
   banner. Everything below (trial banner, quick actions, metrics, recent
   activity) stays exactly as it was.
5. Update docs (UI_UX.md, TASKS.md, CHANGELOG.md, guide content) and add
   gated Playwright smoke assertions.

## Risks

* `components/ui/card.tsx` (shadcn) is intentionally not used, since the real
  codebase convention for data cards is hand-rolled divs — flagged here in
  case a future task wants to standardize on one or the other.
* No authenticated browser session was available in this environment, so the
  rendered result was verified via the offline renderer suite, TypeScript,
  ESLint, and a production build — not a live authenticated screenshot. Left
  to the user: open `/dashboard` and visually confirm the Command Center
  section, dark mode, and mobile layout.

---

## Phase 1.1 — UI Consolidation (2026-09-15)

Phase 1 shipped the Command Center as an *addition* on top of the existing
dashboard, which left real duplicates on the page: the old Metrics strip
(Generations, Pins Created, Articles Generated, Projects, Credits) kept
rendering right below the new mocked KPI cards, and the two "Generate"
buttons lived in the header while near-identical Quick Action cards sat
further down. This phase consolidates the page into one hierarchy, without
losing any real Supabase-backed number and without adding a migration.

### Goal

Consolidate `/dashboard` visually — one hierarchy, no duplicated information,
real stats preserved — while keeping the mocked goals clearly labeled as
previews.

### Final hierarchy

1. `DashboardHeader` (greeting, date, day summary, Credits badge)
2. Trial usage banner (unchanged, hidden for exempt accounts)
3. Command Center: KPI cards → Today's Priorities + Active Projects (side by
   side on desktop) → Weekly Progress
4. Quick Actions (5 cards)
5. Recent Activity

### What changed

* **KPI cards now mix real and mock data.** `CommandCenterKpi` gained
  `source: 'mock' | 'real'` and an optional `href`. `Monthly Revenue`,
  `Tasks Completed`, and `Digital Products` stay mocked (tagged with a small
  "Preview" label on the card) — no Supabase table backs them yet. `Pins
  Created`, `Articles Generated`, `Projects` (clickable, links to
  `/projects`), and `Generations` are now real, read from the exact same
  Supabase queries the old Metrics strip used. The mocked `Content
  Published` KPI from Phase 1 was dropped — it was a vague duplicate of what
  `Pins Created`/`Articles Generated` now show precisely.
* **The old Metrics strip is gone.** Its five stats were not deleted, they
  were relocated: four into the Command Center KPI grid (as above) and
  Credits into the `DashboardHeader` (as a badge next to the greeting) — the
  only place Credits is now displayed. The underlying Supabase queries for
  all five were kept; only the old duplicate `<div>` grid was removed. The
  `projects` query changed from a `head: true` count to a real `id, name`
  row fetch, since Active Projects now needs the names to match against.
* **The two "Generate" buttons moved out of the header** into two new Quick
  Action cards (`Generate Pinterest Pins`, `Generate WordPress Article`),
  next to `New Project`, `Pinterest History`, and `WordPress History` — five
  cards total, each action appearing exactly once on the page.
* **Today's Priorities is now interactive, locally.** Converted to a Client
  Component: clicking a priority's circle toggles a `done` visual state
  (strikethrough + check icon), and a discreet "+ Add priority" button (shown
  only while under 3 items) reveals a small inline input. Both are pure
  `useState` — no Supabase call, no API route — and a small caption ("Preview
  only — changes aren't saved yet.") makes that explicit so it's never
  mistaken for a saved change.
* **Active Projects cards are only clickable when a real match exists.**
  `resolveActiveProjects()` (`lib/dashboard/build-command-center.ts`)
  case-insensitively matches each mocked project's `name` against the user's
  real `projects` rows; only a match gets an `href` (`/projects/[id]`) — a
  mocked project with no real counterpart (e.g. "POD", if the user hasn't
  created that project yet) renders as a plain, non-clickable card. Added a
  section header ("Active Projects" + "View all projects" → `/projects`).
  `Next action`'s text contrast was fixed (was `text-secondary`, a muted
  gray failing readability; now a labeled `text-muted-foreground` prefix +
  full-contrast `text-foreground` value, with `wrap-break-word` so long
  actions never get clipped).
* **Weekly Progress now shows a target per metric** with its own compact
  progress bar: Articles Published 3/4, Pins Created 21/49, Products
  Launched 0/1, Revenue 240 €/1 000 € — `WeeklyProgressStats` restructured
  from four bare numbers into four `{ label, current, target, unit }`
  records, still fully mocked in `command-center-mock.ts`.
* New `lib/dashboard/build-command-center.ts` (the mock/real merge logic —
  `buildCommandCenterKpis()`, `resolveActiveProjects()`) and
  `lib/dashboard/format-metric.ts` (the shared currency/count formatter used
  by both `KpiCard` and `WeeklyProgress`, replacing two copies of the same
  ternary).

### Real metrics preserved (query untouched, only the render moved)

`generations` count, `pins` count, `wordpress_articles` count, `profiles.credits_balance` — all still fetched exactly as before. The `projects` query now selects `id, name` rows instead of a `head: true` count, to support name-matching for Active Projects.

### Mocks still in use (all in `lib/dashboard/command-center-mock.ts`)

`MOCK_DAY_SUMMARY`, `MOCK_KPIS` (Monthly Revenue, Tasks Completed, Digital Products — each tagged `source: 'mock'`), `MOCK_TODAY_PRIORITIES` (3 items), `MOCK_ACTIVE_PROJECTS` (CrochetSal, Home Decor DE — name, status, progress %, main KPI, next action; `href` added at render time only on a real-name match), `MOCK_WEEKLY_PROGRESS` (4 metrics with targets). See "Phase 1.1 Hotfix" below — POD was removed from `MOCK_ACTIVE_PROJECTS` on 2026-09-15.

### Constraints respected

No Supabase migration or schema change. No Pinterest/WordPress business logic touched. No new dependency. No chart library — every "chart" is a plain CSS width-percentage bar, matching the existing trial-usage-banner pattern. No commit/push performed by the agent.

### Remaining limitations

* No authenticated browser session was available in this environment. Verified instead: TypeScript, ESLint (scoped — an unrelated pre-existing untracked file, `.claude/hooks/graphify-reminder.js`, fails whole-repo lint with `no-require-imports`, unrelated to this task and not modified by it), production build, the full offline Pinterest renderer suite (81/81), and confirmation that `/dashboard` still 307-redirects an unauthenticated request to `/login`. The new/updated Playwright smoke assertions in `tests/playwright/ui-foundations.spec.ts` correctly skip without `PLAYWRIGHT_STORAGE_STATE` — this was not bypassed. Left to the user: open `/dashboard` and visually confirm the new hierarchy, dark mode, and desktop/tablet/mobile layouts.
* Active Projects will only link out once a real project happens to be named exactly "CrochetSal", "Home Decor DE", or "POD" for the logged-in user — on a fresh/test account all three will correctly render as non-clickable, which is the intended "don't fabricate a link" behavior, not a bug.
* Today's Priorities' local "Add priority"/completion state is per-page-load only (no `localStorage`, no persistence) — by design, per the instruction not to imply anything is saved.

---

## Phase 1.1 Hotfix (2026-09-15)

Four visual defects were reported after testing Phase 1.1 in the browser. No
new task was created — this is a direct fix on the same TASK-FIX-038, same
"Allowed files" scope as above (only touching files already listed there,
plus this doc).

### Bug 1 — Real KPIs were not clickable

**Cause:** `buildCommandCenterKpis()` (`lib/dashboard/build-command-center.ts`)
only ever set `href: '/projects'` on the `projects` KPI. `pins-created`,
`articles-generated`, and `generations` were built with no `href` at all —
`KpiCard` only renders a `<Link>` when `kpi.href` is set (`if (kpi.href) return <Link>...`),
so those three were structurally incapable of being clickable, regardless of
any CSS. This was a data-layer omission, not a styling bug.

**Fix — routes inspected in `app/(dashboard)/` before wiring anything (no
route invented):**

| KPI | Route used | Existing page |
| --- | --- | --- |
| Pins Created | `/history` | `app/(dashboard)/history/page.tsx` — the same "Pinterest History" destination already used by Quick Actions |
| Articles Generated | `/wordpress/history` | `app/(dashboard)/wordpress/history/page.tsx` |
| Projects | `/projects` | `app/(dashboard)/projects/page.tsx` (unchanged from Phase 1.1) |
| Generations | *(none — stays non-clickable)* | No combined Pinterest+WordPress history route exists (only the two platform-specific ones above). Per "ne pas inventer de route", `generations` keeps `href: undefined`. |
| Monthly Revenue / Tasks Completed / Digital Products | *(none — stays non-clickable)* | Mock goals, `source: 'mock'`, no Supabase table to open |

`components/dashboard/kpi-card.tsx`: added a discreet open-affordance for
clickable KPIs — an `ArrowUpRight` icon (already the app's existing
"clickable card" convention, same icon used on Quick Actions and the old
Metrics stat links) shown only when `source !== 'mock'` and `href` is set,
plus `hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm` (same
hover treatment as every other clickable card on this page) and an explicit
`cursor-pointer` class. The existing `focus-visible:ring-3` was already
present and unchanged.

### Bug 2 — The "Add priority" button never appeared

**Cause — a real logic bug, not a styling one.** In
`components/dashboard/today-priorities.tsx`, the button was gated behind
`{canAddMore && !isAdding && (...)}`, where `canAddMore = items.length < MAX_PRIORITIES`.
`items` was initialized as `priorities.slice(0, MAX_PRIORITIES)` with
`MAX_PRIORITIES = 3`, and the mock data (`MOCK_TODAY_PRIORITIES`) has exactly
3 items. So on every single render, `items.length` was `3` and `MAX_PRIORITIES`
was `3` — `canAddMore` was `false` from the very first paint, always, for
every user. The button could never appear; this had nothing to do with
overflow, color, or responsive breakpoints.

**Fix:** removed the `canAddMore` gate entirely — the button now always
renders (swapped for the inline input only while `isAdding` is `true`).
Restyled it from a plain muted text link into a visibly bordered secondary
button (`border border-border/60`, `text-foreground`, a `Plus` icon, `hover:bg-muted`)
so it reads as a real secondary action, not a subtle label. Also removed the
matching `items.length >= MAX_PRIORITIES` early-return inside `addPriority()`,
which was the second half of the same bug — even if the button had been
visible, clicking "Add" would have silently done nothing at the default
3-item state.

### Bug 3 — "Next action" not visible on project cards

**Cause:** partly already fixed in Phase 1.1 (the text was `text-foreground`,
not a low-contrast token — verified again here against `app/globals.css`'s
`--foreground` tokens: `oklch(0.257 0.086 281)` in light mode and
`oklch(0.93 0 0)` in dark mode, both far from `--card`'s near-white/near-black,
so this was never literally invisible from a raw contrast-token standpoint).
The real issue was **format**: the value was appended inline right after a
`Next: ` label on one dense line, easy to overlook next to the Progress bar
and main KPI line above it — not the clearly separated two-line block the
founder expects.

**Fix — matches the requested format exactly:**
```
Next action
Publish "Free Crochet Cat Patterns"
```
`components/dashboard/project-progress-card.tsx` now renders a dedicated
`<div>` with a muted label line (`Next action`, `text-xs text-muted-foreground`,
same weight as the "Progress" label above it) and a full-contrast value line
(`text-sm font-medium text-foreground`, `wrap-break-word` so a long action
wraps instead of clipping — no `truncate`, no fixed height, no
`overflow-hidden` anywhere in this block). It is defined once in the shared
`body` JSX used by **both** the `<Link>` branch and the plain `<div>` branch
— i.e. it was already, and remains, completely independent of whether
`project.href` is set. Matching only ever controls the wrapper (`Link` vs
`div`), never this block — verified by the new
`tests/renderer/dashboard-command-center.spec.ts` case asserting
`resolveActiveProjects([])` still returns a truthy `nextAction` for every
project.

### Bug 4 — POD showed up with no real POD project

**Cause:** `MOCK_ACTIVE_PROJECTS` (`lib/dashboard/command-center-mock.ts`)
hardcoded a third entry, `{ id: 'pod', name: 'POD', ... }`, alongside
CrochetSal and Home Decor DE — a fabricated "active project" with no basis in
Supabase, exactly the kind of fake data the matching logic was supposed to
guard against for the *link*, but the card itself was never conditional on a
match existing.

**Fix:** removed the POD entry from `MOCK_ACTIVE_PROJECTS` — Active Projects
now has exactly 2 mocked cards, CrochetSal and Home Decor DE. No replacement
placeholder was added. `MOCK_DAY_SUMMARY` ("...and 3 active projects...") was
updated to say 2, since it would otherwise now be factually wrong — this is
the one edit outside the 4 numbered bugs, but it's a direct, necessary
consequence of Bug 4's fix, not a new change. The Active Projects grid
(`components/dashboard/command-center-section.tsx`) dropped its `lg:grid-cols-3`
in favor of `sm:grid-cols-2` so 2 cards fill the row evenly instead of
leaving an empty third column. Per the brief, no third real project is
auto-added even if one exists in Supabase — that stays a deliberate non-goal
until real progress data (status/progress%/main KPI/next action) exists for
it; the digital product may resurface later under Goals/Future Projects, not
Active Projects.

### Bug 5 — matching verification

`lib/dashboard/build-command-center.ts`'s `resolveActiveProjects()` was
already correct in Phase 1.1 (case-insensitive name match → `href`; no match
→ no `href`, card still renders with all its data) — kept as-is, now only
matching against CrochetSal and Home Decor DE (POD's removal is the only
change here). Re-verified by the new offline test suite (below): an
unmatched project keeps `status`, `progressPercent`, and `nextAction`; only
`href` is withheld; a match on one project never affects its sibling.

### Files modified

* `lib/dashboard/build-command-center.ts` — added `href` for `pins-created`/`articles-generated`
* `components/dashboard/kpi-card.tsx` — open-affordance icon + hover/cursor treatment for clickable KPIs
* `components/dashboard/today-priorities.tsx` — removed the always-false button gate; restyled as a visible secondary button
* `components/dashboard/project-progress-card.tsx` — "Next action" restructured into an always-rendered two-line block
* `lib/dashboard/command-center-mock.ts` — removed the POD entry; updated `MOCK_DAY_SUMMARY`'s project count
* `components/dashboard/command-center-section.tsx` — Active Projects grid adjusted for 2 cards
* `tests/renderer/dashboard-command-center.spec.ts` (new) — offline data-contract tests for KPI hrefs, POD's removal, and matching-only-controls-href
* `tests/playwright/ui-foundations.spec.ts` — new gated browser assertions checking real computed visibility/attributes (not string presence): KPI link roles + `href` values, mock KPIs having no anchor ancestor, the Add-priority button's actual visibility/enabled state end-to-end (click → type → submit → appears), and "Next action" visible on both remaining project cards
* `docs/tasks/TASK-COMMAND-CENTER-MVP.md` (this file)

### Constraints respected

No Supabase migration or schema change. No Pinterest/WordPress logic touched. No dependency added. `.claude/`, `.opencode/`, `AGENTS.md` untouched. No commit/push performed.

### Test results

* TypeScript: OK
* ESLint, scoped to every file this hotfix touched: OK (the same unrelated pre-existing untracked `.claude/hooks/graphify-reminder.js` still fails a *whole-repo* lint with `no-require-imports` — not touched by this task, not scoped-checked)
* Production build: OK
* Offline Pinterest renderer suite: 87/87 (81 pre-existing + 6 new data-contract cases), no regression
* New/updated Playwright browser assertions in `tests/playwright/ui-foundations.spec.ts`: correctly **skip** on both `chromium` and `mobile-chrome` projects — no `PLAYWRIGHT_STORAGE_STATE` available in this environment, not bypassed

### Remaining limitations

* Still no authenticated browser session in this environment, so the fixes above are verified by (a) static code inspection against each reported symptom's actual root cause, (b) the new offline data-contract tests (`tests/renderer/dashboard-command-center.spec.ts`), which really execute and really pass, and (c) gated Playwright browser assertions that are ready but unexecuted here. A real click-through in the browser (KPI links navigate, Add priority visibly appears and works, Next action reads clearly, POD is gone) is left to the user.
* If the logged-in user happens to have a real project literally named "CrochetSal" or "Home Decor DE", that card becomes clickable; otherwise both correctly render as non-clickable with their status/progress/next action still fully visible.
