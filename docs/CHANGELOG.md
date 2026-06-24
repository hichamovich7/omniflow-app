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

# [0.8.1] - 2026-06-24

## TASK-014 Fix: Switch image generation from OpenRouter to OpenAI

### Fixed

* OpenRouter does not have /api/v1/images/generations endpoint (returned 404)
* Replaced OpenRouter image client with OpenAI direct API (api.openai.com/v1/images/generations)

### Added

* lib/openai/image-client.ts — OpenAI Images API client with 120s timeout
* OPENAI_API_KEY and OPENAI_IMAGE_MODEL environment variables

### Changed

* API route now imports from lib/openai/image-client instead of lib/openrouter/image-client
* Model defaults to gpt-image-1 via OPENAI_IMAGE_MODEL env var
* .env.example updated with OpenAI variables (replacing OPENROUTER_IMAGE_MODEL)

---

# [0.8.0] - 2026-06-24

## TASK-014: AI Image Generation

### Added

* OpenRouter image client (lib/openrouter/image-client.ts) — generates images via /api/v1/images/generations with 120s timeout
* POST /api/pinterest/generate-images — batch image generation for all pins in a generation
* Promise pool utility (lib/utils/promise-pool.ts) — concurrency-limited parallel processing
* Image prompt config (lib/prompts/image-generator.ts) — pinterest-image-v1, 1024x1536 vertical
* GenerateImagesButton component — state-aware (none/processing/completed/partial/failed) with retry support
* PinTable now shows image thumbnails when media_url exists (using next/image with unoptimized for external URLs)
* Migration 004: image_status column on generations + Supabase Storage bucket generated-images + storage policies
* .env.example updated with OPENROUTER_IMAGE_MODEL

### Changed

* Results page includes Generate Images button when generation is completed
* DATABASE.md updated with image_status column
* types/database.ts updated with ImageStatus type

---

# [0.7.2] - 2026-06-24

## TASK-010B: Prompt Architecture & Partial Completion

### Added

* lib/prompts/pinterest-pins.ts — extracted prompt with ID `pinterest-pins-v1`
* lib/prompts/index.ts — prompt barrel export
* Partial completion support: generations with fewer pins than requested are marked `completed`, not `failed`
* Warning logged when pinsGenerated < pinsRequested
* API response now includes `pinsGenerated` count

### Changed

* API route refactored to use lib/prompts instead of inline buildPrompt()
* Results page shows "Generated X of Y pins" badge when partial completion occurs
* DECISIONS.md: registered prompt architecture decision

---

# [0.7.1] - 2026-06-24

## TASK-010A: UX & Technical Refinements

### Fixed

* Pinterest Generator project selector now displays project name instead of UUID
* History filters project selector now displays project name instead of UUID

### Changed

* TASKS.md: added Backlog section with deferred improvements (pagination, bulk delete, date range filter, GIN index)
* DECISIONS.md: registered decision to defer History performance optimizations until data volume justifies them

---

# [0.7.0] - 2026-06-24

## TASK-010: History Module

### Added

* History page with generations table (keyword, project name, language, pins, status, date)
* Keyword search with 300ms debounce (ilike query)
* Filters by project, language, and status via URL searchParams
* Row actions dropdown: View Results, Export CSV, Delete Generation
* Delete generation with confirmation dialog (CASCADE deletes associated pins)
* Export CSV directly from history (fetches pins via API, reuses shared CSV lib)
* GET /api/generations/[id] — returns generation + pins
* DELETE /api/generations/[id] — deletes generation with CASCADE
* Shared query utility: lib/queries/generations.ts
* Shared CSV utility: lib/csv/pinterest.ts
* DeleteGenerationDialog component
* HistoryFilters component
* HistoryTable component
* HistoryActions component

### Changed

* Sidebar: History link enabled in main navigation
* ExportCsvButton refactored to use shared CSV utility
* /pinterest/[id] page refactored to use shared generation query

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
