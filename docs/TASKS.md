# TASKS.md

# OmniFlow Development Tasks

---

# ACTIVE TASK

No active task.

All tasks through TASK-025 are completed. TASK-023 and TASK-024 also completed (TASK-023 out of order — Firecrawl was set up first, making it the natural next step; TASK-024 completed right after, closing the Research → Analyze → Generate loop).

---

# PRODUCT VISION

OmniFlow is an intelligent content workspace.

The product flow for every platform:

```txt
Research → Analyze → Generate → Review → Images → Schedule → Export
```

Pinterest is the first module implementing the complete flow.

WordPress will reuse the entire architecture afterwards.

---

# ROADMAP

Ordered by strategic priority and phased delivery.

## [TASK-018] Security Hardening

### Status: PLANNED

### Goal

Corregir vulnerabilidades de seguridad antes de avanzar con nuevas funcionalidades.

### Features

```txt
Ownership validation (user_id filter) en todas las API routes
Fix is_default cross-user bug en projects
Rate limiting en endpoints de generación
try/catch en request.json() para todas las rutas
UUID validation en URL params
```

### Success Criteria

Ningún usuario autenticado puede acceder a recursos de otro usuario.

---

## FASE 1 — Pinterest Professional Workflow

TASK-022 completed — see Completed Tasks below.

---

## FASE 2 — Intelligent Content Research

TASK-023 completed — see Completed Tasks below.

TASK-024 completed — see Completed Tasks below.

---

TASK-025 completed — see Completed Tasks below.

---

## FASE 3 — Platform Architecture

### [TASK-026] Navigation Refactor

#### Status: PLANNED

#### Goal

Reorganizar OmniFlow por plataformas.

#### Sidebar

```txt
Pinterest
  Research
  Generate
  Boards
  History

WordPress

Facebook

LinkedIn

Medium
```

#### Note

La navegación debe quedar preparada para crecimiento.

#### Success Criteria

Sidebar organizado por plataforma con sub-secciones funcionales.

---

### [TASK-027] Multi-Generator Architecture

#### Status: PLANNED

#### Goal

Crear una arquitectura reutilizable para futuros generadores.

#### Reuses

```txt
Brand Profile (TASK-022)
Content Analyzer (TASK-024)
Navigation (TASK-026)
Editorial Workflow (TASK-020)
```

#### Success Criteria

Un nuevo generador puede añadirse reutilizando Brand Profile, Content Analyzer, Navigation y Editorial Workflow.

---

## FASE 4 — WordPress

### [TASK-028] WordPress Generator

#### Status: PLANNED

#### Goal

Primer generador reutilizando toda la arquitectura anterior.

#### Depends On

TASK-027 (Multi-Generator Architecture)

#### Input

```txt
Keyword
Image
Blog URL
```

#### Generation

```txt
SEO Article
Featured Image
Export
Publicación futura
```

#### Reuses

```txt
Editorial Workflow (TASK-020)
Image Versioning (TASK-021)
Brand Profile (TASK-022)
Content Analyzer (TASK-024)
Navigation (TASK-026)
Historial independiente
```

#### Success Criteria

Usuario puede generar contenido WordPress optimizado reutilizando toda la arquitectura existente.

---

## [TASK-011] Credits System

### Status: PLANNED

### Goal

Implementar lógica de créditos.

### Features

```txt
credit_transactions table (DATABASE.md already defines schema)
Balance check before generation
Credit deduction after generation
Transaction recording
Credits page functional
superadmin bypass
```

### Success Criteria

No permitir generación sin créditos (excepto superadmin).

---

## [TASK-012] Billing & Stripe

### Status: PLANNED

### Depends On

TASK-011 (Credits System)

### Goal

Permitir compra de créditos.

### Features

```txt
subscriptions table (DATABASE.md already defines schema)
Stripe Checkout
Webhook Processing
Credit Refill
Pricing page
```

