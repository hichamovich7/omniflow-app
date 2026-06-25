# OmniFlow Design Blueprint

Version: 1.0

Status: AWAITING APPROVAL

---

# 1. Visual Identity

## Personality

OmniFlow is an AI Content Operating System.

It is not a dashboard. It is not an admin panel. It is not a tool.

It is a workspace where content professionals create, manage and export content at scale.

The personality is:

* Calm intelligence — the product feels smart without being noisy
* Quiet confidence — premium quality communicated through restraint, not decoration
* Focused productivity — every pixel serves the user's workflow

## Emotional Response

When a user opens OmniFlow for the first time, they should feel:

"This is a serious product built by people who understand design."

Not:

"This looks like a developer built it over a weekend."

## Visual Language

* White is the dominant color. Content sits on white.
* Gray exists to create hierarchy and separation. Never as decoration.
* Blue is the single accent color. It means "action" and "active". Nothing else.
* Semantic colors (green, amber, red) appear only inside badges and status indicators. They never appear in backgrounds, borders, or large surfaces.
* Typography creates hierarchy. Not borders. Not colors. Not boxes.
* Shadows are elevation signals, not decoration. Most surfaces have no shadow at all.
* Borders are nearly invisible. They exist to separate, not to frame.

## What OmniFlow is NOT

* Not colorful — one accent color, everything else is neutral
* Not playful — no illustrations, no emojis, no rounded cartoon elements
* Not dense — generous whitespace everywhere
* Not complex — progressive disclosure, never overwhelm

---

# 2. App Shell

The app shell is the permanent frame that surrounds every page.

It consists of three elements: Sidebar, Topbar, and Content Area.

```
+------------------+----------------------------------------+
|                  |  Topbar                                |
|    Sidebar       +----------------------------------------+
|                  |                                        |
|    w-56          |  Content Area                          |
|                  |                                        |
|    fixed left    |  scrollable                            |
|    full height   |  max-w-5xl centered                    |
|                  |  px-8 py-8                             |
|                  |                                        |
+------------------+----------------------------------------+
```

### Why this structure

* Fixed sidebar provides spatial anchoring. The user always knows where they are.
* Narrow sidebar (w-56 / 224px) maximizes content space without sacrificing navigation.
* Content area is centered with max-w-5xl (1024px) to maintain comfortable line lengths.
* Topbar is minimal — it exists for global context, not navigation.

---

# 3. Sidebar

## Purpose

Navigation and spatial orientation.

The user should answer "Where am I?" by glancing at the sidebar.

## Blueprint

```
+-------------------------+
|                         |
|  [O] OmniFlow           |   Logo area — h-14
|                         |
+-------------------------+
|                         |
|  WORKSPACE               |   Group label
|    Dashboard             |   Nav item
|    Projects              |   Nav item
|                         |
|  CONTENT                 |   Group label
|    Pinterest Generator   |   Nav item (active)
|    History               |   Nav item
|                         |
|  ACCOUNT                 |   Group label
|    Credits               |   Nav item (disabled)
|    Settings              |   Nav item (disabled)
|                         |
|                         |
|                         |
+-------------------------+
```

### Logo Area

* Product mark: small rounded square with initial "O", using primary color
* Product name: "OmniFlow" in 13px font-semibold
* Height: 56px (h-14)
* No border below — the logo area blends into the navigation

### Navigation Groups

Three groups, ordered by frequency of use:

1. **Workspace** — where the user manages their environment (Dashboard, Projects)
2. **Content** — where the user creates and reviews (Pinterest Generator, History)
3. **Account** — configuration and billing (Credits, Settings)

Why this order: users visit Content most frequently, but Workspace establishes context. Account is lowest frequency.

### Group Labels

* 11px uppercase, tracking-widest
* Very low opacity (muted-foreground/60)
* Purely functional — they organize, they don't compete for attention

### Navigation Items

* 13px text, normal weight for inactive, medium weight for active
* Icons: 15px — smaller than typical, creating a refined, compact feel
* Icon + label gap: 10px (gap-2.5)
* Vertical padding: 6px (py-1.5) — tight but comfortable
* Spacing between items: 1px (space-y-px) — items feel connected as a group

