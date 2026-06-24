# CHANGELOG.md

# OmniFlow Changelog

Todos los cambios relevantes del proyecto deben registrarse aquí.

Formato:

```txt id="f9uxqy"
Fecha
Versión
Cambios
```

No registrar cambios menores de formato o comentarios.

---

# [Unreleased]

## Planned

MVP en construcción.

---
Known Issue

Pinterest Generator project selector displays project UUID instead of project name.
Does not affect functionality.
Will be fixed in next UI refinement pass.

---
# [0.6.0] - 2026-06-24

## TASK-005 / TASK-006 / TASK-007: Pinterest Generator MVP

### Added

* OpenRouter client (lib/openrouter/client.ts) with fetch wrapper, 60s timeout, JSON mode
* Pinterest generation API route: POST /api/pinterest/generate
* PinForm component: project selector, keyword input, language select, pins count select
* PinTable component: results table showing title, description, board, keywords
* ExportCsvButton: client-side Pinterest-compatible CSV export (UTF-8 BOM)
* Generation results page at /pinterest/[id] with metadata badges
* Pinterest types (types/pinterest.ts): languages, pin options, request/response types
* Zod validation schemas for generation input and OpenRouter response
* Structured prompt engineering for Pinterest SEO content generation
* Cost-optimized max_tokens calculation (350 tokens/pin + 100 overhead)
* .env.example updated with OpenRouter variables

### Changed

* Pinterest page replaced placeholder with functional generation form
* Empty state shown when no projects exist (links to create project)

---

# [0.5.0] - 2026-06-24

## TASK-004: Projects Module

### Added

* POST /api/projects — create project (first project auto-set as default)
* PATCH /api/projects/[id] — update project name, description, or set as default
* DELETE /api/projects/[id] — delete project with confirmation dialog
* Projects list page with table (name, date, actions)
* New project page with form
* Edit project page with pre-filled form
* Zod validation schemas (create + update) in lib/validations/project.ts
* ProjectForm reusable component (create + edit modes)
* ProjectActions dropdown (edit, set default, delete)
* DeleteProjectDialog confirmation modal
* EmptyState reusable component
* Badge for default project indicator
* Toast notifications via Sonner for all CRUD actions

---

# [0.4.0] - 2026-06-24

## TASK-003: Dashboard Layout

### Added

* Sidebar component with active link highlighting and disabled links
* Topbar component with user email and Sign Out button
* PageHeader reusable component (title, description, actions slot)
* Dashboard page with static summary cards (Total Generations, Total Pins, Available Credits)
* Placeholder pages: /projects, /pinterest, /history, /credits, /settings

### Changed

* Dashboard layout refactored from header-only to full AppShell (Sidebar + Topbar + content area)

---

# [0.3.0] - 2026-06-24

## TASK-002: Database Schema & RLS

### Added

* Migration 001_initial_schema.sql
* Table: profiles (extends auth.users with name, credits_balance, plan)
* Table: projects (with is_default flag)
* Table: generations (Pinterest generation requests)
* Table: pins (generated Pinterest content)
* Foreign Keys with ON DELETE CASCADE on all relationships
* RLS policies on all tables
* Trigger: auto-create profile on user signup
* Trigger: auto-update updated_at on all tables
* Indexes on user_id, project_id, generation_id, status, language, created_at
* TypeScript types for all database entities (types/database.ts)
* Insert types with optional defaults

### Deferred

* credit_transactions table (to TASK-011)
* subscriptions table (to TASK-012)

### Changed

* DATABASE.md updated with new columns (profiles.name, projects.is_default)
* Validation strategy: language, model, pins_requested validated in application layer (Zod), not in PostgreSQL

---

# [0.2.0] - 2026-06-23

## TASK-001: Project Foundation Setup

### Added

* Next.js 15 with App Router and TypeScript (strict mode)
* Tailwind CSS v4 + Shadcn UI components (button, input, card, label)
* Supabase Auth integration (login, register, logout)
* Auth middleware for route protection
* Auth callback route for PKCE flow
* Login page with email/password and Zod validation
* Register page with email/password/confirm and Zod validation
* Dashboard placeholder (protected route)
* ApiResponse type definition
* ESLint + Prettier configuration
* .env.example with Supabase variables
* README.md with setup instructions

---

# [0.1.0] - 2026-06-23

## Project Initialization

### Added

* PROJECT.md
* ARCHITECTURE.md
* DATABASE.md
* API.md
* UI_UX.md
* RULES.md
* DECISIONS.md
* TASKS.md
* TESTING.md
* DEPLOYMENT.md
* CHANGELOG.md

### Defined

* Pinterest-First MVP strategy
* CSV Export workflow
* OpenRouter as AI provider
* Supabase as backend platform
* Stripe for credits
* Inngest for background jobs

### Removed

* WordPress MVP scope
* SEO Articles MVP scope
* Pinterest API dependency
* Pinterest OAuth dependency

---

# Versioning Rules

## Major Version

Increment:

```txt id="4vkafm"
1.0.0 → 2.0.0
```

When:

* Major architecture changes
* Major product direction changes

---

## Minor Version

Increment:

```txt id="6g94er"
1.0.0 → 1.1.0
```

When:

* New feature added

Examples:

```txt id="v8h1zw"
CSV Export
History Module
Credits System
```

---

## Patch Version

Increment:

```txt id="jw83si"
1.0.0 → 1.0.1
```

When:

* Bug fixes
* Refactors
* Performance improvements

---

# Example Entries

## [0.2.0] - YYYY-MM-DD

### Added

* Projects Module
* Project CRUD

### Changed

* Updated dashboard navigation

---

## [0.3.0] - YYYY-MM-DD

### Added

* Pinterest Generator
* OpenRouter Integration

### Changed

* Improved generation workflow

---

## [0.4.0] - YYYY-MM-DD

### Added

* CSV Export

### Fixed

* Character count validation

---

# Changelog Rules

Every completed task must update:

```txt id="hqvyhz"
TASKS.md
CHANGELOG.md
```

before being considered finished.

If a feature is visible to users, it must appear in the changelog.
