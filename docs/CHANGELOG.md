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

No planned changes.

---

# [1.0.4] - 2026-06-25

## TASK-017: Documentation Consolidation

### Fixed

* TASKS.md: removed completed tasks from NEXT TASKS section, fixed structure
* TASKS.md: TASK-014 goal corrected from "OpenRouter" to "OpenAI (gpt-image-1)"
* TASKS.md: TASK-001 corrected from "Next.js 15" to "Next.js 16"
* TASKS.md: TASK-014 completed entry corrected from OpenRouter to OpenAI reference
* ARCHITECTURE.md: removed "React Query" from Technical Rules (not installed)
* ARCHITECTURE.md: removed Inngest and Credits Validation from generation flow (not implemented)
* ARCHITECTURE.md: added missing layout components (mobile-nav, user-menu) and skeletons folder
* ARCHITECTURE.md: added sheet and custom UI components to component list
* DATABASE.md: pins.image_prompt description corrected from "FAL / Ideogram" to "image generation"
* DATABASE.md: pins.media_url description corrected from "Future" to "Generated image URL"
* DATABASE.md: generated-images bucket corrected from "Reserved for future" to "Active"
* API.md: marked non-implemented endpoints (GET /api/projects, GET /api/pinterest/generations, POST /api/pinterest/export-csv, credits, stripe) as deferred or not implemented
* RULES.md: Rule #11 corrected — OpenRouter for text/vision only, image generation exception documented
* RULES.md: Rule #9 and #13 corrected — replaced FAL references with OpenAI
* RULES.md: Rule #15 updated — Inngest deferred, MVP uses synchronous generation
* DECISIONS.md: fixed malformed "OpenRouter As Unified AI Gateway" entry
* PROJECT.md: Storage section updated to reflect implemented state
* PROJECT.md: Input Methods now distinguish Implemented / Planned / Deferred status

### Changed

* Roadmap reordered: Security → Visual Refinement → Multi-Generator Architecture → WordPress → Credits → Stripe
* TASK-018 (Security Hardening) defined as next priority
* TASK-019 (Visual Refinement) defined
* TASK-020 (Multi-Generator Architecture) defined
* TASK-021 (WordPress Generator) defined
* TASK-011/012 moved later in roadmap (Credits and Stripe after platform expansion)
* MVP Release Checklist updated with current completion status

---

# [1.0.3] - 2026-06-25

## Blueprint Implementation — Visual Refinement

### Changed

* Dashboard: reordered to Control Center layout — primary CTA "Generate Content" in header, Quick Actions promoted above metrics with hero prominence, Pinterest Generator card uses primary tint and Zap icon, metrics reduced to compact text-lg
* Sidebar: navigation restructured for multi-platform scalability — "Content" group split into "Generators" (Pinterest, future platforms) and "Library" (History), brand tagline "AI CONTENT OS" added below logo mark
* Pinterest Generator: elevated to AI Workspace — larger hero icon (h-14 w-14), text-2xl title, taller keyword input (h-12), taller generate button (h-12), increased vertical padding (pt-8 sm:pt-16), wider spacing between hero and form (mb-10)
* Results page: refined header — larger back button (h-7 w-7), dot separators use border color, actions bar with left padding aligned to content, pin count label above grid
* Pin cards: redesigned for AI-generated content feel — image placeholder with Sparkles + "AI Generated" label when no image exists, numbered index as circular badge, increased image max-h to 56 (224px), hover shadow-sm + subtle image scale, gap-4 between cards, 13px title size

---

# [1.0.2] - 2026-06-25

## Frontend Architecture Formalization

### Added

* Adopted DESIGN_SYSTEM.md as official visual identity reference
* Adopted UI_PRINCIPLES.md as official UX principles reference
* Adopted COMPONENT_STANDARDS.md as official component implementation reference
* PROJECT.md: added Frontend Standards section referencing the three documents
* ARCHITECTURE.md: added Frontend Architecture section with four-level hierarchy (Design System → UI Principles → Component Standards → Feature Components)
* RULES.md: added Rules #26–#31 for frontend development (standards required, reuse before create, visual consistency, server components default, no visual libraries without justification, component standards compliance)
* RULES.md: Golden Rule updated to include DESIGN_SYSTEM.md, UI_PRINCIPLES.md, COMPONENT_STANDARDS.md

---

# [1.0.1] - 2026-06-25

## TASK-016B: Premium Visual Redesign

### Changed

