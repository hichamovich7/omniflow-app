# OmniFlow Design System

Version: 1.0

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

Blue

Used only for:

* Primary buttons
* Active navigation
* Links
* Focus ring
* Interactive elements

Never use the primary color as page background.

---

## Neutral

Background

White

Secondary Background

Very light gray

Borders

Soft gray

Muted Text

Medium gray

Primary Text

Near black

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

Geist

Fallback:

Inter

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

* primary color
* subtle background
* left indicator

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
