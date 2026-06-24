# TASKS.md

# OmniFlow Development Tasks

---

# ⚡ ACTIVE TASK

No active task. All tasks through TASK-016 are completed.

---

# ⏳ NEXT TASKS

## [TASK-016] UI/UX Design System & Professional Redesign

### Status: COMPLETED

### Goal

Transformar OmniFlow en un SaaS con aspecto profesional mediante un Design System completo y rediseño visual de todas las pantallas.

### Constraints

No modificar:

* Lógica de negocio
* APIs
* Base de datos
* Prompts
* Generación de imágenes
* Scheduling
* CSV Export

### Success Criteria

* Design System implementado con tokens consistentes
* Todas las pantallas rediseñadas
* Responsive strategy implementada
* Loading states, skeletons, empty states profesionales
* Aspecto visual de SaaS comercial moderno

---

## [TASK-002] Database Schema & RLS

### Status: COMPLETED

### Goal

Crear las tablas core definidas en DATABASE.md.

### Tables Created

```txt id="m4v5oi"
profiles ✅
projects ✅
generations ✅
pins ✅
```

### Deferred

```txt
credit_transactions → TASK-011
subscriptions → TASK-012
```

### Success Criteria

* Migraciones creadas ✅
* Foreign Keys configuradas ✅
* RLS activado ✅
* Policies funcionando ✅
* Triggers created (updated_at, handle_new_user) ✅

---

## [TASK-003] Dashboard Layout

### Status: COMPLETED

### Goal

Construir estructura visual principal.

### Components

```txt id="0d3dfj"
AppShell ✅
Sidebar ✅
Topbar ✅
PageHeader ✅
```

### Pages

```txt id="0udn1x"
/dashboard ✅
/projects ✅ (placeholder)
/pinterest ✅ (placeholder)
/history ✅ (placeholder)
/credits ✅ (placeholder)
/settings ✅ (placeholder)
```

### Success Criteria

Navegación funcional. ✅

---

## [TASK-004] Projects Module

### Status: COMPLETED

### Goal

Crear CRUD completo de proyectos.

### Features

```txt id="0s4fvl"
Create Project ✅
Update Project ✅
Delete Project ✅
List Projects ✅
Set Default Project ✅
```

### Success Criteria

Usuario puede organizar su trabajo por proyectos. ✅

---

## [TASK-005] Pinterest Generator UI

### Status: COMPLETED

### Goal

Crear formulario principal de generación.

### Fields

```txt id="6wz1nm"
Project ✅
Keyword ✅
Language ✅
Pins Requested ✅
```

### Success Criteria

Formulario funcional. ✅

---

## [TASK-006] OpenRouter Integration

### Status: COMPLETED

### Goal

Crear capa centralizada de IA.

### Features

```txt id="oqw6ie"
Generate Titles ✅
Generate Descriptions ✅
Generate Keywords ✅
Generate Boards ✅
Generate Image Prompts ✅
```

### Success Criteria

Respuesta JSON validada mediante Zod. ✅

---

## [TASK-007] Pinterest Generation Job

### Status: COMPLETED

### Goal

Crear flujo completo de generación (MVP síncrono, sin Inngest).

### Flow

```txt id="f9s2jr"
API Route ✅
↓
OpenRouter ✅
↓
Database ✅
↓
Results Page ✅
↓
CSV Export ✅
```

### Success Criteria

Generación funcional con persistencia y export. ✅

---

## [TASK-008] Results Screen

### Status: COMPLETED (absorbed into TASK-007)

### Goal

Visualizar resultados generados.

### Features

```txt id="l39t5t"
Generation Summary ✅
Pins Table ✅
Card View ✅
Copy Buttons ✅
Character Counters ✅
```

### Success Criteria

Todos los resultados son editables. ✅

---

## [TASK-009] CSV Export

### Status: COMPLETED (absorbed into TASK-007)

### Goal

Exportar CSV compatible con Pinterest Bulk Upload.

### Columns

```txt id="3bnq9v"
Title ✅
Media URL ✅
Pinterest board ✅
Description ✅
Link ✅
Publish date ✅
Keywords or tags ✅
```

