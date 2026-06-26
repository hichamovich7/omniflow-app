# TASKS.md

# OmniFlow Development Tasks

---

# ACTIVE TASK

No active task.

All tasks through TASK-021 are completed.

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

### [TASK-022] Brand Profile & AI Context

#### Status: PLANNED

#### Goal

Transformar la descripción del proyecto en el Brand Profile utilizado por toda la IA.

#### Features

```txt
Description → Brand Profile
Utilizado por Pinterest Content
Utilizado por Pinterest Images
Futuro WordPress
Futuro Facebook
Futuro LinkedIn
Futuro Medium
```

#### Note

Preparado para evolucionar a Project Memory / Knowledge Base.

#### Success Criteria

Todo contenido generado utiliza el Brand Profile del proyecto como contexto de IA.

---

## FASE 2 — Intelligent Content Research

### [TASK-023] Content Research & Input Sources

#### Status: PLANNED

#### Goal

Convertir OmniFlow en una herramienta de investigación además de generación.

Firecrawl será utilizado como motor de adquisición de contenido.

API prevista: https://www.firecrawl.dev/

#### MVP Research

```txt
Keyword Research
Website Research
Blog URL Research
Pinterest URL Research
```

#### MVP Input Sources

```txt
Keyword
Image Upload
Blog URL
```

#### Future Input Sources

```txt
PDF
Markdown
RSS
YouTube
Product URL
Shopify
Amazon
```

#### Success Criteria

Usuario puede investigar contenido desde múltiples fuentes antes de generar.

---

### [TASK-024] Content Analyzer

#### Status: PLANNED

#### Goal

Crear un pipeline común que normalice cualquier entrada antes de enviarla a los generadores.

#### Depends On

TASK-023 (Content Research & Input Sources)

#### Responsibilities

```txt
Context Extraction
Theme Detection
Keywords
Audience
Tone
Category
Structured Summary
```

#### Note

Toda entrada deberá pasar por este Analyzer.

#### Success Criteria

Cualquier input source produce un análisis estructurado reutilizable por cualquier generador.

---

### [TASK-025] Pinterest Boards Management

#### Status: PLANNED

#### Goal

Convertir los Boards en entidades reales.

#### Features

```txt
CRUD Boards
Organización por Boards
Historial por Board
Export por Board
Base para automatización futura
```

#### Success Criteria

Boards son entidades persistentes con contenido organizado y exportable.

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
