# OmniFlow Design System

Status: proposed visual source of truth  
Version: 1.0  
Scope: visual design and frontend styling only

This document is the canonical visual specification for OmniFlow. It supersedes visual guidance in `DESIGN_SYSTEM.md`, `DESIGN_BLUEPRINT.md`, `UI_UX.md`, `UI_PRINCIPLES.md`, and `COMPONENT_STANDARDS.md` when those documents conflict. Those files remain useful historical and implementation context; they should be reconciled gradually rather than deleted.

## Design Direction

OmniFlow is a premium content-operations SaaS. Its interface should feel modern, clean, professional, calm, data-oriented, minimal, and precise. The product must look dependable during long work sessions, with clear hierarchy and compact-but-comfortable density.

The primary visual reference is the UI/UX Pro Max SaaS analytics demo. The reference is a marketing landing page rather than an application dashboard, so OmniFlow should borrow its light canvas, crisp hierarchy, vivid controlled accents, white surfaces, restrained borders, and clear data visualization—not its landing-page composition, decorative glow, tilted mockup, or branding.

### Brand expression

- Blue communicates primary action, selection, navigation, links, and focus.
- Purple is a scarce secondary accent for AI-assisted or distinctive product moments.
- Green, amber, and red are reserved for semantic states.
- Neutral surfaces and typography carry most of the interface.
- Hierarchy comes first from type, spacing, and layout; borders and shadows are supporting signals.
- Each screen has one visually dominant primary action. Repeated and navigational actions are secondary or outline.

### Avoid

- Excessive gradients, glassmorphism, blur, neon, or glow.
- Crypto, gaming, or sci-fi visual language.
- Decorative animation or motion longer than 300 ms.
- Large shadows, dark borders, nested cards, and boxes around every region.
- More than three simultaneous accent hues in one view.
- Tiny body copy, placeholder-only labels, or state conveyed by color alone.
- Page-specific styling that bypasses shared primitives without a documented reason.

## Current UI Audit

Audit date: 2026-09-24.

### Existing foundation

- Next.js 16, React 19, Tailwind CSS 4, shadcn, Base UI, CVA, and Lucide.
- Semantic CSS variables already live in `app/globals.css`, including light/dark themes, surfaces, state colors, charts, sidebar tokens, radius, and four shadows.
- Shared primitives exist for buttons, inputs, textarea, select, checkbox, cards, badges, tables, dialogs, sheets, dropdown menus, separators, skeletons, and page containers.
- Shared product patterns exist for page states, resource headers, filters, bulk actions, status badges, and the application shell.
- Interactions generally expose visible focus states and use short 150–200 ms transitions.
- No component-level hexadecimal colors were found; the codebase mostly uses semantic tokens.

### Main issues observed

1. **Competing source documents.** Existing design documents disagree on primary hue, fonts, sidebar active state, shell dimensions, density, and even whether OmniFlow should resemble a dashboard. This makes otherwise sound component decisions drift over time.
2. **Brand direction mismatch.** The live theme is violet-first (`Space Grotesk` + `DM Sans`), while the requested direction is blue-first with purple as a secondary accent.
3. **Radius drift.** The UI uses `rounded`, `sm`, `md`, `lg`, `xl`, `2xl`, `4xl`, and full pills. `rounded-lg`, `rounded-xl`, and `rounded-2xl` are all common, so visually equivalent surfaces do not share one radius role.
4. **Typography drift.** At least 69 arbitrary text-size uses were found: 29 at 11 px, 22 at 10 px, 11 at 13 px, four at 12 px, and two at 9 px, plus a custom `0.8rem`. Several are labels or metadata, but 9–11 px reduces readability and creates many unofficial type roles.
5. **Primitive bypasses.** Dashboard widgets and feature forms sometimes use raw `button` and `input` elements with bespoke focus, height, radius, and padding rules instead of shared variants.
6. **Surface duplication.** Repeated combinations such as `rounded-xl border border-border/60 bg-surface p-5` recreate card styling outside `Card`. `EmptyState` and `PageState` also overlap visually.
7. **Control density mismatch.** Core primitives default to 32 px controls, while authentication overrides them to 40 px and touch guidance calls for 44 px on compact screens. A deliberate desktop/mobile density policy is missing.
8. **Page title mismatch.** Global `.text-page-title` uses 24 px, while `PageHeader` uses 20 px. Feature pages also introduce local 20/24 px headings.
9. **Shell inconsistency.** The current sidebar is 256 px and the topbar is 72 px, while older documentation describes 224 px and 48 px. The active item combines a tinted fill with a left indicator even though older documents prescribe only one of those treatments.
10. **Dark mode is real but under-documented.** The application follows the system theme and defines dark tokens. It must be preserved and verified, not accidentally removed during the light-theme refresh.
11. **Semantic color leakage.** Most usage is tokenized, but a small number of amber, emerald, and orange utilities remain in feature components. These should move to semantic variants when their components are standardized.
12. **Live visual coverage is incomplete.** Playwright verified the login screen at 1440 px and 390 px. Private routes correctly redirect without a session, so dashboard, table, chart, and modal rendering still require an authenticated visual pass.

