# OmniFlow Design System

Version: 1.2

---

# Philosophy

OmniFlow is an AI-powered SaaS focused on productivity.

The interface must feel:

* Professional
* Premium
* Minimal
* Fast
* Clean
* Calm

The UI should never feel like an admin panel or a CRUD application.

Every screen should communicate quality and simplicity.

Inspired by:

* Linear
* Vercel
* Stripe Dashboard
* Notion
* Raycast
* OpenAI Platform
* Typefully

These products are references for quality only.
Never copy their branding.

---

# Core Principles

## 1. Content First

The content is always more important than decoration.

Avoid unnecessary visual noise.

---

## 2. Simplicity

Every component should have one obvious purpose.

If something can be removed without reducing usability, remove it.

---

## 3. Consistency

The same action should always look identical.

The same information should always be displayed the same way.

---

## 4. Breathing Space

Use generous spacing.

Avoid crowded layouts.

Whitespace is part of the design.

---

## 5. Hierarchy

Users should immediately know:

* where they are
* what is important
* what action to perform next

---

# Color Palette

## Primary

Violet (`#7C3AED`)

Used only for:

* Primary buttons
* Active navigation
* Links
* Focus ring
* Interactive elements

Never use the primary color as page background.

---

## Brand Accent

Cyan (`#0891B2`)

A rare highlight color, not a structural one. Reserved for AI/analysis-context moments only (e.g. the Content Analyzer panel, "using content analysis" indicators). Not used for buttons, navigation, or general interactive elements — those stay Primary.

Distinct from shadcn's internal `--accent` token (a structural hover-state color used across menus/dropdowns, which stays in the neutral/violet family, not cyan).

---

## Neutral

Background

Near-white, fully neutral (`#FAFAFA`) — no perceptible violet tint. Violet is reserved for interactive elements only (see Buttons discipline below), never for structural surfaces.

Cards / Popovers

Pure white — one step lighter than the page background, so dense forms/tables remain maximally legible during all-day use.

Secondary Background

Very light violet-tinted gray

Borders

Soft violet (`#DDD6FE`)

Muted Text

Medium gray

Primary Text

Deep indigo (`#1E1B4B`)

---

## Semantic Colors

Success

Green

Warning

Amber

Error

Red

Info

Blue

Only semantic components may use these colors.

---

# Typography

Font Family

Headings: Space Grotesk

Body: DM Sans

Fallback:

System UI

---

## Headings

H1

Page titles

Bold

Large

H2

Section titles

Semibold

H3

Card titles

Medium

---

## Body

Default

Readable

Comfortable line height

Muted

For descriptions

Small

For metadata

---

Never use more than three font sizes inside the same component.

---

# Layout

Desktop first.

Maximum content width:

1280px

Default page padding:

32px

Section spacing:

32px

Card spacing:

24px

Grid gap:

24px

---

## Content Width By Page Type

Not every page should stretch to the full 1280px. `PageContainer` accepts a `narrow` prop for this.

List / grid pages — max-width 1280px (default, unchanged)

```txt
Dashboard
Projects
Boards
History
```

Simple form pages — max-width ~672px (`max-w-2xl`), centered, `<PageContainer narrow>`

```txt
Research
Generate (Pinterest Generator)
New / Edit Project
New / Edit Board
```

A form page stretched to 1280px reads as unfinished — inputs and a single submit button floating in empty space. Narrow width keeps the eye's travel distance short and the form feeling intentional.

---

# Radius

Small components

8px

Cards

12px

Dialogs

16px

Buttons

10px

Never mix many different radii.

---

# Shadows

Very subtle.

Avoid heavy shadows.

Use elevation only to separate layers.

---

# Buttons

Variants

Primary

Main action

Secondary

Alternative action

Outline

Neutral action

Ghost

Toolbar actions

Destructive

Delete actions

Loading state required.

Disabled state required.

Hover state required.

Focus state required.

---

## Discipline: One Primary Per Screen

Primary (solid violet) is reserved for exactly **one** button per screen — the single most important action a user takes there (e.g. "Generate Content" on the Dashboard, "Research" on Research, "Generate Pins" on the Generator).

Repeated or list-level actions — "New Project", "New Board", "Create Project", "Continue to Generate", "Go to Generator", and similar navigational shortcuts that appear every time the user visits a page — always use Outline, never Primary. These are not the page's core action; they are a way in or a way forward, and should read as neutral, dark-text (`--foreground`, deep indigo) controls rather than compete with the screen's one true CTA.

A screen showing two solid-violet buttons at once is a bug. Modals are an exception: a dialog's own primary action (e.g. "Apply Schedule") may be solid violet independently of the page behind it, since it is evaluated as its own self-contained context.

Form submit buttons (Research, Generate Pins) size to their label plus padding and align to the right of the form — never full-width. A full-width button on a narrow form reads as an oversized target with no visual weight; a right-aligned, standard-size button reads as a deliberate, confident action.

---

# Inputs

All inputs should have:

* label
* placeholder
* helper text when needed
* validation message

Consistent height.

Consistent padding.

Visible focus ring.

---

# Cards

Cards are preferred over traditional tables whenever possible.

Every card should have:

* title
* optional description
* action area
* consistent padding

Avoid decorative elements.

---

# Tables

Use tables only for real datasets.

Never create HTML-looking tables.

Tables must have:

* generous row height
* soft separators
* hover state
* sticky header when useful

---

# Badges

Variants

Default

Primary

Success

Warning

Error

Muted

Badges must be compact.

---

# Icons

Use Lucide Icons only.

Size:

16px

18px

20px

Avoid mixing icon libraries.

Icons should always accompany actions.

---

# Sidebar

Grouped navigation.

Workspace

Content

Account

Active item:

* dark foreground text (not violet)
* a 2px left indicator bar in the primary color
* no filled background

Collapsed mode must remain usable.

---

# Topbar

Clean.

Minimal.

Contains only:

* credits
* user menu

No unnecessary controls.

---

# Dashboard

The dashboard is not a statistics page.

It is the product home.

Always include:

* overview
* quick actions
* recent activity
* important metrics

The user should understand the workspace in less than five seconds.

---

# Generator

The Generator is the core feature.

Treat it as the hero experience.

Avoid generic HTML forms.

Use cards and visual grouping.

Highlight the primary action.

---

# Results

Results are the most valuable screen.

Images should receive visual priority.

Actions should be immediately visible.

Metadata should be secondary.

Avoid dense layouts.

---

# History

Optimized for scanning.

Support:

* search
* filters
* badges
* relative dates

---

# Empty States

Every empty state should include:

* icon
* title
* description
* primary action

Never leave blank pages.

---

# Loading

Prefer Skeletons.

Avoid blocking the UI.

Buttons must show loading indicators.

---

# Dialogs

Use confirmation dialogs only for destructive actions.

Keep dialogs compact.

Primary action aligned to the right.

---

# Animations

Fast.

Subtle.

Never decorative.

No animation longer than 200ms.

---

# Accessibility

Keyboard navigation.

Visible focus state.

Good contrast.

Buttons must remain accessible.

---

# Responsive

Desktop First.

Tablet supported.

Mobile usable.

No feature may disappear on smaller screens.

---

# Performance

Server Components by default.

Client Components only when interaction is required.

Avoid unnecessary re-renders.

Avoid heavy libraries.

---

# Design Rules

Before creating a new component ask:

* Can an existing component be reused?
* Is this visually consistent?
* Does it simplify the interface?
* Does it improve the user experience?

If the answer is no, redesign before implementing.

---

# Golden Rule

Every screen should look like a product someone would be happy to pay for.
