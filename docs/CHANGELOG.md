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

# [1.11.2] - 2026-07-14

## TASK-FIX-004: Design System Consistency Corrections

### Changed

* Fond de page passé d'un tint violet subtil à un gris neutre — le violet est réservé aux boutons/liens/états actifs uniquement
* Les pages de formulaire (Research, Generate, New/Edit Project, New/Edit Board) ne s'étirent plus sur toute la largeur — largeur plafonnée via la nouvelle prop `narrow` de `PageContainer`
* Discipline "un seul bouton primary par écran" appliquée : les boutons secondaires/de navigation (Boards, Projects, Pinterest, Research, History) passent en style outline
* Boutons de soumission (Research, Generate Pins) désormais alignés à droite et dimensionnés au label plutôt qu'en pleine largeur
* Indicateur de nav actif dans la sidebar : fond plein remplacé par une barre gauche + texte foreground sombre

No database migration, no API contract changes — CSS and component-prop changes only.

---

# [1.11.1] - 2026-07-09

## TASK-FIX-003: Research Reliability & Pinterest URL Removal

### Fixed

* Research failures now show a specific, actionable error message (blocked / timeout / rate-limited / unsupported site / no content) instead of one generic string, persisted and displayed on the failed history row, with a Retry action
* Firecrawl scrape calls now use `onlyMainContent`/`waitFor` for more reliable content extraction

### Removed

* "Pinterest URL" removed as a Research source — Firecrawl does not support scraping pinterest.com at all (confirmed via live testing, not fixable with scrape params). Historical Pinterest research results remain visible; new submissions are rejected server-side.

No database migration — the `source_type` CHECK constraint is unchanged, only the app-level validation and UI selector changed.

---

# [1.11.0] - 2026-07-09

## User Guide

### Added

* New in-app Guide (`/guide`), added to the sidebar's Account group — one page, one card per feature (Projects, Research, Analyze, Generate, Editorial Review, AI Images, Boards, Scheduling, Export, History), with an anchor-link chip row for quick navigation
* Content lives in `lib/guide/content.ts` (`guideSections`) — plain data, no markdown parser or CMS added
* New standing rule in `CLAUDE.md` Documentation Discipline: any user-facing feature must update the Guide at the same time it ships, not as a follow-up task

No API or database changes — static content page only.

---

# [1.10.1] - 2026-07-09

## TASK-FIX-002: History Pagination

### Added

* Server-side pagination on the History page (`app/(dashboard)/history/page.tsx`) — 20 generations per page via Supabase `.range()`, Previous/Next controls, applied after all existing filters
* Changing a filter resets to page 1; navigating to an out-of-range page redirects to the last valid page instead of showing an incorrect empty state

No API or database changes.

---

# [1.10.0] - 2026-07-09

## TASK-026: Navigation Refactor

### Changed

* Sidebar reorganized from function-based groups (Generators / Library / Account) to platform-based groups (Workspace / Pinterest / Platforms / Account), per the structure already specified in ARCHITECTURE.md
* New disabled "Platforms" group (WordPress, Facebook, LinkedIn, Medium) — same pattern as the existing disabled Credits/Settings items, preparing the sidebar for TASK-028 and future generators

No route, API, or database changes — sidebar data structure only (`components/layout/sidebar.tsx`).

---

# [1.9.0] - 2026-07-09

## Visual Redesign: AI Purple + Cyan Rebrand

### Changed

* New color palette — violet/purple primary (`#7C3AED`) + cyan brand accent (`#0891B2`) replacing the single blue accent; new `--brand-accent` token added (`app/globals.css`), scoped to AI/analysis-context highlights only (Content Analyzer panel, Pinterest "using content analysis" indicator), distinct from shadcn's structural `--accent`
* New typography pairing — Space Grotesk (headings) + DM Sans (body), replacing Geist; `--font-heading` is now independent of `--font-sans` (previously aliased) and applied globally via a new `h1..h6` base-layer rule
* Sidebar logo mark updated to a two-tone gradient (primary → brand-accent)
* Page background now carries a subtle violet tint; cards/popovers stay achromatic for legibility in dense forms/tables

### Fixed

* Research history: a failed Pinterest-source research result showed a red "Pinterest URL" badge, reading as a miscolored category tag rather than a status indicator. Source-type badge is now always neutral (`outline` variant); a separate "Failed" badge with an icon appears only when `status === 'failed'`.