### Active State

* Background: primary color at 8% opacity — a subtle tint, not a block
* Text: primary color
* No left indicator bar — the color tint is sufficient

Why no left indicator: it creates visual noise in a narrow sidebar. The color shift alone communicates active state clearly. This follows Linear's approach — subtle but unambiguous.

### Disabled Items

* 30% opacity of muted-foreground
* cursor-not-allowed
* No hover effect

### Hover State (inactive items)

* Background: muted color
* Text: shifts to foreground color
* Transition: 100ms — fast enough to feel instant

### Overall Sidebar Styling

* Background: same as page background (nearly white) — no visual separation other than the right border
* Border-right: border color at 60% opacity — barely visible
* Width: 224px (w-56)

### Design Rationale

This sidebar is intentionally restrained. In products like Linear and Vercel, the sidebar recedes into the background. It is always there, always usable, but never the focus. The content area is where the user's attention should live.

---

# 4. Topbar

## Purpose

Global context. User identity. Credits.

The topbar does NOT navigate. The sidebar navigates.

## Blueprint

```
+------------------------------------------------------------------+
|  [hamburger]                              42 credits    [A]       |
+------------------------------------------------------------------+
     mobile only                            plain text      avatar
     md:hidden                              xs size         h-7 w-7
```

### Elements

Left side:
* Hamburger menu — visible only on mobile (md:hidden). Opens sidebar as sheet.

Right side:
* Credits — plain text, not a badge. "42 credits" in xs muted text. No icon. Credits are informational, not interactive.
* User avatar — initials circle, 28px (h-7 w-7), primary/10 background tint, primary text color.

### What is NOT in the topbar

* No page title (the page content handles its own title)
* No breadcrumbs (one level of navigation is sufficient)
* No search (search lives contextually on pages that need it)
* No notifications (not in MVP)

### Height

48px (h-12). Minimal vertical footprint.

### Border

Bottom border at 60% opacity — consistent with sidebar border treatment.

### Design Rationale

The topbar in most SaaS products is overloaded. Vercel's topbar is instructive: it contains almost nothing. The less the topbar contains, the more the content area commands attention.

---

# 5. Dashboard

## Purpose

Answer the question: "What is happening in my workspace?"

The dashboard is the product home. Not a statistics page. Not a report.

It should feel like opening your workspace in the morning and immediately understanding the state of things.

## Blueprint

```
+------------------------------------------------------------------+
|                                                                    |
|  Good morning                                                      |
|  Here's what's happening in your workspace.                        |
|                                                                    |
+------------------------------------------------------------------+
|                                                                    |
|  +-----------+  +-----------+  +-----------+  +-----------+        |
|  | GENS      |  | PINS      |  | PROJECTS  |  | CREDITS   |        |
|  |    12     |  |   120     |  |     3     |  |    500    |        |
|  +-----------+  +-----------+  +-----------+  +-----------+        |
|                                                                    |
+------------------------------------------------------------------+
|                                                                    |
|  +--------------------+ +------------------+ +------------------+  |
|  | [*] New Generation | | [+] New Project  | | [c] View History |  |
|  |  Create Pinterest  | |  Organize your   | |  Browse past     |  |
|  |  content           | |  content         | |  generations     |  |
|  +--------------------+ +------------------+ +------------------+  |
|                                                                    |
+------------------------------------------------------------------+
|                                                                    |
|  Recent Activity                                    View all ->    |
|                                                                    |
|  +--------------------------------------------------------------+  |
|  | * bathroom storage ideas                                      |  |
|  |   Bathroom Blog · English · 10 pins              2h ago       |  |
|  +--------------------------------------------------------------+  |
|  | * healthy recipes meal prep                                   |  |
|  |   Food Blog · Deutsch · 20 pins                  1d ago       |  |
|  +--------------------------------------------------------------+  |
|  | * home office setup ideas                                     |  |
|  |   Decor Project · English · 5 pins               3d ago       |  |
|  +--------------------------------------------------------------+  |
|                                                                    |
+------------------------------------------------------------------+
```

### Block 1: Greeting