### Success Criteria

CSV descargable e importable en Pinterest. ✅

---

## [TASK-010] History Module

### Status: COMPLETED

### Goal

Guardar y visualizar generaciones anteriores.

### Features

```txt id="a8s1dd"
History List ✅
Filters (project, language, status, keyword search) ✅
Generation Details (via /pinterest/[id]) ✅
Re-export CSV ✅
Delete Generation ✅
```

### Success Criteria

Usuario puede recuperar generaciones antiguas. ✅

---

## [TASK-011] Credits System

### Goal

Implementar lógica de créditos.

### Features

```txt id="h7i0gn"
Balance
Consumption
Transactions
```

### Success Criteria

No permitir generación sin créditos.

---

## [TASK-012] Billing & Stripe

### Goal

Permitir compra de créditos.

### Features

```txt id="c5ptc3"
Stripe Checkout
Webhook Processing
Credit Refill
```

### Success Criteria

Compra real funcionando.

---

## [TASK-013] Image Analysis

### Status: DEFERRED

### Goal

Analizar imágenes de referencia subidas por el usuario para generar prompts más precisos.

### Note

La generación de image prompts se implementó en TASK-014 (AI Image Generation). El análisis de imágenes de referencia mediante vision models queda pendiente para una futura iteración.

### Input

```txt id="wtlxzj"
PNG
JPG
WEBP
```

### Output

```txt id="7ujs98"
Image Analysis
Image Prompt
```

### Success Criteria

Generación consistente de prompts Pinterest basados en imagen de referencia.

---

## [TASK-014] AI Image Generation

### Status: COMPLETED

### Goal

Generar imágenes Pinterest automáticamente mediante OpenRouter.

### Features

```txt id="h8g7c3"
Generate Image ✅
Store In Supabase Storage ✅
Create Public URL ✅
Attach To Pin ✅
```

### Success Criteria

Pin generado con imagen lista para exportar. ✅

---

## [TASK-015] Schedule Management

### Status: COMPLETED

### Goal

Permitir configurar fechas de publicación.

### Features

```txt id="onq7cn"
Date Picker ✅
Time Picker ✅
Frequency (Daily, Every 2/3 Days, Weekly, Weekday) ✅
Auto Schedule with preview ✅
Clear Schedule ✅
Pinterest CSV date format (ISO 8601) ✅
```

### Success Criteria

Publish Date exportada correctamente al CSV. ✅

---

# 🚀 MVP RELEASE CHECKLIST

Antes de lanzar:

```txt id="rzc1dq"
Auth Working
Projects Working
Pinterest Generation Working
CSV Export Working
History Working
Credits Working
Stripe Working
```

---

# ✅ COMPLETED TASKS

## [TASK-016] UI/UX Design System & Professional Redesign — 2026-06-25

* Design System: brand blue accent color (oklch hue 250), success/warning tokens, shadow scale, 4px spacing grid
* Sidebar redesign: navigation groups (Workspace/Content/Account), active state with left accent border, mobile drawer via Sheet
* Topbar redesign: hamburger for mobile, user dropdown menu with avatar initials, credits badge
* Dashboard: real metrics from database (generations count, pins count, credits), recent activity list with status dots
* Projects UI: description column, relative dates, consistent table headers
* Pinterest Generator: centered card layout, keyword emphasis, side-by-side language/pins selects
* Results screen: summary metadata card with icons, ActionBar component, semantic status badges
* History UI: status dots replacing text badges, relative dates, responsive column hiding
* PinTable: improved density, rounded-lg borders, uppercase tracking headers
* Empty states: icon support, improved typography hierarchy, contextual messages per screen
* Skeleton components: DashboardSkeleton, TableSkeleton for loading states
* New components: StatusDot, MetricCard, PageContainer, ActionBar, RelativeDate, MobileNav, UserMenu
* Badge: added success and warning variants
* Auth pages: consistent card sizing and spacing
* All pages use PageContainer for uniform padding
* Platform-agnostic navigation structure (ready for future content types beyond Pinterest)
* Zero changes to APIs, database, prompts, or business logic

---

## [TASK-015] Schedule Management — 2026-06-24