### Live observations

- The login page is responsive with no visible horizontal overflow at 390 px.
- The desktop login composition leaves a very large empty field around a small central form; this is calm but visually under-articulated.
- The full-width purple submit control is clear, but it reflects the current violet identity rather than the new blue-first direction.
- Form labels, controls, and focus borders are consistent on the inspected screen.
- The Next.js development indicator appeared in captures and is not part of the product UI.

## Color System

The palette is blue-first, neutral-led, and compatible with semantic CSS variables. Hex values are canonical design references; implementation may store perceptually equivalent OKLCH values.

### Core tokens

| Token                              | Light value | Use                                                         |
| ---------------------------------- | ----------- | ----------------------------------------------------------- |
| `--background` / `--canvas`        | `#F7F9FC`   | Application canvas                                          |
| `--foreground`                     | `#172033`   | Primary text and icons                                      |
| `--surface` / `--card`             | `#FFFFFF`   | Cards and primary surfaces                                  |
| `--surface-muted` / `--muted`      | `#F1F5FA`   | Secondary regions and quiet hover                           |
| `--surface-elevated` / `--popover` | `#FFFFFF`   | Menus, popovers, dialogs                                    |
| `--muted-foreground`               | `#687386`   | Secondary text; do not reduce opacity further for body copy |
| `--subtle-foreground`              | `#7F8A9D`   | Metadata at 12 px or larger only                            |
| `--border`                         | `#E8EDF4`   | Subtle separators and card borders                          |
| `--input`                          | `#D9E2EC`   | Input boundary                                              |
| `--primary`                        | `#1570EF`   | Primary CTA, active navigation, links                       |
| `--primary-hover`                  | `#0F5ECB`   | Primary hover/pressed                                       |
| `--primary-foreground`             | `#FFFFFF`   | Text/icons on primary                                       |
| `--selected`                       | `#EAF3FF`   | Selected and active soft background                         |
| `--ring`                           | `#2583FF`   | Focus ring                                                  |
| `--secondary`                      | `#EEF3F8`   | Secondary controls                                          |
| `--secondary-foreground`           | `#344054`   | Text on secondary controls                                  |
| `--brand-accent`                   | `#7C3CFF`   | Rare AI/special-feature accent                              |
| `--brand-accent-soft`              | `#F2ECFF`   | Soft purple context surface                                 |
| `--success`                        | `#168A45`   | Positive and completed state                                |
| `--success-soft`                   | `#ECFDF3`   | Success surface                                             |
| `--warning`                        | `#B54708`   | Warning text/icon                                           |
| `--warning-soft`                   | `#FFF7E8`   | Warning surface                                             |
| `--destructive`                    | `#D92D20`   | Error and destructive action                                |
| `--destructive-soft`               | `#FEF3F2`   | Error surface                                               |