* Time-based greeting: "Good morning" / "Good afternoon" / "Good evening"
* Optional user name if available
* Subtitle: "Here's what's happening in your workspace."
* Why: personalizes the experience. The user is welcomed, not dumped into data.

### Block 2: Metrics

Four cards in a single row (2 columns on small screens, 4 on desktop).

Each card:
* Label: 11px uppercase tracking-wider, muted
* Value: 24px (text-2xl) semibold
* No icon — the label is sufficient. Icons in metric cards add visual noise without improving comprehension.

Cards: Generations | Pins Created | Projects | Credits

Why these four: they represent the complete workspace state. A user immediately knows their scale (generations, pins), organization (projects), and capacity (credits).

Why no icons: metrics are numbers. The label explains the number. An icon is a third element competing for a space that only needs two. Linear and Stripe use label+number without icons.

### Block 3: Quick Actions

Three cards in a row, each linking to a primary workflow.

Each card:
* Icon container: 36px (h-9 w-9) rounded-lg, using primary/10 for the main action, muted for secondary
* Title: 14px (text-sm) font-medium
* Description: 12px (text-xs) muted
* Arrow icon: appears on hover, shifts right by 2px — a micro-interaction signaling interactivity
* Full card is clickable

Cards: New Generation | New Project | View History

Why three: these represent the three most common user intents when arriving at the dashboard. "New Generation" is primary (primary tint). The others are secondary (muted tint).

### Block 4: Recent Activity

Timeline of the last 5 generations.

Each row:
* Status dot: 8px circle (success/warning/error/neutral)
* Keyword: 14px font-medium, primary information
* Metadata inline: project name · language · pin count, separated by dots, 11px muted
* Relative date: right-aligned, 11px muted
* Full row is clickable (links to results)

Empty state when no generations exist:
* Centered icon in circular muted background
* "No activity yet"
* "Start by creating your first generation."
* Text link: "Get started →"

### Why this layout

The dashboard follows the Information Priority principle from UI_PRINCIPLES.md:

1. Greeting — establishes context (who, when)
2. Metrics — establishes scale (how much)
3. Quick Actions — enables next step (what to do)
4. Recent Activity — provides continuity (what happened)

Users read top-to-bottom. The most urgent information (metrics and actions) is above the fold. The historical information (activity) is below.

---

# 6. Projects

## Purpose

Answer the question: "What am I working on?"

Projects are organizational entities. They are not tasks or items in a list. Each project represents a body of work.

## Layout Decision: Cards

Cards, not a table.

Justification per DESIGN_SYSTEM.md: "Cards are preferred over traditional tables whenever possible." Projects have:
* a name (title)
* a description (optional)
* metadata (creation date, generation count)
* an action area (edit, delete, set default)

This matches the Card definition exactly. A table would flatten this hierarchy.

## Blueprint

```
+------------------------------------------------------------------+
|                                                                    |
|  Projects                                        [+ New Project]   |
|  Organize your content by project                                  |
|                                                                    |
+------------------------------------------------------------------+
|                                                                    |
|  +---------------------+  +---------------------+  +-----------+  |
|  | [folder] My Blog    |  | [folder] Travel FR  |  | [folder]  |  |
|  |  German Pinterest   |  |  French travel      |  |  Recipe   |  |
|  |  project for bath.  |  |  content project    |  |  content  |  |
|  |                     |  |                     |  |           |  |
|  |  12 gens · 3d ago   |  |  5 gens · 1w ago   |  |  0 gens   |  |
|  |  Default            |  |                     |  |  just now |  |
|  +---------------------+  +---------------------+  +-----------+  |
|                                                                    |
+------------------------------------------------------------------+
```

### Card Anatomy

```
+--------------------------------------+
|                              [...] |   Actions dropdown (top-right)
|  [folder-icon]  Project Name        |   Icon + title row
|                 Description text    |   Optional, line-clamp-2
|                 that wraps to two   |
|                 lines maximum       |
|                                     |
|  12 generations · 3d ago · Default  |   Metadata footer
+--------------------------------------+
```

* Icon: FolderOpen, 16px, inside a 36px muted rounded-lg container
* Name: 14px font-medium
* Description: 12px muted, line-clamp-2
* Metadata footer: 11px muted, separated by dots
* "Default" label: primary color text, font-medium — no badge, just text
* Actions: dropdown trigger (three dots), positioned absolute top-right
* Hover: border shifts from border/60 to border (subtle darkening)

