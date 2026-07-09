# UI_UX.md

# UI / UX Overview

OmniFlow es una plataforma de generación de contenido mediante IA. Pinterest es el primer módulo implementado. La interfaz debe soportar múltiples generadores de contenido con el mismo flujo de trabajo.

La interfaz debe priorizar:

* Simplicidad
* Velocidad
* Claridad
* Flujo de trabajo repetitivo
* Mínimos clics para generar contenido

El usuario principal es un creador que genera múltiples piezas de contenido cada día.

---

# Design Principles

## Primary Goal

Permitir generar contenido optimizado en menos de 60 segundos. El primer módulo validado es Pinterest.

---

## UI Priorities

1. Simplicidad
2. Rapidez
3. Legibilidad
4. Mobile Friendly
5. Acciones visibles

---

## Avoid

* Wizards complejos
* Modales innecesarios
* Navegación profunda
* Más de 2 niveles de navegación

---

# Layout Structure

## Sidebar

Organizado por plataforma (TASK-026):

```txt
Workspace
  Dashboard
  Projects

Pinterest
  Research
  Generate
  Boards
  History

Platforms (disabled — coming soon)
  WordPress
  Facebook
  LinkedIn
  Medium

Account
  Guide
  Credits
  Settings
```

---

## Top Bar

Mostrar:

```txt
Project Selector

Credits Remaining

User Menu
```

---

# Pages

## Login Page

Route:

```txt
/login
```

Elements:

* Logo
* Email
* Password
* Login Button
* Register Link

---

## Register Page

Route:

```txt
/register
```

Elements:

* Email
* Password
* Confirm Password
* Create Account Button

---

## Dashboard

Route:

```txt
/dashboard
```

Purpose:

Resumen rápido del uso.

Cards:

* Total Generations
* Total Pins Generated
* Available Credits
* Active Project

Recent Activity:

* Last Generations

Quick Actions:

* New Generation

---

## Projects

Route:

```txt
/projects
```

Purpose:

Gestionar proyectos.

Actions:

* Create Project
* Rename Project
* Delete Project

Table:

| Column         |
| -------------- |
| Name           |
| Pins Generated |
| Created Date   |

---

# Research

Route:

```txt
/research
```

Purpose:

Research a topic from a keyword, website, or blog before generating pins, using Firecrawl. Step 1 of the product pipeline (Research → Analyze → Generate → ...).

Note: Pinterest URL is not offered as a Source — Firecrawl does not support scraping pinterest.com ("we do not support this site", confirmed via live testing), every submission failed. Historical research results with source type "Pinterest URL" may still exist and are displayed correctly (read-only), but the option is not selectable for new research.

---

## Research Form

Fields:

* Project (select)
* Source (select: Keyword, Website URL, Blog URL)
* Input (single text field, label/placeholder changes with Source — keyword text for Keyword, URL for the others)

Action:

* Research button — calls Firecrawl, shows a preview panel below the form (title + content, scrollable)

---

## Research Preview

Shown after a successful Research call:

* Title (page title for scraped sources, the keyword itself for Keyword source)
* Source URL (scraped sources only)
* Content preview (scrollable box)
* "Analyze" button (outline style) — calls the Content Analyzer, replaces itself with a structured result panel (Theme, Category, Audience, Tone, Keywords, Summary) once done
* "Continue to Generate" button — navigates to the Pinterest Generator with a suggested keyword (and, for URL sources, the source URL) pre-filled; if an analysis was run, its id is carried forward too

Analysis is opt-in and visible, not automatic: the user sees exactly what will be injected into AI generation before continuing (TASK-024). Skipping "Analyze" and clicking "Continue to Generate" directly still works — generation proceeds without analysis context, same as before TASK-024.

---

## Research History

List of past research results for the selected project, below the form:

* Source-type badge (neutral/outline — never colored by status)
* Input, title, relative date
* Failed rows: separate red "Failed" badge, the stored error message shown inline below the row, and a Retry action (hover-reveal) that re-populates the form with the same Project/Source/Input — except for historical Pinterest-source rows, which have no Retry (retrying is guaranteed to fail)
* Delete action (hover-reveal)

