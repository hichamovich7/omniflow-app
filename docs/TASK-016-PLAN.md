# TASK-016 — UI/UX Design System & Professional Redesign

## Technical Plan

Status: COMPLETED

Version: v0.9.1 → v1.0.0

---

# 1. Design Objectives

Transform OmniFlow from a functional prototype into a commercial-grade SaaS product.

Inspiration: Linear, Vercel, Notion, Typefully, Raycast.

### Principles

* **Minimal** — every element earns its space
* **Fast** — instant feedback, no unnecessary transitions
* **Consistent** — one design language across all screens
* **Professional** — credible as a paid product on day one
* **Dark-first** — dark mode as primary, light mode polished

### Non-Goals

* No animations beyond subtle transitions (hover, focus, state changes)
* No custom illustration system
* No onboarding wizard
* No marketing pages
* No changes to business logic, APIs, database, prompts, or CSV

---

# 2. Design System

## 2.1 Colors

Replace the current grayscale-only palette with a branded system.

### Brand Color

```
Accent: Blue (inspired by Linear/Vercel)
--accent-hue: 220
```

### Light Mode

```css
--background:       oklch(0.99 0 0)          /* near white */
--foreground:        oklch(0.13 0 0)          /* near black */
--card:              oklch(1 0 0)             /* white */
--muted:             oklch(0.96 0.005 250)    /* cool gray bg */
--muted-foreground:  oklch(0.55 0.01 250)     /* secondary text */
--border:            oklch(0.91 0.005 250)    /* subtle border */
--input:             oklch(0.91 0.005 250)    /* input border */
--primary:           oklch(0.55 0.18 250)     /* brand blue */
--primary-foreground: oklch(0.99 0 0)         /* white on blue */
--destructive:       oklch(0.58 0.22 25)      /* red */
--success:           oklch(0.62 0.17 145)     /* green */
--warning:           oklch(0.75 0.15 75)      /* amber */
```

### Dark Mode

```css
--background:       oklch(0.13 0.005 250)     /* deep dark */
--foreground:        oklch(0.93 0 0)           /* off-white text */
--card:              oklch(0.17 0.005 250)     /* elevated surface */
--muted:             oklch(0.21 0.008 250)     /* subtle surface */
--muted-foreground:  oklch(0.63 0.01 250)      /* secondary text */
--border:            oklch(0.25 0.008 250)     /* subtle border */
--input:             oklch(0.25 0.008 250)     /* input border */
--primary:           oklch(0.65 0.18 250)      /* lighter brand blue */
--primary-foreground: oklch(0.13 0 0)          /* dark on blue */
```

### Semantic Colors

Add `--success` and `--warning` tokens (missing from current system).

Used for: status badges, generation states, toast types.

---

## 2.2 Typography

### Font Stack

Keep Geist Sans (already loaded via Next.js). No new font dependencies.

### Scale

```
text-xs:   12px / 16px   — labels, counters, metadata
text-sm:   14px / 20px   — body text, table cells, descriptions
text-base: 16px / 24px   — form inputs, buttons
text-lg:   18px / 28px   — section headers
text-xl:   20px / 28px   — page titles
text-2xl:  24px / 32px   — dashboard numbers, hero metrics
```

### Weights

```
font-normal: 400  — body text
font-medium: 500  — labels, navigation, table headers
font-semibold: 600 — page titles, card titles
font-bold: 700    — dashboard metrics only
```

### Rules

* No font-bold outside dashboard metric cards
* All body text is `text-sm` (14px) — matches Linear/Notion density
* Muted text uses `text-muted-foreground`, never opacity hacks

---

## 2.3 Spacing

Standardize on 4px grid. Current code uses mixed spacing.

```
Key spacings:
gap-1:   4px    — icon-to-label inline
gap-2:   8px    — between related elements
gap-3:   12px   — form field spacing
gap-4:   16px   — section element spacing
gap-6:   24px   — between sections
gap-8:   32px   — between major sections
p-4:     16px   — card padding
p-6:     24px   — page padding (desktop)
p-4:     16px   — page padding (mobile)
```

---

## 2.4 Border Radius