### Grid

* Desktop: 3 columns (lg:grid-cols-3)
* Tablet: 2 columns (sm:grid-cols-2)
* Mobile: 1 column
* Gap: 12px (gap-3)

### Empty State

* Icon: FolderOpen in rounded-2xl container (48px)
* Title: "No projects yet"
* Description: "Projects help you organize your generated content. Create one to get started."
* CTA: Primary button "New Project"

---

# 7. Pinterest Generator

## Purpose

Answer the question: "What do I want to create?"

This is the hero experience. The core feature. The reason users pay.

Per DESIGN_SYSTEM.md: "The Generator is the core feature. Treat it as the hero experience."

Per UI_PRINCIPLES.md: "AI generation pages are the heart of OmniFlow. They should never feel like HTML forms. Instead they should feel like creative workspaces."

## Design Philosophy

The generator should feel like a focused creative moment. When the user lands here, the world narrows. There is one thing to do: enter a keyword and generate content.

No sidebar distraction. No excessive options. No visual noise.

The form is not wrapped in a Card component. Cards represent objects. The generator is an experience, not an object.

## Blueprint

```
+------------------------------------------------------------------+
|                                                                    |
|                                                                    |
|                      [sparkles-icon]                               |
|                                                                    |
|               Generate Pinterest Content                           |
|                                                                    |
|          Enter a keyword to generate optimized pins                |
|          with titles, descriptions, and image prompts.             |
|                                                                    |
|                                                                    |
|  +--------------------------------------------------------------+  |
|  |  Keyword                                                      |  |
|  |  [ small bathroom storage ideas                          ]    |  |
|  +--------------------------------------------------------------+  |
|                                                                    |
|  +-----------------------+  +-------------+  +----------+          |
|  | Project               |  | Language    |  | Pins     |          |
|  | [ Bathroom Blog    v] |  | [ English v]|  | [ 10  v] |          |
|  +-----------------------+  +-------------+  +----------+          |
|           flex-1                 w-32           w-28                |
|                                                                    |
|  +--------------------------------------------------------------+  |
|  |              [sparkles]  Generate Pins                        |  |
|  +--------------------------------------------------------------+  |
|           h-11, w-full, primary, prominent                         |
|                                                                    |
|                                                                    |
+------------------------------------------------------------------+
```

### Hero Section

* Icon: Sparkles in a rounded-2xl container (48px), primary/10 background
* Title: 18px (text-lg) font-semibold
* Description: 14px (text-sm) muted, max two lines
* Centered alignment

Why a hero section: it transforms a form page into a destination. The user arrives and immediately understands the purpose. It also creates breathing space above the form, which follows the "Breathing Space" principle.

### Keyword Input

* Larger than other inputs: h-11 (44px)
* Larger font: 15px
* Placeholder text at low opacity (40%)
* This is the primary input — it should feel prominent

Why larger: the keyword is the most important decision the user makes. Making it physically larger signals importance. Every other field is secondary configuration.

### Configuration Row

Three controls in a single row:

* Project: flex-1 (takes remaining space)
* Language: fixed w-32
* Pins: fixed w-28
* Gap: 16px (gap-4)
* Labels: 12px (text-xs) muted, uppercase feeling without being uppercase

Why 3 columns: per Progressive Disclosure, we show only what the user needs to decide. Advanced options (model, prompt config) don't exist here.

### Generate Button

* Full width (w-full)
* Tall: h-11 (44px) — matching the keyword input
* Primary color — the only primary button on the page
* Sparkles icon + "Generate Pins" text
* Loading state: spinner + "Generating..."

### Error Display

* Below the configuration row, above the button
* Subtle destructive/5 background with destructive text
* Rounded-lg, px-3 py-2

### What is NOT on this page

* No PageHeader component — the hero section replaces it
* No description of credits cost (future feature)
* No model selector (per Progressive Disclosure)
* No advanced AI settings
* No recent generations

---

# 8. Results

## Purpose

Answer the question: "What has AI created?"

