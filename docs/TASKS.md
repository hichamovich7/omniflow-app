# TASKS.md

# OmniFlow Development Tasks

---

# ACTIVE TASK

No active task.

All tasks through TASK-017 are completed.

---

# ROADMAP

Ordered by strategic priority.

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

## [TASK-019] Visual Refinement

### Status: PLANNED

### Goal

Completar el rediseño visual y conectar componentes existentes no utilizados.

### Features

```txt
loading.tsx con skeletons existentes (DashboardSkeleton, TableSkeleton)
error.tsx boundaries en route groups
Eliminar duplicación timeAgo() — usar RelativeDate component
Eliminar duplicación statusToVariant() — extraer utility
Usar MetricCard en dashboard o eliminarlo
Configurar remotePatterns en next.config.ts
Accesibilidad: aria-labels en botones icon-only, contrast ratios
```

### Constraints

No modificar lógica de negocio ni APIs.

### Success Criteria

Zero componentes no utilizados. Suspense boundaries funcionales. WCAG AA compliance.

---

## [TASK-020] Multi-Generator Architecture

### Status: PLANNED

### Goal

Preparar la arquitectura para soportar múltiples generadores de contenido (Pinterest, WordPress, Facebook, LinkedIn, etc.) sin duplicar código.

### Features

```txt
Abstraer flujo de generación genérico
Generator registry / factory pattern
Prompt system extensible por plataforma
Shared results/history/export components
Navigation structure para múltiples generadores
```

### Constraints

No romper el flujo Pinterest existente.

### Success Criteria

Un nuevo generador puede añadirse creando solo prompt, validation y config específicos.

---

## [TASK-021] WordPress Generator

### Status: PLANNED

### Goal

Primer generador adicional: contenido WordPress (artículos, meta descriptions, títulos SEO).

### Depends On

TASK-020 (Multi-Generator Architecture)

### Success Criteria

Usuario puede generar contenido WordPress optimizado y exportarlo.

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
SEO Articles
Teams
Analytics Dashboard
Mobile App
Multi-tenant Organizations
```