```
--radius: 0.5rem (8px)

radius-sm:  4px  — badges, small buttons
radius-md:  6px  — inputs, selects, dropdowns
radius-lg:  8px  — cards, dialogs, tables
radius-xl:  12px — feature cards, modals
radius-full: 9999px — avatars, status dots
```

---

## 2.5 Shadows

Current system has no shadows. Add minimal shadow tokens.

```css
--shadow-xs:  0 1px 2px oklch(0 0 0 / 0.04)                     /* inputs */
--shadow-sm:  0 1px 3px oklch(0 0 0 / 0.06), 0 1px 2px oklch(0 0 0 / 0.04)  /* cards */
--shadow-md:  0 4px 8px oklch(0 0 0 / 0.06), 0 2px 4px oklch(0 0 0 / 0.04)  /* dropdowns */
--shadow-lg:  0 8px 24px oklch(0 0 0 / 0.08)                    /* dialogs */
```

In dark mode: shadows nearly invisible, rely on border + elevation via background.

---

## 2.6 Icons

Keep Lucide React (already installed, good coverage).

### Rules

* Size: `h-4 w-4` (16px) for inline, `h-5 w-5` (20px) for standalone
* Color: `text-muted-foreground` by default, `text-foreground` when active
* No colored icons except status indicators
* Stroke width: default (2px)

---

## 2.7 States

### Interactive States

```
Default:  base styles
Hover:    background shift + subtle transition (150ms)
Focus:    ring-2 ring-ring ring-offset-2
Active:   slightly darker/lighter background
Disabled: opacity-50 cursor-not-allowed
```

### Data States

```
Loading:  skeleton pulse or spinner
Empty:    illustrated empty state
Error:    destructive border + message
Success:  success border/badge + message
```

---

## 2.8 Badges

Redesign current Badge component with semantic variants.

```
default:     brand color bg, white text (status: completed)
secondary:   muted bg, muted-foreground text (metadata)
outline:     transparent bg, border, foreground text (neutral info)
destructive: red bg (status: failed)
success:     green bg (status: completed, images generated)
warning:     amber bg (status: partial, processing)
```

---

## 2.9 Tables

Current tables are functional. Improvements:

* Consistent row height: 48px
* Hover state: subtle background change
* Header: `text-xs font-medium uppercase tracking-wider text-muted-foreground`
* Cells: `text-sm`
* Sticky header on scroll
* Alternating row background: NO (keep clean)
* Border: outer border only, no internal vertical borders (current style is fine)

---

## 2.10 Forms

* Label: `text-sm font-medium` above input
* Input height: 36px (h-9)
* Input border: `border-input` with focus ring
* Select: match input styling exactly
* Error: red border + error text below field
* Help text: `text-xs text-muted-foreground` below input
* Spacing between fields: `gap-4` (16px)
* Button: full-width on mobile, auto-width on desktop

---

# 3. Dashboard Redesign

### Current State

Static cards with hardcoded "0" values. No real data. No visual hierarchy.

### Target

Professional overview with real data from database.

### Changes

* **Metric Cards** (3 cards, single row)
  * Fetch real counts: total generations, total pins, credits balance
  * Large number (`text-2xl font-bold`)
  * Subtle icon right-aligned
  * Trend indicator placeholder (text, not chart — e.g. "12 this week")

* **Quick Actions Bar**
  * Primary CTA: "New Generation" button (prominent)
  * Secondary: "View History" link

* **Recent Generations** (table, last 5)
  * Keyword, status badge, pins count, date
  * "View all" link to History
  * Shows skeleton while loading

### Layout

```
[ Metric ] [ Metric ] [ Metric ]
[ Quick Actions Bar              ]
[ Recent Generations Table       ]
```

---

# 4. Sidebar Redesign

### Current State

Basic link list, hidden on mobile (no mobile nav), disabled items shown grayed out.

### Target

Professional sidebar matching Linear/Notion density.

### Changes

* **Logo area**: brand mark + "OmniFlow" text, smaller height (h-12)
* **Navigation groups**: labeled sections (platform-agnostic structure)
  * Workspace: Dashboard, Projects
  * Content: Pinterest Generator, History
  * Account: Credits (disabled), Settings (disabled)
  * Structure designed to accommodate future content types beyond Pinterest