Per DESIGN_SYSTEM.md: "Results are the most valuable screen. Images should receive visual priority."

Per UI_PRINCIPLES.md: "Results pages are the most valuable pages in the product. Never hide the generated content."

## Design Philosophy

This is where value is delivered. The user invested credits and waiting time. The results must feel valuable.

Images dominate. Titles are readable. Metadata is secondary. Actions are always visible.

## Blueprint

```
+------------------------------------------------------------------+
|                                                                    |
|  [<]  bathroom storage ideas                                       |
|       English · 10 pins · gemini-2.5-flash · 2h ago  [completed]   |
|                                                                    |
|                    [Images(3)] [Schedule] [Export CSV]              |
|                                                                    |
+------------------------------------------------------------------+
|                                                                    |
|  +------------------+  +------------------+  +------------------+  |
|  |  +-----------+   |  |  +-----------+   |  |  +-----------+   |  |
|  |  |           |   |  |  |           |   |  |  |           |   |  |
|  |  |   image   |   |  |  |   image   |   |  |  |   image   |   |  |
|  |  |           |   |  |  |           |   |  |  |           |   |  |
|  |  +-----------+   |  |  +-----------+   |  |  +-----------+   |  |
|  |                   |  |                   |  |                   |  |
|  |  Title of the     |  |  Title of the     |  |  Title of the     |  |
|  |  generated pin    |  |  generated pin    |  |  generated pin    |  |
|  |                   |  |                   |  |                   |  |
|  |  Description text |  |  Description text |  |  Description text |  |
|  |  that describes   |  |  that describes   |  |  that describes   |  |
|  |  the pin cont...  |  |  the pin cont...  |  |  the pin cont...  |  |
|  |                   |  |                   |  |                   |  |
|  |  [board-name]     |  |  [board-name]     |  |  [board-name]     |  |
|  +------------------+  +------------------+  +------------------+  |
|                                                                    |
|   ... more pin cards ...                                           |
|                                                                    |
+------------------------------------------------------------------+
```

### Header

* Back arrow: clickable, returns to generator. Small (h-6 w-6), ghost hover.
* Keyword as page title: text-xl font-semibold — this is the identity of the generation
* Metadata inline: language · pin count · model · relative date, 12px muted, separated by dots
* Status badge: success/warning/destructive semantic variant
* Partial badge: warning variant, only when pins < requested

Why the keyword as title: because it is. The user typed this keyword. It's their intent. Making it the page title creates a clear identity for this results page.

### Actions Row

* Generate Images button: primary or outline depending on state
* Schedule button: outline
* Export CSV button: outline
* All buttons size="sm"
* Positioned below the metadata, aligned right on desktop

### Pin Cards

Grid layout: sm:2 lg:3

Each card:

```
+--------------------------------+
|  +-------------------------+   |
|  |                         |   |
|  |      Generated Image    |   |   aspect-2/3, max-h-48
|  |      (if exists)        |   |   rounded top corners
|  |                         |   |
|  +-------------------------+   |
|                                |
|  Title of the pin         #1   |   14px medium + index
|                                |
|  Description text that         |   12px muted
|  wraps to three lines          |   line-clamp-3
|  maximum for readability       |
|                                |
|  [board-name]    Jun 15, 09:00 |   pill + date (if scheduled)
+--------------------------------+
```

* Image: aspect-2/3, max-h-48, full width, cover mode. If no image, no image placeholder — the card simply starts with the title.
* Title: 14px font-medium
* Index: 11px muted, right-aligned alongside the title
* Description: 12px muted, line-clamp-3, leading-relaxed
* Board: inline pill (muted bg, 11px font-medium)
* Publish date: 11px muted (only if scheduled)
* Card: rounded-xl, border at 60% opacity, bg-card, hover darkens border

Why cards instead of a table: pins contain images, titles, descriptions, keywords, and boards. Per COMPONENT_STANDARDS.md: "If images dominate the content, use cards instead." Per UI_PRINCIPLES.md: "If content includes Images, Descriptions, Actions, Metadata — Prefer cards instead."

Why no keywords in the card: keywords are secondary metadata. Showing them in every card creates visual noise. They are present in the CSV export. If needed, they can be revealed on card expansion in a future iteration.

