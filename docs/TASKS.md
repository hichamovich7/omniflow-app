# TASKS.md

# OmniFlow Development Tasks

---

# ACTIVE TASK

No active task.

All tasks through TASK-026 are completed. TASK-023 and TASK-024 also completed out of order (TASK-023 — Firecrawl was set up first, making it the natural next step; TASK-024 completed right after, closing the Research → Analyze → Generate loop). TASK-026 (Navigation Refactor) completed next, ahead of TASK-027, since it only touched the sidebar's data structure with zero route changes. TASK-029 (Rate Limit Bypass Admin Panel) completed 2026-07-14. TASK-027 (Multi-Generator Architecture) DEFERRED 2026-07-15 — see DECISIONS.md — TASK-028 built directly on top of the existing generic pieces instead. TASK-028 Option 1 (Keyword → SEO Article) completed 2026-07-15; Options 2/3 remain PLANNED. TASK-030 (Admin Dashboard) added to roadmap as PLANNED. TASK-031 (Dashboard Multi-Platform Restructure) completed 2026-07-20. TASK-032 (WordPress Categories) completed 2026-07-26. TASK-033 (Projects: truncation fix, Niche, Default Language) completed 2026-07-26. TASK-034 (Niche Visual Conventions + Text Overlay Routing) completed 2026-07-27. TASK-035 (WordPress REST API Publishing) completed 2026-07-28. TASK-FIX-006 (Import WordPress categories instead of requiring a manual one first) completed 2026-08-02. TASK-FIX-007 (WordPress send status clarity + post-hoc category assignment) completed 2026-08-02. TASK-FIX-008 (Remove duplicate H1 on WordPress-published articles) completed 2026-08-02. TASK-FIX-009 (Remove the 3-internal-image cap on the pins→article flow) completed 2026-08-02. TASK-FIX-010 (Scope the WordPress History Category filter to the selected Project) completed 2026-08-02. TASK-FIX-011 (Fix Project/Language overlap on the WordPress Generate form) completed 2026-08-02. TASK-036 (Project Detail Page + clickable Project cards + expandable Brand Profile) completed 2026-08-02.

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

TASK-018 completed — see Completed Tasks below.

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

TASK-026 completed — see Completed Tasks below.

---

### [TASK-027] Multi-Generator Architecture

#### Status: DEFERRED

#### Goal

Crear una arquitectura reutilizable para futuros generadores.

#### Note

Decisión 2026-07-15 (ver DECISIONS.md): no se trata como tarea separada antes de WordPress. Se pasa directamente a TASK-028, reutilizando pragmáticamente la infraestructura ya genérica (Brand Profile, Content Analyzer, Navigation, Editorial Workflow) y aceptando duplicación razonable en la parte específica del generador. Se reconsiderará una vez WordPress esté construido, cuando los patrones comunes reales entre Pinterest y WordPress sean visibles en el código.

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

#### Status: Options 1 and 4 completed (2026-07-15, 2026-07-17) — Options 2/3 PLANNED

#### Note

No depende de TASK-027 (decisión 2026-07-15, ver DECISIONS.md) — reutiliza directamente Brand Profile y Navigation, con duplicación razonable en la parte específica del generador (prompts, tablas, ruta API). Content Analyzer y Editorial Workflow (selección) siguen siendo reutilizables mais no están conectados por Option 1 (generación por keyword directo, sin pasar por Research/Analyze). Option 4 sí conecta Editorial Workflow selection (TASK-020).

2026-07-18: fix de fiabilidad (Options 1 y 4) — `title`/`metaTitle`/`slug`/`metaDescription` del outline se truncan de forma determinista a un límite de palabra completa antes de la validación Zod, en vez de dejar que el modelo cuente caracteres. Eliminó el falso "AI returned an invalid outline format" que aparecía cuando el modelo superaba el límite (visto en alemán, no específico a ese idioma). Ver DECISIONS.md 2026-07-18.

#### Option 1 — Keyword → SEO Article (DONE)

```txt
Input: Keyword, Project, Language
Generation: outline (Zod-validated) → full article from outline (Zod-validated) → 1 featured image + 2-3 internal images (role IMAGE)
Content stored as Markdown (source of truth), {{IMAGE_N}} markers resolved to real URLs before storage
Export: Copy Markdown, Copy HTML (via `marked`), Download .md — no direct WordPress REST API publishing
```

Text role centralized to `FAST` in `lib/wordpress/generate-article.ts` (`TEXT_ROLE` constant) — single place to switch to `SMART` if quality requires it.

#### Option 2 — Image → SEO Article (PLANNED, not implemented)

```txt
Input: reference image instead of / alongside a keyword
Depends on: TASK-013 (Image Analysis) — VISION role wiring
```

#### Option 3 — Blog URL → Rewritten/Optimized Article (PLANNED, not implemented)

```txt
Input: existing blog post URL to rewrite or SEO-optimize
Could reuse Research (TASK-023) source_type: 'blog' fetching, and Content Analyzer (TASK-024)
```

#### Option 4 — Selected Pins → Unified Article (DONE 2026-07-17)

```txt
Input: 1+ Pinterest pins selected from an Editorial Workflow generation (Pinterest module), via SelectionActionBar → "Generate WordPress Article"
Project and Language are derived server-side from the selected pins (their shared generation → project_id, and pins.language) — no manual Project/Language selectors in this mode. All selected pins must belong to the same generation, or the request is rejected (400).
Generation: outline synthesized from the pins' combined theme (lib/ai/prompts/wordpress-from-pins-prompt.ts) — one cohesive article, not a concatenation — then the full article is written from that outline using the exact same 10-block article prompt as Option 1 (lib/ai/prompts/wordpress-article-prompt.ts), unchanged.
Featured image: newly generated via generateImage() (role IMAGE), from a prompt describing the article's unified theme — never a reused pin image.
Internal images (up to 3): the active pin_images image of up to 3 of the selected pins, copied by URL as-is — no generateImage() call, no re-upload. See DECISIONS.md 2026-07-17 for why this split (fresh featured image, reused internal images).
addExternalLink() runs the same as Option 1: best-effort single external link, inserted after the article is written and before image marker resolution.
< 3 pins selected: allowed, but the UI warns before navigating ("may lack enough source material") and the API logs a warning; not a hard block.
source_type: 'pins', source_pin_ids: uuid[] on wordpress_generations records provenance.
Route: POST /api/wordpress/generate-from-pins (separate from Option 1's /api/wordpress/generate — different input shape, ownership check is pins-based instead of project-based).
```