* **Active state**: left border accent (3px) + subtle background, not just background
* **Icons**: 16px, muted color, foreground when active
* **Hover**: subtle background transition (150ms)
* **Collapsed state** (future-ready): not implemented, but structure should allow it
* **Mobile**: slide-in drawer triggered by hamburger in topbar
* **Footer**: user email truncated + avatar placeholder (initials circle)

---

# 5. Topbar Redesign

### Current State

Right-aligned email + logout button. No breadcrumbs. No mobile menu.

### Target

Professional topbar with context.

### Changes

* **Left side**: mobile menu hamburger (md:hidden) + breadcrumb (optional)
* **Right side**: credits badge (compact) + user dropdown menu
* **User dropdown**: email, divider, Settings link, Sign Out
* **Credits badge**: pill with coin icon + number, subtle style
* **Height**: h-12 (48px, reduced from h-14)

---

# 6. Projects UI

### Current State

Functional but basic table with name, date, and actions.

### Target

Clean, Notion-like project list.

### Changes

* **Project cards or rows** with:
  * Project name (medium weight)
  * Description preview (truncated, muted)
  * Default badge
  * Generation count
  * Last activity date ("2 days ago" relative format)
  * Actions dropdown (unchanged logic)
* **New Project button**: consistent with design system
* **Empty state**: improved with icon and clear CTA

---

# 7. Pinterest Generator UI

### Current State

Form with basic inputs (max-w-lg). Functional but feels like a prototype.

### Target

Professional, focused generation form.

### Changes

* **Layout**: centered card (max-w-xl), subtle shadow, proper padding
* **Form fields**: consistent label + input spacing
* **Keyword input**: larger, emphasized (primary input feel)
* **Selects**: compact row for language + pins count side by side
* **Generate button**: full-width, prominent, with keyboard shortcut hint
* **Loading state**: button shows spinner + "Generating..." + disable form
* **Credit cost preview**: "This will use ~X credits" below button (future-ready text)

---

# 8. Results Screen UI

### Current State

Badges row + table. Actions clustered in PageHeader. Functional but dense.

### Target

Clean results view with clear hierarchy.

### Changes

* **Summary card**: keyword, language, model, date — in a compact card at top
* **Status row**: generation status + image status as semantic badges
* **Action bar**: clear separation — Generate Images | Schedule | Export CSV | New Generation
* **Pin table**: improved with redesigned rows
  * Image thumbnail: rounded-md, proper aspect ratio
  * Title: medium weight, single line truncated
  * Expandable row for description + keywords + image prompt (click to expand)
  * Copy buttons on hover per field
* **Partial completion**: clear yellow warning banner

---

# 9. History UI

### Current State

Filters bar + table. Functional.

### Target

Polished data view with better filters and visual hierarchy.

### Changes

* **Search**: prominent keyword search at top
* **Filters**: inline filter pills (project, language, status) below search
* **Table**: improved row design
  * Status as colored dot (not text badge) — green/yellow/red
  * Relative dates ("2 hours ago")
  * Project name as subtle pill
  * Actions on hover (not always visible dropdown)
* **Empty state**: contextual message based on active filters

---

# 10. Empty States

### Current State

Generic EmptyState component with title, description, and optional CTA. No illustrations.

### Target

Contextual, helpful empty states per screen.

### Changes per Screen

| Screen     | Icon        | Title                      | CTA                    |
|------------|-------------|----------------------------|------------------------|
| Dashboard  | BarChart    | No activity yet            | Create your first project |
| Projects   | FolderOpen  | No projects                | New Project            |
| Pinterest  | Image       | Ready to generate          | Create a project first |
| History    | Clock       | No generations yet         | Go to Pinterest Generator |
| History (filtered) | Search | No matching results   | Clear filters          |
| Results    | FileX       | No pins generated          | Try again              |

### Component Update

Add `icon` prop to EmptyState component. Increase padding. Improve typography hierarchy.

---

# 11. Loading States

### Current State

Only `Loader2` spinner in PinForm button. No page-level loading.

### Target

Consistent loading patterns.

### Patterns

* **Button loading**: spinner + text change (already exists, standardize)
* **Page loading**: skeleton layout matching real content
* **Inline loading**: small spinner for individual actions (delete, export)
* **Full-page loading**: centered spinner with app shell visible (sidebar + topbar remain)

---

# 12. Skeletons