---

# 9. History

## Purpose

Answer the question: "What have I already generated?"

Per DESIGN_SYSTEM.md: "Optimized for scanning."

Per UI_PRINCIPLES.md: "Search first. Filters second. Sorting third."

## Design Philosophy

History is a timeline of work. Not a data table. Each entry represents a creative session — a moment when the user generated content.

The user is scanning for a specific generation. They need to find it fast.

## Blueprint

```
+------------------------------------------------------------------+
|                                                                    |
|  History                                                           |
|  Browse your past generations                                      |
|                                                                    |
+------------------------------------------------------------------+
|                                                                    |
|  [search icon] Search keywords...    [Project v] [Lang v] [Sts v]  |
|                                                                    |
+------------------------------------------------------------------+
|                                                                    |
|  +--------------------------------------------------------------+  |
|  | *  bathroom storage ideas                              2h ago |  |
|  |    Bathroom Blog · English · 10 pins                     [...] |  |
|  +--------------------------------------------------------------+  |
|  | *  healthy recipes meal prep                            1d ago |  |
|  |    Food Blog · Deutsch · 20 pins                         [...] |  |
|  +--------------------------------------------------------------+  |
|  | x  garden furniture ideas                               3d ago |  |
|  |    Outdoor Project · English · 5 pins                    [...] |  |
|  +--------------------------------------------------------------+  |
|                                                                    |
+------------------------------------------------------------------+
```

### Filters

* Search: full-width on mobile, max-w-xs on desktop. Leading search icon at 50% opacity. Placeholder: "Search keywords..." at 40% opacity. 300ms debounce.
* Filters: three compact selects — Project (w-36), Language (w-28), Status (w-28). Height: h-9.
* Layout: search left, filters right on desktop. Stacked on mobile.

### Generation Cards

Each generation is a card (rounded-xl, border at 60% opacity).

Card anatomy:
* Status dot: 8px circle (success/processing/error/neutral)
* Keyword: 14px font-medium — this is the primary identifier
* Metadata: project name · language · pin count, 11px muted, separated by dots
* Relative date: right-aligned, 11px muted
* Actions dropdown: three dots, visible on hover only (opacity transition)
* Full card is clickable — navigates to results

### Spacing

Cards are separated by 8px (space-y-2). Not touching, not far apart. A comfortable rhythm.

### Empty State (no filters)

* Icon: Clock in rounded-2xl container (48px)
* "No generations yet"
* "Your generation history will appear here once you create your first batch of pins."
* CTA: "Go to Generator"

### Empty State (with filters)

* Icon: Search in rounded-2xl container (48px)
* "No matching results"
* "Try adjusting your filters to find what you're looking for."
* CTA: "Clear filters" (outline button)

---

# 10. Empty States

Per DESIGN_SYSTEM.md: "Every empty state should include: icon, title, description, primary action."

Per UI_PRINCIPLES.md: "An empty page is never acceptable. Every empty state should encourage the next action."

## Blueprint (generic)

```
+--------------------------------------------------+
|                                                    |
|                                                    |
|                                                    |
|               +----------+                         |
|               |  [icon]  |   48px, rounded-2xl     |
|               +----------+   muted background      |
|                                                    |
|              Title Text                            |
|                                                    |
|       Description text that explains               |
|       what this area is for and what               |
|       the user should do next.                     |
|                                                    |
|             [ Primary CTA ]                        |
|                                                    |
|                                                    |
|                                                    |
+--------------------------------------------------+
     border-dashed, border/60, rounded-xl, py-20
```

## Per-Screen Empty States

| Screen | Icon | Title | Description | CTA |
|---|---|---|---|---|
| Dashboard activity | Sparkles | No activity yet | Start by creating your first generation. | Get started → (text link) |
| Projects | FolderOpen | No projects yet | Projects help you organize your generated content. Create one to get started. | New Project |
| Generator (no projects) | Sparkles | No projects yet | Create a project before generating pins. Projects help you organize your content. | Create Project |
| Results (no pins) | Sparkles | No pins generated | This generation didn't produce any results. | (none) |
| History (no data) | Clock | No generations yet | Your generation history will appear here once you create your first batch of pins. | Go to Generator |
| History (no results) | Search | No matching results | Try adjusting your filters to find what you're looking for. | Clear filters |
| Credits | Coins | Coming soon | Credit management will be available in a future update. | (none) |
| Settings | Settings | Coming soon | Settings will be available in a future update. | (none) |