* Design tokens: deeper indigo accent (oklch hue 260), softer shadows, reduced border opacity (border/60), warmer backgrounds
* Sidebar: Linear-inspired — branded logo mark, 11px section labels, 13px nav items, 15px icons, primary tint on active state, w-56
* Topbar: minimal — plain text credits, avatar initials with primary/10 tint, removed Badge for credits
* Dashboard: complete home redesign — time-based greeting, 4-stat grid, 3 quick action cards with hover arrows, activity timeline with inline metadata
* Projects: card grid (sm:2 lg:3) replacing table — folder icon, description preview, generation count, relative dates, "Default" as inline text
* Pinterest Generator: hero-style layout — centered icon + heading + description above form, 3-column settings row, h-11 keyword input, removed Card wrapper
* Results: streamlined header — back arrow + keyword as h1, inline metadata row, removed Card summary, pin cards with visual prominence
* PinTable: cards grid (sm:2 lg:3) replacing table — large image thumbnails (aspect 2:3), board as inline pill, #index in corner, line-clamp-3 descriptions
* History: card-based timeline replacing table — status dots, inline metadata, hover-reveal actions, rounded-xl cards
* History filters: compact h-9 controls, search with subtle placeholder, tighter select widths
* Empty states: larger padding (py-20), rounded-2xl icon containers (h-12 w-12), relaxed line-height descriptions, max-w-xs text
* Auth pages: removed Card wrapper, branded logo mark, "Welcome back" / "Create your account" copy, h-10 inputs, error in tinted background
* UserMenu: simplified to plain trigger (no Button wrapper), h-7 w-7 avatar
* PageContainer: max-w-5xl centered, space-y-8 for more breathing room, py-6/py-8 padding
* PageHeader: 13px description, 0.5 spacing between title and description

---

# [1.0.0] - 2026-06-25

## TASK-016: UI/UX Design System & Professional Redesign

### Added

* Design System: brand blue accent (oklch hue 250), success/warning semantic tokens, 4-level shadow scale
* StatusDot component: colored indicator for generation status (success/warning/error/processing)
* MetricCard component: dashboard metric with icon, value, and subtitle
* PageContainer component: standardized page wrapper with responsive padding
* ActionBar component: consistent button bar for page-level actions
* RelativeDate component: "2h ago" / "3d ago" from timestamps
* MobileNav component: slide-in drawer via Sheet for mobile sidebar
* UserMenu component: dropdown with avatar initials, email, settings link, sign out
* DashboardSkeleton and TableSkeleton loading placeholders
* Badge variants: success (green) and warning (amber)
* Dashboard: real metrics from database + recent activity with clickable rows
* Credits badge in topbar showing current balance

### Changed

* Sidebar: platform-agnostic navigation groups (Workspace/Content/Account), active state with left border accent, reduced width to w-60
* Topbar: hamburger menu for mobile, user dropdown replaces plain email+logout, height reduced to h-12
* Dashboard: replaced static hardcoded cards with real Supabase queries (generations count, pins count, credits)
* Projects page: added description column, relative dates, improved table headers
* Pinterest Generator: centered card layout, side-by-side language/pins selects, Sparkles icon on button
* Results screen: metadata summary card with icons, ActionBar for actions, semantic status badges
* History table: status dots instead of text badges, relative dates, responsive column hiding, project name as pill badge
* History filters: responsive stacked layout on mobile
* PinTable: rounded-lg borders, uppercase tracking headers, improved text density
* Empty states: icon prop support, increased padding, contextual messages per screen
* Auth pages: consistent card sizing (max-w-sm), font-semibold titles, 1.5 label spacing
* All page-level action buttons: size="sm" with 3.5px icons for visual consistency
* Color system: replaced grayscale-only palette with cool-toned blues (oklch), added --success and --warning tokens
* Border radius: reduced base from 0.625rem to 0.5rem (8px)
* Body: added antialiased rendering
* Layout: h-screen with overflow-hidden shell, overflow-y-auto on main content
* Toast: limited to 3 visible, text-sm class applied

### Removed

* LogoutButton standalone component (replaced by UserMenu dropdown)

---

# [0.9.1] - 2026-06-24

## TASK-015 Enhancement: Spread by Hours scheduling mode

### Added

* Scheduling Mode selector: "Spread by Days" or "Spread by Hours"
* Hour interval options: 30 minutes, 1 hour, 2 hours, 4 hours
* calculateHourSchedule() for intraday pin distribution
* Zod discriminated union schema for days vs hours modes

### Changed

* Schedule dialog now shows mode selector before frequency/interval
* API route handles both modes via discriminated union validation
* Renamed internal types: Frequency → DayFrequency, added HourInterval

---

# [0.9.0] - 2026-06-24

## TASK-015: Content Scheduling & Pinterest CSV Compliance

### Added

* PATCH /api/pinterest/schedule — apply auto-schedule or clear all dates
* ScheduleDialog component: date picker, time picker, frequency selector, real-time preview
* Frequency options: Daily, Every 2 Days, Every 3 Days, Weekly, Every Weekday (Mon-Fri)
* Schedule preview shows first 5 pins + "N more" count
* Clear Schedule action to remove all publish dates
* formatPinterestPublishDate() in lib/csv/pinterest.ts — ISO 8601 format (YYYY-MM-DDTHH:mm:ss)
* Zod validation for schedule input with past-date rejection
* calculateScheduleDates() with weekday-aware scheduling

### Changed

* PinTable shows "Publish Date" column conditionally when any pin has a date
* CSV export now formats publish_date in ISO 8601 (was raw timestamp)
* Results page includes "Schedule Pins" button when generation is completed

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

* OpenAI image client (lib/openai/image-client.ts) — generates images via gpt-image-1 with 120s timeout
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

* Next.js 16 with App Router and TypeScript (strict mode)
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

# Changelog Rules

Every completed task must update:

```txt id="hqvyhz"
TASKS.md
CHANGELOG.md
```

before being considered finished.

If a feature is visible to users, it must appear in the changelog.