### Current State

Skeleton component exists in shadcn but is not used anywhere.

### Target

Skeleton placeholders for every data-fetching view.

### Create Skeletons For

* **DashboardSkeleton**: 3 metric card skeletons + table skeleton
* **ProjectsTableSkeleton**: 3-5 row placeholders
* **HistoryTableSkeleton**: filter bar skeleton + 5 row placeholders
* **ResultsSkeleton**: summary card skeleton + table skeleton
* **PinFormSkeleton**: form field placeholders (for initial project load)

### Implementation

Use Suspense boundaries in page components with skeleton fallbacks.

```tsx
<Suspense fallback={<DashboardSkeleton />}>
  <DashboardContent />
</Suspense>
```

---

# 13. Toasts

### Current State

Sonner is configured. Basic success/error messages.

### Target

Consistent toast system with proper types.

### Rules

* **Success**: green accent, auto-dismiss 3s — "Pins generated", "Project created"
* **Error**: red accent, auto-dismiss 5s — "Generation failed", "Delete failed"
* **Warning**: amber accent, auto-dismiss 4s — "Insufficient credits"
* **Info**: blue accent, auto-dismiss 3s — "CSV downloaded"
* **Position**: bottom-right (desktop), bottom-center (mobile)
* **Max visible**: 3

### Implementation

Create `showToast()` wrapper with preset types if Sonner doesn't support all variants natively. Configure Sonner theme in root layout to match design system colors.

---

# 14. Dialogs

### Current State

shadcn Dialog used for delete confirmations and schedule. Basic styling.

### Target

Consistent, professional dialog system.

### Rules

* **Width**: max-w-md (confirmations), max-w-lg (forms like Schedule)
* **Overlay**: dark semi-transparent backdrop with blur
* **Animation**: fade + scale-up (shadcn default is fine)
* **Actions**: right-aligned, destructive action on left, cancel on right
* **Close button**: top-right X icon
* **Title**: text-lg font-semibold
* **Description**: text-sm text-muted-foreground

### Dialogs to Audit

* DeleteProjectDialog — verify consistency
* DeleteGenerationDialog — verify consistency
* ScheduleDialog — verify consistency, improve form layout

---

# 15. Responsive Strategy

### Current State

Desktop-first. Sidebar hidden on mobile (`hidden md:flex`). No mobile navigation.

### Target

Usable on tablet and mobile. Generation remains desktop-optimized.

### Breakpoints

```
sm:  640px   — mobile landscape
md:  768px   — tablet portrait (sidebar visible)
lg:  1024px  — tablet landscape / small desktop
xl:  1280px  — desktop
```

### Mobile (< 768px)

* Sidebar: slide-in sheet/drawer, triggered by hamburger
* Topbar: hamburger (left) + logo (center) + user menu (right)
* Tables: horizontal scroll or card-based layout
* Forms: full-width inputs, stacked layout
* Page padding: p-4 (reduced from p-6)
* Action buttons: full-width stacked

### Tablet (768px - 1024px)

* Sidebar: visible, narrower (w-56)
* Tables: hide low-priority columns
* Forms: same as desktop

### Desktop (> 1024px)

* Full layout as designed
* Sidebar: w-60 (slightly reduced from w-64)
* Content max-width: none (fluid within container)

---

# 16. Reusable Components to Create

| Component          | Purpose                                          |
|--------------------|--------------------------------------------------|
| StatusDot          | Colored dot for status (green/yellow/red)        |
| MetricCard         | Dashboard metric card with icon + value + label  |
| FilterPills        | Inline filter bar with active state              |
| MobileNav          | Slide-in drawer for mobile sidebar               |
| UserMenu           | Dropdown with avatar, email, settings, logout    |
| CreditsBadge       | Compact pill showing credits balance             |
| SkeletonTable      | Generic table skeleton with N rows               |
| SkeletonCard       | Generic card skeleton                            |
| RelativeDate       | "2 hours ago" / "3 days ago" from timestamp      |
| ActionBar          | Consistent button bar for page actions           |
| PageContainer      | Standardized page wrapper with consistent padding|

---

# 17. Existing Components to Modify