---

# 11. Loading States

Per DESIGN_SYSTEM.md: "Prefer Skeletons. Avoid blocking the UI."

Per UI_PRINCIPLES.md: "Skeleton → Spinner → Progress → Success → Error"

## Skeletons

Every page that fetches data should show a skeleton matching its final layout.

### Dashboard Skeleton

```
+------------------------------------------------------------------+
|  [====  ====  ====]                     greeting placeholder       |
|  [==============]                       subtitle placeholder       |
|                                                                    |
|  [=====] [=====] [=====] [=====]        four metric cards          |
|                                                                    |
|  [===========] [===========] [===========]  three action cards     |
|                                                                    |
|  [====]                                  section title             |
|  [=================================]     activity row              |
|  [=================================]     activity row              |
|  [=================================]     activity row              |
+------------------------------------------------------------------+
```

### Projects Skeleton

```
+------------------------------------------------------------------+
|  [===] [===]                              header                   |
|                                                                    |
|  [=========] [=========] [=========]      three project cards      |
+------------------------------------------------------------------+
```

### History Skeleton

```
+------------------------------------------------------------------+
|  [===] [===]                              header                   |
|  [===============]  [===] [===] [===]     filters                  |
|                                                                    |
|  [=================================]     generation card           |
|  [=================================]     generation card           |
|  [=================================]     generation card           |
+------------------------------------------------------------------+
```

## Button Loading

Buttons with async actions show:
* Spinner icon (Loader2 with animate-spin)
* Text changes to present participle: "Generate" → "Generating..."
* Button is disabled during loading

## Image Generation Loading

The Generate Images button has explicit states:
* none: "Images (N)" — primary button
* processing: "Generating..." — spinner, disabled
* completed: "Images Ready" — outline, checkmark, disabled
* partial/failed: "Retry (N)" — warning icon

---

# 12. Mobile Adaptation

Per DESIGN_SYSTEM.md: "Desktop First. Tablet supported. Mobile usable. No feature may disappear on smaller screens."

## Strategy

The app shell transforms. The content simplifies. No features are removed.

### Shell Transformation

```
Desktop (>768px)              Mobile (<768px)
+--------+----------+        +------------------+
| Sidebar| Content  |   →    | [=] Topbar    [A]|
|        |          |        +------------------+
|        |          |        |                  |
+--------+----------+        |  Content         |
                              |  (full width)    |
                              |                  |
                              +------------------+
```

* Sidebar becomes a slide-in sheet (left side), triggered by hamburger
* Topbar shows hamburger on left, logo center (optional), avatar right
* Content area: padding reduces from px-8 to px-4

### Grid Simplification

| Component | Desktop | Tablet | Mobile |
|---|---|---|---|
| Metrics | 4 cols | 4 cols | 2 cols |
| Quick Actions | 3 cols | 3 cols | 1 col (stacked) |
| Project Cards | 3 cols | 2 cols | 1 col |
| Pin Cards | 3 cols | 2 cols | 1 col |
| History Cards | 1 col | 1 col | 1 col |

### Form Adaptation

* Generator: keyword input stays full width, config row stays 3 cols on tablet, stacks on small mobile
* Filter row: stacks vertically on mobile, search full width, selects full width

### Touch Considerations

* All tap targets minimum 44px height
* Cards: full card is tappable
* Dropdown triggers: minimum 40px touch area
* Spacing between interactive elements: minimum 8px

---

# 13. Reusable Component Inventory

Components needed, mapped to COMPONENT_STANDARDS.md principles:

## Primitive Components (Design System level)

| Component | Responsibility | Server/Client |
|---|---|---|
| StatusDot | Render colored status indicator | Server |
| MetricCard | Render label + value metric | Server |
| PageContainer | Provide consistent page padding and max-width | Server |
| ActionBar | Group action buttons horizontally | Server |
| EmptyState | Render empty state with icon, title, description, CTA | Server |