No schema or API changes — CSS tokens and four component files only.

---

# [1.8.0] - 2026-07-09

## TASK-024: Content Analyzer

### Added

* New `lib/analyzer/` provider-agnostic normalization layer (`analyzeContent()`, SMART AI role) — same philosophy as `lib/research/` and `lib/ai/`
* New `content_analyses` table (migration 009): structured theme/keywords/audience/tone/category/summary per research result, immutable, one row per `research_result_id`
* New `POST /api/analyze` — idempotent (returns the existing analysis on re-click instead of re-running the AI)
* Research page: visible "Analyze" button + result panel after a successful research call, shown before "Continue to Generate"
* `buildAnalysisContext()` (`lib/analyzer/context.ts`) injects the analysis into the AI system prompt, same pattern as Brand Profile — wired into `POST /api/pinterest/generate` via an optional `analysisId`
* Pinterest Generator form shows a visible indicator when generation is using a carried-over analysis
* Closes the `Research → Analyze → Generate` loop: research content now reaches AI generation, deliberately deferred by TASK-023

Fully backward compatible: `analysisId` is optional everywhere — direct-keyword Pinterest generation without Research/Analyze is unchanged.

---

# [1.7.0] - 2026-07-09

## TASK-023: Content Research & Input Sources

### Added

* New `lib/research/` provider-agnostic layer (`runResearch()`, Firecrawl provider) — same philosophy as `lib/ai/`, swappable without touching route code
* New `research_results` table (migration 008): keyword/website/blog/Pinterest URL research, scoped per project, immutable
* New `/research` page: research form, content preview, per-project research history with delete
* `POST /api/research`, `DELETE /api/research/[id]`
* "Continue to Generate" bridges Research → Pinterest Generator (suggested keyword + source URL via query params); `generations.website_url`/`pinterest_url` (previously unused columns) now populated for provenance
* Sidebar: "Research" added to the Generators group

Deliberately out of scope: scraped content is not yet fed into the AI generation prompt (TASK-024, Content Analyzer, will normalize research before generators consume it). Image Upload input source remains deferred to TASK-013.

## Pinterest Generator: manual board selection

### Added

* Optional `board` field on the Pinterest Generator form (combobox — pick an existing board for the selected project or type a new one). When set, it overrides the AI's per-pin board suggestion for the whole batch; when left blank, behavior is unchanged (AI suggests per pin, auto-linked via `findOrCreateBoardIds`).
* `POST /api/pinterest/generate` accepts an optional `board` field.

Follow-up to TASK-025 (Pinterest Boards Management) — no schema change.

## History: Board filter

### Added

* Board filter on the History page, scoped to the selected Project (changing Project clears the Board filter). Filters generations by matching `pins.board_id` for the chosen board, since a board isn't directly linked to a generation.

Follow-up to TASK-025 (Pinterest Boards Management) — no schema change.

---

# [1.6.0] - 2026-07-08

## TASK-025: Pinterest Boards Management

### Added

* `boards` table (migration 007) — real Pinterest board entities, scoped per project
* `pins.board_id` (nullable FK) — links a pin to its board; existing free-text `pins.board` untouched
* Auto-linking at generation time (`findOrCreateBoardIds()`): AI-suggested board names are matched case-insensitively and turned into persistent boards automatically
* `POST /api/boards`, `PATCH /api/boards/[id]`, `DELETE /api/boards/[id]`
* `/boards`, `/boards/new`, `/boards/[id]`, `/boards/[id]/edit` pages — CRUD, per-board pin history, per-board CSV export
* "Boards" nav item in the sidebar Library group

No changes to History, PinTable, or the CSV builder.

---

# [1.5.0] - 2026-07-08

## TASK-022: Brand Profile & AI Context

### Added

* `lib/brand-profile.ts` — `buildBrandProfileContext()`, a Core Platform helper reusable by any future generator
* `projects.description` now flows into Pinterest generation as brand context (tone, audience, style), injected into the FAST role's system prompt — no schema change, no new API fields

### Changed

* `ProjectForm` — "Description" relabeled "Brand Profile" with a helper line explaining it drives AI generation (copy only)

---

# [1.4.0] - 2026-07-08

## TASK-FIX-001: Pinterest Generation Reliability & Error Visibility

### Fixed