#### Reuses (Option 1)

```txt
Brand Profile (TASK-022) — buildBrandProfileContext(), unchanged
Navigation (TASK-026) — sidebar entry unhidden
AI Engine (generateText, generateImage) — unchanged, no new provider code
Historial independiente — wordpress_generations / wordpress_articles / wordpress_article_images (migration 012), separate from generations/pins
```

Not yet wired into Option 1: Content Analyzer (TASK-024) — the keyword-only flow doesn't go through Research/Analyze. Editorial Workflow selection (TASK-020) is now wired, but only by Option 4.

#### Success Criteria

Usuario puede generar un artículo SEO completo desde un keyword, con imagen destacada e imágenes internas, y exportarlo en Markdown o HTML. (Cumplido por Option 1.) Usuario puede seleccionar pins de Pinterest y generar un artículo SEO unificado, con imagen destacada nueva e imágenes internas reutilizadas de los pins. (Cumplido por Option 4.) Options 2 y 3 quedan PLANNED.

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

## [TASK-030] Admin Dashboard (Users & Roles Management)

### Status: PLANNED

### Goal

Extender el panel admin actual (`/admin/bypass`) a un dashboard real de gestión de usuarios y roles.

### Scope

```txt
Consolidar el control de acceso admin sobre profiles.role (user/admin/superadmin,
ya decidido en DECISIONS.md) en lugar del sistema actual ADMIN_EMAIL + rate_limit_bypass
Página /admin/users: listado de usuarios, actividad (generaciones, proyectos),
gestión de roles (otorgar/revocar permisos admin)
Vista de créditos por usuario — depende de TASK-011 (Credits System),
añadir solo una vez completado TASK-011
```

### Depends On

Ninguna dependencia obligatoria para empezar. La vista de créditos por usuario espera a TASK-011 (Credits System).

### Success Criteria