The original `#2583FF` remains the vivid brand blue for rings and graphical highlights. `#1570EF` is used for solid buttons because it provides stronger contrast with white text. Muted text must not be implemented with repeated opacity reductions; use a dedicated token when a quieter tier is necessary.

### Color usage

- Blue: primary CTA, current location, links, progress, focus, and the principal chart series.
- Purple: AI-assisted features or one secondary chart series; never a second competing CTA color.
- Green: success, active, completed, or positive change.
- Amber: warning and attention.
- Red: errors, failures, destructive actions, and critical values.
- Neutral: structure, metadata, inactive states, and most UI chrome.

### Chart palette

Use at most five simultaneous series, in this order:

1. Blue `#1570EF`
2. Purple `#7C3CFF`
3. Green `#16A34A`
4. Orange `#D97706`
5. Cyan `#0891B2`

Grid lines use `--border`; axes use `--subtle-foreground`; tooltips use `--surface-elevated` and `--shadow-sm`. Do not rely on red/green alone. Pair series with labels, shapes, or line styles and provide a textual or tabular equivalent for important data.

### Dark mode

Dark mode already exists and must be preserved. Do not derive it by inverting the light palette. Map the same semantic roles to dark surfaces and verify text, border, focus, selected, semantic, and chart contrast independently. No dark-mode redesign is part of the first implementation batch.

## Typography

### Target family

- UI and headings: **Inter Variable**.
- Monospace: **Geist Mono** for IDs, code, and tabular technical values only.
- Fallback: `ui-sans-serif, system-ui, sans-serif`.

Inter is preferred over the current Space Grotesk + DM Sans pairing because it simplifies the system, remains highly legible in compact forms and tables, and supports the requested modern SaaS tone without becoming anonymous when combined with OmniFlow's blue/purple color language. The migration should occur once at the root token rather than page by page.

Use only 400, 500, 600, and 700; normal product UI should primarily use 400/500/600.

### Type scale

| Role          | Size / line height | Weight     | Tracking                    |
| ------------- | ------------------ | ---------- | --------------------------- |
| Display       | 32 / 38 px         | 700        | `-0.025em`                  |
| Page title    | 28 / 34 px         | 700        | `-0.02em`                   |
| Section title | 22 / 28 px         | 600        | `-0.015em`                  |
| Card title    | 18 / 24 px         | 600        | `-0.01em`                   |
| Body          | 15 / 22 px         | 400        | normal                      |
| Body medium   | 14 / 20 px         | 500        | normal                      |
| Label         | 13 / 18 px         | 500 or 600 | normal                      |
| Metadata      | 12 / 17 px         | 400 or 500 | normal                      |
| KPI           | 30 / 34 px         | 700        | `-0.025em`; tabular figures |

Rules:

- Do not introduce body or interactive text below 12 px.
- Use 15–16 px inputs on mobile to protect readability and avoid browser zoom.
- Prefer wrapping. When truncation is necessary, use an ellipsis and expose the full value through a tooltip or accessible label.
- Use tabular figures for KPI values, credits, dates in data columns, and changing counters.
- A component should normally contain no more than three type roles.
- Use `.text-body-secondary` for secondary body copy. Do not create a `.text-secondary` typography helper because `text-secondary` is reserved for the semantic color utility generated by Tailwind.

## Layout System

### Spacing

Use the Tailwind 4-point scale; do not create a parallel spacing system.

| Token      | Value | Typical use                        |
| ---------- | ----- | ---------------------------------- |
| `space-1`  | 4 px  | Tight internal separation          |
| `space-2`  | 8 px  | Icon/text and compact control gaps |
| `space-3`  | 12 px | Dense groups                       |
| `space-4`  | 16 px | Default component padding/gap      |
| `space-5`  | 20 px | Compact cards                      |
| `space-6`  | 24 px | Standard cards/forms               |
| `space-8`  | 32 px | Sections and desktop page gutters  |
| `space-10` | 40 px | Major separation                   |
| `space-12` | 48 px | Page-level separation              |
| `space-16` | 64 px | Rare marketing/auth separation     |

Defaults:

