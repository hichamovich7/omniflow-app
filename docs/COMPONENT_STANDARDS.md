# OmniFlow Component Standards

Version: 1.0

---

# Purpose

This document defines how UI components must be designed, implemented and maintained across OmniFlow.

The goal is to build a scalable component library that remains consistent as the product grows.

These rules apply to every React component.

---

# Component Philosophy

Components should solve one problem.

They should not try to solve multiple unrelated problems.

A component must be:

* reusable
* predictable
* composable
* easy to test
* easy to replace

---

# Single Responsibility

Each component has exactly one responsibility.

Good

Button

Card

ProjectCard

PinCard

HistoryFilters

Bad

DashboardComponent

GeneratorEverything

MainUI

---

# Prefer Composition

Build interfaces by composing small components.

Avoid large monolithic components.

Good

Page

↓

Section

↓

Card

↓

Button

Avoid components with hundreds of lines.

---

# Presentational vs Logic

Separate UI from business logic.

Prefer:

Server Component

↓

Container

↓

Presentational Component

Example

ProjectList

↓

ProjectCard

Business logic should never live inside visual components.

---

# Server Components First

Default to Server Components.

Only use Client Components when interaction is required.

Examples

Client Components

Forms

Dialogs

Dropdowns

Date Pickers

Search

Server Components

Dashboard

Cards

Lists

Pages

Tables

Statistics

---

# Component Size

Target size

100–150 lines

Maximum recommended

250 lines

If a component grows larger:

Split it.

---

# File Naming

Use PascalCase.

Examples

ProjectCard.tsx

PinCard.tsx

GenerateButton.tsx

Never

project-card.tsx

card.tsx

component.tsx

---

# Folder Organization

Feature-first.

Example

components/

projects/

ProjectCard.tsx

ProjectActions.tsx

ProjectForm.tsx

ProjectHeader.tsx

Avoid dumping everything inside components/.

---

# Props

Props should be explicit.

Avoid boolean explosions.

Bad

<Button
primary
large
rounded
blue
/>

Prefer

<Button
variant="primary"
size="lg"
/>

---

# Variants

Every reusable component should expose variants.

Example

Button

primary

secondary

outline

ghost

destructive

Badge

default

success

warning

error

muted

Never create multiple components for styling only.

---

# Reuse Before Create

Before creating a new component ask:

Can Button be reused?

Can Card be reused?

Can Dialog be reused?

Can Badge be reused?

Only create a new component if the answer is no.

---

# Business Logic

Never place business rules inside reusable UI components.

Bad

PinCard generates images.

Good

PinCard displays data.

Image generation belongs to services or API routes.

---

# Styling

Always use shared design tokens.

Never hardcode:

colors

spacing

font sizes

border radius

Use the Design System.

---

# State Management

Keep state as close as possible to where it is used.

Avoid unnecessary prop drilling.

Avoid global state unless required.

---

# Loading States

Every async component must support loading.

Preferred

Skeleton

↓

Spinner

↓

Disabled button

Never leave interactive elements active while processing.

---

# Error States

Components must gracefully handle:

empty

loading

error

success

No component should assume data always exists.

---

# Accessibility

Every interactive component must support:

Keyboard navigation

Focus state

ARIA labels where needed

Screen reader compatibility

Accessibility is part of the component.

Not an afterthought.

---

# Icons

Only use Lucide.

Do not mix icon libraries.

Icons are decorative unless they improve usability.

Buttons with icons must remain understandable.

---

# Buttons

Buttons trigger actions.

Links navigate.

Never use buttons as links.

Never use links as buttons.

---

# Cards

Cards represent objects.

Examples

Project

Generation

Pin

Image

Cards should not become generic layout containers.

---

# Dialogs

Dialogs exist only for:

Confirmation

Editing

Important actions

Avoid nesting dialogs.

---

# Forms

Every form should include:

labels

validation

error messages

loading state

submit state

cancel action

Use shared form components whenever possible.

---

# Tables

Use tables only for structured data.

If images dominate the content, use cards instead.

---

# Empty States

Every reusable list component should support:

loading

empty

data

error

Never require the parent to implement all four repeatedly.

---

# API Boundaries

UI components must never know database details.

Never call Supabase directly from reusable UI components.

Prefer

API Route

↓

Server Action

↓

Hook

↓

Component

---

# Hooks

Extract reusable logic into hooks.

Examples

useProjects()

useHistoryFilters()

useSchedulePreview()

Avoid duplicate logic across components.

---

# Utilities

Shared logic belongs in:

lib/

Never duplicate formatting functions.

Examples

formatDate()

formatRelativeDate()

formatPinterestPublishDate()

generatePinterestCsv()

---

# Performance

Memoize only when necessary.

Avoid premature optimization.

Prefer simple code.

Measure before optimizing.

---

# Testing Mindset

Every component should be easy to test.

Ask:

Can I render it independently?

Can I mock its props?

Can I reuse it elsewhere?

If not, redesign it.

---

# Documentation

Complex reusable components should include:

Purpose

Props

Variants

Usage example

Known limitations

Future contributors should understand the component quickly.

---

# Refactoring Rule

If three screens implement the same UI pattern:

Extract a reusable component.

Do not wait for five copies.

---

# Golden Questions

Before creating any new component ask:

1. Does a similar component already exist?

2. Can I compose existing components?

3. Is this component solving only one problem?

4. Is it reusable?

5. Does it follow the Design System?

6. Is business logic separated from presentation?

7. Would another developer understand it in five minutes?

If any answer is "No", redesign before implementing.

---

# Final Principle

Components are the building blocks of OmniFlow.

A great product is not built from large pages.

It is built from small, consistent, reusable components that work together seamlessly.