### Success Criteria

Compra real funcionando.

---

## [TASK-013] Image Analysis

### Status: DEFERRED

### Goal

Analizar imágenes de referencia subidas por el usuario para generar prompts mas precisos.

### Note

La generacion de image prompts se implemento en TASK-014 (AI Image Generation). El analisis de imagenes de referencia mediante vision models queda pendiente para una futura iteracion.

### Success Criteria

Generacion consistente de prompts Pinterest basados en imagen de referencia.

---

# MVP RELEASE CHECKLIST

```txt
Auth Working                    ✅
Projects Working                ✅
Pinterest Generation Working    ✅
AI Image Generation Working     ✅
Scheduling Working              ✅
CSV Export Working               ✅
History Working                 ✅
Security Hardening              ⬚ TASK-018
Credits Working                 ⬚ TASK-011
Stripe Working                  ⬚ TASK-012
```

---

# COMPLETED TASKS

## [TASK-024] Content Analyzer — 2026-07-09

* New provider-agnostic `lib/analyzer/` layer (mirrors `lib/research/`/`lib/ai/`): `engine.ts` (`analyzeContent()`, calls the AI Engine's SMART role), `types.ts` (`AnalysisOutput`), `context.ts` (`buildAnalysisContext()`, pure function mirroring `lib/brand-profile.ts`)
* New `content_analyses` table (migration 009): theme/keywords/audience/tone/category/summary per research result, unique `research_result_id` FK, write-once (no `updated_at`)
* New `POST /api/analyze`: idempotent — returns the existing analysis for a `researchResultId` instead of re-running the AI; rejects research results that aren't owned by the caller or aren't `status: completed`
* Research page: visible "Analyze" button appears after a successful research call; result panel (Theme, Category, Audience, Tone, Keywords, Summary) shown before "Continue to Generate" — analysis is opt-in and visible by design, not automatic
* `analysisId` flows through query params exactly like the existing `websiteUrl`/`pinterestUrl` passthrough (Research page → `/pinterest?...` → `PinForm` → POST body)
* `POST /api/pinterest/generate` accepts optional `analysisId`, fetches the `content_analyses` row (ownership-checked), and injects `buildAnalysisContext()` into the system prompt alongside Brand Profile — fully backward compatible, direct-keyword generation without Research/Analyze is unchanged
* Pinterest Generator form shows a one-line indicator ("Using content analysis from Research") when `analysisId` is present — unlike the silent URL passthrough, this one changes AI output
* Closes the scope boundary TASK-023 deliberately left open: research content now reaches AI generation through a structured, generator-agnostic analysis step, reusable by any future generator (e.g. WordPress, TASK-028) via the same `buildAnalysisContext()` helper

---

## [TASK-023] Content Research & Input Sources — 2026-07-09

* New provider-agnostic `lib/research/` layer (mirrors `lib/ai/`): `engine.ts` (`runResearch()`), `providers/firecrawl.ts` (`scrapeUrl()`, `searchWeb()`) — raw `fetch`, no SDK dependency, response shapes verified against the live Firecrawl API before implementation
* New `research_results` table (migration 008): stores keyword/website/blog/Pinterest URL research, scoped per project, write-once (no `updated_at`)
* New `/research` page: Project + Source Type + Input form, preview panel after a successful call, research history list per project, delete action
* `POST /api/research`, `DELETE /api/research/[id]` (no PATCH — results are immutable)
* "Continue to Generate" bridges Research → Pinterest Generator: carries a suggested keyword (and, for URL sources, the source URL) via query params — `PinForm` reads `keyword`/`projectId`/`websiteUrl`/`pinterestUrl` from `useSearchParams()` on mount
* `generations.website_url`/`pinterest_url` (existing unused columns from migration 001) now populated when carried over from Research — provenance only, zero AI prompt change
* Sidebar: "Research" added to the Generators group, above Pinterest — kept as a flat `/research` route (not nested under `/pinterest/...`) to avoid a real active-link collision (`pathname.startsWith('/pinterest/')` would double-highlight both items)
* Scope boundary (deliberate): scraped/researched content is acquired, stored, and previewed only — not injected into the Pinterest generation prompt. That normalization is TASK-024 (Content Analyzer)'s job; building throwaway prompt-injection now would just get replaced
* Image Upload input source and PDF/Markdown/RSS/YouTube/Product URL/Shopify/Amazon remain out of scope (TASK-013 deferred separately; explicitly "Future Input Sources")

---

## [TASK-025] Pinterest Boards Management — 2026-07-08

* New `boards` table (migration 007): `id`, `project_id` (FK, boards belong to a project), `user_id`, `name`, timestamps. Unique `(project_id, name)`, RLS scoped to owner
* New nullable `pins.board_id` FK (ON DELETE SET NULL) alongside the existing free-text `pins.board` (kept unchanged for CSV/display) — no backfill, only new pins get linked
* Auto-linking at generation time: `lib/queries/boards.ts` `findOrCreateBoardIds()` matches AI-suggested board names case-insensitively against existing boards for the project and creates missing ones — pins are organized into real board entities with no manual step, wired into `POST /api/pinterest/generate`
* CRUD: `POST /api/boards`, `PATCH /api/boards/[id]`, `DELETE /api/boards/[id]` (mirrors the Projects API pattern)
* New UI: `/boards` (list), `/boards/new`, `/boards/[id]` (detail — pin history for that board + Export CSV scoped to it, reuses `ExportCsvButton`/`generatePinterestCsv` as-is), `/boards/[id]/edit`
* Sidebar: "Boards" added to the Library group
* Zero changes to History, PinTable, or the CSV builder

---

## [TASK-022] Brand Profile & AI Context — 2026-07-08

* `projects.description` (already existing, no schema change) now doubles as the project's Brand Profile — project identification and AI context
* New `lib/brand-profile.ts` (`buildBrandProfileContext()`) — Core Platform-level helper, reusable by any future generator, not Pinterest-specific
* `lib/prompts/pinterest-pins.ts`: `buildPinterestPinsPrompt()` accepts an optional `brandProfile` and injects it into the FAST role's system prompt
* `POST /api/pinterest/generate` fetches `project.description` and passes it through — title, description, keywords, board, and `image_prompt` are all generated under this brand-aware system prompt
* Pinterest image generation inherits the Brand Profile transitively: the LLM-generated `image_prompt` is already brand-aware before the Prompt Engine adds photographic directives — no change needed in `lib/ai/prompt-engine`
* `ProjectForm`: relabeled "Description" → "Brand Profile" with a helper line clarifying it drives AI generation (copy only, no new field)
* Zero DB migration, zero API contract change

---

## [TASK-FIX-001] Pinterest Generation Reliability & Error Visibility — 2026-07-08

* Fixed root cause of "Generation failed" with reasoning-capable FAST models (e.g. `openai/gpt-5-mini`): the model's hidden reasoning tokens consumed the entire `max_tokens` budget before producing any visible content. `lib/ai/services/text.ts` now sends `reasoning: { effort: 'minimal' }` for the FAST role via `lib/ai/providers/openrouter.ts`; SMART keeps default reasoning behavior since it's reserved for complex reasoning tasks
* Fixed a second, intermittent failure mode: OpenRouter occasionally returns HTTP 200 with the failure embedded in the choice itself (`finish_reason: "error"`, e.g. "Stream ended before a terminal response event") after already emitting partial content, which is not valid JSON. `lib/ai/providers/openrouter.ts` now detects this and automatically retries (up to 3 attempts) before surfacing an error — this was the cause of the intermittent "response wasn't valid JSON" failures at higher pin counts (10+)
* New `generations.error_message` column (migration 006) stores a human-readable failure reason instead of discarding it
* `POST /api/pinterest/generate` classifies known failures (empty AI response, interrupted provider stream, OpenRouter HTTP errors by status, invalid JSON) into specific messages via `classifyGenerationError()`, returned in the API response and persisted for later display
* Results page empty state (0 pins generated) now shows the stored error reason and a "Regenerate" action (`RegenerateGenerationButton`) that resubmits the same keyword/language/project/pins-count to `POST /api/pinterest/generate`
* Zero changes to API contracts or response shapes — only error message content and one new nullable DB column

---

## [TASK-AI-001] AI Engine Architecture Refactor — 2026-07-08

* New `lib/ai/` provider-agnostic AI Engine: business code only calls `generateText()`, `analyzeImage()`, `generateImage()`
* Four AI roles (FAST, SMART, VISION, IMAGE), each independently configurable (provider + model) via env vars, resolved in `lib/ai/config.ts`
* Provider adapters `lib/ai/providers/openrouter.ts` and `lib/ai/providers/openai.ts` are the only files allowed to call an external AI SDK directly
* New `lib/ai/prompt-engine/` builds the IMAGE prompt from the Pinterest Package (title, description, keywords, board, image_prompt) — byte-identical output to the previous `lib/prompts/image-generator.ts`, designed to later accept Brand Profile, Camera/Lighting/Composition, Negative Prompt, SEO Intent, Style Presets without changing its interface
* `VISION` role fully implemented but not wired into any route yet — ready for TASK-013
* `lib/openrouter/` and `lib/openai/` removed; `POST /api/pinterest/generate` and `POST /api/pinterest/generate-images` now go through the AI Engine
* Zero changes to API contracts, database schema, prompt content, or product behavior
* Architecture prep for TASK-022 (Brand Profile), TASK-023 (Research), and TASK-028 (WordPress) — new generators/providers plug in without touching business logic

---

## [TASK-021] Image Versioning & Regeneration — 2026-06-26

* New `pin_images` table: stores image versions per pin (id, pin_id, storage_path, url, is_active, version, created_at)
* Partial unique index enforces one active image per pin at database level
* Data migration: existing pins.media_url migrated to pin_images version 1 records
* Storage path changed from `{user_id}/{pin_id}.png` to `{user_id}/{pin_id}/{version}.png`
* pins.media_url preserved as denormalized field — CSV export, history, and display work unchanged
* POST /api/pinterest/generate-images: versioned image creation, selective regeneration when pinIds provided
* GET /api/pinterest/pin-images: list all versions for a pin
* PATCH /api/pinterest/pin-images/[id]: set active image version, updates pins.media_url
* DELETE /api/pinterest/pin-images/[id]: delete version with safety checks (cannot delete only version, auto-promotes on active deletion)
* ImageVersionsDialog: thumbnail grid showing all versions with Set Active / Delete actions
* PinTable: hover overlay with Regenerate button (per pin) and Versions button (when count > 1)
* GenerateImagesButton: shows "Regenerate (N)" when all selected pins already have images
* Integrated with TASK-020 editorial selection — selective regeneration for selected pins
* Variation directive: regenerated images (version > 1) receive explicit instructions to vary camera angle, composition, lighting, styling, props, and perspective
* Lightbox preview: click any thumbnail in ImageVersionsDialog to view full-size with dark overlay
* Visual hierarchy: active version uses primary badge with checkmark, "Use this" is a primary button, delete action de-emphasized as icon-only ghost
* Architecture reusable for WordPress and future generators (pin_images table, versioning flow)

---

## [TASK-020] Editorial Workflow — 2026-06-26

* Editorial selection system: EditorialSelectionProvider context with reusable selection state (toggle, selectAll, selectNone, invertSelection)
* SelectionToolbar: Select All / Select None / Invert buttons with real-time counter ("8 selected of 10 pins")
* SelectionActionBar: contextual action bar shown only when pins are selected, with selection count and Clear button
* EditorialWorkspace: wrapper component composing provider + toolbar + action bar + pin grid
* PinTable: added per-pin selection checkbox with visual feedback (primary border + ring when selected, hover-reveal when not)
* ExportCsvButton: exports only selected pins when selection exists, all pins when no selection
* GenerateImagesButton: generates images only for selected pins when selection exists
* API route POST /api/pinterest/generate-images: added optional pinIds filter for selective image generation
* Accessibility: real input[type=checkbox] with sr-only + aria-label per pin, Clear Selection has aria-label
* ScheduleDialog: accepts optional selectedPinIds — schedules only selected pins when selection exists
* PATCH /api/pinterest/schedule: accepts optional pinIds filter for selective scheduling and clearing
* SelectionActionBar includes Schedule action between Regenerate and Export for consistent editorial flow
* Architecture: editorial components in components/editorial/ — decoupled from Pinterest, reusable for future generators
* Zero changes to database or prompts

---

## [TASK-019] Frontend Production Readiness — 2026-06-26

* Extracted shared utility timeAgo() to lib/utils/format-date.ts — eliminated 4 duplicate implementations
* Extracted shared utility statusToVariant() to lib/utils/status.ts — eliminated 2 duplicate implementations
* Loading states: added loading.tsx with skeletons for dashboard, history, projects, pinterest, and results pages
* Connected existing DashboardSkeleton and TableSkeleton components (previously unused)
* Error boundary: added error.tsx for the dashboard route group with retry support
* Configured next.config.ts remotePatterns for Supabase Storage image optimization
* Removed unoptimized flag from PinTable Image component, added proper sizes attribute
* Accessibility: added aria-label to icon-only DropdownMenuTriggers (history-actions, project-actions, user-menu)
* Accessibility: added aria-label to back navigation link on results page
* Removed dead code: LogoutButton (replaced by UserMenu), openrouter/image-client.ts (replaced by openai/image-client.ts)
* Removed unused components: MetricCard, ActionBar, RelativeDate (timeAgo utility covers the use case)
* Zero changes to APIs, database, prompts, or business logic

---

## [TASK-IMG-001] Base Image Generation Prompt Enhancement — 2026-06-26

* Upgraded image prompt system from pinterest-image-v1 to pinterest-image-v2
* New buildImagePrompt() wrapper enriches LLM-generated scene descriptions with professional photography directives before sending to gpt-image-1
* Niche-aware photography style inference (18 categories: food, interior, travel, fashion, garden, beauty, fitness, DIY, family, business, wedding, pet, art, education, tech, holiday, organization + generic fallback)
* Enhanced LLM instructions to generate hyper-specific scene descriptions (concrete subjects, materials, textures, colors, camera angles) instead of vague keywords
* Image prompts now always generated in English regardless of content language for optimal gpt-image-1 results
* Quality directives added: photorealistic, editorial quality, DSLR, bokeh, natural lighting, rule of thirds, Pinterest vertical format
* Strict negative constraints: no text, typography, watermarks, logos, overlays, frames, borders, or graphic elements
* Zero changes to API, database, frontend, scheduling, CSV, or architecture

---

## [TASK-017] Documentation Consolidation — 2026-06-25

* Synchronized all documentation with actual code state
* Fixed TASKS.md structure: removed completed tasks from NEXT TASKS section
* Fixed TASK-014 description: OpenRouter → OpenAI (gpt-image-1)
* Fixed TASK-001 reference: Next.js 15 → Next.js 16
* Fixed ARCHITECTURE.md: removed inaccurate references (Inngest in generation flow, React Query, OpenRouter for images)
* Fixed DATABASE.md: updated outdated descriptions (FAL/Ideogram → OpenAI, future → implemented)
* Fixed API.md: marked non-implemented endpoints as deferred
* Fixed RULES.md: corrected Rule #11, removed FAL references
* Fixed DECISIONS.md: cleaned formatting, registered consolidation decision
* Updated PROJECT.md: clarified implemented vs planned input methods
* Reorganized roadmap: Security → Visual → Multi-Generator → WordPress → Credits → Stripe
* Registered all inconsistencies found between documentation and code

---

## [TASK-016] UI/UX Design System & Professional Redesign — 2026-06-25

* Design System: brand blue accent color (oklch hue 250), success/warning tokens, shadow scale, 4px spacing grid
* Sidebar redesign: navigation groups (Generators/Library/Account), active state with left accent border, mobile drawer via Sheet
* Topbar redesign: hamburger for mobile, user dropdown menu with avatar initials, credits badge
* Dashboard: real metrics from database (generations count, pins count, credits), recent activity list with status dots
* Projects UI: card grid with description, relative dates, generation count
* Pinterest Generator: hero-style layout, centered icon + heading, taller inputs
* Results screen: pin cards with image thumbnails, numbered index badges, AI Generated placeholder
* History UI: card-based timeline, status dots, hover-reveal actions
* Empty states: icon support, improved typography hierarchy, contextual messages per screen
* Skeleton components: DashboardSkeleton, TableSkeleton for loading states
* New components: StatusDot, MetricCard, PageContainer, ActionBar, RelativeDate, MobileNav, UserMenu
* Badge: added success and warning variants
* Auth pages: branded logo mark, consistent spacing
* Platform-agnostic navigation structure (ready for future content types beyond Pinterest)
* Zero changes to APIs, database, prompts, or business logic

---

## [TASK-015] Schedule Management — 2026-06-24

* Auto Scheduler: Start Date + Time + Frequency → publish_date for all pins
* Two modes: Spread by Days / Spread by Hours
* Frequencies: Daily, Every 2 Days, Every 3 Days, Weekly, Every Weekday (Mon-Fri)
* Intervals: 30 minutes, 1 hour, 2 hours, 4 hours
* Schedule preview showing first 5 pins + "N more" in modal
* Clear Schedule to remove all dates
* PATCH /api/pinterest/schedule — apply or clear schedule
* CSV exports publish_date in ISO 8601 format (YYYY-MM-DDTHH:mm:ss)
* ScheduleDialog component with real-time preview
* Zod validation with past-date rejection

---

## [TASK-014] AI Image Generation — 2026-06-24

* OpenAI image generation via gpt-image-1 (lib/openai/image-client.ts)
* Image generation API route: POST /api/pinterest/generate-images
* Supabase Storage bucket: generated-images (public read, authenticated write)
* Concurrency-limited processing: max 3 simultaneous, max 10 per batch
* GenerateImagesButton with state awareness (none/processing/completed/partial/failed)
* PinTable shows thumbnails when images exist
* Migration 004: image_status column on generations + storage bucket + policies
* Promise pool utility for controlled concurrency
* Image prompt config (lib/prompts/image-generator.ts)
* Note: Uses OpenAI directly — OpenRouter does not support /v1/images/generations. See DECISIONS.md.

---

## [TASK-010] History Module — 2026-06-24

* History list page with generations table (keyword, project, language, pins, status, date)
* Filters: keyword search (debounced ilike), project, language, status via URL searchParams
* Actions per row: View Results, Export CSV, Delete Generation
* Delete with confirmation dialog (CASCADE deletes pins)
* Export CSV from history (fetches pins via GET /api/generations/[id], reuses shared CSV lib)
* Shared query utility: lib/queries/generations.ts (used by /pinterest/[id] and API)
* Shared CSV utility: lib/csv/pinterest.ts (used by ExportCsvButton and HistoryActions)
* GET /api/generations/[id] — returns generation + pins
* DELETE /api/generations/[id] — deletes generation + CASCADE pins

---

## [TASK-008] Results Screen — 2026-06-24 (absorbed into TASK-007)

* Generation summary with metadata badges (keyword, language, pins, model, status)
* Pins table with all generated fields
* Copy buttons for title, description, prompt
* Character counters (title 0/100, description 0/500)

---

## [TASK-009] CSV Export — 2026-06-24 (absorbed into TASK-007)

* Pinterest Bulk Upload format with UTF-8 BOM
* Columns: Title, Media URL, Pinterest board, Description, Link, Publish date, Keywords
* Client-side CSV generation via ExportCsvButton
* Shared CSV utility: lib/csv/pinterest.ts

---

## [TASK-007] Pinterest Generation Job — 2026-06-24

* Synchronous generation flow: API Route → OpenRouter → DB → Results
* Generation record created with status tracking (processing/completed/failed)
* Pins batch inserted after successful OpenRouter response
* CSV Export on results page (Pinterest Bulk Upload format, UTF-8 BOM)
* Generation metadata displayed: keyword, language, pins, model, status, date
* Partial completion support: fewer pins than requested marked as completed with warning

---

## [TASK-006] OpenRouter Integration — 2026-06-24

* OpenRouter client (lib/openrouter/client.ts) with fetch, 60s timeout, JSON mode
* Structured prompt for Pinterest SEO content (system + user messages)
* Zod validation of OpenRouter JSON response
* Cost-optimized max_tokens: 350 tokens/pin + 100 overhead

---

## [TASK-005] Pinterest Generator UI — 2026-06-24

* PinForm component: project selector, keyword, language, pins count
* PinTable component: results display with title, description, board, keywords
* Pinterest page loads projects via Supabase Server Client
* Results page at /pinterest/[id] with generation metadata + CSV export
* EmptyState when no projects exist

---

## [TASK-004] Projects Module — 2026-06-24

* Projects CRUD: create, list, edit, delete
* Set default project (only one default per user)
* First project auto-set as default
* API routes: POST /api/projects, PATCH/DELETE /api/projects/[id]
* Server-side data fetching with Supabase Server Client (no GET API route)
* Zod validation client + server side
* EmptyState, ProjectForm, ProjectActions, DeleteProjectDialog components
* Toast notifications for all actions

---

## [TASK-003] Dashboard Layout — 2026-06-24

* AppShell: Sidebar + Topbar + content area
* Sidebar with grouped navigation
* Topbar with user menu and credits display
* PageHeader reusable component
* Dashboard page with real metrics and recent activity
* Placeholder pages for /credits, /settings

---

## [TASK-002] Database Schema & RLS — 2026-06-24

* Core tables: profiles, projects, generations, pins
* Foreign Keys with ON DELETE CASCADE
* RLS policies on all tables
* Triggers: auto-create profile on signup, auto-update updated_at
* Indexes on all query-critical columns
* TypeScript types for all tables
* credit_transactions and subscriptions deferred

---

## [TASK-001] Project Foundation Setup — 2026-06-23

* Next.js 16 + TypeScript + Tailwind CSS v4 + Shadcn UI
* Supabase Auth (login, register, logout)
* Protected routes with middleware
* Dashboard placeholder
* ESLint + Prettier configured

---

# BACKLOG

Improvements deferred until data volume justifies them.

* History Pagination — server-side pagination with range() for large generation lists
* Bulk Delete Generations — select multiple generations and delete at once
* Date Range Filter — add date picker filter to History
* Keyword Search Optimization — add GIN index on generations(keyword) for faster ilike queries
* Supabase Type Generation — auto-generate TypeScript types from database schema

---

# OUT OF MVP

No implementar todavia:

```txt
Pinterest OAuth
Pinterest API
Teams
Analytics Dashboard
Mobile App
Multi-tenant Organizations
```

---

# TECHNICAL DEBT

See:

```txt
docs/TECHNICAL_DEBT.md
```

Infrastructure improvements and internal refactoring that do not belong in the product roadmap.