- Page gutter: 16 px mobile, 24 px tablet, 32 px desktop.
- Page vertical padding: 24 px mobile, 32 px desktop.
- Section gap: 32 px.
- Grid gap: 16 px compact, 24 px standard.
- Card padding: 20 px compact, 24 px standard.
- Form group gap: 20 px; field label/control gap: 8 px.
- Maximum standard content width: 1280 px.
- Narrow forms: 672 px maximum.
- Reading content: 720 px maximum.

### Breakpoints and behavior

- 390 px: single-column layout, 16 px gutter, 44 px minimum touch controls, no unintended horizontal overflow.
- 768 px: mobile navigation may transition to sidebar; two-column cards only when content remains readable.
- 1024 px: desktop application shell and dense tables become primary.
- 1280 px: standard maximum-width layout.
- 1440 px: preserve content width; do not stretch cards or form fields merely to fill space.

Tables may scroll inside a clearly bounded region on small screens, but the page itself must not overflow. Reflow secondary table detail into a stacked row or disclosure when horizontal scrolling harms comprehension.

### Radius

Use role-based radii, backed by a single base token:

| Role          | Value   | Use                                             |
| ------------- | ------- | ----------------------------------------------- |
| `radius-xs`   | 6 px    | Checkboxes and compact tags                     |
| `radius-sm`   | 8 px    | Small controls                                  |
| `radius-md`   | 10 px   | Buttons, inputs, selects                        |
| `radius-lg`   | 14 px   | Filters, dropdowns                              |
| `radius-xl`   | 16 px   | Cards, dialogs, sheets, large states            |
| `radius-full` | 9999 px | Avatars, dots, progress tracks, true pills only |

Do not use `rounded-2xl` or `rounded-full` as a generic decorative choice. The same component role must use the same radius everywhere.

### Borders

- Default: 1 px `--border`.
- Inputs: 1 px `--input`; focus moves to `--ring` plus a subtle 3 px ring.
- Use horizontal separators in tables; avoid vertical cell borders.
- Prefer whitespace or a surface shift before adding another border.

### Shadows

| Token         | Value                              | Use                            |
| ------------- | ---------------------------------- | ------------------------------ |
| `--shadow-xs` | `0 1px 2px rgb(16 24 40 / 0.04)`   | Subtle control/card lift       |
| `--shadow-sm` | `0 2px 8px rgb(16 24 40 / 0.06)`   | Dropdowns and hover elevation  |
| `--shadow-md` | `0 12px 28px rgb(16 24 40 / 0.10)` | Dialogs and important popovers |

Cards should usually use a border with no shadow or `shadow-xs`, never a heavy floating treatment.

### Motion

- Fast: 150 ms for hover, focus, and pressed states.
- Standard: 200 ms for dropdown, popover, and disclosure.
- Deliberate: 250 ms maximum for dialogs and sheets.
- Use opacity and transform; avoid animating dimensions and layout positions.
- Respect `prefers-reduced-motion`.
- No layout-shifting hover effects. Card translation is exceptional and should not be a global pattern.

## Components

### Buttons

Variants: primary, secondary, outline, ghost, destructive, link, and icon. Sizes: small 32 px, medium 40 px, large 44 px. On touch layouts, interactive hit areas are at least 44 × 44 px even when the visible icon is smaller.

Primary uses blue with white text and a darker hover. Destructive uses a solid or soft red treatment according to consequence and context, never the primary blue. Every button needs hover, active, focus-visible, loading, and disabled states. Loading must preserve width.

Button focus-visible uses a solid 2 px `--ring` (or `--destructive` for destructive buttons) with a 2 px `--background` offset. A translucent halo is not enough on solid blue fills, especially in dark mode. Inputs keep the border-to-`--ring` treatment described under Borders.

Button heights are `sm` 36 px, `default` 40 px, and `lg` 44 px, with a 44 px minimum touch target below `md` (48 px for `lg`). Buttons use a 10 px radius, 500 weight, 13–15 px labels, and icons sized to the button (14 / 16 / 18 px). A compact `xs` size (28 px, 12 px text) is reserved for dense bulk and selection bars. Disabled buttons are not faded copies of their variant: they keep full opacity on a muted surface with muted text and a not-allowed cursor, so the label stays readable while clearly inert.