* Reasoning-capable FAST models (e.g. `openai/gpt-5-mini`) burned their entire token budget on hidden reasoning, returning empty content and a generic "Generation failed" error. `generateText()` now caps reasoning effort to `minimal` for the FAST role.
* Intermittent "response wasn't valid JSON" failures at higher pin counts: OpenRouter occasionally returns HTTP 200 with `finish_reason: "error"` (an interrupted upstream stream) after emitting partial content. `chatCompletion()` now detects this and retries automatically (up to 3 attempts) instead of trying to parse truncated content.

### Added

* `generations.error_message` column (migration 006) — persists why a generation failed
* `classifyGenerationError()` in `POST /api/pinterest/generate` — maps known AI Engine errors to specific, actionable messages instead of a generic failure string
* `RegenerateGenerationButton` — shown on the results page when a generation produced 0 pins, resubmits the same parameters

No API contract or schema changes beyond the new nullable column.

---

# [1.3.0] - 2026-07-08

## TASK-AI-001: AI Engine Architecture Refactor

### Added

* `lib/ai/` — provider-agnostic AI Engine. Business code now only calls `generateText()`, `analyzeImage()`, `generateImage()` (`lib/ai/engine.ts`)
* Four AI roles (FAST, SMART, VISION, IMAGE) with independent provider/model configuration via `lib/ai/config.ts` and new env vars (`AI_FAST_PROVIDER`/`MODEL`, `AI_SMART_PROVIDER`/`MODEL`, `AI_VISION_PROVIDER`/`MODEL`, `AI_IMAGE_PROVIDER`/`MODEL`)
* `lib/ai/providers/openrouter.ts` — `chatCompletion()` (moved from `lib/openrouter/client.ts`) and new `visionCompletion()` (implemented, not yet wired into any route — ready for TASK-013)
* `lib/ai/providers/openai.ts` — `generateImage()` moved from `lib/openai/image-client.ts`
* `lib/ai/prompt-engine/` — dedicated Prompt Engine that turns the Pinterest Package into the IMAGE prompt (`engine.ts`, `presets.ts`, `templates/photography-styles.ts`), moved from `lib/prompts/image-generator.ts` with byte-identical prompt text
* Reserved (unused) `FAL_API_KEY` / `HIGHFIELD_API_KEY` env vars for future image providers

### Changed

* `POST /api/pinterest/generate` — uses `generateText({role: 'FAST', ...})` instead of calling OpenRouter directly
* `POST /api/pinterest/generate-images` — uses `generateImage()` and `buildImagePrompt()` from the AI Engine instead of calling OpenAI directly
* `lib/prompts/image-generator.ts` — trimmed to `IMAGE_CONFIG` only (batch size, concurrency, output size)

### Removed

* `lib/openrouter/client.ts`, `lib/openai/image-client.ts` — logic moved into `lib/ai/providers/`

No API contract, database schema, prompt content, or product behavior changed.

---

# [1.2.0] - 2026-06-26

## TASK-021: Image Versioning & Regeneration

### Added

* `pin_images` table with versioning support (migration 005)
* Partial unique index: one active image per pin enforced at database level
* GET /api/pinterest/pin-images — list all versions for a pin
* PATCH /api/pinterest/pin-images/[id] — set active image version
* DELETE /api/pinterest/pin-images/[id] — delete a version with safety checks
* ImageVersionsDialog — thumbnail grid for comparing and managing image versions
* Lightbox preview in ImageVersionsDialog — click any thumbnail to view full-size with dark overlay
* Per-pin Regenerate button (hover overlay on image area)
* Per-pin Versions button showing version count (visible when count > 1)
* PinImage and PinImageInsert types in types/database.ts
* lib/queries/pin-images.ts — shared query for fetching pin image versions
* Variation directive in image prompt for version > 1 — regenerated images vary camera angle, composition, lighting, styling, props, and perspective

### Changed