## Layout Components

| Component | Responsibility | Server/Client |
|---|---|---|
| Sidebar / SidebarContent | Render navigation groups | Client (usePathname) |
| Topbar | Render global context bar | Server |
| MobileNav | Render slide-in sidebar for mobile | Client (useState) |
| UserMenu | Render user dropdown with logout | Client (useRouter) |
| PageHeader | Render page title + description + actions | Server |

## Feature Components

| Component | Responsibility | Server/Client |
|---|---|---|
| PinForm | Generation form with keyword + configuration | Client (form state) |
| PinCard (PinTable) | Render grid of generated pin cards | Server |
| ProjectCard (in Projects page) | Render project card with metadata | Server |
| GenerateImagesButton | Trigger image generation with state | Client (fetch + state) |
| ExportCsvButton | Generate and download CSV | Client (click handler) |
| ScheduleDialog | Schedule configuration dialog | Client (dialog state) |
| HistoryFilters | Search + filter controls with URL sync | Client (searchParams) |
| HistoryCard (HistoryTable) | Render generation cards in timeline | Server |

## Skeleton Components

| Component | Purpose |
|---|---|
| DashboardSkeleton | Skeleton matching dashboard layout |
| TableSkeleton | Generic skeleton for card lists |

---

# 14. Visual Token Summary

All values reference the Design System. This is a mapping, not a redefinition.

### Typography Scale (in use)

| Token | Size | Usage |
|---|---|---|
| text-xl | 20px | Page titles (h1) |
| text-lg | 18px | Section hero titles |
| text-sm / 14px | 14px | Body text, card titles, nav items |
| text-[13px] | 13px | Descriptions, sidebar nav |
| text-xs / 12px | 12px | Labels, metadata, form labels |
| text-[11px] | 11px | Timestamps, group labels, inline metadata |

### Spacing Scale (in use)

| Token | Value | Usage |
|---|---|---|
| space-y-8 | 32px | Between major page sections |
| gap-4 | 16px | Between form fields, within sections |
| gap-3 | 12px | Between cards in grid, between quick actions |
| gap-2 | 8px | Between action buttons, between history cards |
| py-6 / py-8 | 24–32px | Page top/bottom padding |
| px-4 / px-8 | 16–32px | Page horizontal padding (mobile/desktop) |
| p-4 / p-5 | 16–20px | Card internal padding |

### Border Strategy

* Primary border: border-border/60 — nearly invisible, separation only
* Hover border: border-border — slightly more visible on interaction
* Dashed border: border-dashed border-border/60 — empty states only
* No heavy borders anywhere

### Radius Strategy

* Cards, containers: rounded-xl (12px matches Design System "Cards: 12px")
* Icon containers: rounded-lg (10px) or rounded-2xl (16px for hero icons)
* Buttons: inherit from shadcn (10px matches Design System)
* Small elements (badges, pills): rounded-md (6px)
* Avatar: rounded-full

---

# 15. Design Validation Checklist

Before implementation, every screen must pass:

- [ ] One obvious primary action per screen (UI_PRINCIPLES.md)
- [ ] Visual hierarchy: Primary Action → Content → Secondary → Metadata (UI_PRINCIPLES.md)
- [ ] No more than 3 font sizes per component (DESIGN_SYSTEM.md)
- [ ] Cards for objects, tables only for structured datasets (DESIGN_SYSTEM.md)
- [ ] Empty state with icon + title + description + CTA (DESIGN_SYSTEM.md)
- [ ] Loading skeleton matching final layout (UI_PRINCIPLES.md)
- [ ] Keyboard navigation works (DESIGN_SYSTEM.md)
- [ ] Comfortable on mobile without losing features (DESIGN_SYSTEM.md)
- [ ] "Would someone pay for this?" test (DESIGN_SYSTEM.md Golden Rule)
- [ ] Component follows single responsibility (COMPONENT_STANDARDS.md)
- [ ] Server Component unless interaction required (COMPONENT_STANDARDS.md)
- [ ] Design tokens used, no hardcoded values (COMPONENT_STANDARDS.md)

---

This blueprint awaits approval before implementation begins.