Control de acceso admin basado en `profiles.role`; `/admin/users` permite ver actividad de usuarios y gestionar roles; vista de créditos añadida solo tras TASK-011.

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
Security Hardening              ✅
Credits Working                 ⬚ TASK-011
Stripe Working                  ⬚ TASK-012
```

---

# COMPLETED TASKS

## [TASK-036] Project Detail Page + clickable Project cards + expandable Brand Profile — 2026-08-02

* New `app/(dashboard)/projects/[id]/page.tsx`: header (name, niche, default language, Default badge), Brand Profile (via new `ExpandableText`, "Edit Project" button to the existing edit form), WordPress connection status (connected site URL, or a "Connect WordPress" link when none), quick stats scoped to this Project only (Pinterest generations via `generations.project_id`, WordPress articles via a two-step `wordpress_generations.project_id` → `wordpress_articles.generation_id` query — no `project_id` column on `wordpress_articles` itself, following the existing two-step-query convention from `lib/queries/wordpress-usage.ts` rather than an embedded inner-join filter), and Quick Links pre-filtered to this Project (`/history?project=`, `/wordpress/history?project=`, both existing query params; `/wordpress/categories#project-` — a same-page hash anchor rather than real filtering, since the Categories page already renders every project's section on one page)
* New `components/ui/expandable-text.tsx` — generic truncate-at-N-chars (default 200) with "Read more"/"Read less". Used on the detail page's Brand Profile, and reused with a second behavior on the Project edit form: an existing Brand Profile now starts collapsed as read-only `ExpandableText`, switching to the real editable `Textarea` (auto-focused) only once clicked into or "Read more" is clicked — a create-mode or empty Brand Profile skips this and is always directly editable
* `app/(dashboard)/projects/page.tsx` / new `components/projects/project-card.tsx`: the whole card is now a `Link` to `/projects/[id]` (markup extracted unchanged from the inline card that used to live in `page.tsx`). The existing "..." `ProjectActions` dropdown stays reachable without triggering the card's navigation — its wrapper `div` calls `preventDefault()`/`stopPropagation()` on click, same pattern used for nested-interactive-inside-a-link elsewhere in this codebase
* Caught during verification, not in the original request: `project-card.tsx` initially had no `'use client'` directive — since `app/(dashboard)/projects/page.tsx` is a Server Component, the card's `onClick` guard crashed `/projects` at runtime ("Event handlers cannot be passed to Client Component props"), a Next.js RSC boundary error `tsc`/`eslint` don't catch. Fixed by marking the card a Client Component (it needs the click guard, so this is the minimal client boundary, per CLAUDE.md's "Client Components only when needed")
* `components/wordpress/categories-manager.tsx`: each project's section got `id="project-{projectId}"` (plus `scroll-mt-6`) so the detail page's "Manage Categories" link lands on the right project
* Verified with a local Playwright install (Playwright MCP not connected in this environment, same substitute as TASK-FIX-011), authenticated via the established magic-link + `verifyOtp` + cookie-injection technique: card click → detail page navigation confirmed; "..." click → dropdown opens, no navigation (URL stays on `/projects`); detail page's Brand Profile (a real 3,296-character profile) renders collapsed with "Read more" and expands on click; edit form's Brand Profile renders collapsed (`#description` is not a `<textarea>` on load) and becomes a real, focused `<textarea>` after clicking "Read more"
* `docs/UI_UX.md`, `lib/guide/content.ts`, `docs/CHANGELOG.md` updated. No DB/schema change, no new API route — pure UI/query addition on existing tables

---

## [TASK-FIX-011] Fix Project/Language overlap on the WordPress Generate form — 2026-08-02

* Root cause, found by code inspection then confirmed visually: the Project/Language/Category row in `components/wordpress/article-form.tsx` is `grid grid-cols-3 gap-4` (Tailwind's `minmax(0, 1fr)` tracks, so the tracks themselves stay fixed-width), but the `SelectTrigger` primitive (`components/ui/select.tsx`) defaults to `w-fit` — every other place in the codebase that needs a trigger to fill its container explicitly passes `w-full` (e.g. `wp-category-mapping.tsx`, `wp-import-categories-dialog.tsx`); the Project/Language triggers here didn't. A long project name ("Blog_Home_Decor_Germany") made the Project trigger grow to its full intrinsic content width and paint over the Language trigger next to it, since nothing constrained either the trigger or its grid cell (CSS Grid items default to `min-width: auto`, not `0`)
* Fixed with `min-w-0` on each of the three grid cells, `w-full min-w-0` on the Project/Language `SelectTrigger`s, and `min-w-0` on the Project trigger's inner `truncate` span (a flex child needs `min-w-0` for `truncate`/`line-clamp` to actually engage instead of just stretching its parent — the standard fix for this class of bug). Same treatment applied to the shared `CategorySelect` component (`category-select.tsx`) for parity, per the task's "each field" wording, even though Category wasn't the reported symptom
* Playwright MCP is not connected in this environment — flagged to the user upfront rather than silently skipping or faking the requested before/after verification. User chose to have a local Playwright + Chromium installed as a substitute (kept as a devDependency afterward, per their choice, not wired into CI/test scripts)
* Verification: authenticated via a Supabase magic-link session (service-role `generateLink` + `verifyOtp`, session cookie injected into the Playwright browser context — same technique used for read-only DB diagnosis in TASK-FIX-006), navigated to `/wordpress`, selected "Blog_Home_Decor_Germany" as Project, screenshotted at 1440×900 and 1366×768 before and after the fix. Before: Project trigger ~290px wide inside a 170px track, `getBoundingClientRect()` confirmed `project.right > language.left`. After: both triggers exactly 170px, zero overlap at either resolution, confirmed both visually (PNG) and programmatically (bounding-box comparison), not just by eyeballing a screenshot
* `docs/CHANGELOG.md` updated. No `lib/guide/content.ts` change — visual/layout fix, not a behavior or capability change

---

## [TASK-FIX-010] Scope the WordPress History Category filter to the selected Project — 2026-08-02

* Root cause: `app/(dashboard)/wordpress/history/page.tsx` always queried `wordpress_categories` scoped to every project the user owns (`.in('project_id', projects.map(p => p.id))`), independent of whatever the Project filter's `searchParams.project` was already set to — so the Category dropdown never actually reflected the active Project filter
* Fixed by deriving the categories query's project scope from `params.project` when present (`[params.project]`), falling back to all owned projects only when Project is unset/"All Projects" — the existing generations query already had this same `params.project` conditional, categories now mirrors it
* Chose "disable Category when Project = All Projects" over the alternative (suffixing every category name with its project) — explicitly the simpler option per the task, and it sidesteps the ambiguity case entirely rather than just labeling it. Trigger text reads "Select a Project" while disabled instead of a dead-looking "Category" placeholder
* `components/wordpress/wordpress-history-filters.tsx`: new `handleProjectChange()` (Project select's `onValueChange`) clears the `category` URL param in the same `router.replace()` call as the project change — a category id from the previous Project scope is never left selected against a new (or no) Project
* No DB/schema change — pure query-scoping + URL-state fix
* `docs/CHANGELOG.md` updated. No `lib/guide/content.ts` change — filter-scoping correctness, not a new capability

---

## [TASK-FIX-009] Remove the 3-internal-image cap on the pins→article flow — 2026-08-02

* Root cause was two independent hard-coded 3s, not one — both had to be fixed together or the second would have silently broken any request past 3 images:
  1. `app/api/wordpress/generate-from-pins/route.ts` — `pinsWithImage` was `.slice(0, MAX_INTERNAL_IMAGES)`, discarding any pin beyond the 3rd regardless of how many the user selected. Removed; `internalImageUrls` (and therefore `imageCount` passed into the outline prompt/schema) now reflects every selected pin with an active image
  2. `lib/ai/prompts/wordpress-from-pins-prompt.ts` — the outline prompt's `imagesInstruction` enumerated placement marker names as a literal ternary chain capping out at `"IMAGE_3"`. Not reachable as a bug while the route capped at 3, but would have left the model with no instruction for `IMAGE_4` onward the moment the route cap was lifted — fixed to build the full marker list dynamically from `imageCount` via `Array.from({ length: imageCount }, ...)`
* Verified point 3 (sections vs. image count) separately: the outline schema for this flow (`buildWordpressPinsOutlineSchema`, `lib/validations/wordpress.ts`) already pins `images` to `.length(imageCount)` dynamically — no fixed cap there, already correct. The article-writing prompt (`wordpress-article-prompt.ts`, shared with Option 1) already places markers generically ("at the point in the body... most relevant"), with no 1-marker-per-section assumption in code. Added one explicit instruction line anyway — more than one marker may share a section when images outnumber the 8-10 planned sections — since a real request could select up to 20 pins (`generateArticleFromPinsSchema`, `pinIds` max 20) while sections cap at 10
* The `keyword` field synthesized for the generation (`pins.slice(0, N).map(p => p.title).join(' + ')`, a short display label, unrelated to image count) was incidentally reusing the same `MAX_INTERNAL_IMAGES` constant — split into its own `MAX_KEYWORD_PIN_TITLES = 3`, behavior unchanged, just no longer coupled by name to the removed image cap
* Option 1 (keyword flow) explicitly out of scope, confirmed untouched: separate schema (`wordpressOutlineSchema`, fixed `.min(2).max(3)` images), separate prompt (`wordpress-outline-prompt.ts`), separate generation path (`generateWordPressArticle`, real `generateImage()` calls via `promisePool`, not pin-image reuse)
* `docs/CHANGELOG.md`, `lib/guide/content.ts` updated. No DB/schema change

---

## [TASK-FIX-008] Remove duplicate H1 on WordPress-published articles — 2026-08-02

* Root cause: the article-writing prompt (`lib/ai/prompts/wordpress-article-prompt.ts`) always instructs the AI to write `"# {title}"` as the literal first line of `content` — so `content` and `wordpress_articles.title` both carry the title, by design (`title` is `outline.title`, the same source `content`'s H1 line renders). Fine as long as only one of the two ever reaches a rendered page — but the publish route sends `title` as the WP post's own `title` field (rendered as H1 by the theme) *and* `content` (H1 line included) as the post body, so a published post showed two stacked H1s
* Pre-check requested before coding: does `/wordpress/[id]` (OmniFlow's own reading view) have the same bug? Verified no — its page `<h1>` renders `generation.keyword` (not `article.title`); `article.title` is only used as the featured image's `alt` attribute, never as a second visible heading. The only title rendered in that view's reading pane comes from `content`'s own H1 via `exportToHtml()`/`ArticleContent` — removing it there would leave the article with no visible title at all in that view (a new bug), not fix an existing one. Left untouched
* New `stripLeadingH1()` in `lib/wordpress/export.ts` (regex-based, handles both `\n` and `\r\n`, no-op if `content` doesn't start with an H1) plus `exportToMarkdownForWordPress()`/`exportToHtmlForWordPress()`, wired into: `POST /api/wordpress/[id]/publish`'s post body (both the initial `upsertPost` call and its 404-retry create), and `CopyExportButtons`' `markdown`/`html`/download props on `/wordpress/[id]` (shown only when the project has no WordPress connection) — flagged explicitly in the task as the same risk since TASKS.md already documents Copy Markdown/HTML as meant for pasting into WordPress
* `content` in the database is untouched — still generated and stored with its H1 intact, deliberately, per the task's explicit instruction (kept for a hypothetical future export target with no separate title field). Stripping is export-time only, never at generation
* Raw `exportToMarkdown()` (unconditional passthrough) deleted — the `CopyExportButtons` call was its only caller, now replaced by the WordPress-specific variant, so it had no remaining use. `exportToHtml()` (raw) is kept — still the correct function for `ArticleContent`'s internal rendering
* `docs/DATABASE.md`, `docs/API.md`, `docs/CHANGELOG.md` updated. No `lib/guide/content.ts` change — this is an internal rendering-correctness fix, not a new user-facing capability to document in the in-app Guide

---

## [TASK-FIX-007] WordPress send status clarity + post-hoc category assignment — 2026-08-02

* Two independent fixes on top of TASK-035. Neither touches the known-separate duplicate-H1-title or pins-image-limit issues — explicitly out of scope for this task.
* **Send status clarity**: `wp_post_id`/`publish_status` already existed (TASK-035) but weren't visible enough to prevent an accidental duplicate send. New shared `components/wordpress/wp-send-status-badge.tsx` renders "Not sent to WordPress" (gray, no `wp_post_id`) vs "Sent as Draft"/"Published"/"Scheduled for [date]" (green, `wp_post_id` present) vs "Failed to send"/"Update failed" (red, `publish_status = 'failed'`) — shown prominently at the top of `/wordpress/[id]` and compact on every `/wordpress/history` row (query extended to select the needed columns)
* "Scheduled for [date]" needed the actual WP-side target datetime, which was never persisted (`published_at` stays null for `scheduled` by design, migration 019). New migration 020 adds `wordpress_articles.scheduled_at` (nullable timestamptz), set by the publish route only on `mode: "schedule"`, cleared otherwise. Agent has no live DB access (service_role lacks table grants in this project, confirmed during TASK-FIX-006's diagnosis; no Supabase CLI access token either) — user applied migration 020 manually before testing
* `publish-control.tsx`: clicking Save as Draft/Publish Now/Schedule when `article.wp_post_id` already exists now opens a confirmation dialog first ("already sent on [date] — this will update the existing post, not create a duplicate"), informational not blocking — `upsertPost()` already handles the update-not-duplicate case correctly, this is purely a UI safeguard
* **Post-hoc category assignment**: verified first — `category_id` was only ever settable at generation time (`generate`/`generate-from-pins` routes), no edit path existed after. New `PATCH /api/wordpress/[id]` (`[id]` = generation id, alongside the existing `DELETE`) reassigns it, ownership-checked per TASK-018's inline pattern, plus an extra scope check that the category belongs to the generation's own `project_id` (cross-project assignment would silently produce a meaningless `wp_category_id` mapping)
* New `components/wordpress/article-category-editor.tsx` reuses the exact `CategorySelect` component from generation time, immediate save on change. Changing the category never re-publishes automatically — if the article already has a `wp_post_id`, a note explains the change only takes effect on the next publish/update, matching how the mapped-category resolution already works in the publish route
* `docs/DATABASE.md`, `docs/API.md`, `docs/CHANGELOG.md`, `lib/guide/content.ts` updated

---

## [TASK-FIX-006] Import WordPress categories instead of requiring a manual one first — 2026-08-02

* Diagnosed (no fix applied in that pass): `/wordpress/categories` showed no real WordPress categories for a connected site even though "Test Connection" succeeded. Root cause traced with a throwaway script — `fetchCategories()` worked fine (HTTP 200, real categories returned); the actual bug was `components/wordpress/categories-manager.tsx` only mounting `WpCategoryMapping` when `projectCategories.length > 0` — a project with zero OmniFlow categories (the case here: none had ever been created) never rendered the mapping UI at all, so `wp_category_id` could never be set and publishing fell back to WordPress's default "Uncategorized"
* Fix: `WpCategoryMapping` now renders whenever a site is connected, independent of category count (`categories-manager.tsx:70`, condition dropped). `wp-category-mapping.tsx` shows an explicit "No categories yet — create one manually or import from WordPress" empty state instead of an empty list under its "Map to WordPress category" header
* New "Import from WordPress" button (next to "New Category", visible whenever a site is connected) opens `components/wordpress/wp-import-categories-dialog.tsx` — lists the site's real WordPress categories with checkboxes (all checked by default), and creates one OmniFlow category per one kept checked, `wp_category_id` already filled in — no second manual mapping pass required
* New `POST /api/wordpress/sites/[id]/categories/import` — re-fetches categories from WordPress server-side rather than trusting client-supplied names (only the ids round-trip from the client), matches against the project's existing categories case-insensitively by name: fills in `wp_category_id` only if it was unset (an existing mapping is never overwritten), otherwise inserts a new category. Ownership check copied from the established inline pattern (TASK-018/TASK-032/TASK-035: `select → 404 → 403`), no shared helper. Not rate-limited — bounded one-shot action, same precedent as the existing `GET .../categories` endpoint, per user instruction
* `lib/validations/wordpress-category.ts`: new `importWordPressCategoriesSchema`
* No DB migration — reuses the existing `wordpress_categories.wp_category_id` column from TASK-035
* `docs/API.md`, `docs/CHANGELOG.md`, `lib/guide/content.ts` updated

---

## [TASK-035] WordPress REST API Publishing — 2026-07-28

* New `wordpress_sites` table (migration 019) — one WordPress connection per Project (`project_id` UNIQUE), `site_url`/`wp_username`/`encrypted_application_password` (AES-256-GCM, new `lib/wordpress/crypto.ts`, no external dependency — no encryption precedent existed in the codebase before this task). RLS via denormalized `user_id = auth.uid()`, same shape as `wordpress_categories` (migration 016), justified in DECISIONS.md
* `wordpress_categories.wp_category_id` (nullable int) — maps to the real WordPress category term id. `wordpress_articles.wp_post_id` / `publish_status` (`draft`/`scheduled`/`published`/`failed`, default `draft`, not a DB enum/CHECK) / `published_at` / `publish_error`
* New `lib/wordpress/rest-client.ts` — native `fetch` (no HTTP library, matching `lib/research/providers/firecrawl.ts`/`lib/ai/providers/openrouter.ts`): `testConnection()` (`GET /wp-json/wp/v2/users/me`, the credential-validation step, always re-run server-side before any write), `fetchCategories()`, `uploadMedia()` (raw binary body + `Content-Disposition`, not multipart — downloads from the article's Supabase Storage URL and re-uploads to the WP media library), `upsertPost()` (`status`/`date` per WP REST conventions — `future` + `YYYY-MM-DDTHH:MM:SS` with no timezone suffix for scheduling, auto-published by WP-Cron with no further OmniFlow action)
* New API routes, flat `/api/wordpress/...` namespace (no `/api/projects/[id]/...` precedent exists in this codebase — justified in DECISIONS.md): `POST /api/wordpress/sites/test`, `POST /api/wordpress/sites`, `PATCH`/`DELETE /api/wordpress/sites/[id]`, `GET /api/wordpress/sites/[id]/categories`, `POST /api/wordpress/[id]/publish`. Every route follows the existing inline ownership-check convention (TASK-018/TASK-032, no shared helper)
* Rate limiting extended to `wordpress/sites/test` (30/hour) and `wordpress/publish` (15/hour) — first non-AI endpoints rate-limited, since both make real external requests to a third-party WordPress host with real side effects
* `components/projects/project-form.tsx` — new "WordPress Connection" section in the existing shared create/edit form (no new tab/page — no Tabs pattern exists anywhere in this app, and the form already handles create/edit via a `mode` prop): Site URL / WP Username / Application Password, "Test Connection" required before the connection can be saved, "Connected to [site]" badge + Change/Disconnect once connected. Project save and WordPress-connection save are two separate API calls — a WordPress-connection failure never rolls back or blocks the already-saved project
* `components/wordpress/wp-category-mapping.tsx` — on `/wordpress/categories`, when a project has an active connection, maps each OmniFlow category to a real WordPress category (auto-suggested by case-insensitive name match, editable via `Select`), persisted through the extended `PATCH /api/wordpress/categories/[id]`
* `components/wordpress/publish-control.tsx` — on `/wordpress/[id]`, replaces `CopyExportButtons` when the project has an active connection (unchanged otherwise): Draft (default) / Publish Now / Schedule, native date/time inputs for Schedule mirroring the Pinterest `ScheduleDialog` JSX pattern (not importing that component — it's tightly coupled to Pinterest's pin-distribution logic). Featured image upload failure aborts the publish (`featured_media` has no URL-fallback); internal image upload failures are non-fatal, the original Supabase URL is kept. Every failure sets `publish_error`, shown to the user — never silent
* Known limitations, both flagged in DECISIONS.md rather than fixed this iteration: `fetchCategories` caps at 100 (WP's `per_page` max, no pagination); no server-side lock against a genuine two-tab double-publish race (client-side `loading` guard only)
* Not tested against a real WordPress site by the agent — explicitly left to the user
* `docs/DATABASE.md`, `docs/API.md`, `docs/DECISIONS.md` (2026-07-28 entry), `docs/CHANGELOG.md`, `lib/guide/content.ts`, `.env.example` updated

---

## [TASK-034] Niche Visual Conventions + Text Overlay Routing — 2026-07-27

* New `lib/ai/niche-visual-conventions.ts` — `getNicheVisualConvention(niche)` maps a project's `niche` (TASK-033, free text) to `{ framingMode: 'space' | 'object', allowTextOverlay: boolean, styleGuidance: string }`. Four entries for this iteration: `Home Organization & Decor` (migrated from the old keyword-based classification), `Personal Finance / Budgeting`, `Food & Recipes`, `Travel`. Unrecognized/empty niche → `null`, caller applies the conservative default. Beauty & Personal Care, Pets, Parenting & Baby, Health & Wellness (medical) deliberately excluded from this iteration
* `lib/prompts/pinterest-pins.ts`: niche convention now takes priority for `framingMode`; the old keyword heuristic (`classifyPinComposition`) is kept only as a fallback for niches with no entry — including Home Decor projects that predate `projects.niche` or left it blank, so no existing project silently loses its full-room framing. `allowTextOverlay` has no keyword fallback (always `false` without a matched niche). `PROMPT_ID`: `pinterest-pins-v4` → `pinterest-pins-v5`
* New `textOverlayMode` (`auto` default / `always` / `never`) on `POST /api/pinterest/generate` (`lib/validations/pinterest.ts`); each pin's `visualFormat`/`overlayText` is decided by the AI in the same single generation call (no separate outline step, unlike WordPress). Server clamps to `never` whenever the resolved niche doesn't allow text overlay, regardless of the submitted value — the form (`components/pinterest/pin-form.tsx`) already hides the selector in that case, but the server doesn't trust the client alone (Rule #6)
* Migration 018: `pins.visual_format` (`text NOT NULL DEFAULT 'photo'`), `pins.overlay_text` (nullable) — validated at the Zod layer, no DB CHECK, same convention as other status-like text columns in this schema
* `lib/ai/services/image.ts`: pins with `visualFormat: 'text-overlay'` route through OpenRouter to a new `AI_IMAGE_MODEL_TEXT` env var (default `google/gemini-3.1-flash-image`), reusing the existing `OPENROUTER_IMAGE_API_KEY` — no new provider key. `photo` pins keep the existing `AI_IMAGE_PROVIDER`/`AI_IMAGE_MODEL` behavior unchanged. Routing decision lives entirely inside `lib/ai/` (Rule #10/#11)
* `lib/ai/prompt-engine/engine.ts` (`buildImagePrompt`): text-overlay pins get an explicit "render this exact text" instruction and swap `NEGATIVE_CONSTRAINTS` for a new `NEGATIVE_CONSTRAINTS_TEXT_OVERLAY` preset (`presets.ts`) that permits the one requested text instead of banning all text
* Zero images regenerated, zero pins backfilled — `visual_format` defaults to `photo` for all existing rows
* `docs/DECISIONS.md`, `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/UI_UX.md`, `.env.example`, `lib/guide/content.ts` updated

---

## [TASK-031] Dashboard Multi-Platform Restructure — 2026-07-20

* Dashboard (`app/(dashboard)/dashboard/page.tsx`) now reflects both Pinterest and WordPress instead of Pinterest only
* "Generate Content" primary CTA replaced by a `DropdownMenu`-based button (new `components/dashboard/generate-content-menu.tsx`, Client Component — justified per Rule #29) with two options: "Pinterest Pins" (→ `/pinterest`) and "WordPress Article" (→ `/wordpress`); remains the only solid/primary button on the screen
* Quick Actions grid: single "View History" card replaced by "Pinterest History" (→ `/history`) and "WordPress History" (→ `/wordpress/history`), alongside unchanged "New Project"; grid reflows from 2 to 3 cards (`sm:grid-cols-3`)
* New "Articles Generated" stat card counts `wordpress_articles` (RLS-scoped to the user, same pattern as the existing `generations`/`pins` counts — no explicit `user_id` filter needed); stats grid now 5 cards (`sm:grid-cols-3 lg:grid-cols-5`), verified not to overflow at 1366×768
* "Projects" stat card is now a `Link` to `/projects` (previously a static div)
* Recent Activity merges Pinterest `generations` and WordPress `wordpress_generations` into one list, sorted by `created_at` descending, top 5 — two grouped queries (one per table), not N+1; each row shows a platform icon (Sparkles for Pinterest, FileText for WordPress, matching existing sidebar/history icon conventions) next to the status dot, and links to `/pinterest/[id]` or `/wordpress/[id]` accordingly
* Visually verified with a Playwright-driven headless browser (real login, not a static check) at 1440×900 and 1366×768 — no overflow, dropdown opens correctly, Projects tile navigates, zero console errors
* `docs/UI_UX.md` Dashboard section rewritten to describe the two-platform structure
* No database schema changes (reused existing `wordpress_articles` table), no API changes, no new dependencies — `lib/guide/content.ts` not touched since Dashboard was never a documented guide section (it's a navigation hub over already-documented features, not a new capability)

---

## [TASK-032] WordPress Categories (manual, project-scoped) — 2026-07-26

* New `wordpress_categories` table (migration 016) scoped by `project_id`, RLS via denormalized `user_id = auth.uid()` — same shape as `boards` (unique `(project_id, name)` index, no `updated_at` trigger since renames are infrequent)
* `wordpress_articles.category_id` added (nullable, `ON DELETE SET NULL`) — deleting a category never deletes the articles that used it, they fall back to "Uncategorized"
* Assignment is **always manual on both generation flows, no AI suggestion anywhere** — explicit requirement, unlike `boards`' `findOrCreateBoardIds` auto-linking
* New `components/wordpress/category-select.tsx` — built from existing `Select`/`Dialog`/`Button`/`Input` primitives only (no Combobox/Popover exists in this codebase): a Select with "Uncategorized" + existing categories + a "+ New Category" item that opens a quick-create Dialog, plus a small gear-icon button opening a Manage dialog (inline rename, two-step confirm delete)
* `components/wordpress/article-form.tsx` (keyword flow): Project/Language 2-column row becomes a 3-column row with Category; category options are client-filtered by the selected project (same pattern as the existing board-filtered-by-project logic in `history-filters.tsx`); switching project resets the selected category
* `components/wordpress/pins-source-article-form.tsx` (pins flow): this form has no Project field at all — project is resolved server-side in `app/(dashboard)/wordpress/page.tsx` from the selected pins' generation, and categories are fetched pre-scoped to that project; Category field placed directly below Research Notes
* `lib/validations/wordpress.ts`: `categoryId` (optional uuid) added to both `generateArticleSchema` and `generateArticleFromPinsSchema`; new `lib/validations/wordpress-category.ts` for the category CRUD schemas
* New `app/api/wordpress/categories/route.ts` (POST) and `.../categories/[id]/route.ts` (PATCH/DELETE) — ownership checks copied verbatim from the `boards` routes' established inline pattern (`select('id, user_id') → 404 → 403`), no shared helper introduced, consistent with TASK-018
* `app/api/wordpress/generate/route.ts` and `.../generate-from-pins/route.ts`: validate that a submitted `categoryId` belongs to the resolved `projectId` before writing it onto the `wordpress_articles` insert (data-integrity guard; RLS already scopes the row to the requesting user) — **`buildWordPressFromPinsPrompt` and the outline schemas are untouched**, category never reaches AI input
* WordPress History: category badge (`outline` variant, "Uncategorized" fallback) added next to the existing status badge on each card; new Category filter alongside Project/Language/Status, using the same two-step "query child table for generation_ids, then `.in('id', ...)`" pattern already used for the Pinterest board filter
* New `/wordpress/categories` page (mirrors `/boards` for parity) + sidebar entry (`components/layout/sidebar.tsx`) under the WordPress group, between Generate and History. One section per project listing its categories with inline rename/delete and a "New Category" button — reuses `CategoryManagerList`/`CreateCategoryDialog`, extracted as named exports from `category-select.tsx` so the same rename/delete logic isn't duplicated between the in-form Manage dialog and this standalone page
* `docs/DATABASE.md`, `docs/DECISIONS.md` (2026-07-26 entry), `docs/CHANGELOG.md`, `docs/UI_UX.md` updated

---

## [TASK-033] Projects: Brand Profile truncation fix, Niche field, Default Language — 2026-07-26

* **Truncation fix**: diagnosed before coding — `projects.description` (DB `text`) has no limit; the real cap was a Zod `.max(500)` (`lib/validations/project.ts`, both create/update schemas) stacked with `maxLength={500}` on the Brand Profile `<Textarea>` (`components/projects/project-form.tsx`). `rows={3}` was ruled out — display-only, doesn't truncate data. Both raised to 10,000 rather than removed, as a real (not functional) abuse ceiling
* Migration 017 adds `projects.niche` and `projects.default_language`, both nullable `text`, no DB constraint — validated at the Zod layer only (`default_language` against the existing `SUPPORTED_LANGUAGES` enum from `types/pinterest.ts`, not redeclared)
* New `components/ui/combobox.tsx` wraps `@base-ui/react/combobox` (already a dependency, `^1.6.0` — same library every other `components/ui/` primitive wraps). **No new npm dependency** — confirmed during planning that `cmdk` isn't present anywhere in this codebase and isn't needed; base-ui's `combobox` subpath already provides live-filtered list + free-text input natively
* Niche field: `components/projects/project-form.tsx` uses the new Combobox with a fixed 20-item suggestion list (Insurance, Mortgages & Home Loans, ... Food & Recipes), but any typed value is stored as-is — no enum, no validation against the list. Storage only: no prompt/AI logic branches on this field yet (see `docs/DECISIONS.md`, 2026-07-26 "(3)" entry — home decor cadrage convention is not universal; the future extension point for a real second niche is enriching the Brand Profile, not this field)
* Default Language field: a `Select` (same `SUPPORTED_LANGUAGES`/`LANGUAGE_LABELS` source as the generation forms) with a "None" option, since it's optional
* `app/api/projects/route.ts` (POST) explicitly destructures/inserts `niche`/`default_language` (this route builds its insert object field-by-field, not a spread); `app/api/projects/[id]/route.ts` (PATCH) needed no change — it already spreads all non-`is_default` parsed fields into `.update()`
* Pre-fill wiring: `components/pinterest/pin-form.tsx` and `components/wordpress/article-form.tsx` seed initial `language` state from the default project's `default_language`, and a `handleProjectChange` (new in `pin-form.tsx`, extended in `article-form.tsx` where it already existed for category-reset) sets `language` on project switch — but only when the newly selected project actually has a `default_language`; otherwise the current language selection is left untouched, never forced. Both `app/(dashboard)/pinterest/page.tsx` and `app/(dashboard)/wordpress/page.tsx` project queries extended to select `default_language`
* `docs/DATABASE.md`, `docs/CHANGELOG.md`, `lib/guide/content.ts` updated

---

## [TASK-FIX-005] Pin Detail Dialog — full content no longer hidden behind line-clamp truncation — 2026-07-18

* New `components/pinterest/pin-detail-dialog.tsx` — shared, read-only dialog (full image, untruncated title/description, keywords as tags, image prompt) opened by clicking a pin card; modeled structurally on `ImageVersionsDialog` (controlled `open`/`onClose`) but view-only, no duplicated card actions
* `components/pinterest/pin-table.tsx` (Results page) and new `components/boards/board-pin-card.tsx` (Board Detail page, extracted from previously inline card markup) both wire the same dialog — checkbox/image/Regenerate/Versions clicks `stopPropagation()` so the card click doesn't fight with their own actions
* Image prompt shown in a monospace block labeled "Internal use, not exported", with a Copy-to-clipboard button — confirmed via full read of `lib/csv/pinterest.ts` (`generatePinterestCsv`, the only CSV export path) that `image_prompt` was never and is still not one of the exported CSV columns
* Fixed a follow-up bug: `DialogContent` had no `max-height`, so a long image prompt could push the dialog taller than the viewport with no way to scroll to the cut-off part (dialog is `position: fixed`, page scroll doesn't help) — added `max-h-[90vh] overflow-y-auto` on the dialog and `overscroll-contain` on the inner prompt block so scrolling it doesn't chain to the dialog behind it
* `docs/UI_UX.md`: replaced the stale "Pins Table"/"Pin Card View"/"Character Counters" sections (described inline-editable fields and per-field copy buttons that were never built) with "Pin Grid" and "Pin Detail Dialog", matching actual behavior; `lib/guide/content.ts` "Editorial Review" section updated with a point about the click-to-expand behavior
* `line-clamp-2`/`line-clamp-3` kept as-is in both grid views — this only adds a way to reach the full content, it doesn't touch list-view density
* Zero changes to selection, image regeneration/versions, scheduling, or CSV export logic

---

## [TASK-029] Rate Limit Bypass Admin Panel — 2026-07-14

* New `rate_limit_bypass` table (migration 011) — `email`, `added_at`, RLS enabled with **no policies** (deny-all for the normal anon/authenticated client, matching the requested "deny all direct access")
* New `is_rate_limit_bypassed()` Postgres function (SECURITY DEFINER) — self-referential, takes no email argument, reads `auth.jwt() ->> 'email'` internally so it can only ever answer for the caller's own session; `GRANT EXECUTE ... TO authenticated` is safe to expose broadly because of this
* New `lib/supabase/admin.ts` `createAdminClient()` — the project's first use of the Supabase `service_role` key (RULES.md Rule #7 allows it "en procesos controlados"); scoped exclusively to `app/api/admin/bypass-emails/route.ts`, every handler of which re-verifies `user.email === process.env.ADMIN_EMAIL` via the normal session client *before* the service-role client is ever touched
* `lib/rate-limit.ts` `checkRateLimit()` signature extended to `(userId, userEmail, endpoint, limit, windowSeconds)`: (a) `userEmail === process.env.ADMIN_EMAIL` short-circuits to `{ allowed: true }` with no DB call, (b) otherwise calls `is_rate_limit_bypassed()` — a match short-circuits the same way, (c) otherwise falls through to the existing `increment_rate_limit()` counter from TASK-018, unchanged
* All 4 existing call sites (`pinterest/generate`, `pinterest/generate-images`, `research`, `analyze`) updated to pass `user.email ?? ''` — sourced exclusively from the same `supabase.auth.getUser()` call that already produced `user.id`, never from client input (see confirmation below)
* New `app/(dashboard)/admin/bypass/page.tsx` — Server Component, checks `user.email === process.env.ADMIN_EMAIL` first and calls `notFound()` (404, no "access denied" message) if it doesn't match; only then reads the bypass list via its own `createAdminClient()` call. No sidebar entry — reachable only by direct URL
* New `app/api/admin/bypass-emails/route.ts` (GET/POST/DELETE) — each handler independently re-runs the same `ADMIN_EMAIL` check via `requireAdmin()` and returns 404 on failure, regardless of what the page-level check already did (defense in depth — the route is directly reachable by URL)
* New `components/admin/bypass-email-form.tsx` / `bypass-email-table.tsx` — Card/Table/Dialog/Button/Input reused as-is per DESIGN_SYSTEM.md, mirroring the existing Boards CRUD pattern (`BoardForm`/`DeleteBoardDialog`)
* Zero changes to TASK-018's ownership validation, `is_default` fix, `request.json()` try/catch, or UUID param validation — untouched, out of scope for this task

---

## [TASK-018] Security Hardening — 2026-07-14

* New `api_rate_limits` table (migration 010) + `increment_rate_limit()` Postgres function — atomic fixed-window counter (single `INSERT ... ON CONFLICT DO UPDATE`, avoids the read-then-write race of separate SELECT/UPDATE calls under concurrent requests)
* New `lib/rate-limit.ts` `checkRateLimit(userId, endpoint, limit, windowSeconds)` — applied to `POST /api/pinterest/generate` (60/hour), `POST /api/pinterest/generate-images` (20/hour), `POST /api/research` (60/hour), `POST /api/analyze` (60/hour); returns `429` (`rate_limited`) when exceeded, fails open (allows the request) if the rate-limit check itself errors, so an infra hiccup on this table never blocks generation
* Explicit `user_id === auth.uid()` ownership checks (`403 forbidden`) added in every API route that loads a resource by ID, as defense-in-depth alongside existing RLS policies — `projects/[id]`, `boards/[id]`, `generations/[id]`, `research/[id]`, `pinterest/pin-images/[id]`, `pinterest/pin-images` (GET by `pinId`), `pinterest/generate` (project + optional analysis), `pinterest/schedule` (generation), `boards` (project), `research` (project), `analyze` (research result)
* New `lib/queries/pin-images.ts` `getPinOwnerUserId()` — `pin_images` has no direct `user_id` column, so ownership is resolved by walking `pin_images → pins → generations.user_id`
* Fixed `is_default` cross-user bug in `app/api/projects/[id]/route.ts`: the bulk "clear previous default" update and the "set new default" update now both carry an explicit `.eq('user_id', user.id)` instead of relying solely on RLS to scope the write
* try/catch added around every `request.json()` call across the 9 POST/PATCH routes — malformed JSON now returns `400` (`invalid_json`) instead of surfacing as an unhandled exception
* New `lib/utils/uuid.ts` `isValidUuid()` — validates the `[id]` URL param format in `projects/[id]`, `boards/[id]`, `generations/[id]`, `research/[id]`, `pinterest/pin-images/[id]` before it reaches a database query; returns `400` (`invalid_id`)
* Pre-implementation audit confirmed RLS (Rule #7) was already correctly enforced on every table via the anon-key Supabase client (no `service_role` usage found in application code) — the vulnerabilities this task targeted were app-layer gaps (RULES.md Rule #6 violations), not live cross-user data exposure
* Zero changes to existing business logic, request/response shapes, or unrelated routes — security layers only

---

## [TASK-FIX-004] Design System Consistency Corrections — 2026-07-14

* `app/globals.css` `--background` : suppression du tint violet (`oklch(0.977 0.014 308)` / `#FAF5FF` → `oklch(0.985 0 0)` / `#FAFAFA`) — le violet est désormais réservé aux éléments interactifs uniquement
* Nouvelle prop `narrow` sur `components/ui/page-container.tsx` `PageContainer()` — limite les pages de formulaire simples (Research, Generate, New/Edit Project, New/Edit Board) à `max-w-2xl` au lieu du `max-w-7xl` des pages liste/grille
* Discipline "One Primary Per Screen" appliquée : les boutons de navigation/liste ("New Board", "Create Project", "New Project", "Go to Generator", "Continue to Generate") passent de `primary` (défaut) à `variant: 'outline'` dans `boards/page.tsx`, `pinterest/page.tsx`, `research/page.tsx`, `projects/page.tsx`, `history/page.tsx`, `research-form.tsx` — un seul CTA violet plein reste visible par écran
* Boutons de soumission de formulaire (`pin-form.tsx`, `research-form.tsx`) passés de pleine largeur (`w-full`) à alignés à droite, taille au label (`h-11 px-6`)
* `components/layout/sidebar.tsx` : item de nav actif restylé — fond plein + texte violet remplacé par une barre indicatrice gauche de 2px + texte foreground sombre
* Zero changes aux routes, APIs ou base de données — changements visuels/CSS et props de composants uniquement

---

## [TASK-FIX-003] Research Reliability & Pinterest URL Removal — 2026-07-09

* `lib/research/providers/firecrawl.ts` `scrapeUrl()`: added `onlyMainContent: true` and `waitFor: 3000` to the Firecrawl `/scrape` call — strips nav/footer noise and gives JS-heavy pages time to render before capture; verified live against a real website research call, still works
* New `classifyResearchError()` in `app/api/research/route.ts` (mirrors `classifyGenerationError()` from the Pinterest generate route): failures are now classified into specific, actionable messages (blocked/timeout/rate-limited/unsupported site/no content) instead of one generic string, and the real message is persisted to `research_results.error_message` — previously it was hard-coded to the same generic text regardless of cause
* Research History now displays the stored `error_message` inline under failed rows, and a Retry action (hover-reveal) that re-populates the form with the same Project/Source/Input
* **Root cause found via live testing**: Pinterest URL research was failing 100% of the time because Firecrawl does not support scraping pinterest.com at all (`403`, `"we do not support this site"`) — not a bot-detection or JS-timing issue, and not fixable with `proxy`/`waitFor`/other scrape params (tested `proxy: 'auto'` live, same result)
* "Pinterest URL" removed from the Research Form's Source selector and from `createResearchSchema` (`lib/validations/research.ts`) — new submissions are rejected at the API, not just hidden in the UI. Retry is also hidden for historical Pinterest-source rows (would just fail again with a validation error)
* `research_results.source_type` CHECK constraint intentionally left unchanged — historical `pinterest` rows remain valid and readable (see DATABASE.md)
* Zero changes to `content_analyses`/`generations` — Analyze and Generate are unaffected, this only touches the Research acquisition step

* `app/(dashboard)/history/page.tsx`: server-side pagination via Supabase `.range()` + `{ count: 'exact' }`, 20 generations per page, all existing filters (keyword/project/board/language/status) applied before the range so pagination is always computed on the filtered set
* New `components/history/history-pagination.tsx`: Server Component, Previous/Next links preserving all current query params, hidden entirely when there's only one page
* `components/history/history-filters.tsx`: changing any filter now resets `page` to 1, so switching projects/keywords never leaves the user stranded on an out-of-range page for the new result set
* Out-of-range `page` values (e.g. stale bookmark, manual URL edit) redirect server-side to the last valid page instead of showing a misleading "No generations yet" empty state when generations actually exist — caught during manual verification
* Removed from BACKLOG (was deferred "until data volume justifies them" — the account used for verification already had enough generations to make single-page scrolling noticeably worse)
* Zero changes to API routes or database — query-level pagination only

---

## [TASK-026] Navigation Refactor — 2026-07-09

* `components/layout/sidebar.tsx` `navGroups` reorganized from function-based grouping (Generators / Library / Account) to platform-based grouping (Workspace / Pinterest / Platforms / Account) — matches the structure already specified in `docs/ARCHITECTURE.md`'s Navigation section
* Pinterest group now contains Research, Generate (renamed from "Pinterest" — the group header already says Pinterest), Boards, History — same 4 routes as before (`/research`, `/pinterest`, `/boards`, `/history`), zero URL changes, zero broken links
* New disabled "Platforms" group: WordPress, Facebook, LinkedIn, Medium — placeholders using the same `disabled` pattern already established for Credits/Settings, preparing the sidebar for TASK-028 (WordPress) and beyond without inventing new UI patterns
* `components/layout/mobile-nav.tsx` needed no changes — it already reuses `SidebarContent`, single source of truth for both desktop and mobile nav
* Zero changes to routes, pages, APIs, or database — sidebar data structure only

---

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