Empty states:

* No projects yet → prompt to create a project first (research belongs to a project)
* Has projects, no research yet → simple empty message

---

# Pinterest Generator

Route:

```txt
/pinterest
```

Main feature of the application. Can be reached directly, or via "Continue to Generate" from the Research page (pre-fills Keyword, Project, and — for URL sources — a hidden Website/Pinterest URL carried through for provenance on the generation record; no visible field for it).

If a content analysis was carried over from Research, a small indicator ("Using content analysis from Research") is shown above the form — unlike the hidden URL passthrough, this one changes AI output, so it stays visible (TASK-024).

---

## Input Section

Fields:

### Keyword

Type:

```txt
Text Input
```

Required:

```txt
Yes
```

Example:

```txt
badezimmer inspiration schrank
```

---

### Language

Type:

```txt
Select
```

Options:

```txt
English
Deutsch
Español
Français
```

Required:

```txt
Yes
```

---

### Board

Type:

```txt
Text Input (combobox — suggests existing boards for the selected project, or type a new name)
```

Required:

```txt
No
```

When left blank, the AI suggests a board per pin (auto-linked as before). When filled, every generated pin is assigned to that one board.

---

### Number Of Pins

Type:

```txt
Select
```

Options:

```txt
1
5
10
20
30
```

Default:

```txt
10
```

---

### Website URL

Type:

```txt
URL Input
```

Required:

```txt
No
```

---

### Pinterest URL

Type:

```txt
URL Input
```

Required:

```txt
No
```

---

### Reference Image

Type:

```txt
File Upload
```

Formats:

```txt
PNG
JPG
WEBP
```

Required:

```txt
No
```

---

### Generate Button

Primary Action

Text:

```txt
Generate Pins
```

---

# Loading State

While generating:

Display:

```txt
Generating Pins...
```

Show:

* Spinner
* Progress Message

Disable Form

---

# Results Page

Displayed after generation.

---

## Generation Summary

Show:

```txt
Keyword

Language

Pins Generated

Credits Used

Model Used
```

---

## Pins Table

One row per generated pin.

Columns:

| Column       |
| ------------ |
| Title        |
| Description  |
| Keywords     |
| Board        |
| Image Prompt |

All fields editable.

---

## Pin Card View

Alternative view.

Each card displays:

* Title
* Description
* Keywords
* Board
* Image Prompt

Actions:

* Copy Title
* Copy Description
* Copy Prompt

---

## Character Counters

Title:

```txt
0 / 100
```

Description:

```txt
0 / 500
```

---

## CSV Export

Button:

```txt
Export CSV
```

Downloads Pinterest-compatible CSV.

---

# Boards

Route:

```txt
/boards
```

Purpose:

Manage Pinterest boards as real entities. Boards are created automatically when a generation's suggested board name doesn't match an existing one, or manually via "New Board".

---

## Boards List

Card grid, one card per board:

* Name
* Project
* Pin count
* Actions (Edit, Delete)

Empty states:

* No projects yet → prompt to create a project first (a board must belong to a project)
* Has projects, no boards yet → prompt to create a board manually (boards are otherwise created automatically during generation)

---

## Board Detail

Route:

```txt
/boards/[id]
```

Shows:

* Board name, project, pin count
* Export CSV (this board's pins only)
* Edit / Delete actions
* Pin grid (image, title, description) — read-only, no selection or regeneration since pins here may span multiple generations

---

## New / Edit Board

Route:

```txt
/boards/new
/boards/[id]/edit
```

Fields:

* Project (select, create only — fixed after creation)
* Name

---

# History

Route:

```txt
/history
```

Purpose:

Review previous generations.

---

## Filters

* Project
* Board (scoped to the selected project; changing Project clears the Board filter)
* Language
* Date Range

---

## History Table

Columns:

| Column   |
| -------- |
| Keyword  |
| Language |
| Pins     |
| Credits  |
| Date     |
| Status   |

Actions:

* View
* Export CSV Again

---

# Guide

Route:

```txt
/guide
```

Purpose:

User-facing documentation explaining how each shipped feature works — distinct from `docs/*` (developer-facing). Content lives in `lib/guide/content.ts` (`guideSections`).

Layout:

* Anchor chip row at the top — one per section, jumps to that section's card
* One card per section: icon, title, one-line summary, bullet points
* Static content, no data fetching — Server Component

Must be updated whenever a user-facing feature ships (see CLAUDE.md Documentation Discipline).

---

# Credits

Route:

```txt
/credits
```

Purpose:

Monitor credit usage.

---

## Summary Card

Show:

```txt
Current Balance
```

---

## Transactions Table

Columns:

| Column      |
| ----------- |
| Date        |
| Type        |
| Credits     |
| Description |

---

# Billing

Route:

```txt
/settings/billing
```

Purpose:

Manage subscriptions.

Show:

* Current Plan
* Credits Remaining
* Upgrade Plan

Actions:

* Purchase Credits
* Manage Subscription

---

# Settings

Route:

```txt
/settings
```

Purpose:

Application preferences.

---

## General Settings

Fields:

* Default Language
* Default Pins Count

---

## AI Settings

Display only:

```txt
Current AI Provider

Current Model
```

User cannot change provider in MVP.

---

# Components

## Shared Components

### AppShell

Contains:

* Sidebar
* Topbar
* Content Area

---

### PageHeader

Contains:

* Title
* Description
* Actions

---

### DataTable

Reusable table component.

Used in:

* Projects
* History
* Credits

---

### EmptyState

Used when:

* No projects
* No generations
* No credits history

---

### LoadingState

Reusable loading component.

---

### ErrorState

Reusable error component.

---

# Notifications

Use toast notifications.

Success:

```txt
Generation completed.
```

Error:

```txt
Generation failed.
```

Warning:

```txt
Insufficient credits.
```

---

# Image Generation

Available on results page when generation status is "completed".

## Generate Images Button

States:

```txt
none — "Generate Images" enabled
processing — "Generating..." disabled with spinner
completed — "Images Generated" success state
partial — "Retry Failed" warning state
failed — "Retry" error state
```

## Image Thumbnails

PinTable displays image thumbnails when media_url exists.

Thumbnail size:

```txt
64x96px (vertical Pinterest ratio)
```

---

# Scheduling

Available on results page when generation status is "completed".

## Schedule Dialog

Triggered by "Schedule Pins" button.

### Mode Selector

```txt
Spread by Days
Spread by Hours
```

### Fields (Days Mode)

* Start Date (date picker, no past dates)
* Start Time (time picker)
* Frequency: Daily, Every 2 Days, Every 3 Days, Weekly, Every Weekday (Mon-Fri)

### Fields (Hours Mode)

* Start Date (date picker, no past dates)
* Start Time (time picker)
* Interval: 30 minutes, 1 hour, 2 hours, 4 hours

### Preview

Shows first 5 pins with calculated dates + "N more" count.

### Actions

* Apply Schedule — sets publish_date on all pins
* Clear Schedule — removes all publish_date values
* Cancel — closes dialog

### PinTable Integration

Publish Date column shown conditionally when any pin has a date.

### CSV Integration

publish_date exported in ISO 8601 format: YYYY-MM-DDTHH:mm:ss

---

# Responsive Rules

Desktop First.

Minimum supported width:

```txt
1024px
```

Mobile support:

* View Results
* View History

Generation workflow optimized for desktop.

---

# Future Screens

## Planned (in roadmap)

* WordPress Generator (TASK-028)
* Platform-based navigation (TASK-026)
* Content Research (TASK-023)

## Not MVP

Do not implement yet.

* Pinterest Publishing
* Pinterest OAuth
* Team Management
* Analytics Dashboard
* Mobile App