* POST /api/pinterest/generate-images — creates versioned pin_images records instead of overwriting; supports selective regeneration when pinIds provided
* buildImagePrompt() accepts optional version parameter; version > 1 injects explicit variation instructions for meaningfully different results
* Storage path changed from `{user_id}/{pin_id}.png` to `{user_id}/{pin_id}/{version}.png`
* ImageVersionsDialog — active version uses primary badge with checkmark, "Use this" is a primary button, delete action de-emphasized as icon-only ghost button
* GenerateImagesButton — shows "Regenerate (N)" when all selected pins already have images
* PinTable — accepts generationId and imageVersionCounts props for regeneration and version display
* EditorialWorkspace — passes imageVersionCounts to PinTable, computes allPinsHaveImages for button label
* getGenerationWithPins — returns imageVersionCounts alongside generation and pins
* ScheduleDialog — accepts optional selectedPinIds for selective scheduling; button shows "Schedule (N)" when selection active
* PATCH /api/pinterest/schedule — accepts optional pinIds array for selective scheduling and clearing
* EditorialWorkspace — SelectionActionBar now includes Schedule between Regenerate and Export
* DATABASE.md — documented pin_images table, updated storage path pattern
* API.md — documented new pin-images endpoints, updated generate-images documentation

---

# [1.1.0] - 2026-06-26

## TASK-020: Editorial Workflow

### Added

* EditorialSelectionProvider — reusable React Context for item selection state (components/editorial/selection-provider.tsx)
* SelectionToolbar — Select All / Select None / Invert buttons with real-time counter (components/editorial/selection-toolbar.tsx)
* SelectionActionBar — contextual action bar visible only when items are selected (components/editorial/selection-action-bar.tsx)
* EditorialWorkspace — wrapper composing provider + toolbar + action bar + pin grid (components/editorial/editorial-workspace.tsx)
* Per-pin selection checkbox in PinTable with hover-reveal and selected state styling
* Selective image generation: POST /api/pinterest/generate-images now accepts optional pinIds array

### Changed

* PinTable converted to client component with selection context integration
* ExportCsvButton accepts optional selectedPinIds — exports only selected pins when selection exists
* GenerateImagesButton accepts optional selectedPinIds — generates images only for selected pins when selection exists
* Results page refactored to use EditorialWorkspace wrapper — header remains server-rendered, editorial area is client-interactive

---

# [1.0.10] - 2026-06-26

## Documentation: Final Vision Alignment

### Changed

* PROJECT.md: OmniFlow presented as a multi-platform AI content platform; Pinterest identified as first module; WordPress acknowledged as next planned module
* PROJECT.md: problem statement broadened from Pinterest-only to multi-platform content creation
* PROJECT.md: success criteria generalized to platform-agnostic language with Pinterest as first validated module
* PROJECT.md: removed "WordPress Publishing" and "SEO Article Generation" from out-of-scope (now in roadmap)
* PROJECT.md: added Platform Roadmap section referencing TASKS.md
* UI_UX.md: overview rewritten from "Pinterest-First SaaS" to multi-platform content workspace
* UI_UX.md: primary goal broadened to platform-agnostic content generation
* UI_UX.md: future screens split into "Planned (in roadmap)" and "Not MVP" categories
* RULES.md: Rule #25 updated — removed WordPress and SEO Articles from prohibited list; added note about roadmap-gated implementation
* DECISIONS.md: "Pinterest First MVP" decision updated — WordPress and SEO Articles reclassified from "excluded" to "not in MVP, now in roadmap"
* DECISIONS.md: added "Platform Vision Evolution" decision (2026-06-26)

---

# [1.0.9] - 2026-06-26

## Documentation: Architecture Alignment

### Changed

* ARCHITECTURE.md updated to reflect the new long-term product vision
* Product vision: OmniFlow presented as an AI content platform, not a Pinterest generator
* High-level architecture: documented the full pipeline (Research → Analyze → Generate → Review → Images → Schedule → Export) with implemented vs planned status
* Module architecture: added platform-based module diagram (Core, Pinterest, WordPress, Facebook, LinkedIn, Medium)
* Pinterest module: separated current state from roadmap evolution
* Multi-generator strategy: documented Pinterest as validation module, WordPress as first reuse
* Navigation: documented planned platform-based sidebar structure
* Scalability target: added "Múltiples plataformas de contenido"
* Out of scope: removed "SEO Articles" (now covered by TASK-028 WordPress Generator)

### Added

* Product Vision section
* High-Level Architecture pipeline with implementation status
* Module Architecture diagram
* Brand Profile section (planned — TASK-022)
* Research Layer section (planned — TASK-023)
* Content Analyzer section (planned — TASK-024)
* Editorial Workflow section (planned — TASK-020)
* Pinterest Module section with current state and roadmap
* Multi-Generator Strategy section
* Navigation section (planned — TASK-026)
* Future Evolution section with phased progression

---

# [1.0.8] - 2026-06-26