* Auto Scheduler: Start Date + Time + Frequency → publish_date for all pins
* Frequencies: Daily, Every 2 Days, Every 3 Days, Weekly, Every Weekday (Mon-Fri)
* Schedule preview showing first 5 pins + "N more" in modal
* Clear Schedule to remove all dates
* PATCH /api/pinterest/schedule — apply or clear schedule
* PinTable shows Publish Date column when dates exist
* CSV exports publish_date in ISO 8601 format (YYYY-MM-DDTHH:mm:ss)
* formatPinterestPublishDate() centralized in lib/csv/pinterest.ts
* ScheduleDialog component with real-time preview
* Zod validation with past-date rejection

---

## [TASK-014] AI Image Generation — 2026-06-24

* OpenRouter image client (lib/openrouter/image-client.ts) with 120s timeout
* Image generation API route: POST /api/pinterest/generate-images
* Supabase Storage bucket: generated-images (public read, authenticated write)
* Concurrency-limited processing: max 3 simultaneous, max 10 per batch
* GenerateImagesButton with state awareness (none/processing/completed/partial/failed)
* PinTable shows thumbnails when images exist
* Migration 004: image_status column on generations + storage bucket + policies
* Promise pool utility for controlled concurrency
* Image prompt config (lib/prompts/image-generator.ts)

---

## [TASK-009] CSV Export — 2026-06-24

* Absorbed into TASK-007
* Pinterest Bulk Upload format with UTF-8 BOM
* Columns: Title, Media URL, Pinterest board, Description, Link, Publish date, Keywords
* Client-side CSV generation via ExportCsvButton
* Shared CSV utility: lib/csv/pinterest.ts

---

## [TASK-008] Results Screen — 2026-06-24

* Absorbed into TASK-007
* Generation summary with metadata badges (keyword, language, pins, model, status)
* Pins table with all generated fields
* Copy buttons for title, description, prompt
* Character counters (title 0/100, description 0/500)

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
* History enabled in sidebar navigation

---

## [TASK-007] Pinterest Generation Job — 2026-06-24

* Synchronous generation flow: API Route → OpenRouter → DB → Results
* Generation record created with status tracking (processing/completed/failed)
* Pins batch inserted after successful OpenRouter response
* CSV Export on results page (Pinterest Bulk Upload format, UTF-8 BOM)
* Generation metadata displayed: keyword, language, pins, model, status, date

---

## [TASK-006] OpenRouter Integration — 2026-06-24

* OpenRouter client (lib/openrouter/client.ts) with fetch, 60s timeout, JSON mode
* Structured prompt for Pinterest SEO content (system + user messages)
* Zod validation of OpenRouter JSON response
* Cost-optimized max_tokens: 350 tokens/pin + 100 overhead

---

## [TASK-005] Pinterest Generator UI — 2026-06-24

* PinForm component: project selector, keyword, language, pins count
* PinTable component: results table with title, description, board, keywords
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
* Sidebar with navigation (Dashboard, Projects, Pinterest active; History, Credits, Settings disabled)
* Topbar with user email from Supabase server client + Sign Out
* PageHeader reusable component
* Dashboard page with static summary cards (Total Generations, Total Pins, Available Credits)
* Placeholder pages for /projects, /pinterest, /history, /credits, /settings

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

* Next.js 15 + TypeScript + Tailwind CSS + Shadcn UI
* Supabase Auth (login, register, logout)
* Protected routes with middleware
* Dashboard placeholder
* ESLint + Prettier configured

---

# 📋 BACKLOG

Improvements deferred until data volume justifies them.

* History Pagination — server-side pagination with range() for large generation lists
* Bulk Delete Generations — select multiple generations and delete at once
* Date Range Filter — add date picker filter to History (documented in UI_UX.md)
* Keyword Search Optimization — add GIN index on generations(keyword) for faster ilike queries

---

# 🚫 OUT OF MVP

No implementar todavía:

```txt id="j5phf9"
Pinterest OAuth
Pinterest API
WordPress Publishing
SEO Articles
Teams
Analytics Dashboard
Mobile App
Multi-tenant Organizations
```