| Component            | Changes                                              |
|----------------------|------------------------------------------------------|
| Sidebar              | Groups, active state redesign, mobile drawer, footer |
| Topbar               | Hamburger, user dropdown, credits badge              |
| PageHeader           | Refined typography, optional breadcrumb support      |
| EmptyState           | Add icon prop, improve spacing and typography        |
| Badge                | Add success, warning variants                        |
| PinForm              | Centered card layout, improved spacing               |
| PinTable             | Hover actions, expandable rows, improved density     |
| ExportCsvButton      | Consistent with ActionBar pattern                    |
| GenerateImagesButton | Consistent with ActionBar pattern                    |
| ScheduleDialog       | Improved form layout within dialog                   |
| HistoryFilters       | Convert to FilterPills pattern                       |
| HistoryTable         | Status dots, relative dates, hover actions           |
| ProjectActions       | Consistent with hover-reveal pattern                 |
| DashboardPage        | Real data, metric cards, recent activity             |
| globals.css          | New color tokens, shadows, typography refinements    |

---

# 18. Libraries

### Keep (already installed)

* shadcn/ui — component primitives
* Lucide React — icons
* Sonner — toasts
* Tailwind CSS 4 — styling
* class-variance-authority — variants
* tailwind-merge — utility merging

### Add (only if justified)

| Library              | Purpose                          | Justification                              |
|----------------------|----------------------------------|--------------------------------------------|
| @radix-ui/react-sheet | Mobile drawer/sheet             | Not bundled with current shadcn setup. Needed for mobile nav. Alternative: add shadcn Sheet component via CLI. |

### Do NOT Add

* Framer Motion — no complex animations needed
* Chart libraries — no charts in this task
* Date libraries (date-fns, dayjs) — use Intl.RelativeTimeFormat for relative dates
* CSS-in-JS — Tailwind is sufficient
* Any state management library

---

# 19. Risks

| Risk                                     | Mitigation                                            |
|------------------------------------------|-------------------------------------------------------|
| Breaking existing functionality          | UI-only changes, no API/DB/logic modifications        |
| Inconsistent application of design system | Apply changes screen by screen, verify each           |
| Mobile navigation complexity             | Use shadcn Sheet component, keep logic simple          |
| Dark mode regressions                    | Test every component in both modes                     |
| Tailwind 4 CSS variable conflicts        | Test token changes incrementally                       |
| Scope creep into business logic          | Strict rule: only touch presentation layer             |
| Performance regression from added components | Skeletons/suspense should improve perceived perf    |

---

# 20. Success Criteria

1. **Visual consistency**: every screen uses the same design tokens (colors, spacing, typography)
2. **Professional appearance**: a first-time user perceives OmniFlow as a commercial product
3. **Mobile usability**: all screens navigable on 375px width
4. **Loading experience**: no blank screens — skeletons on every data-fetching page
5. **Empty states**: every list/table has a helpful empty state
6. **Dark mode**: fully functional, not an afterthought
7. **No regressions**: all existing features work identically after redesign
8. **Build passes**: TypeScript strict mode, ESLint, `next build` with zero errors
9. **Performance**: no increase in bundle size > 10KB
10. **Dashboard**: shows real data from database

---

# 21. Implementation Order (Suggested)

Phase A — Foundation:
1. Design tokens (globals.css: colors, shadows, typography)
2. Badge variants (success, warning)
3. PageContainer + ActionBar components

Phase B — Shell:
4. Sidebar redesign + mobile navigation
5. Topbar redesign + UserMenu + CreditsBadge
6. Dashboard with real data + MetricCard

Phase C — Screens:
7. Projects UI
8. Pinterest Generator form
9. Results screen
10. History UI

Phase D — Polish:
11. Empty states (all screens)
12. Skeletons + Suspense boundaries
13. Loading states
14. Toast configuration
15. Dialog audit
16. Responsive testing + fixes

Phase E — UI Polish (final):
17. Visual consistency audit across all screens
18. Spacing harmonization (4px grid compliance)
19. Iconography review (size, color, weight consistency)
20. UX micro-details (focus states, transitions, hover feedback)

---

# Estimated Scope

Files to create: ~10 new components
Files to modify: ~20 existing files
Files to delete: 0
Database changes: 0
API changes: 0
New dependencies: 0-1 (shadcn Sheet via CLI)

---

This plan awaits approval before any implementation begins.