## Documentation: Technical Debt Separation

### Added

* docs/TECHNICAL_DEBT.md — dedicated document for infrastructure improvements and internal refactoring
* TASKS.md: technical debt reference section pointing to TECHNICAL_DEBT.md
* ARCHITECTURE.md: technical debt reference section pointing to TECHNICAL_DEBT.md

### Changed

* ARCHITECTURE.md: updated folder structure — removed deleted files (openrouter/image-client.ts, action-bar, metric-card, relative-date), added new utils (format-date.ts, status.ts)

---

# [1.0.7] - 2026-06-26

## TASK-019: Frontend Production Readiness

### Added

* loading.tsx for dashboard (uses DashboardSkeleton), history (uses TableSkeleton), projects, pinterest, and results pages
* error.tsx boundary for dashboard route group with retry button
* lib/utils/format-date.ts — shared timeAgo() utility
* lib/utils/status.ts — shared statusToVariant() utility
* aria-label on icon-only DropdownMenuTriggers: history-actions, project-actions, user-menu
* aria-label on back navigation link in results page
* next.config.ts: remotePatterns for Supabase Storage (*.supabase.co/storage/**)
* Image sizes attribute on PinTable for responsive image optimization

### Removed

* LogoutButton component (dead code — replaced by UserMenu in TASK-016)
* lib/openrouter/image-client.ts (dead code — replaced by lib/openai/image-client.ts in TASK-014)
* MetricCard component (unused — dashboard uses inline metric grid)
* ActionBar component (unused — trivial flex wrapper)
* RelativeDate component (unused — timeAgo() utility covers the use case without requiring a client component)
* unoptimized flag from PinTable Image component (no longer needed with remotePatterns)

### Changed

* Eliminated 4 duplicate timeAgo() implementations (dashboard, history-table, results, projects)
* Eliminated 2 duplicate statusToVariant() implementations (dashboard, history-table)

---

# [1.0.6] - 2026-06-26

## TASK-017A: Roadmap Reorganization

### Changed

* Roadmap reorganizado según la nueva visión estratégica del producto
* Product Vision added: Research → Analyze → Generate → Review → Images → Schedule → Export
* Pinterest established as first module implementing the complete flow; WordPress reuses the architecture
* Roadmap organized in 4 phases after Security Hardening and Visual Refinement
* FASE 1 — Pinterest Professional Workflow: TASK-020 Editorial Workflow, TASK-021 Image Versioning & Regeneration, TASK-022 Brand Profile & AI Context
* FASE 2 — Intelligent Content Research: TASK-023 Content Research & Input Sources, TASK-024 Content Analyzer, TASK-025 Pinterest Boards Management
* FASE 3 — Platform Architecture: TASK-026 Navigation Refactor, TASK-027 Multi-Generator Architecture
* FASE 4 — WordPress: TASK-028 WordPress Generator
* TASK-011 Credits and TASK-012 Stripe repositioned after platform phases
* TASK-013 Image Analysis remains DEFERRED
* Removed "SEO Articles" from OUT OF MVP (now covered by TASK-028)

---

# [1.0.5] - 2026-06-26

## TASK-IMG-001: Base Image Generation Prompt Enhancement

### Changed

* Image prompt system upgraded from pinterest-image-v1 to pinterest-image-v2
* LLM instructions now require hyper-specific scene descriptions: concrete subjects, materials, textures, named colors, camera angles, 3-5 supporting details per scene — replaces vague "detailed prompt for vertical image"
* Image prompts are now always generated in English regardless of content language for optimal gpt-image-1 results
* System prompt upgraded: LLM now acts as "visual director" in addition to SEO content creator

### Added

* buildImagePrompt() function in lib/prompts/image-generator.ts — wraps LLM-generated scene descriptions with professional photography directives before sending to gpt-image-1
* inferPhotographyStyle() — niche-aware photography style mapping based on board name (18 categories + generic fallback)
* Photography directives: DSLR full-frame, shallow depth of field, bokeh, natural diffused lighting, rule of thirds, vertical 2:3 filling entire frame
* Quality directives: ultra high resolution, visible textures, rich natural colors, aspirational mood
* Strict negative constraints: no text, typography, watermarks, logos, overlays, frames, borders, collages, or graphic elements
* Niche categories: food, interior, travel, fashion, garden, beauty, fitness, DIY, family, business, wedding, pet, art, education, tech, holiday, organization

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