### Inputs and forms

Input, textarea, select, combobox, checkbox, radio, switch, search, date, and file controls share the same 10 px radius, border, label, focus, disabled, read-only, error, and success language. Validate on blur or submit rather than presenting errors on every keystroke. Place errors beside the field and state both the issue and recovery path.

Desktop fields default to 40 px; mobile fields use at least 44 px. Placeholders are examples, never labels.

Read-only fields keep full-strength text on a muted surface with a text cursor, so they stay readable and selectable. Disabled fields use the same muted surface at 60 % opacity with a not-allowed cursor. Placeholders use `--muted-foreground` unmodified, never a translucent variant, so they keep at least 4.5:1 contrast.

### Cards

Standard cards use the `--card` surface, a 16 px radius, a 1 px `--border`, `shadow-xs` (reserve `shadow-sm` for genuinely raised surfaces, never `shadow-md`), and 24 px padding (20 px for `size="sm"`), with no gradient or glow. `CardTitle` is 18 / 24 px, weight 600; `CardDescription` is 14 / 20 px, weight 400, `--muted-foreground`. `CardAction` sits top right with at least 16 px from the title, and `CardFooter` wraps its content with no divider unless `border-t` is added. Use `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, and `CardFooter` instead of repeating page-local surface recipes. Avoid nested cards unless the child is independently actionable or scrollable.

### Page and resource headers

Headers are typographic blocks, not cards: no surface, border, shadow, gradient, or decorative background by default. They are left-aligned and render the page's single `h1`.

- `PageHeader` (main pages): title 28 / 34 px, 700, `-0.02em` (`text-page-title`); optional 13 px / 500 muted eyebrow; optional title-sized muted icon with no tile. The page container provides the 32 px gap below it.
- `ResourceHeader` (detail and resource pages): title 22 / 28 px, 600 (`text-section-title`); optional ghost `icon-sm` back link with an accessible name, centred on the first title line; status uses `Badge` / `StatusBadge` only; metadata is 12 px / 500 muted.
- Descriptions are 14 / 20 px, 400, `--muted-foreground`, capped around 42 rem.
- Actions sit at the right when there is room and wrap under the title otherwise, with an 8 px gap and never horizontal overflow.

### Badges and status

Variants: neutral, primary, success, warning, danger, and purple. Badges are compact; reserve pills for short statuses. Every status includes text and may add a dot/icon—color is never the only signal. `StatusBadge` is the canonical workflow-status component.

Badges are soft, never solid fills: a tinted semantic surface, semantic text that meets 4.5:1 at 12 px, and a subtle same-hue border. They are 22 px tall with 12 px / 500 text, 8 px horizontal padding, and a 6 px radius (`radius-xs`). Text is never smaller than 12 px. Blue marks in-progress or planned states (processing, scheduled), and amber is reserved for states that need attention (at risk, warming).

### Tables

Use a quiet header, 44–48 px rows, horizontal separators, row hover, selected state, keyboard-reachable actions, and `aria-sort` for sortable columns. Numeric data uses tabular figures. Filters, pagination, empty, loading, and error states should be shared across datasets.

### Sidebar

- Light surface with a subtle right border.
- Desktop width target: 240 px; collapse only if the existing information architecture can remain legible.
- Items: 40 px visual height, 16–18 px Lucide icons, 12 px section labels.
- Active: `--selected` background plus blue icon/text. Do not also add a decorative indicator unless later testing shows the fill alone is insufficient.
- Hover: `--surface-muted`; inactive text: `--muted-foreground`.
- Disabled destinations remain identifiable and explain availability rather than disappearing.

### Top navigation

Target height: 64 px desktop and 56 px mobile. Use the same surface, border, focus, radius, and typography language as the sidebar. Keep global actions sparse. Page title and page-specific actions remain in `PageHeader`.

### Dropdowns and popovers

White/elevated surface, 14 px radius, subtle border, `shadow-sm`, 8 px internal padding, clear hover/selected states, and separated dangerous actions. Menu items have a minimum 36 px visual height and 44 px touch target on mobile.

### Dialogs and sheets

Dialogs use 16 px radius, a 40–60% neutral scrim, restrained width, 24 px padding, and explicit title/description/actions. Sheets share the same semantics and motion tokens. Close/cancel and Escape routes must remain available; unsaved destructive dismissal needs confirmation.

### Tooltips

Short, supplemental, and never required to complete an action. Use a dark neutral surface, high-contrast text, 8 px radius, 12 px copy, and a brief entrance. Tooltip content must also be reachable by keyboard.

### Loading, empty, error, and success states

`PageState` should absorb the older `EmptyState` pattern. Skeletons mirror the final component geometry. Use spinners only for compact, short-lived actions. Error states include a recovery action when recovery is possible. Success feedback is concise and uses icon/text in addition to color.

### Charts

Use quiet grid lines, labeled axes and units, nearby legends, exact-value tooltips, and 2 px lines. Area opacity stays below 16%. Reduce tick density and series count on small screens. Provide an accessible summary and a data table or export path for important datasets.

### Icons

Lucide is the sole product icon library. Standard sizes are 14, 16, 18, 20, and 24 px, with consistent outline weight. Do not use emojis as structural icons. Icon-only buttons require an accessible name.

## Accessibility

- Normal text contrast: at least 4.5:1; large text and meaningful UI graphics: at least 3:1.
- Visible 2–3 px focus state on every interactive element.
- Keyboard order follows visual order; dialogs trap and restore focus.
- Meaning is not communicated by color alone.
- Disabled and read-only states are visually and semantically distinct.
- Small-screen controls provide 44 px hit targets and at least 8 px separation.
- Reduced motion is respected.
- Avoid opacity stacking on muted text; use semantic foreground tokens.
- Charts provide nonvisual descriptions and keyboard-accessible data where interactive.

## Main UI Files

| Concern                      | Primary files                                                                                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global tokens and typography | `app/globals.css`, `app/layout.tsx`                                                                                                                                           |
| Application shell            | `app/(dashboard)/layout.tsx`, `components/layout/sidebar.tsx`, `components/layout/topbar.tsx`, `components/layout/mobile-nav.tsx`                                             |
| Page layout and headers      | `components/ui/page-container.tsx`, `components/layout/page-header.tsx`, `components/shared/resource-header/resource-header.tsx`                                              |
| Core controls                | `components/ui/button.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx`, `combobox.tsx`, `checkbox.tsx`, `label.tsx`                                                            |
| Surfaces and overlays        | `components/ui/card.tsx`, `dialog.tsx`, `sheet.tsx`, `dropdown-menu.tsx`, `collapsible.tsx`                                                                                   |
| Data display                 | `components/ui/table.tsx`, `badge.tsx`, `status-dot.tsx`, `components/shared/status/status-badge.tsx`                                                                         |
| Shared states and workflows  | `components/shared/page-state/page-state.tsx`, `components/empty-state.tsx`, `components/shared/filter-bar/filter-bar.tsx`, `components/shared/bulk-actions/bulk-actions.tsx` |
| Representative feature UI    | `components/dashboard/`, `components/projects/`, `components/boards/`, `components/pinterest/`, `components/wordpress/`, `components/history/`, `components/research/`        |

## Governance

1. Use semantic tokens, not raw colors, in feature components.
2. Extend a shared primitive before introducing page-local variants.
3. Document any intentional exception near the component and here if it is reusable.
4. Validate significant visual changes at 1440, 1280, 1024, 768, and 390 px.
5. Run TypeScript/build, ESLint, relevant tests, and `git diff --check` after each batch.
6. A passing build is necessary but not visual validation; inspect authenticated pages and capture representative before/after screenshots.
7. Do not alter product logic, data access, workflows, or content solely to satisfy this design system.
