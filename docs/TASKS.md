# TASKS.md

# OmniFlow Development Tasks

---

# ACTIVE TASK

TASK-FIX-041 (Pinterest Board Section) is implemented locally, not yet validated against a live Supabase/OpenRouter environment: an optional `Board section (optional)` text field in `/pinterest`, placed immediately after Board, empty by default, requiring Board to be filled (`Select a board before entering a board section.` otherwise). Migration 032 adds nullable `pins.board_section text` (additive only, no backfill, no DB CHECK — validated at the Zod layer, same convention as migrations 018/025/026/027). `boardSection` is trimmed, max 100 chars, empty string becomes `null`, rejects `/` (Pinterest's own Board/Section separator), `\`, line breaks and control characters. The generate route persists the same `boardSection` on every pin of the batch, same convention as `board` (never AI-suggested per pin, never touching the real Board name). CSV export (`lib/csv/pinterest.ts`) writes `Board/Section` (or `Board` alone) into the existing `Pinterest board` column — never a separate `Board_Section` column. No Board/Section is created in Supabase or sent to Pinterest by OmniFlow — Pinterest creates it at CSV import time. TypeScript, ESLint, the offline renderer suite (216/216) and the production build pass. See CHANGELOG.md "Add: optional Board Section for Pinterest CSV export". 2026-09-23 continuation: the board_section value is now surfaced (display-only) in the Pin table's board badge (`Board / Section`) and as filter chips (All / each section / No section) above the pin grid on a Board's detail page (`components/boards/board-pin-grid.tsx`) — no new query, no edit capability (see TASK-043 for that). See CHANGELOG.md "Add: Board Section display in the Pin table and Board detail page". Do not commit automatically.

TASK-041 Phase 2 (Pinterest AI Integrated — generation modes in `/pinterest`) is implemented, validated and committed locally (not pushed): `AI Integrated` (default, recommended), `Photo Only` and `Legacy Composite` (unchanged SVG/Sharp renderer, kept for compatibility and history). The model is never user-selectable — it stays server-owned via `AI_IMAGE_PROVIDER` / `AI_IMAGE_MODEL` / `AI_IMAGE_MODEL_TEXT`. No route, table, migration, provider or dependency was added; the resolved contract lives in `pins.image_analysis._pinterestAiIntegrated`. The 2026-09-21 continuation clarified mode labels in Pin details/review and restricted layout diagnostics to legacy Pins. TypeScript, ESLint, the offline renderer suite (178/178) and the production build pass; no paid image call was made. Correction 2026-09-21: `AI Integrated` no longer accepts a reference image (it was never sent to the image model, only analyzed by Vision) — the form shows a "coming soon" note and the server rejects it before Vision; `Photo Only` stays reference-free; `Legacy Composite` keeps the TASK-013 mechanism. TASK-042 remains the full implementation. See `docs/tasks/TASK-041-PINTEREST-AI-INTEGRATED-PHASE-2.md`. Do not commit automatically.

TASK-041 (Pinterest AI Integrated — Phases 1/1.1/1.2 model benchmark, safe preflight and limited real run) is implemented locally. Phase 1.2 completed the explicitly authorized 8-call benchmark: two fixtures × four exact models, 8/8 images generated, zero references, zero retries, provider-returned total cost $0.5239775, with originals/metadata/summary and a human-review HTML comparison stored under the Git-ignored `.benchmark-output/`. It does not change `/pinterest`, production routes, database, credits, or the SVG/Sharp legacy renderer. See `docs/tasks/TASK-041-PINTEREST-AI-INTEGRATED-PHASE-1.md`. Do not run another `--execute` without new explicit user authorization and do not commit automatically.

TASK-FIX-040 (WordPress Generator reorg + visual finish + surface hierarchy pass — `/wordpress/blog-post`, a first targeted UX/UI pass, not part of the Command Center Phase 2 phase numbering below) is implemented and committed locally (not pushed): Project Context / Article Source / Article Settings / Advanced Options (collapsed by default) / Generation Summary, each now a real card (`rounded-2xl border border-border bg-card shadow-sm`) with a numbered step, a violet-tinted icon and header, a visible title and description, sitting inside a `bg-muted/60` workspace panel — replacing both the previous always-visible layout and the single giant `bg-card` wrapper that made every section blend together. No field removed, no default value, validation rule, Zod schema, API payload, prompt, rate limit, generation, saving, or publishing change. The WordPress connection status and any Content Stream(s) matching the selected category are surfaced read-only (informational only, derived from the existing `content_streams.wordpress_category_id` column — no new relation, no article↔Content Stream link created). TypeScript, ESLint, the offline test suite (138/138), and the production build all pass; the gated browser tests (10) correctly skip without `PLAYWRIGHT_STORAGE_STATE` (not bypassed). See docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md §14d for the cross-reference note (this is a separate task, not a Phase 2 sub-phase — "Phase 2b" already names something else there: persistent manual tasks).

TASK-FIX-039 (Command Center Phase 2) — design doc's 8 open decisions are resolved (founder, 2026-09-16). **Phase 2a** (migration 030: `content_streams` + `content_stream_boards`, RLS hardened via migration 031 — confirmed applied live) and **Phase 2a.1** (a small Content Streams management UI inside each project's own page: create/edit/archive, `app/api/content-streams/*` routes, the "one board per active stream" rule enforced both client- and server-side) are implemented. No `tasks`/`task_occurrences`/`pinterest_accounts` table, no automatic recommendation, no Next Best Action, no Pinterest/WordPress logic change — Phases 2b–2e remain design-only. TypeScript, ESLint, the offline test suite (129/129), and the production build all pass; the new gated browser tests for the Phase 2a.1 UI correctly skip without `PLAYWRIGHT_STORAGE_STATE` (not bypassed). Do not commit automatically. See docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md (§14/§14a/§14b/§14c) for the full record.

TASK-FIX-038 (Command Center MVP, now including Phase 1.1 — UI Consolidation and a Phase 1.1 Hotfix: real KPI links to /history, /wordpress/history and /projects; a fixed always-false condition that hid the "Add priority" button; "Next action" restructured into an always-visible two-line block; and the fabricated "POD" Active Project card removed) is implemented locally and awaiting manual visual validation (no authenticated browser session in this agent's environment). Do not commit automatically. See docs/tasks/TASK-COMMAND-CENTER-MVP.md and "Completed Tasks" below for full scope.

TASK-FIX-037 (WordPress "Refonte Phase 4" — External Linking block, manual URLs only: no automatic Firecrawl search yet, see Backlog note below) is implemented locally and awaiting manual validation (a real generation against a live Supabase/OpenRouter environment — no live credentials in this agent's environment). Do not commit automatically. See "Completed Tasks" below for full scope.

TASK-FIX-036 (WordPress "Refonte Phase 3" — SEO Keywords block: tag input + "Générer avec l'IA" suggestion on "1-Click Blog Post") is implemented locally and awaiting manual validation (a real generation against a live Supabase/OpenRouter environment — no live credentials in this agent's environment). Do not commit automatically. See "Completed Tasks" below for full scope; see DECISIONS.md 2026-09-13 (5) for the storage/tag-input/framing rationale.

Phase 9 (Pinterest Creative Diagnostics & Batch Review) is implemented locally and awaiting validation. Do not commit automatically. It adds compact creative indicators, local filters, a 5/10-Pin review dialog, descriptive batch diversity diagnostics and a direct hand-off to the existing Change layout flow. Quality metadata is carried in the existing `image_analysis` JSON text value; no schema, provider, credit, Vision API or marketing-scoring change is included.

TASK-FIX-035 (WordPress "Refonte Phase 2" — Structure block: Introductory Hook Brief + 9 three-state toggles on "1-Click Blog Post") is implemented locally and awaiting manual validation (a real generation against a live Supabase/OpenRouter environment — no live credentials in this agent's environment). Do not commit automatically. See "Completed Tasks" below for full scope; see DECISIONS.md 2026-09-13 (3)/(4) for the schema-convention and absence-guarantee rationale.

TASK-FIX-034 (WordPress "Refonte Phase 1" — homepage grid of generator cards + Core Settings block on "1-Click Blog Post") completed, committed (`dddb124`), and pushed to `main` 2026-09-13. See "Completed Tasks" below for full scope; see DECISIONS.md 2026-09-13 (2) for the route-restructuring rationale.

Phase 8 (Pinterest Live Recomposition Preview) was committed and pushed as `aec597f`.

Implemented scope: read-only in-memory preview route; 300 ms debounce; stale request cancellation; live rendered preview; visible `PASS`/`WARN`/`RECOMPOSE`/`FAIL` feedback and issue reasons; and `Apply` gating to the current valid preview. No DB schema, provider, credit, Strategy Engine or WordPress change is part of Phase 8.

Phase 7 (Pinterest Manual Recomposition) was committed as `eea6bd5`. Its source-companion and additive versioning behavior remain unchanged.

Phase 6 was manually validated and committed as `f3ad8f8`. Its Quality Gate remains unchanged and is reused by Phase 7.

Phase 5 was manually validated and committed as `e49576f`. Its deterministic scoring, batch variation and existing-column persistence remain unchanged.

TASK-FIX-028 / Phase 4 (Pinterest Strategy Engine) completed and committed as `1763a0f`. Its five-angle validation, grounded claims, title diversity, and prompt v9 remain unchanged.

TASK-FIX-030 (Remove silent Gemini fallback on `AI_IMAGE_MODEL_TEXT`) completed 2026-09-12 — see DECISIONS.md and CHANGELOG.md. `resolveImageModel('text-overlay')` now requires `AI_IMAGE_MODEL_TEXT` explicitly and throws if unset/empty; no more hardcoded `google/gemini-3.1-flash-image` fallback. `photo` routing unchanged.

TASK-FIX-027 / Phase 3 (Pinterest Templates v2) completed and manually validated 2026-09-12. Phase 4 must not begin automatically.

Implemented scope: role-aware Headline/CTA variants; `editorial`, `minimal`, `split`, and `magazine` families; eight static SVG assets; controlled Inter typography; Phase 2 contrast/safe-area reuse; deterministic visual contact sheet; and five new renderer tests (27/27 total). No Strategy Engine, angle scoring, template auto-selector, provider, route contract, schema, credits, storage, history, CSV, or old-image mutation.

TASK-FIX-026 / Phase 2 (Pinterest Local Contrast + Simple Safe Areas) completed, manually validated, committed, and pushed 2026-09-12 as `9b5f98e`. Its history remains unchanged.

Implemented scope: Sharp-only local luminance/contrast/variance/edge-density analysis; 5% horizontal and 4% vertical safe areas; top/bottom headline candidates with the lower candidate reserved above the fixed CTA; automatic `#FFFFFF`/`#141414`; bounded local overlay only when both raw candidates miss 4.5:1; explicit neutral `clean-band` and `BannerCompositionError` fallbacks; eight controlled fixtures; 22/22 offline renderer tests; visual comparisons; and an isolated +58.5 ms benchmark. No semantic vision, schema, provider, credits, route-contract, storage, history, CSV, or old-image mutation.

TASK-FIX-025 / Phase 1 (Pinterest Rendering Reliability — measured typography, template text boxes, preview fidelity, and offline renderer tests) completed and manually validated 2026-09-12. Phase 2 was subsequently completed and manually validated 2026-09-12.

All tasks through TASK-026 are completed. TASK-023 and TASK-024 also completed out of order (TASK-023 — Firecrawl was set up first, making it the natural next step; TASK-024 completed right after, closing the Research → Analyze → Generate loop). TASK-026 (Navigation Refactor) completed next, ahead of TASK-027, since it only touched the sidebar's data structure with zero route changes. TASK-029 (Rate Limit Bypass Admin Panel) completed 2026-07-14. TASK-027 (Multi-Generator Architecture) DEFERRED 2026-07-15 — see DECISIONS.md — TASK-028 built directly on top of the existing generic pieces instead. TASK-028 Option 1 (Keyword → SEO Article) completed 2026-07-15; Options 2/3 remain PLANNED. TASK-030 (Admin Dashboard) added to roadmap as PLANNED. TASK-031 (Dashboard Multi-Platform Restructure) completed 2026-07-20. TASK-032 (WordPress Categories) completed 2026-07-26. TASK-033 (Projects: truncation fix, Niche, Default Language) completed 2026-07-26. TASK-034 (Niche Visual Conventions + Text Overlay Routing) completed 2026-07-27. TASK-035 (WordPress REST API Publishing) completed 2026-07-28. TASK-FIX-006 (Import WordPress categories instead of requiring a manual one first) completed 2026-08-02. TASK-FIX-007 (WordPress send status clarity + post-hoc category assignment) completed 2026-08-02. TASK-FIX-008 (Remove duplicate H1 on WordPress-published articles) completed 2026-08-02. TASK-FIX-009 (Remove the 3-internal-image cap on the pins→article flow) completed 2026-08-02. TASK-FIX-010 (Scope the WordPress History Category filter to the selected Project) completed 2026-08-02. TASK-FIX-011 (Fix Project/Language overlap on the WordPress Generate form) completed 2026-08-02. TASK-036 (Project Detail Page + clickable Project cards + expandable Brand Profile) completed 2026-08-02. TASK-013 (Image Analysis — reference image style extraction) completed 2026-08-02, out of DEFERRED. TASK-037 (WordPress Generator Option 3: External Source → Original SEO Article — link or pasted text used as research context only, never rewritten/paraphrased closely) completed 2026-08-12, reframed from its original "rewrite a blog post" description before implementation (see DECISIONS.md). TASK-FIX-012 (User avatar dropdown menu — Settings link, Credits display, Sign Out) completed 2026-08-28. TASK-FIX-013 (Collapsible Pinterest/WordPress sidebar groups) completed 2026-08-28. TASK-FIX-014 ("Save the Pin" banner on every generated pin image) completed 2026-08-28. TASK-FIX-015 (Lifetime trial usage cap per account) completed 2026-08-28. TASK-FIX-016 (Dark mode — ThemeProvider wiring, theme-aware toasts, Light/Dark/System toggle in the user menu) completed 2026-08-29. TASK-FIX-017 (Pinterest ICPC framework for title/description, pinterest-pins-v5 → v6) completed 2026-09-02, validated with a real gpt-5-mini generation (10/10 pins, no spoiler, 5 angles represented) — see Completed Tasks. TASK-FIX-018 (per-image AI model traceability, pin_images.image_model) completed 2026-09-02. TASK-FIX-019 (deterministic code-composited "Save the Pin" CTA banner via sharp, replacing the AI-prompt version measured at 1/10 success) completed 2026-09-02 — see Completed Tasks. TASK-FIX-020 (guardrail against illegible incidental text on decor props — notebooks, books, labels — pinterest-pins-v7) completed 2026-09-02. TASK-FIX-021 (automatic accent-color extraction + deterministic top title banner, generalizing the CTA compositing) completed 2026-09-02 — see Completed Tasks. TASK-FIX-022 (fixed two root-cause bugs in extractAccentColor(): near-black saturation artifact winning over representative colors, and resize-blur erasing small saturated regions) completed 2026-09-02 — see Completed Tasks. TASK-FIX-023 (banner height tightened to actual text size + top banner margin reduced to near-zero, fixing subject overlap) completed 2026-09-02 — see Completed Tasks. TASK-FIX-024 (multi-template banner compositing — static SVG shapes, AI-chosen per banner, clamped server-side by niche) implemented 2026-09-12, not yet validated on a real batch by the user — see Completed Tasks.

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

#### Status: Options 1 and 4 completed (2026-07-15, 2026-07-17) — Option 3 completed as TASK-037 (2026-08-12) — Option 2 PLANNED

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

#### Option 3 / TASK-037 — External Source → Original SEO Article (DONE 2026-08-12)

Tracked as its own numbered task, TASK-037, same convention as TASK-032/TASK-035/TASK-036 (WordPress-related work that gets its own entry in Completed Tasks rather than staying folded only into this Option list) — full write-up under "[TASK-037]" in Completed Tasks below.

```txt
Input: an external source (a URL to scrape, or text pasted directly) used ONLY as
research context — the topics, angles, and key points it covers, never as text to
rewrite, optimize, or paraphrase closely. The generated article must be structurally
and formally independent of the source (its own outline, its own wording, its own
structure) — same guarantee as Option 1/4, just seeded by external research instead
of a bare keyword or selected pins.
Reframed 2026-08-12 (see DECISIONS.md) from the original "rewrite or SEO-optimize
the blog post" framing — that framing risked unauthorized reproduction of the
source and a near-duplicate-content SEO penalty. Same rationale as the Image
Analysis anti-copyright guardrail (TASK-013, DECISIONS.md 2026-08-02 (4)).
Could reuse Research (TASK-023) source_type: 'blog'/'website' fetching (the same
Firecrawl scrape provider), but not the Content Analyzer (TASK-024) — that
analyzer's output (theme/audience/tone/category/summary) is a voice-alignment
classifier, not a topics/angles extractor, and carries no anti-reproduction
instruction. A dedicated summary prompt is used instead.
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

#### [TASK-FIX-034] WordPress Homepage + Core Settings (Refonte Phase 1)

##### Status: Completed, committed (`dddb124`) and pushed to `main` 2026-09-13

Nueva página de inicio en `/wordpress` (grid de 4 cards de generadores — solo "1-Click Blog Post" activo, "Bulk Article Generation"/"Super Page"/"Rewriter Tool" deshabilitados, mismo tratamiento visual que las entradas Facebook/LinkedIn/Medium del sidebar). El formulario Option 1/Option 3 existente se movió sin cambios a `/wordpress/blog-post` (ver DECISIONS.md 2026-09-13 (2)). Option 1 gana un bloque "Core Settings" opcional: Article Type, Article Size, Tone of Voice, Point of View, Target Country — los cinco por defecto en "None", reproduciendo exactamente el comportamiento previo cuando no se tocan. Migration 026 añade las 5 columnas nullable a `wordpress_generations`. Sin cambios en Option 3, Option 4, TASK-035 (publishing), ni en el rol IMAGE.

#### [TASK-FIX-035] WordPress Structure Block (Refonte Phase 2)

##### Status: Implemented 2026-09-13, awaiting manual validation

Segundo bloque opcional en "1-Click Blog Post" (modo Keyword únicamente), debajo de Core Settings: un Introductory Hook Brief (textarea + 5 presets) y 9 toggles de 3 estados (Conclusion, Tables, H3, Lists, Italics, Quotes, Key Takeaways, FAQ, Bold), todos por defecto en "Non défini" — comportamiento previo inalterado si no se tocan. Migration 027 añade `hook_brief` (text) + 9 columnas booleanas `include_*` a `wordpress_generations`, misma convención de columnas planas que Phase 1 (ver DECISIONS.md 2026-09-13 (3) para la comparación con `settings jsonb` consolidado). Key Takeaways/FAQ="Non" es una garantía dura vía schema Zod (array forzado a longitud 0); Bold/Italics/Quotes/H3/Lists="Non" son prohibiciones explícitas a nivel de prompt, no un sanitizer determinista de código (ver DECISIONS.md 2026-09-13 (4)). Sin cambios en Option 3, Option 4, TASK-035 (publishing), ni en el rol IMAGE.

#### [TASK-FIX-036] WordPress SEO Keywords Block (Refonte Phase 3)

##### Status: Implemented 2026-09-13, awaiting manual validation

Tercer bloque opcional en "1-Click Blog Post" (modo Keyword únicamente), debajo de Structure: un tag input "Keywords to include in the text" (hasta 15 mots-clés, 60 caracteres cada uno — ningún componente tag/chip reutilizable existía en el proyecto, ver DECISIONS.md 2026-09-13 (5)) y un botón "Générer avec l'IA" que sugiere mots-clés vía `POST /api/wordpress/suggest-keywords` (rol FAST, presentado honestamente como brainstorm IA, no como un outil NLP/SERP real). Migration 028 añade `seo_keywords` (text nullable, comma-separated, misma convención que `pins.keywords` — no un array Postgres) a `wordpress_generations`. Lista vacía = comportamiento previo inalterado; lista no vacía = instruction en `wordpress-article-prompt.ts` para tisser chaque mot-clé naturellement au moins une fois. Sin cambios en Core Settings, Structure, Option 3, Option 4, TASK-035 (publishing), ni en el rol IMAGE.

##### Manual Validation Pending

Not tested — no Supabase/OpenRouter access in the development environment. Left to the user:

* Générer sans toucher SEO Keywords → résultat identique à avant Phase 3
* Ajouter 3-4 mots-clés manuels → vérifier leur présence dans le texte généré
* Tester le bouton "Générer avec l'IA" → vérifier que les suggestions sont cohérentes avec le Main Keyword

#### [TASK-FIX-037] WordPress External Linking Block — Manual URLs (Refonte Phase 4)

##### Status: Implemented 2026-09-13, awaiting manual validation

Cuarto bloque opcional en "1-Click Blog Post" (modo Keyword únicamente), debajo de SEO Keywords: un campo de texto simple "Manual URLs" (comma-separated, validación de formato URL por entrada, hasta 10 URLs). Migration 029 añade `manual_external_urls` (text nullable, comma-separated, misma convención que `seo_keywords`) a `wordpress_generations`. Puramente aditivo: el mecanismo automático existente `addExternalLink()` (`lib/ai/services/external-link.ts`, búsqueda web vía OpenRouter, 0-1 enlace, incondicional en las Options 1/3/4) permanece completamente intocado y sigue ejecutándose exactamente igual, sin ninguna condición ligada a este nuevo campo. Lista vacía = comportamiento previo inalterado (incluido el comportamiento habitual de `addExternalLink()`); lista no vacía = instruction adicional en `wordpress-article-prompt.ts` para insertar cada URL como lien Markdown allí donde sea contextualmente relevante. Sin cambios en Core Settings, Structure, SEO Keywords, Option 3, Option 4, TASK-035 (publishing), ni en el rol IMAGE.

##### Manual Validation Pending

Not tested — no Supabase/OpenRouter access in the development environment. Left to the user:

* Générer sans toucher Manual URLs → résultat identique à avant Phase 4, y compris le comportement habituel d'`addExternalLink()`
* Ajouter 2-3 URLs séparées par virgules → confirmer leur présence en tant que liens dans le texte généré, en plus du lien habituel d'`addExternalLink()`

##### Backlog (no activo)

Future: evaluate exposing AI model choice (Claude/DeepSeek/GPT/...) to users once the SaaS is more mature — currently role-based only (Rule #11, Roles Not Providers). Not an active task; revisit once the product has more traction.

Future: Automatic external linking via Firecrawl `/search` (candidate URLs found from the Main Keyword, not just user-typed ones) — coexistence with the existing `addExternalLink()` (OpenRouter web_search) to be decided when this is actually built, not guessed now. Not an active task.

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

TASK-013 completed — see Completed Tasks below.

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

## [TASK-042] Pinterest AI Integrated — One Reference Image per Generation

### Status: PLANNED (documented follow-up of TASK-041 Phase 2 — not started, not the active task)

### Goal

Let the user optionally attach a single reference image to an `AI Integrated` Pinterest generation and send it to the server-configured image model as a visual reference (style, composition or subject — never a copy of the image or its text). No reference means the current `AI Integrated` behavior: same prompt, same provider payload, no Vision call, no additional cost.

### Scope

```txt
One reference per generation; AI Integrated only (never Photo Only / Legacy Composite)
Model/provider stay server-owned (AI_IMAGE_PROVIDER / AI_IMAGE_MODEL / AI_IMAGE_MODEL_TEXT) — no public selector
Strict server validation: real file type, size, dimensions, ownership; metadata stripped
No key, durable/signed URL, path or private content in any API response, log or error
Pin detail shows that a reference was used, without exposing its content
No reference library, no shared folder, no migration in the initial task
Legacy renderer (SVG/Sharp) and historical generations untouched
```

### Depends On

TASK-041 Phase 2. Builds on, without replacing, the existing TASK-013 reference upload (Vision style analysis).

### Open Decisions

Storage (temporary vs persistent), retention, weight limit, accepted formats, dimension bounds, behavior when the configured model does not support references, interaction with the existing Vision analysis, and others — see `docs/tasks/TASK-042-PINTEREST-AI-REFERENCE-PER-GENERATION.md`.

### Success Criteria

An AI Integrated generation with one valid reference sends it to the provider and follows its guidance without copying it; without a reference nothing changes; legacy paths and history are unchanged; no sensitive data is exposed; tests, TypeScript, ESLint and build pass; documentation and the in-app Guide are updated. Full detail: `docs/tasks/TASK-042-PINTEREST-AI-REFERENCE-PER-GENERATION.md`.

---

## [TASK-043] Pinterest Board Section — Edit On Existing Pins

### Status: PLANNED (documented follow-up of TASK-FIX-041 — not started, not the active task)

### Goal

Let the user add or change `board_section` on a Pin that already exists (generated before or after TASK-FIX-041), instead of only being able to set it at generation time. Requested 2026-09-23 after TASK-FIX-041 shipped, since old Pins have no way to get a section applied retroactively.

### Scope

```txt
Small inline edit control (input + Save) in the Pin detail view (components/pinterest/pin-detail-dialog.tsx)
New PATCH /api/pinterest/pins/[id] route — updates board_section only, never board
Reuses the exact same boardSection Zod validation as generation (trim, max 100,
forbidden "/", "\", line breaks/control chars, empty string -> null)
Ownership check via the pin's generation_id -> generations.user_id chain
Since pins.board is NOT NULL, every existing pin already has a board — no
"section without board" case to handle for this edit path
board / board_id remain non-editable, unchanged — same as today
CSV export, database schema (beyond the already-shipped board_section column),
image generation, providers and scheduling untouched
```

### Depends On

TASK-FIX-041 (Pinterest Board Section — CHANGELOG.md "Add: optional Board Section for Pinterest CSV export"), which added the `board_section` column and its validation rules.

### Success Criteria

A user can open an existing Pin's detail, add or edit its Board section, and save it; the CSV export immediately reflects `Board/Section` for that Pin; invalid input (forbidden characters, over max length) is rejected with the same message as at generation time; `board`/`board_id` are never modified by this path; tests, TypeScript, ESLint and build pass; `docs/API.md`, `docs/UI_UX.md`, `docs/DATABASE.md` (if needed) and the in-app Guide are updated.

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

## [TASK-041] Pinterest AI Integrated — Phase 2 Generation Modes — 2026-09-20

* `/pinterest` now offers a Generation mode: `AI Integrated` (default, Recommended), `Photo Only`, and `Legacy Composite` (badged Legacy). AI Integrated exposes Creative format, Pinterest strategy (+ manual Angle), Headline / Subtitle / CTA text modes (Generate with AI / Use exact text / None where allowed), Maximum text lines, per-field importance, and a read-only Effective language inherited from the project.
* Strict server contract: `generatePinsSchema` is a discriminated union on `generationMode` (missing value = `legacy-composite`, so old payloads are unchanged). No client field can select a provider or model.
* AI Integrated pins persist `visual_format = ai-integrated` and the resolved final text under `image_analysis._pinterestAiIntegrated`; the image prompt quotes the approved strings and bans any other text, logo or watermark. Sharp re-encodes the returned file to strip embedded metadata (EXIF, XMP, C2PA — TASK-FIX-033) and validates it (readable format, 2:3 ±0.01, non-empty); no SVG/Sharp text or banner is ever drawn on the new paths.
* `Photo Only` persists `visual_format = photo-only` (no text, no banner). Legacy `photo` / `text-overlay` branches, recomposition gating and Quality Gate are untouched.
* No migration (`pins.visual_format` is unconstrained text), no new route/table/provider/package, no `.env.local` change. Guide, API, DATABASE, UI_UX, PROJECT and TESTING documentation updated.
* Validation: tsc, ESLint, renderer 178/178 (29 AI Integrated offline cases; provider calls use a stubbed `fetch`), production build. No paid image request.
* Correction 2026-09-21: the TASK-013 reference upload is removed from `AI Integrated` (replaced by a "coming soon" note) and rejected server-side for `ai-integrated` / `photo-only` before any Vision call; `Legacy Composite` unchanged. See the addendum in the Phase 2 task file.
* Phase 2 continuation (2026-09-21): Pin cards/details/review display clear mode labels; AI Integrated and Photo Only never display unavailable legacy templates or Quality Gate states. Batch Review layout metrics apply only to Legacy Composite Pins. Historical Pins without `_pinterestAiIntegrated` remain readable.
* Form reorganization 2026-09-21: `/pinterest` is grouped into Project context → Board → Keyword → Generation mode → AI Integrated settings with one help sentence per section (presentation only; no field, default, validation, payload or route change). See `docs/UI_UX.md`.
* Production fix: `POST /api/pinterest/generate` no longer `JSON.parse`s the planning response directly. A truncated plan (`Unterminated string in JSON at position 11038` for 7 German AI Integrated pins, cut by the output-token ceiling) is now rejected by `parsePinterestGenerationPlan()` with HTTP 422 `invalid_pin_plan` before any pin or image work; AI Integrated gets a larger output budget for `integratedText`. See `docs/CHANGELOG.md`.
* Metadata fix: AI Integrated and Photo Only images no longer keep the provider's embedded metadata (the C2PA `caBX` manifest was present in the configured model's output): `sanitizeFinalPinterestImage()` re-encodes them before storage (lossless for PNG), and the unused `preserveOriginal` adapter option was removed. Images already stored are unchanged. See the Phase 2 task file addendum.
* Full record: `docs/tasks/TASK-041-PINTEREST-AI-INTEGRATED-PHASE-2.md`.

## [TASK-041] Pinterest AI Integrated — Phase 1/1.1 Model Benchmark + Safe Preflight — 2026-09-20

* Added `scripts/pinterest-ai-benchmark.ts`, a standalone Node 22 TypeScript runner with strict dry-run default and explicit `--execute` opt-in.
* Candidate models come only from the active image environment configuration or exact repeated `--model provider:model-id` arguments; duplicate ids are removed and no aliases are invented.
* Execute mode performs OpenRouter model discovery before generation, checks advertised 2:3/reference/quality capabilities, sends `quality=high` when supported and never sends `low`.
* Added the four requested Crochet/Home Decor fixtures with exact EN/DE typography and no invented CTA for fixtures that do not define one.
* Provider images are saved unchanged under Git-ignored `.benchmark-output/`; Sharp only records technical metadata and never composes text.
* Added nullable human evaluation fields and PASS/NEEDS_REVIEW/FAIL calculation. A generated image starts at NEEDS_REVIEW; technical ratio inspection alone can never mark it PASS.
* Added offline coverage for CLI parsing, fixtures, configured-model deduplication, dry-run network isolation and evaluation calculation.
* No database, migration, credit, UI, production route, prompt-engine or legacy renderer change. No paid execution, commit or push.
* Phase 1.1 adds a discovery-only `--preflight`, fixture-scoped references, four-model shortlist, endpoint capability validation, per-model parameter resolution and future-cost estimation. All four exact slugs passed the live discovery preflight on 2026-09-20; no image endpoint was called.
* Phase 1.2 adds explicit fixture filtering, a required hard `--max-calls` ceiling, per-result manual-review criteria, `benchmark-summary.json`, and a local comparison page. The authorized run attempted exactly 8 calls, generated 8 images, recorded 0 failures and returned a total provider cost of $0.5239775. No reference or retry was used.
* Renumbered from the provisional TASK-038 to TASK-041 because TASK-FIX-038, TASK-FIX-039 and TASK-FIX-040 already occupy those numeric suffixes; 041 is the first suffix free across both task namespaces.
* Full implementation record: `docs/tasks/TASK-041-PINTEREST-AI-INTEGRATED-PHASE-1.md`.

## [TASK-FIX-040] WordPress Generator Reorg — 2026-09-16

* First targeted UX/UI pass on `/wordpress/blog-post` (`app/(dashboard)/wordpress/blog-post/page.tsx`, `components/wordpress/article-form.tsx`) — pure reorg + read-only additions, zero change to defaults, validation, prompts, Zod schemas, API payloads, rate limiting, generation, saving, or publishing. Not a Command Center Phase 2 sub-phase (that document's own "Phase 2b" already names something else — persistent manual tasks); cross-referenced from `docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md` §14d only because it surfaces Content Streams read-only
* New visual order: Project Context (Project, WordPress connection status, Language, Category, matching Content Stream(s)) → Article Source (Keyword/External Source, unchanged) → Article Settings (Article Type/Size/Tone of Voice, always visible) → Advanced Options (Point of View, Target Country, Hook Brief, Structure, SEO Keywords, External Linking — collapsed by default, `Collapsible`) → Generation Summary (read-only recap) → submit
* `article-form.tsx` (~920 lines) split into 5 presentational components: `article-form-project-context.tsx`, `article-form-source.tsx`, `article-form-settings.tsx`, `article-form-advanced.tsx`, `article-form-summary.tsx` — all state and both `handleSubmit`/`handleSuggestKeywords` handlers stay in `article-form.tsx`, unchanged; label maps centralized in `lib/wordpress/article-form-labels.ts`
* WordPress connection status and matching Content Stream(s) are both read-only, informational, server-fetched props — `app/(dashboard)/wordpress/blog-post/page.tsx` fetches `wordpress_sites`/`content_streams` once for every owned project (`.in('project_id', ...)`, RLS-scoped), so switching Project client-side never triggers a new fetch; two pure lookups (`lib/wordpress/project-context.ts`: `findSiteForProject`, `findContentStreamsForCategory`) resolve the current selection. No new relation created — the Content Stream match is derived solely from the existing `content_streams.wordpress_category_id` column (Phase 2a); several matching streams are all shown, never one picked arbitrarily
* **Visual finish (same task, same day):** the reorg above initially kept the pre-existing single giant `bg-card` wrapper around the whole form, which made Project Context/Article Settings/Advanced Options blend into both the form and each other (reported directly from screenshots). Fixed by giving each of the 5 blocks its own real card — new `components/wordpress/article-form-section-card.tsx` (`ArticleFormSectionCard` + shared `SectionHeading`: step number, `bg-primary/10` violet icon square, title, description, content separated by a `border-t`) — reused by all 5 sections instead of the previous plain `bg-muted/20`/plain-text headers. Project Context and Generation Summary get a `border-primary/30` + `ring-primary/10` accent (one accent color, not a new palette per section). Advanced Options' `Collapsible` trigger reuses the same `SectionHeading` inside a real `<button>` with visible hover/focus-visible states and a rotating chevron; its own Structure/SEO Keywords/External Linking sub-boxes moved from `bg-card/60` (invisible once nested inside a `bg-card` parent) to `bg-muted/30`. WordPress connection status split into a labeled "WordPress" row + badge + separate (non-dominating) URL line. Generation Summary restyled as a label/value grid with unset values shown in neutral `text-muted-foreground` (never destructive/warning). Error box gained a `border-l-4 border-l-destructive` accent; submit button is `w-full sm:w-auto` (full-width on mobile, no sticky footer). Hero's vertical padding trimmed slightly (`pt-8 sm:pt-16` → `pt-6 sm:pt-10`). Only Tailwind/shadcn semantic tokens used, no hex, dark mode unaffected (all tokens already have dark-mode variants)
* **Accessibility pass (same task), guided by the `ui-ux-pro-max` skill** (`.claude/skills/ui-ux-pro-max`, read in full before making any change): ran `--design-system` (top-level pattern/style matches were landing-page-oriented and not directly applicable to an internal form, but confirmed the app's existing violet `primary` already matches the tool's own "AI purple" recommendation for this product type — no palette change needed) plus targeted `--domain ux`/`style`/`stack shadcn` searches. Applied: step numbers and Generation Summary labels bumped from `text-muted-foreground/50`/`/70` to full `text-muted-foreground` (contrast risk on small text); every purely decorative icon this task introduced marked `aria-hidden="true"` (each already has a visible label or its button already has an `aria-label`); Advanced Options' chevron gained `motion-reduce:transition-none`; "Connect WordPress" link gained an explicit `focus-visible:ring-2`. Verified already-compliant, no change needed: `SelectTrigger`'s existing disabled/focus-visible styling, status conveyed via badge text not color alone, sequential `h1`→`h2` heading order. Deliberately **not** applied (would exceed this task's no-functional-change scope): migrating to shadcn's `Form`/`react-hook-form` pattern, and `cursor-pointer` on the new trigger button (would be inconsistent — no `Button` in the app sets this today)
* **Surface hierarchy pass (same task):** the visual finish still left `bg-background`/`bg-card` too close in value to read as separate layers on their own (both ~0.97–1.0 lightness in this app's tokens). Added a 4th surface level instead of touching either shared token: the 5 steps now sit inside one `bg-muted/60` "workspace" panel in `article-form.tsx` (reusing `bg-muted`'s already-slightly-violet-hued value, not a new tint); card borders/dividers bumped `border-border/60` → full `border-border`, and each card header gained its own `bg-primary/5` fill (previously transparent). New `FIELD_SURFACE_CLASS`/`SELECT_SURFACE_CLASS` exports from `article-form-section-card.tsx` applied via each field's own `className` prop (a per-usage override, no shared `Input`/`Textarea`/`Select` component edited) give every field in Project Context/Article Source/Article Settings a visible secondary fill; `CategorySelect` gained one optional, backward-compatible `triggerClassName` prop for the same purpose. Advanced Options' closed header now matches the other cards' tint; Generation Summary's 5 values became individual tiles instead of a flat label/value list. Still zero hex, zero new color, same single violet accent.
* Tests: TypeScript OK, ESLint OK (0 issues), offline renderer suite 138/138 (129 previous + 9 new for `findSiteForProject`/`findContentStreamsForCategory`, `tests/renderer/wordpress-project-context.spec.ts` — unaffected by either visual pass, pure functions untouched), production build OK (no new API route, `/wordpress/blog-post` unchanged in the route list), gated `tests/playwright/wordpress-blog-post.spec.ts` (10 tests — 2 added for the visual finish: full-width mobile submit button, `aria-expanded`/keyboard focus on the Advanced Options trigger) correctly skips without `PLAYWRIGHT_STORAGE_STATE`, not bypassed
* Not covered by the browser suite (depends on the test account's real data, no seed data allowed): which specific project has a connected WordPress site or a category mapped to a Content Stream — those 3 scenarios use `test.skip()` guards that only run when the test account happens to already have that state

## [TASK-FIX-039] Command Center Phase 2a.1 — Content Streams Management UI — 2026-09-16

* A small CRUD UI for `content_streams` inside each project's own page (`/projects/[id]`) — no new migration, no `tasks` table, no automatic recommendation, no Next Best Action, no Pinterest/WordPress logic change. Full writeup: `docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md` §14c
* New `app/api/content-streams/route.ts` (create + optional board link), `[id]/route.ts` (edit, including a board change), `[id]/archive/route.ts` (archive only, soft status change, never a physical delete) — every route re-verifies the session and re-checks ownership server-side, never trusting a client-sent `project_id`/`board_id`/`wordpress_category_id`
* New `components/projects/{content-streams-section,content-stream-card,content-stream-form-dialog,archive-content-stream-dialog}.tsx` — reuses existing Shadcn primitives (`Dialog`, `Select`, `Badge`), the existing `delete-project-dialog.tsx` confirmation shape, and `sonner` toasts; a partial create (stream saved, board link failed) is reported as a warning toast, never a plain success
* Board rule for the current "1 account = 1 board" experiment: a board already linked to another non-archived stream is disabled in the picker (client) and rejected with `409 board_taken` (server) — enforced by one shared pure function, `findBoardOccupant()` (`lib/queries/content-streams.ts`), called from both sides so the two can't drift apart; the `content_stream_boards` schema itself stays N:N, unchanged
* Tests: TypeScript OK, ESLint OK (one `react-hooks/set-state-in-effect` and one unescaped-apostrophe issue found and fixed during development), offline renderer suite 129/129 (117 previous + 12 new for `findBoardOccupant`/`parseOptionalNonNegativeInt`), full Playwright suite 129 passed / 52 skipped (new gated `tests/playwright/content-streams.spec.ts` correctly skips without `PLAYWRIGHT_STORAGE_STATE`, not bypassed), production build OK (`/api/content-streams` + 2 sub-routes appear, `/projects/[id]` unchanged in the route list)
* Not covered by the browser suite (no way to seed cross-project fixtures, and seeding is out of scope): "category from another project rejected," "board from another project rejected," "board already used by an active stream rejected" — all three already covered as offline tests of the exact functions the API routes call (`isCategoryInProject`, `isBoardInProject`, `findBoardOccupant`), signaled explicitly rather than silently skipped

## [TASK-FIX-039] Command Center Phase 2 — Discovery & Design — 2026-09-16

* Discovery/design only, per the founder's explicit scope: no migration, no schema change, no component modified. Full writeup: `docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md`
* **Method note**: Graphify (referenced by `.claude/hooks/graphify-reminder.js` / `.opencode/plugins/graphify.js`) is not actually available in this environment — no `graphify-out/graph.json`, no CLI. Signaled rather than worked around; classical inspection (migrations, types, queries, pages, docs) was used as the fallback, exactly as the brief allowed
* Confirmed by direct inspection (not assumed): `projects` has no direct WordPress/Pinterest columns — it reaches WordPress via `wordpress_sites.project_id` (UNIQUE, one per project) and `wordpress_categories.project_id` (one-to-many), and reaches Pinterest only via `boards.project_id` (one-to-many) — there is no Pinterest account/profile table anywhere, and `docs/DATABASE.md`'s own "Future Tables (Not MVP)" list explicitly names `pinterest_accounts` as "Do NOT create yet"
* Confirmed `pins.publish_date` is OmniFlow's own scheduling *intent* for CSV export only — never sent to Pinterest (no OAuth/API integration exists) — so scheduled-count/next/last/days-covered are all honestly computable from Supabase, while real board activity/engagement is not and was not fabricated
* Proposed minimal model: `content_streams` + `content_stream_boards` (join table, references `wordpress_categories`/`boards` by id only, never duplicates their names), `tasks`, `task_occurrences` — flat columns (no JSONB), following the project's own established precedent (`docs/DECISIONS.md` 2026-09-13)
* RLS proposal follows the existing denormalized `user_id` convention (`wordpress_sites`/`wordpress_categories`/`boards`), not the subquery convention
* Task state machine (Accept/Edit/Schedule/Postpone/Skip/Complete/Make recurring/Pin to Today) documented with every brief-mandated rule mapped to a specific mechanism — including a DB-level `CHECK` preventing a `suggested` (unaccepted) task from ever being pinned
* Recurrence handled with zero cron/Inngest dependency (occurrences created lazily on first interaction), consistent with RULES.md Rule #15 ("Inngest esta previsto pero no implementado")
* Next Best Action documented as a conceptual, tunable scoring function over existing/proposed fields only — explicitly ranks candidates and never auto-pins or auto-schedules
* 8 explicit open decisions flagged for founder review before any implementation phase begins (notably: whether to unblock `pinterest_account_id` with a placeholder table despite the standing "do not create yet" guidance — recommended against for now)
* Also flagged as a discovered risk (not fixed in this task): the Phase 1.1 Command Center's `resolveActiveProjects()` name-matching hack must be retired once real Content Streams/Tasks data exists, replaced by real id-based joins

## [TASK-FIX-038] Command Center MVP — Phase 1.1 Hotfix — 2026-09-15

* Same task, no new task number — a direct fix for 4 visual defects the founder observed after testing Phase 1.1 in the browser. Full root-cause writeup per bug in `docs/tasks/TASK-COMMAND-CENTER-MVP.md` ("Phase 1.1 Hotfix")
* **Real KPIs weren't clickable**: `buildCommandCenterKpis()` only ever set `href` on the `projects` KPI. Routes were inspected in `app/(dashboard)/` before wiring anything (none invented): `Pins Created` → `/history` (existing Pinterest History page), `Articles Generated` → `/wordpress/history` (existing WordPress History page), `Projects` → `/projects` (unchanged). `Generations` intentionally stays without an `href` — no combined Pinterest+WordPress history route exists. `components/dashboard/kpi-card.tsx` gained a discreet `ArrowUpRight` open-affordance (matching the app's existing clickable-card convention) plus explicit `cursor-pointer`, shown only on real, linked KPIs
* **"Add priority" never appeared**: a real logic bug, not styling — `today-priorities.tsx`'s button was gated behind `canAddMore = items.length < MAX_PRIORITIES`, and since the 3 mock priorities already equal `MAX_PRIORITIES` (3) on first render, `canAddMore` was `false` on every single load, for every user. Fixed by removing that gate entirely (button always renders except mid-edit) and removing the matching internal cap in `addPriority()`. Restyled from a subtle text link into a visibly bordered secondary button with a `Plus` icon
* **"Next action" not visible**: contrast tokens were already correct (verified again against `--foreground`/`--card` in `app/globals.css`); the real defect was format — restructured `project-progress-card.tsx` into the exact two-line block requested (`Next action` label, then the value), still defined once in the shared body JSX used by both the linked and non-linked card variants, so matching only ever controls the `Link`/`div` wrapper, never this block
* **POD showed up with no real POD project**: removed the fabricated `{ id: 'pod', name: 'POD', ... }` entry from `MOCK_ACTIVE_PROJECTS` (`lib/dashboard/command-center-mock.ts`). Active Projects now shows exactly CrochetSal and Home Decor DE — no replacement placeholder added, and no third real Supabase project is auto-added without reliable progress data. `MOCK_DAY_SUMMARY`'s project count corrected from 3 to 2 as a direct consequence. `command-center-section.tsx`'s Active Projects grid adjusted from `lg:grid-cols-3` to `sm:grid-cols-2` for the 2 remaining cards
* New `tests/renderer/dashboard-command-center.spec.ts` (offline, no browser/auth): 6 passing data-contract tests verifying KPI `href`s, POD's absence from `MOCK_ACTIVE_PROJECTS`, and that name-matching only ever withholds `href` — never `status`/`progressPercent`/`nextAction`
* `tests/playwright/ui-foundations.spec.ts`: new gated assertions checking real computed visibility/attributes rather than string presence — KPI link roles + exact `href` values, mock/routeless KPIs verified to have no anchor ancestor, the Add-priority button clicked through end-to-end (visible → enabled → click → type → submit → new item appears), and "Next action" visible on both remaining cards
* No Supabase migration, no Pinterest/WordPress logic change, no new dependency, `.claude/`/`.opencode/`/`AGENTS.md` untouched
* **Not visually verified against a live authenticated session** (same environment limitation as Phase 1.1). Verified instead: TypeScript OK, ESLint OK (scoped to every touched file — the same unrelated pre-existing untracked `.claude/hooks/graphify-reminder.js` still fails a whole-repo lint, not touched here), production build OK, offline Pinterest renderer suite 87/87 (81 pre-existing + 6 new), new Playwright browser assertions correctly skip without `PLAYWRIGHT_STORAGE_STATE` on both `chromium` and `mobile-chrome` (not bypassed). Manual validation left to the user: click each real KPI and confirm it navigates, click "+ Add priority" and confirm it visibly works, confirm "Next action" reads clearly on both cards, and confirm POD no longer appears

---

## [TASK-FIX-038] Command Center MVP — Phase 1.1 — UI Consolidation — 2026-09-15

* Scope requested by the founder as a follow-up on the same task (no new task number created — see "Phase 1.1" in `docs/tasks/TASK-COMMAND-CENTER-MVP.md`): consolidate `/dashboard` visually, remove duplicated information between the Phase 1 Command Center and the pre-existing Metrics strip, and merge in real Supabase data where a reliable match exists — without any Supabase migration and without losing any real metric
* Final hierarchy: `DashboardHeader` (greeting, date, day summary, Credits badge) → trial usage banner → Command Center (KPI grid → Today's Priorities + Active Projects → Weekly Progress) → Quick Actions (5 cards) → Recent Activity
* `types/dashboard.ts`: `CommandCenterKpi` gained `source: 'mock' | 'real'` and an optional `href`; `ProjectProgress` gained an optional `href`; `WeeklyProgressStats` restructured from 4 bare numbers into 4 `{ label, current, target, unit }` records
* `lib/dashboard/build-command-center.ts` (new): `buildCommandCenterKpis()` merges the 3 remaining mock goal KPIs (Monthly Revenue, Tasks Completed, Digital Products) with 4 real ones (Pins Created, Articles Generated, Projects, Generations) built from the Dashboard page's existing Supabase counts; `resolveActiveProjects()` case-insensitively matches each mocked Active Project's name against the user's real `projects` rows and attaches a `/projects/[id]` href only on an exact match — never a fabricated link
* `lib/dashboard/format-metric.ts` (new): the shared currency/count formatter, replacing two copies of the same ternary in `KpiCard` and `WeeklyProgress`
* `lib/dashboard/command-center-mock.ts`: dropped the mocked "Content Published" KPI (a vague duplicate of what real Pins Created/Articles Generated now show precisely); remaining `MOCK_KPIS` tagged `source: 'mock'`; `MOCK_WEEKLY_PROGRESS` restructured with per-metric targets (Articles Published 3/4, Pins Created 21/49, Products Launched 0/1, Revenue 240 €/1 000 €)
* `app/(dashboard)/dashboard/page.tsx`: the `projects` query changed from a `head: true` count to a real `id, name` row fetch (needed for Active Projects name-matching); the old 5-stat Metrics `<div>` grid (Generations, Pins Created, Articles Generated, Projects, Credits) was removed — every one of its underlying Supabase queries was kept, only the duplicate render was deleted; the 2 header CTA buttons (Generate Pinterest Pins / Generate WordPress Article) moved into 2 new Quick Action cards, for 5 total (New Project, Generate Pinterest Pins, Generate WordPress Article, Pinterest History, WordPress History) — each action now appears exactly once on the page
* `components/dashboard/dashboard-header.tsx`: dropped the `actions` CTA-buttons prop, added a `credits` prop rendered as a badge next to the greeting (via `ResourceHeader`'s `status` slot) — the only place Credits is now shown
* `components/dashboard/kpi-card.tsx`: renders a small "Preview" label for `source: 'mock'` KPIs, and becomes a `Link` when `href` is set (Projects → `/projects`)
* `components/dashboard/today-priorities.tsx`: converted to a Client Component — clicking a priority toggles a local `done` visual state (strikethrough + check icon), a discreet "+ Add priority" button (shown only under 3 items) reveals an inline input that appends a local-only item, and a caption ("Preview only — changes aren't saved yet.") makes the lack of persistence explicit. No Supabase call, no API route, no `localStorage`
* `components/dashboard/project-progress-card.tsx`: added a section header ("Active Projects" + "View all projects" link, in `command-center-section.tsx`); becomes a `Link` only when `project.href` is set; fixed the low-contrast "Next action" line (was `text-secondary` throughout, now a muted label prefix + full-contrast `text-foreground` value) with `wrap-break-word` so long actions never clip
* `components/dashboard/weekly-progress.tsx`: each metric now renders `current / target` plus its own compact progress bar
* `components/dashboard/command-center-section.tsx`: now receives `kpis` and `activeProjects` as props (resolved by the page) instead of importing all-mock data directly, keeping the mock/real merge logic out of presentational components (Rule #14)
* `docs/UI_UX.md` (rewritten Command Center subsection), `docs/tasks/TASK-COMMAND-CENTER-MVP.md` (new "Phase 1.1" section), `lib/guide/content.ts` (Command Center guide section updated) updated
* `tests/playwright/ui-foundations.spec.ts`: replaced the Phase 1 smoke test (which asserted the now-removed "Content Published" KPI) with assertions for the merged KPI grid, Today's Priorities + the "Preview only" caption, Active Projects + "View all projects", a dedicated no-duplication check (`Pins Created`/`Articles Generated`/`Projects`/Credits each render exactly once inside `<main>`), a Quick Actions exactly-once check (5 actions), and a Recent Activity presence check — all gated behind `PLAYWRIGHT_STORAGE_STATE` the same way as every other case in that file
* **Not visually verified against a live authenticated session** — no Supabase session available in this agent's environment; `/dashboard` was confirmed to still correctly 307-redirect an unauthenticated request to `/login`. Verified instead: TypeScript OK, ESLint OK (scoped to every file this task touched — an unrelated pre-existing untracked file, `.claude/hooks/graphify-reminder.js`, fails a whole-repo lint with `no-require-imports`, not modified by this task), production build OK, full offline Pinterest renderer suite unaffected (81/81), new/updated Playwright assertions correctly skip without `PLAYWRIGHT_STORAGE_STATE` (not bypassed). Manual validation left to the user: open `/dashboard`, confirm the new hierarchy renders with no duplicated information, check dark mode and desktop/tablet/mobile layouts, and confirm the Active Projects cards only link out when a matching real project actually exists for the logged-in account

---

## [TASK-FIX-038] Command Center MVP — 2026-09-15

* Scope requested by the founder: a first visual prototype of a "Command Center" dashboard section centralizing projects, goals, daily tasks and results, using mocked data only. No Supabase migration, no Pinterest/WordPress business logic touched. Isolated planning doc: `docs/tasks/TASK-COMMAND-CENTER-MVP.md`
* `types/dashboard.ts`: `CommandCenterKpi`, `PriorityItem`, `ProjectProgress` (+ `ProjectStatus`), `WeeklyProgressStats`, `DaySummary` — shapes deliberately mirroring what a future Supabase-backed version would look like, so the mock data can be swapped later without changing component props
* `lib/dashboard/command-center-mock.ts`: the single centralized mock data file (`MOCK_DAY_SUMMARY`, `MOCK_KPIS`, `MOCK_TODAY_PRIORITIES`, `MOCK_ACTIVE_PROJECTS`, `MOCK_WEEKLY_PROGRESS`) — the only place this task's data lives
* New presentational components under `components/dashboard/` (kebab-case files, `rounded-xl border border-border/60 bg-surface` div cards — matching the codebase's actual dominant card convention, not the underused shadcn `Card` primitive): `dashboard-header.tsx` (greeting + date + day summary, wraps the existing `ResourceHeader`), `kpi-card.tsx`, `today-priorities.tsx`, `project-progress-card.tsx` (status badge, progress bar, main KPI, next action), `weekly-progress.tsx`, and `command-center-section.tsx` composing all of the above
* `app/(dashboard)/dashboard/page.tsx`: the existing hero block now renders through `DashboardHeader` (same CTA buttons, unchanged behavior) with today's date and the mocked day summary added; `<CommandCenterSection />` is inserted right after it, before the trial usage banner. The pre-existing Quick Actions, Metrics, and Recent Activity sections are completely unchanged
* `docs/UI_UX.md` (new "Command Center" subsection under Dashboard), `docs/tasks/TASK-COMMAND-CENTER-MVP.md`, `lib/guide/content.ts` (new "Command Center" guide section) updated
* `tests/playwright/ui-foundations.spec.ts`: two new smoke assertions (desktop sections visible; mobile viewport renders the same headings), gated behind `PLAYWRIGHT_STORAGE_STATE` the same way as every existing case in that file
* **Not visually verified against a live authenticated session** — no Supabase session available in this agent's environment; `/dashboard` was confirmed to still correctly redirect unauthenticated requests to `/login` (no crash). Verified instead: TypeScript OK, ESLint OK (project-wide), production build OK, full offline Pinterest renderer suite unaffected (81/81), new Playwright assertions correctly skip without `PLAYWRIGHT_STORAGE_STATE`. Manual validation left to the user: open `/dashboard`, confirm the Command Center section renders as expected, check dark mode and mobile/desktop responsive layout, and confirm every pre-existing dashboard section and route still works

---

## [TASK-FIX-035] WordPress Structure Block (Refonte Phase 2) — 2026-09-13

* Scope agreed with the founder: a second optional block, "Structure", added to the "1-Click Blog Post" generator (Option 1, Keyword mode only), below Core Settings (TASK-FIX-034). Nothing else — zero change to Core Settings, Option 3, Option 4, TASK-035 (publishing), or the IMAGE role
* **Schema convention** (DECISIONS.md 2026-09-13 (3)): evaluated flat nullable columns vs. a consolidated `settings jsonb`, given Phase 3/4 will add more optional settings. Kept flat columns, matching Phase 1 and the zero JSONB precedent across all 26 prior migrations — treated as an architecture-pattern decision (Rule #3), not a routine schema extension, and deferred consolidation until the real shape of 3-4 phases' worth of settings is actually known (same reasoning already used for TASK-027's deferral)
* Migration 027: `wordpress_generations` gains `hook_brief` (text) + 9 nullable `boolean` columns (`include_conclusion`, `include_tables`, `include_h3`, `include_lists`, `include_italics`, `include_quotes`, `include_key_takeaways`, `include_faq`, `include_bold`) — a nullable boolean's 3 states (`true`/`false`/`null`) map directly onto "Oui"/"Non"/"Non défini", no CHECK or extra enum needed
* `lib/validations/wordpress.ts`: `generateArticleSchema` gains `hookBrief` (string, max 500) and 9 `z.boolean().optional()` fields. `buildWordpressOutlineSchema()`/`buildWordpressArticleResponseSchema()` (the latter newly extracted the same way TASK-FIX-034 extracted the outline builder) both gain `keyTakeawaysRange`/`faqRange` params — called with no args (or with both ranges at their `DEFAULT_*` values) they reproduce the exact pre-existing 4-6 validation; `DISABLED_ARRAY_RANGE` (`{min:0,max:0}`) is used only when the corresponding toggle is explicitly `false`, giving Key Takeaways="Non"/FAQ="Non" a genuine Zod-enforced guarantee of absence (the outline step itself fails validation if the model returns anything non-empty), not just a prompt request
* `lib/ai/prompts/wordpress-outline-prompt.ts`: new optional `hookBrief`/`includeConclusion`/`includeKeyTakeaways`/`includeFaq` context. Hook Brief adds a planning-stage note shaping title/quickAnswerAngle. The fixed-structure block-list sentence ("The article follows a fixed N-block structure (...)") is now built from an array and drops Key Takeaways/FAQ/Conclusion by name when disabled instead of a hardcoded "10-block" string. The `keyTakeawaysThemes`/`faqQuestions` instruction lines switch to "return an empty array — do not plan this section" when their toggle is `false`; every branch collapses to the exact original text when toggles are unset
* `lib/ai/prompts/wordpress-article-prompt.ts` (the larger change): (1) **Tables** — a new `resolvedIncludeTable` overrides the outline's own topic-driven `includeComparisonTable` judgment only when the toggle is explicitly set, covering both directions (force a table into a topic the outline didn't plan one for, or forbid tables — including ad-hoc ones outside the dedicated section — even if the outline wanted one); undefined leaves the outline's judgment untouched, identical to the pre-existing two-branch instruction. (2) **H3/Lists/Italics/Quotes/Bold** — a new "Formatting directives" block; `false` is always phrased as an explicit ban naming the literal Markdown syntax ("no `**double asterisks**`"), not a soft "not required", since the goal is to force absence, not merely avoid requesting presence (Lists explicitly carves out Key Takeaways/Common Mistakes, which keep their own fixed list format regardless of this toggle). (3) **Hook Brief** overrides the generic "a question, a scenario, or a fact" opening-angle instruction with the user's specific text, keeping the "never restate the H1" constraint. (4) **Conclusion/Key Takeaways/FAQ presence** — the previously hardcoded 1-10 numbered structure list is now built from an array so steps can be added or omitted with automatic renumbering (including the "insert image markers at steps X, Y, Z" cross-reference, which is computed live rather than hardcoded as "2, 5, or 6" so it stays correct when Key Takeaways shifts the numbering). Verified by inspection line-by-line that every branch reproduces the exact original wording, ordering, and step count when every Structure field is left unset
* `lib/wordpress/generate-article.ts`: `generateWordPressArticle()` accepts the 10 new optional/nullable fields, resolves `keyTakeawaysRange`/`faqRange` once, and always calls the parameterized schema builders (`buildWordpressOutlineSchema({...})`/`buildWordpressArticleResponseSchema({...})`) instead of branching on the bare singletons — when every new field is unset this produces byte-for-byte the same validation as before TASK-FIX-034/035
* `app/api/wordpress/generate/route.ts`: parses, persists (`hook_brief`, `include_*`), and forwards the 10 fields; Option 3/4 routes/schemas untouched, so they never populate these columns
* `components/wordpress/article-form.tsx`: new "Structure" block (Keyword mode only) below Core Settings — an Introductory Hook Brief textarea (500-char cap, live counter) with 5 preset buttons that pre-fill it (still freely editable after), plus a small reusable `StructureToggle` 3-state select (Non défini/Oui/Non) used for all 9 toggles
* `docs/UI_UX.md` (new "Structure" subsection under "WordPress Generator — 1-Click Blog Post"), `docs/DATABASE.md`, `docs/DECISIONS.md` (2026-09-13 (3) schema convention, (4) absence-guarantee split), `lib/guide/content.ts` updated
* **Not tested by the agent against a real generation** — no live Supabase/OpenRouter credentials in this environment, so the brief's Étape 0 request (generate 1-2 real test articles to observe natural model defaults before wording the "Non" instructions) could not be carried out empirically; "Non" instructions were written as explicit syntax bans on prompt-engineering-best-practice grounds instead, and Key Takeaways/FAQ get a hard schema-level guarantee where a prompt-only approach isn't verifiable (see DECISIONS.md 2026-09-13 (4)). Verified instead: TypeScript OK, ESLint OK on every changed file (one pre-existing, unrelated ESLint error in `components/pinterest/recompose-pin-dialog.tsx` — uncommitted Phase 7 Pinterest work, not touched by this task), production build OK. Manual validation left to the user: (1) generate with Structure untouched and confirm the result is unchanged from before this task, (2) generate with FAQ=Oui + Tables=Oui + Bold=Non and confirm a FAQ section exists, at least one Markdown table appears, and no bold text appears anywhere, (3) try each Hook Brief preset button and confirm the pre-filled text matches

---

## [TASK-FIX-034] WordPress Homepage + Core Settings (Refonte Phase 1) — 2026-09-13

* Scope agreed with the founder: (A) a new WordPress home page as a grid of generator cards, (B) an enriched "Core Settings" block on the "1-Click Blog Post" generator (Option 1, keyword → article). Nothing else — no Structure/SEO Keywords/Media Hub/Internal-External Linking/Syndication blocks, no AI model choice exposed to users (Rule #11 stays intact; see the Backlog note under FASE 4 above)
* **Route restructuring** (see DECISIONS.md 2026-09-13 (2)): the existing combined Option 1 + Option 3 form (`components/wordpress/article-form.tsx`) moved unchanged to a new route `app/(dashboard)/wordpress/blog-post/page.tsx`. `app/(dashboard)/wordpress/page.tsx` now renders a 4-card grid ("1-Click Blog Post" active → `/wordpress/blog-post`; "Bulk Article Generation", "Super Page", "Rewriter Tool" disabled placeholders, same visual treatment as the sidebar's disabled Facebook/LinkedIn/Medium entries — grayed, "Soon" tag, no route). The `?pinIds=` branch (Option 4) is untouched and still lives at `/wordpress`, checked before the grid renders, so a Pinterest-selection link never sees it. Direct "create an article now" CTAs (dashboard's "Generate WordPress Article" button, WordPress History's empty-state "Go to Generator", the article page's back arrow and its generation-not-found fallback) were repointed to `/wordpress/blog-post` so they keep their one-click behavior instead of adding an extra hop through the hub; the sidebar's "WordPress → Generate" link intentionally still points at `/wordpress` (the hub)
* Migration 026: `wordpress_generations` gains 5 nullable columns — `article_type`, `article_size`, `tone_of_voice`, `point_of_view`, `target_country`. No DB CHECK, validated at the Zod layer, same convention as `visual_format`/`title_banner_template`
* `lib/validations/wordpress.ts`: `ARTICLE_TYPES`, `ARTICLE_SIZES`, `TONES_OF_VOICE`, `POINTS_OF_VIEW`, `TARGET_COUNTRIES` (fixed lists) plus `ARTICLE_SIZE_CONFIG` (section-count/word-count range per size tier). `generateArticleSchema` gains the 5 optional fields. `wordpressOutlineSchema` is now `buildWordpressOutlineSchema(sectionsRange?)` called with no args — byte-for-byte the same schema as before (8-10 sections) — so Option 3/4 (which still call the zero-arg form via `wordpressOutlineSchema`/`buildWordpressPinsOutlineSchema`) are unaffected
* `lib/ai/prompts/wordpress-outline-prompt.ts` / `wordpress-article-prompt.ts`: 5 new optional context fields. Article Type nudges how Main Content H2 sections are framed (step-by-step for How-to, numbered items for Listicle, pros/cons + verdict for Product review, inverted-pyramid for News, criteria-based for Comparison) without altering the fixed 10-block AEO skeleton. Article Size drives the section-count range and word-count target passed into both prompts. Tone of Voice and Point of View are sentence-level voice instructions on the article body, explicitly distinct from and layered on top of the Brand Profile. Target Country steers examples/references/units. Every one of the 5 fields is optional and unused branches reproduce the exact prior prompt text (verified by inspection: identical string output when all are `undefined`)
* `lib/wordpress/generate-article.ts`: `generateWordPressArticle()` accepts the 5 optional fields, builds a size-specific outline schema only when `articleSize` is set (falls back to the untouched default otherwise), and bumps the article generation's `maxTokens` from `ARTICLE_MAX_TOKENS` (8000) to a new `ARTICLE_MAX_TOKENS_LARGE` (11000) only for the `large` tier (~3600-5000 words) to avoid truncating the JSON response — every other tier, including no size chosen, keeps the original constant unchanged
* `app/api/wordpress/generate/route.ts`: parses, persists, and forwards the 5 fields; `generateArticleFromUrlSchema`/`generateArticleFromPinsSchema` and their routes are untouched, so Option 3/4 never populate these columns
* `components/wordpress/article-form.tsx`: new "Core Settings" block (5 selects, all defaulting to "None") rendered only in Keyword mode, below the existing Project/Language/Category row — invisible and inert in External Source mode
* `types/wordpress.ts`: `WordPressGeneration` gains the 5 nullable fields; `WordPressGenerationInsert` keeps them optional
* `docs/UI_UX.md` (new "WordPress Home" section + rewritten "WordPress Generator — 1-Click Blog Post" section with a "Core Settings" subsection), `docs/DATABASE.md`, `docs/DECISIONS.md` (2026-09-13 (2)), `lib/guide/content.ts` updated
* **Not tested by the agent against a real generation** — no live Supabase/OpenRouter credentials in this environment. Verified instead: TypeScript OK, ESLint OK, production build OK (`/wordpress` and `/wordpress/blog-post` both compile as separate routes). Manual validation left to the user: (1) generate via "1-Click Blog Post" with Core Settings untouched and confirm the result is unchanged from before this task, (2) generate with Article Type=Listicle + Article Size=Small + Tone=Witty and confirm the structure/length/tone reflect those choices, (3) confirm the 3 placeholder cards on the WordPress home are non-clickable

---

## [TASK-FIX-033] Strip C2PA Metadata — 2026-09-13

* `lib/ai/providers/openai.ts` `generateImage()`: the raw buffer received from OpenAI (`b64_json` or downloaded from `url`) is now re-encoded through `sharp(...).png().toBuffer()` before being returned, instead of being returned as-is
* Sharp only preserves metadata when `.withMetadata()` is explicitly called, so this re-encode strips all embedded metadata by default — including gpt-image-1's embedded C2PA content-credentials manifest, plus any EXIF/XMP
* Same output format already used by the rest of the pipeline (`lib/pinterest/compositing.ts` also outputs `.png()`, Supabase upload already sets `contentType: 'image/png'`) — no format change
* `sharp` was already a project dependency (used throughout `lib/pinterest/*`), so no new dependency was added
* Scoped to the OpenAI provider only (`lib/ai/providers/openai.ts`) — `lib/ai/providers/openrouter.ts` (text-overlay image routing, TASK-034) is untouched, `lib/ai/services/image.ts`, `app/api/pinterest/generate-images/route.ts`, Supabase Storage upload logic, and the `pins`/`pin_images` schema are all unchanged
* No API, schema, or route-contract change — purely an internal buffer transformation inside the existing AI Engine provider boundary (Rule #10)
* `docs/ARCHITECTURE.md` "Image Generation Flow" diagram gained a "Metadata Stripped" step between "Generated Image" and "Supabase Storage"
* Validation: TypeScript OK, ESLint OK, production build OK

---

## [TASK-FIX-032] Board Badge Reflects Live State — 2026-09-13

* Bug: the pin Board badge on the Results page (`components/pinterest/pin-table.tsx`) rendered `pins.board`, the AI-generated text frozen at generation time — deleting or renaming a board left the old name on screen (confirmed with a deleted board, "Beginner Crochet Tips", still showing on its pins)
* `lib/queries/generations.ts` `getGenerationWithPins()`: pins query now embeds `boards(name)` and returns a new `boardNames: Record<string, string | null>` map (same sibling-map pattern as the existing `imageVersionCounts`/`activeImageModels`), keyed by pin id, resolved live via `board_id`
* `components/pinterest/pin-table.tsx` Board badge now renders `boardNames[pin.id] ?? 'No board assigned'` instead of `pin.board`; `boardNames` threaded through `components/editorial/editorial-workspace.tsx` and `app/(dashboard)/pinterest/[id]/page.tsx`
* `components/boards/board-pin-card.tsx` (Board Detail page) never rendered a Board badge to begin with — every pin there already belongs to the one board named in the page header — so it needed no change
* `pins.board` (AI-generated text), `lib/csv/pinterest.ts` (CSV export), and `findOrCreateBoardIds()` are untouched by design — CSV keeps exporting the original generation-time text
* No DB migration, route, or schema change — `pins.board_id` (nullable, `ON DELETE SET NULL`) already existed since the original Boards migration
* `docs/UI_UX.md` "Pin Grid" section's Board badge bullet updated to describe the live join and the "No board assigned" fallback
* Validation: TypeScript OK, ESLint OK, production build OK. Manual verification (delete a board → pins show "No board assigned"; rename a board → pins show the new name without regenerating; CSV export still contains the original board text) left to the user, since it requires an authenticated session against real data

---

## [TASK-FIX-031] Boards Filters & Pagination — 2026-09-13

* Bug: `/boards` listed every board across all projects on a single unpaginated page, with no way to filter — each card already showed its project name but nothing let the user filter on it, unlike History (TASK-FIX-002) which already solved the identical problem
* `app/(dashboard)/boards/page.tsx`: reads `project`/`search`/`page` search params, applies `project_id` and `name ILIKE '%search%'` filters before `.range()` pagination (20 per page, `{ count: 'exact' }`) — same pattern as `app/(dashboard)/history/page.tsx`
* New `components/boards/board-filters.tsx` (Client Component): Project select ("All Projects" default) + debounced name search input, mirrors `history-filters.tsx`; updates query params and resets to page 1 on any filter change
* New `components/boards/board-pagination.tsx` (Server Component): Previous/Next preserving all current query params, hidden when only one page — near-identical copy of `history-pagination.tsx` adapted to `/boards`
* Out-of-range page redirects server-side to the last valid page, same logic as History
* Empty states split: "No matching results" (with Clear filters) when filters exclude everything vs. the original "No boards yet" when there are truly zero boards
* Zero regression on TASK-025: "New Board" button and per-card Edit/Delete (`board-actions.tsx`) unchanged
* No DB migration, no new API route — `GET /api/boards` remains NOT IMPLEMENTED, board listing stays a direct server-side Supabase query (same convention as Projects/History)
* `docs/UI_UX.md` "Boards" section gained "Filters" and "Pagination" subsections, matching the detail level already documented under "History"
* Validation: TypeScript OK, ESLint OK, production build OK. Manual verification (Project filter isolates that project's boards, case-insensitive name search, pagination no longer dumping all boards at once) confirmed by the user

---

## [TASK-FIX-025] Pinterest Rendering Reliability — 2026-09-12

* Kept the existing SVG + Sharp pipeline, PNG export, five template names, routes, storage, `pin_images`, `media_url`, versions, CSV export, and legacy `'clean-band'` fallback for pre-migration Pins.
* Added explicit 1024-reference text-area metadata per template in `lib/pinterest/banner-templates/index.ts`: x/y/width/height, horizontal and vertical padding, alignment, and separate HEADLINE/CTA font limits, weight, line count, and line height.
* Added `lib/pinterest/text-layout.ts`: Sharp/Pango measurement with versioned Inter TTF files, word-boundary wrapping, balanced lines, measured bounds, minimum-size enforcement, and explicit `BannerCompositionError` when no valid composition exists.
* HEADLINE and CTA are now distinct roles: headline is dominant and supports up to 2–3 lines according to the template; CTA is SemiBold, smaller, and one line.
* `pill` and `corner-tag` fit against their real interior width; text that cannot fit uses an explicit `clean-band` fallback rather than overflowing.
* Removed text nodes from the five shape SVGs. `compositeBanner()` now composites the shape and measured text lines in the image-pixel coordinate system, eliminating the 1024-viewBox double-scaling risk and supporting 1024×1536 plus 1000×1500 proportionally.
* Preview components now preserve the full 2:3 image with `object-contain` and no conflicting max-height crop; the Text in Images descriptions clarify that Never disables the headline but not the always-on Save CTA.
* Added four static offline SVG fixtures, 10 renderer tests, before/after comparison artifacts, a five-template visual matrix, and authenticated desktop/mobile Playwright preview coverage. No AI, external request, Supabase mutation, schema change, route change, provider change, commit, or push.
* Validation completed: TypeScript OK, ESLint OK, renderer 10/10, global Playwright 10 passed / 18 skipped, production build OK, `git diff --check` OK, and a real manual render OK.
* Remaining limitation: the renderer does not yet inspect the local brightness, contrast, or visual complexity of the generated photo. Phase 2 will add local Sharp-only analysis, proportional safe areas, two candidate zones, automatic light/dark text, and a subtle overlay fallback; semantic subject detection remains out of scope.

## [TASK-FIX-024] Multi-template banner compositing (static SVG shapes, AI-chosen, code-executed) — 2026-09-12

* Extends the deterministic banner compositing (TASK-FIX-018/019/020/021/022/023) with 5 selectable shapes instead of the single solid-rectangle band: `clean-band`, `ribbon`, `pill`, `torn-paper`, `corner-tag`. Still never asked from the image model — same guarantee as before, just more visual variety
* `lib/pinterest/banner-templates/*.svg`: one static SVG file per shape, each authored on a fixed 1024-wide reference canvas (matching `IMAGE_CONFIG.size`) with its own intrinsic height (`viewBox`) and shape/text geometry — `{{TEXT}}`/`{{ACCENT_COLOR}}`/`{{TEXT_COLOR}}`/`{{FONT_SIZE}}` tokens substituted at render time. No procedural shape generation in code, no per-template positioning logic — adding a 6th shape later means adding one more SVG file, not new code
* `lib/pinterest/banner-templates/index.ts`: loads all 5 files eagerly via literal `readFileSync` calls (not a dynamic `${template}.svg` lookup) so Next.js's serverless file-tracing (`@vercel/nft`) can see and bundle them; also exposes `getTemplateAspectRatio()` (parsed from each file's own `viewBox`) and `BANNER_TEMPLATE_DESCRIPTIONS` for the prompt
* `lib/pinterest/compositing.ts`: `compositeBanner()` takes a new required `template` param, loads the matching source, fills in tokens, and composites it at the top or bottom edge. Font-size shrink-to-fit (TASK-FIX-023) unchanged; banner **height is now the template's own aspect ratio** rather than derived from the rendered text — an explicit tradeoff (geometry now owned by the static file, not computed per pin), accepted as the cost of the "no per-template positioning logic" requirement
* `lib/validations/pinterest.ts`: new `BANNER_TEMPLATES` enum; `pinResponseSchema` gains **two** independent optional fields — `titleBannerTemplate` and `ctaBannerTemplate` — not one, since the top title-hook banner (only exists when `visualFormat = text-overlay`) and the bottom CTA banner (always composited) are chosen independently. Confirmed with the user during scoping, since the original request named a single `bannerTemplate` field but also required independent per-banner choice
* Migration 025: `pins.title_banner_template` / `pins.cta_banner_template` (text nullable, no DB CHECK — same convention as `visual_format`/`overlay_text`, migration 018)
* `lib/ai/niche-visual-conventions.ts`: `allowedBannerTemplates?: BannerTemplate[]` on `NicheVisualConvention`. `DEFAULT_NICHE_CONVENTION` excludes `torn-paper`; `Personal Finance / Budgeting` restricted to `['clean-band', 'corner-tag']`; `Crochet` allows all 5
* `lib/prompts/pinterest-pins.ts` (`pinterest-pins-v7` → `v8`): FAST role asked for `ctaBannerTemplate` (every pin) and `titleBannerTemplate` (text-overlay pins only), listing only the niche's eligible shapes with a short description each, and steering away from `pill` for text longer than 2-4 words
* `app/api/pinterest/generate/route.ts`: `clampBannerTemplate()` overwrites any AI-chosen template outside the niche's `allowedBannerTemplates` before persisting — defense in depth, same principle as the existing `allowTextOverlay` clamp, but this one is an actual post-hoc override rather than prompt-instruction-only
* `app/api/pinterest/generate-images/route.ts`: passes `pin.cta_banner_template`/`pin.title_banner_template` through to `compositeBanner()`, falling back to `'clean-band'` for pins created before migration 025 (`null` values)
* **Not tested by the agent on a real batch** — explicit user instruction. Verified instead with a local script (`tsx`, no AI/DB calls) calling `compositeBanner()` directly against a synthetic gradient background for all 5 shapes plus the neutral-fallback style; renders shown to the user for review before any real generation. Known limitation surfaced by that preview: `corner-tag`'s usable width (~420/1024) visually overflows with long text — expected, mitigated by prompt guidance rather than a code-side width cap
* `docs/DECISIONS.md` (2026-09-12), `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/CHANGELOG.md` updated. `lib/guide/content.ts` **not** updated — this is an internal image-rendering change with no new user-facing control (banner shape is fully AI-decided, no UI toggle), consistent with TASK-FIX-018 through 023 also not touching the Guide

---

## [TASK-FIX-023] Banner height tightened to actual text + top banner near-zero margin — 2026-09-02

* Real-pin bug report: on "Quick Crochet Secrets" (rabbit plush), the top banner partially overlapped the rabbit's ears, and both banners looked disproportionately thick relative to their text
* No subject-detection built (explicitly out of scope, too complex for the need) — instead: shrink the band to hug the text, and rely on the existing framing conventions (`niche-visual-conventions.ts`) that already keep the extreme top edge generally clear of the subject, combined with a near-flush top placement
* `lib/pinterest/compositing.ts`: `bannerHeight` no longer a fixed fraction of image height — now `fontSize × 1.1 (line-height) + 2 × verticalPadding` (`verticalPadding = height × 0.012`), computed from the *final* font size (after the existing overflow-shrink), so a short CTA also gets a proportionally thin band. Top banner margin cut to `height × 0.008` (near-flush); bottom (CTA) margin unchanged at `height × 0.035` (already validated with no overlap)
* Measured on a real 1696×2528 pin (same dimensions as the reported one): banner height 227px (8.9%) → ~166px (6.6%), ~27% thinner. Top margin 88px → 20px, ~77% reduction
* **Verified with a real regeneration** (same project/keyword as the original report, 5 pins, text-overlay forced): the exact rabbit pin wasn't reproduced (image generation has no seed control, subject is free each call), but all 5 regenerated pins show visibly thinner, near-flush-top banners with zero subject overlap across varied compositions (yarn balls, folded blanket, granny square, coasters) — the fix is structural (thinner band + near-zero margin), not subject-specific, so it transfers to the rabbit case even without reproducing it identically
* `docs/DECISIONS.md` (2026-09-02 (6)), `docs/CHANGELOG.md` updated. No DB/schema change, no `lib/guide/content.ts` change (internal rendering fix)

---

## [TASK-FIX-022] Fix two root-cause bugs in extractAccentColor() — 2026-09-02

* Real-pin bug report (TASK-FIX-021's own output): on a "Quick Crochet Secrets" pin, both banners rendered in a dull brown-taupe blending into the wood-table background, despite vivid colors (mint, rose yarn) visible in the photo
* **Diagnosis run before any fix** (algorithm replayed bucket-by-bucket on the exact reported pin): the winning bucket was `rgb(51,28,8)` — a dark wood-grain shadow fragment — saturation 0.744, lightness 0.116, population **28/2752 sampled pixels (1.0%)**, score 0.513. A far more representative wood bucket, `rgb(120,93,70)` at **200 px (7.3%)**, scored only 0.360 — losing to the 1%-population fragment. Three root causes identified: (1) HSL saturation is unstable near black — a small absolute channel spread yields deceptively high relative saturation for what is really a shadow, not a vibrant color; the old `MIN_LIGHTNESS=0.08` let l=0.116 slip through; (2) saturation's 0.6 score weight had no population floor to counterbalance it, so a few dozen pixels could outscore a 200px region; (3) separately, the old `sharp.resize(64,64)` downsample blurred small saturated objects — a yarn ball ~150-200px wide in a 1696px-wide photo survived resize as only 4-7 blended pixels, measured max saturation 0.18 (mint) / 0.26 (rose), both under the winning fragment's 0.744
* Fix, in `lib/pinterest/color-extraction.ts`:
  1. `MIN_LIGHTNESS` raised 0.08 → 0.15
  2. Saturation dampened by lightness confidence before scoring: `dampenedSaturation = s * (1 - |l-0.5|×2)` — a near-black/white bucket can no longer dominate structurally, even if it clears the lightness floor
  3. Hard population floor `MIN_POPULATION_RATIO = 0.02` (2%) — a bucket below this share is excluded from scoring entirely, not just down-weighted. Confirmed: 28/2752 = 1.02% would have been excluded outright
  4. Resize-based downsampling replaced with direct point-sampling on the full-resolution raw buffer — a 96×96 grid (~9,200 real pixels, no interpolation/blur) instead of `sharp.resize(64,64)` before quantization
* **Re-tested on the exact reported pin**: new winner `rgb(164,127,95)` — a warm wood-brown, 241/9216 samples (2.6%), saturation 0.276, lightness 0.508 (near-median), contrast with black 5.79:1. The old winner's equivalent bucket now scores 0.234, far from winning. The yarn balls still fall under the 2% floor even with true point-sampling (max real bucket measured: 22/9216 = 0.24%) — confirming they're genuinely too small a fraction of the frame to dominate a full-width banner, not a resolution artifact; the new winner is an honestly representative wood-tone instead, matching the acceptance bar set by the user ("at minimum a more representative wood zone")
* Banner height/position (raised separately in the same user report, points 3-4) intentionally NOT touched — out of scope for this fix, to be handled after this correction is validated
* `docs/DECISIONS.md` (2026-09-02 (5)), `docs/CHANGELOG.md` updated. No DB/schema change, no `lib/guide/content.ts` change (internal rendering fix, not a new user-facing capability)

---

## [TASK-FIX-021] Automatic accent-color extraction + deterministic top title banner — 2026-09-02

* Extends TASK-FIX-019's deterministic CTA banner: derives an accent color from each generated image instead of a fixed neutral dark background, and applies the same code-side compositing to the title hook (`overlayText`, `text-overlay` pins only) at the top — that text was still AI-rendered until now, exposed to the same unreliability already measured at 1/10 for the CTA banner
* **Library check before coding**: `sharp` (already a direct dependency) exposes `.stats().dominant` — tested against real generated images first, consistently returned a neutral gray/beige (`{r:152,g:152,b:152}`, `{r:232,g:232,b:232}`...), the single most-common histogram color (usually a wall), not a vibrant accent. `node-vibrant` would fix that, but its Node image backend (`@vibrant/image-node`) depends on `Jimp` purely to decode pixels — duplicating what `sharp` already does natively and faster. Decision, confirmed with the user before implementation: write the quantize-then-score-by-saturation algorithm directly on `sharp`'s raw pixel output (downsample 64×64, bucket-quantize, score = saturation×0.6 + mid-lightness score×0.2 + population score×0.2 — same target-scoring spirit as Android Palette/Vibrant.js, without their dependency). **Zero new library added**
* New `lib/pinterest/color-extraction.ts` — `extractAccentColor(imageBuffer)`: one extraction per image, on the raw buffer *before* any compositing (compositing already-added banners would bias the histogram toward dark gray). Text color (`#ffffff` or `#141414`) chosen via WCAG 2.0 relative luminance + contrast ratio against white/black — never a guess. Explicit fallback to `accentColor: null` (→ existing neutral gray/black style, TASK-FIX-019 behavior unchanged) when: extraction throws, no sufficiently saturated candidate exists, the color is too close to pure white/black (lightness < 0.08 or > 0.92), or the best achievable contrast (white or black) is below 3:1 (WCAG AA large/bold text minimum)
* `compositeCtaBanner` generalized to `compositeBanner(imageBuffer, text, position: 'top' | 'bottom', accentColor, textColor)` (`lib/pinterest/compositing.ts`) — one shared function, same banner style (height, margin, font, overflow-shrink), only position and color vary
* `app/api/pinterest/generate-images/route.ts`: one `extractAccentColor()` call per generated image, reused for both `compositeBanner()` calls — bottom (CTA, every pin) then top (title hook, `visual_format === 'text-overlay'` only — same condition the removed AI instruction used)
* `lib/ai/prompt-engine/engine.ts`/`presets.ts`: the title-hook rendering instruction removed from the image prompt (symmetric to TASK-FIX-019's CTA removal). `NEGATIVE_CONSTRAINTS_TEXT_OVERLAY` deleted as dead code — now identical to `NEGATIVE_CONSTRAINTS` once both text elements moved to code, so a single constant covers both visualFormats. `IMAGE_PROMPT_ID` → `pinterest-image-v5`
* **Verified with two real end-to-end tests, not simulations**:
  1. 10 pins, pure `photo` mode (no `overlay_text`, so no top banner expected): bottom banner 10/10, a real extracted color every time (zero fallback triggered), colors visually coherent with each photo (gold, olive, vivid orange, brick red, cream), contrast always excellent (>9:1 in every case observed)
  2. 5 pins, `text-overlay` mode forced (Crochet niche): **5/5 with both banners** (top: title hook: bottom: CTA), same extracted color reused for both on each pin, all legible and correct, no truncation, CTA variant rotation confirmed working
* This same test batch also re-validated TASK-FIX-020 (below) — the two fixes were live together and tested in the same real generation
* `docs/DECISIONS.md` (2026-09-02 (4)), `docs/CHANGELOG.md` updated. No DB/schema change, no `lib/guide/content.ts` change (visual rendering detail, not a new user-facing capability — the CTA/title-on-image behavior itself was already documented)

---

## [TASK-FIX-020] Guardrail against illegible incidental text on decor props — 2026-09-02

* Distinct from explicit text (title, CTA banner — already fixed by TASK-FIX-018/019): generated images kept showing illegible pseudo-text on scene props never explicitly asked to carry text — book spines ("EHIRIKGTUNA", "I-MASSOM"), a candle jar label — observed in prior tests. Root cause: the `image_prompt` instruction ([pinterest-pins.ts:120](../lib/prompts/pinterest-pins.ts)) freely allowed "3-5 supporting objects or details" with no state qualifier, and the "Personal Finance / Budgeting" niche styleGuidance literally suggested "a notebook, printed charts or graphs" — objects that, once positively described as carrying content, push the image model to hallucinate text on them even though the blanket negative constraint ("no text of any kind") already technically forbids it. A negative ban alone isn't enough when the positive prompt describes the object in a state that implies text
* New Rules bullet ([pinterest-pins.ts:136](../lib/prompts/pinterest-pins.ts)): any prop that customarily carries writing (notebook, book, magazine, label, tag, sign, chart, paper) must be described in a state that implies no legible text ("closed notebook", "blank-spined books") rather than a state that implies it ("notebook with handwritten notes", "chart with numbers") — even without quoting the text itself. `PROMPT_ID` → `pinterest-pins-v7`
* `NICHE_VISUAL_CONVENTIONS['Personal Finance / Budgeting'].styleGuidance` corrected to match: "notebook" → "closed notebook (cover only)", "printed charts or graphs" → "abstract bar-chart, no numbers or labels", "banknotes" removed (currency inherently carries text/numbers, no phrasing avoids that)
* `overlayText`, CTA banner compositing, niche framing/variation rules: untouched, checked line-by-line before editing
* **Verified with a real test** (same generation as TASK-FIX-021 above): clear improvement, not a full elimination — of 10 real photo-mode images, 7 had no incidental text at all, 3 had minor residual marks (background book spine, candle label) markedly subtler than the pre-fix baseline ("EHIRIKGTUNA"/"I-MASSOM"). The image model retains some tendency to hallucinate pseudo-text on flat surfaces even without a positive description inviting it — a known, accepted limitation to keep watching, not a fix failure
* `docs/DECISIONS.md` (2026-09-02 (3)), `docs/CHANGELOG.md` updated. No `lib/guide/content.ts` change — internal prompt-quality fix, not a new capability

---

## [TASK-FIX-019] Deterministic code-composited "Save the Pin" CTA banner (replaces AI-prompt version) — 2026-09-02

* Direct follow-up to TASK-FIX-018: with per-image model traceability in place, a real test on 10 pins in pure `photo` mode (all confirmed `black-forest-labs/flux.2-pro` via `image_model`) measured the actual success rate of asking the image model to render the "Save the Pin" banner (introduced 2026-08-28 (2)): **1/10** — 7/10 banner missing entirely, 2/10 present but corrupted or truncated (one case also hallucinated a fake Pinterest-style logo despite the explicit no-logo constraint). Full breakdown in `docs/DECISIONS.md` 2026-09-02 (2)
* Same principle already applied elsewhere in this codebase for an unreliable AI-declarative-instruction problem: the WordPress external link (2026-07-15/17) moved from trusting the model's own claim to a real server-side HTTP check. Here, the equivalent fix is to stop asking the model to render this text at all
* `lib/ai/prompt-engine/engine.ts`: the CTA banner instruction line removed from the image prompt. `lib/ai/prompt-engine/presets.ts`: `NEGATIVE_CONSTRAINTS`/`NEGATIVE_CONSTRAINTS_TEXT_OVERLAY` reverted to ban all text not explicitly requested (photo: no text at all; text-overlay: only the `overlayText` headline, unchanged). `IMAGE_PROMPT_ID` → `pinterest-image-v4`
* New `lib/pinterest/compositing.ts` (`compositeCtaBanner(imageBuffer, text)`): reads the image's real dimensions via `sharp().metadata()`, composites an SVG banner (semi-opaque dark backdrop `rgba(17,17,17,0.62)`, bold white centered text) at a position/size always derived from the same ratios. Includes an overflow-safety heuristic that shrinks the font size when the estimated text width would exceed the banner — directly targets the truncation failure mode measured above (a fixed-width composited banner has the same overflow risk in principle; this guards against it deterministically instead of hoping)
* New `lib/pinterest/cta-messages.ts`: 4 short CTA variants per language (en/de/es/fr), static translated strings, never AI-generated. `pickCtaMessage(language, index)` rotates through them using the pin's position in the generation batch (`promisePool`'s existing `index` argument — no new data needed), same principle as the title-angle variation rule (v6). Old `lib/ai/prompt-engine/save-pin-message.ts` (single fixed message per language) deleted — fully superseded, zero remaining references
* `app/api/pinterest/generate-images/route.ts`: `compositeCtaBanner()` called on every generated image, both `visualFormat` `photo` and `text-overlay`, right after `generateImage()` and before the Storage upload — unconditional, no toggle, replacing the old in-prompt mechanism entirely
* `sharp` added to `package.json` direct dependencies — checked first and confirmed it was only present transitively via `next` (its internal image optimizer), never declared or imported by application code. Now imported directly in `lib/pinterest/compositing.ts`, so declaring it explicitly is required (a transitive dependency of a third-party package is not a stable thing to import against)
* **Verified with a real end-to-end regeneration, not a synthetic test**: same running app, same real user session, regenerated the exact same 10 pins from TASK-FIX-018's test ("cozy living room decor ideas", German, pure photo mode) via the real "Regenerate" flow (`POST /api/pinterest/generate-images` with all 10 `pinIds`), confirmed `image_model = black-forest-labs/flux.2-pro` on all 10 again. Downloaded and visually inspected all 10 resulting images (not a sample): **10/10 banners present, legible, and textually correct** — a clean jump from the 1/10 baseline. All 4 CTA variants observed rotating across the batch, confirming `pickCtaMessage()` works as intended
* Side observation, not a regression from this change: the visual card order shown to the user differs slightly between the original generation and the post-regeneration page reload for these particular 10 pins — traced to the original bulk insert giving several pins the exact same `created_at` timestamp, which Postgres does not order deterministically on ties. Pre-existing behavior (`ORDER BY created_at` with no tiebreaker, already used by both the pin listing query and the image-generation route), unrelated to CTA compositing or rotation, not fixed here since out of scope
* `docs/DATABASE.md` untouched by this task (no schema change) — `pin_images.image_model` documentation already covered under TASK-FIX-018 below
* `docs/DECISIONS.md`, `docs/CHANGELOG.md` updated. No `lib/guide/content.ts` change — the CTA banner was already documented there as an always-on feature (TASK-FIX-014); its rendering mechanism changing under the hood doesn't change what the user-facing Guide describes

---

## [TASK-FIX-018] Per-image AI model traceability (`pin_images.image_model`) — 2026-09-02

* No existing column tracked which AI model generated a specific pin image — `generations.model_used` only tracks the text model (FAST role) for the whole generation. Triggered by an illegible "Save the Pin" banner observed on a `photo`-mode pin, where it wasn't possible to confirm with certainty which model produced that specific image rather than assuming from current env vars (which can change over time)
* Migration 024: `pin_images.image_model text`, nullable (existing rows unaffected)
* `lib/ai/services/image.ts`: routing logic (`AI_IMAGE_MODEL` vs `AI_IMAGE_MODEL_TEXT` by `visualFormat`) extracted into exported `resolveImageModel(visualFormat)`, used internally by `generateImage()` (unchanged behavior) and called separately by the route right before `generateImage()` to capture the exact value to persist — a pure function of env vars + `visualFormat`, so both calls are guaranteed identical, not a guess
* `app/api/pinterest/generate-images/route.ts`: `image_model` included in every `pin_images` insert. `types/database.ts`: `PinImage.image_model` added
* `lib/queries/generations.ts`: new `activeImageModels` map (joined on `pin_images.is_active`), threaded through `EditorialWorkspace` → `PinTable`/`PinDetailDialog`
* UI: `PinDetailDialog` shows "Generated with: {model}" next to the Image Prompt section; `pin-table.tsx` shows a compact monospace label on each card (with a native tooltip)
* No other `generateImage()` call site affected (WordPress's `lib/wordpress/generate-article*.ts`) — `generateImage()`'s own signature is unchanged, only a new helper function was added alongside it
* Used immediately by TASK-FIX-019 above to confirm all 10 test images actually went through flux.2-pro before diagnosing the CTA banner defect
* `docs/DATABASE.md`, `docs/DECISIONS.md`, `docs/CHANGELOG.md` updated. No `lib/guide/content.ts` change — internal diagnostic/traceability data, not a user-facing capability

---

## [TASK-FIX-017] Pinterest ICPC framework for title/description (pinterest-pins-v5 → v6) — 2026-09-02

* Context: high impressions but low outbound clicks on generated pins — titles and descriptions were already answering their own promise in the text (the exact number/technique/answer was given away before the click), leaving no reason to leave Pinterest. Full rationale in `docs/DECISIONS.md` (2026-09-01)
* `lib/prompts/pinterest-pins.ts`, `PROMPT_ID` bumped `pinterest-pins-v5` → `pinterest-pins-v6`. Four scoped changes to the `Rules` block only:
  1. Title rule replaced with 5 named angles + one concrete example each (Curiosity, Problem→Solution, Listicle, Discovery, Article Promise) — main keyword still required naturally, 100-char limit unchanged
  2. New variation rule: the title angle must vary across the pins of a single generation, each angle used at most twice before repeating — same pattern as the existing image_prompt variation rule, applied to title angle instead
  3. Description rule replaced with the ICPC instruction: give enough to attract interest, never state the specific technique/number/answer the article reveals, end on an open loop only the click resolves; CTA must point toward discovery ("see how", "find out which"), never restate the content — 500-char limit unchanged
  4. New anti-leak guardrail appended to the Rules block: an explicit "before finalizing, verify title+description never together reveal the full answer — rewrite the description if they do" check
* Explicitly out of scope, verified untouched: niche `framingMode`/`styleGuidance` rules, text-overlay field instructions, image_prompt variation rule, and the entire `keywords` field (its field spec, no-duplicates rule, language rule, and JSON schema) — the Pinterest-internal keyword/SEO signal is independent of title/description and must not regress from this change
* **Validated with a real generation, not just a code review**: logged into the running app as a real user (Playwright-driven browser, real Supabase auth) and submitted the actual Pinterest Generator form — a genuine `POST /api/pinterest/generate` call through `generateText({ role: 'FAST' })`, i.e. real OpenRouter, real `gpt-5-mini` (`AI_FAST_MODEL`), real credits/generation/transaction flow, no mocking. One batch of 10 pins, keyword "modern kitchen ideas" (generated in German — the test account's default project language), German pin: `PROMPT_ID = pinterest-pins-v6`
* **Result, scraped from the real rendered page (all 10, not a sample)**: 10/10 titles+descriptions had no giveaway — no description named the specific technique, material, or number the article reveals; every description ended on an open loop ("klicken Sie, um ... zu entdecken/sehen/finden"). All 5 angles appeared across the batch (Problem→Solution, Listicle, Discovery, Curiosity, Article Promise), though distribution wasn't perfectly even (Listicle-leaning titles appeared ~4 times by a subjective read, since the model isn't asked to self-label its angle — noted as a known soft spot, not a failure, since the "no more than twice before repeating" rule is about avoiding an obviously repeated formula, which held). Main keyword concept present naturally in all 10 titles (translated, since output language ≠ input keyword language — expected, unrelated to this change). Keywords field: 10-15 relevant items per pin in the correct language, no duplicates observed — confirmed unaffected
* Baseline for comparison: if a future `pinterest-pins-v7` revisits this framework, this entry's 10/10 real-test numbers (angle distribution, spoiler count) are the number to beat, not just "the new prompt reads better"
* Checkpoint before this change: git tag `20260901` on `8dceaf7`, pushed to `origin`
* `docs/DECISIONS.md` (2026-09-01), `docs/CHANGELOG.md`, `lib/guide/content.ts` (Generate/Pinterest section — new bullet on the title/description click framework) updated. No DB/schema change, no new endpoint, no `docs/API.md`/`docs/DATABASE.md` change

---

## [TASK-FIX-015] Lifetime trial usage cap per account — 2026-08-28

* Lightweight, deliberately distinct from the future Credits System (TASK-011/012, still PLANNED, not built here) — protects against cost accumulation on test/trial accounts, doesn't attempt to replace future monetization. Full cost-math rationale and the distinction from Credits in `docs/DECISIONS.md` (2026-08-28 (3))
* `profiles` already existed, so per the task's own instruction, added `total_generations_used integer NOT NULL DEFAULT 0` directly on it (migration 023) rather than a new `trial_usage` table — checked first
* Migration 023 also adds `increment_trial_usage(p_user_id uuid) RETURNS integer`, same atomic UPDATE...RETURNING pattern as `increment_rate_limit()` (migration 010) — not `SECURITY DEFINER`, relies on the existing `profiles` RLS policy (`id = auth.uid()`)
* `lib/rate-limit.ts` (`checkRateLimit()`): new optional 6th parameter `{ enforceTrialLimit: true }`, opt-in per call site rather than baked in unconditionally — this check must NOT apply to every `checkRateLimit()` caller (`research`, `analyze`, `wordpress/publish`, `wordpress/sites/test`, `pinterest/reference-image`, `wordpress/generate-from-url` are all out of scope per the task). When enforced, the trial counter is checked (and incremented) only after the existing hourly window check has already passed — a request already rejected for hourly reasons never consumes trial budget. New `getTrialGenerationLimit()` export (reads `TRIAL_GENERATION_LIMIT`, defaults to 10) — single source of truth shared by the enforcement check and the dashboard banner. New `rateLimitErrorResponse()` export — the 4 call sites' identical `429 rate_limited` JSON block was duplicated verbatim across all of them; extracted once rather than copy-pasted a 5th/6th/7th/8th time, now also handles the new `403 trial_limit_reached` branch
* The existing TASK-029 bypass (`ADMIN_EMAIL` env check, then the `rate_limit_bypass` table via `is_rate_limit_bypassed()`) applies to the trial check exactly as it already did to the hourly one — both checks live in the same function, share the same early-return bypass path, no new bypass mechanism introduced
* Applied to the 4 endpoints from the task that actually exist: `pinterest/generate`, `pinterest/generate-images`, `wordpress/generate`, `wordpress/generate-from-pins`. The task's 5th endpoint, `wordpress/[id]/translate`, does not exist anywhere in the codebase (confirmed by search — no WordPress translation route has been built) — not invented; flagged instead of guessed or silently dropped
* Dashboard (`app/(dashboard)/dashboard/page.tsx`): new banner below the greeting/CTA row — "X / Y free generations used" with a small progress bar, switching to a destructive-styled "Free trial limit reached — contact {ADMIN_EMAIL}" once the cap is hit. Hidden entirely for exempt accounts, determined via the exact same two signals `checkRateLimit()` itself checks (`user.email === ADMIN_EMAIL`, `is_rate_limit_bypassed()` RPC) — not `profiles.role`, which the actual enforcement code never checks, to avoid the UI and the real enforcement disagreeing about who's exempt
* `types/database.ts`: `Profile.total_generations_used` added; `ProfileInsert`'s `Omit` list updated so the new column stays optional there too (defaults at the DB layer), matching the existing `credits_balance`/`plan`/`role` pattern
* `npx tsc --noEmit`, `npx eslint .`, and `npm run build` (production build, RULES.md Rule #32) all clean
* Migration 023 not applied by the agent — no DB DDL access (same constraint noted since TASK-FIX-007/DECISIONS.md), user applies it manually before testing
* `docs/DATABASE.md`, `docs/API.md`, `docs/DECISIONS.md`, `docs/CHANGELOG.md`, `.env.example` updated. No `lib/guide/content.ts` change — a trial/abuse-prevention mechanism, not a product capability to document for end users

---

## [TASK-FIX-014] "Save the Pin" call-to-action banner on every generated pin image — 2026-08-28

* Proposed by the user from a reference image (a pink ribbon "Save the Pin! So you can make it later!" banner). Asked first rather than assuming an approach: no image-compositing step exists anywhere in the pipeline today (pins are 100% AI-generated, including the existing title-hook `overlayText`, which is rendered by the image model itself, not layered on afterward via code). User chose the AI-prompt approach (matching the existing mechanism) over a fixed PNG/SVG layer composited post-generation via `sharp`, applied unconditionally to every pin — not a per-generation toggle
* `lib/ai/prompt-engine/engine.ts` (`buildImagePrompt()`): now appends a "render this exact banner text near the bottom edge" instruction to *every* pin's image prompt, regardless of `visual_format` — previously the only text-rendering instruction was the conditional title-hook one, gated to `visual_format === 'text-overlay'`
* New `lib/ai/prompt-engine/save-pin-message.ts`: the banner text is localized (en/de/es/fr, English fallback) rather than hardcoded, matching how every other piece of pin content (title, description, keywords) is already localized per pin's own `language`
* `PinterestPackage` (`engine.ts`) gained a `language: string` field — already present on the `Pin` row (`types/database.ts`) passed in by the only real call site (`app/api/pinterest/generate-images/route.ts`), so no schema change and no other call site to update
* `lib/ai/prompt-engine/presets.ts`: both `NEGATIVE_CONSTRAINTS` (photo mode) and `NEGATIVE_CONSTRAINTS_TEXT_OVERLAY` (text-overlay mode) previously banned this exact thing — "no text of any kind" / "nothing beyond the one requested hook" — so both had to be loosened to explicitly permit this one additional banner, or the new instruction would directly contradict the constraint sitting right below it in the same prompt. `IMAGE_PROMPT_ID` bumped to `v3` for this behavior change, following the project's existing prompt-versioning convention (`pinterest-pins-v5`, etc.)
* Known tradeoff of the chosen (AI-prompt) approach, not a bug: exact banner styling/position/legibility isn't guaranteed pixel-perfect on every generation, same caveat that already applies to the existing title-hook overlay. See `docs/DECISIONS.md` (2026-08-28 (2)) for the full option comparison
* `lib/guide/content.ts` (Generate/Pinterest section), `docs/CHANGELOG.md`, `docs/DECISIONS.md` updated. No DB/schema change

---

## [TASK-FIX-013] Collapsible Pinterest/WordPress sidebar groups — 2026-08-28

* No pre-existing `Collapsible`/`Accordion` wrapper in `components/ui/` — checked before building anything, per the task's instruction. Added `components/ui/collapsible.tsx`, thin wrapper over `@base-ui/react/collapsible` (`Root`/`Trigger`/`Panel`), same conventions as the existing `dropdown-menu.tsx` wrapper (`data-slot`, `cn`, pass-through props). Used two independent `Collapsible` instances (one per group) rather than Base UI's `Accordion`, since the task explicitly rules out accordion-style exclusivity ("pas un accordéon strict")
* `components/layout/sidebar.tsx` restructured: `Pinterest` group now Generate/Boards/History (Research pulled out); `WordPress` group reordered to Generate/History/Categories (was Generate/Categories/History) per the task's specified order. `Research` renders as a standalone flat link (no section label) between Workspace and the Pinterest group — deliberately not nested under Pinterest; see `docs/DECISIONS.md` (2026-08-28) for why (future "SPY Tools" module). Dashboard/Projects (Workspace), the disabled Platforms items, and Account are untouched, still flat
* Open/closed state persisted to `localStorage` (`omniflow:sidebar-groups`) via `useSyncExternalStore` rather than a `useEffect` + `setState` read — the project's ESLint config (`react-hooks/set-state-in-effect`) rejects the latter as a synchronous setState-in-effect anti-pattern; `useSyncExternalStore` is React's own recommended mechanism for reading an external store like `localStorage` and is what the lint rule is steering toward. The parsed snapshot is cached against the raw stored string so `getSnapshot` returns a stable reference when nothing changed (a hard requirement of the hook — an always-new object would loop-render)
* Auto-expand on the active route (point 4) is computed as *derived* render-time state, not stored: whichever group contains the current pathname is forced open in the rendered output, without writing that override back to `localStorage` — so visiting a WordPress page always shows the WordPress group open without silently overwriting a Pinterest collapse (or vice versa) the user set earlier elsewhere
* Panel expand/collapse animates via Base UI's `--collapsible-panel-height` CSS var (`h-(--collapsible-panel-height)` + `data-starting-style:h-0`/`data-ending-style:h-0`), the primitive's own documented pattern — not a generic fade, which wouldn't read correctly for a block of nav links sliding open
* Playwright MCP is still not connected in this environment. Unlike TASK-FIX-011/TASK-036, a local-Playwright authenticated session wasn't attempted this time: the project's global `proxy.ts` (Next.js's middleware successor, `lib/supabase/middleware.ts`'s `updateSession`) redirects *every* unauthenticated route except `/`, `/login`, `/register`, `/auth/callback` — confirmed by curling a throwaway public test page, which also redirected to `/login`. Reaching an authenticated session requires the Supabase admin API (`auth.admin.listUsers`/`generateLink`), which the auto-mode permission classifier blocked as a real-user-data action in the previous task; not retried here rather than working around that denial with a different tool. Verified instead by: (1) reading `@base-ui/react/collapsible`'s source directly (`Root`/`Trigger`/`Panel` contract, `data-panel-open`/`data-open`/`data-closed`/`data-starting-style`/`data-ending-style` attributes, `--collapsible-panel-height` var) rather than guessing the API; (2) a throwaway public Next.js page rendering the real `SidebarContent` component (deleted before finishing) exercised in a local Playwright/Chromium session — confirmed independent open/close toggling, `localStorage` persistence across a reload, and zero console/page errors; the active-route auto-expand path specifically could not be exercised this way (the throwaway route's pathname never matches a nav `href`) and was instead verified by code inspection (same `pathname.startsWith(href + '/')` pattern already proven correct for per-item active highlighting)
* `docs/DECISIONS.md` (2026-08-28) added for the Research placement call. `docs/CHANGELOG.md` updated. No `lib/guide/content.ts` change — internal navigation chrome, not a documented user-facing capability

---

## [TASK-FIX-012] User avatar dropdown menu — Settings link, Credits display, Sign Out — 2026-08-28

* The avatar (`components/layout/user-menu.tsx`) already had a working `DropdownMenu` (built in TASK-003, reused as-is per the task's instruction — no new dropdown component introduced) — user's report that it was "just a non-clickable circle" didn't match the code; the actual gaps were narrower: "Settings" was a `disabled` dead item, and Credits balance lived only in the Topbar header row, not inside the menu
* Added a Credits row inside the menu (`DropdownMenuLabel`, between the email and Settings), fed by the same `creditsBalance` prop the Topbar already receives from `profile.credits_balance` (`app/(dashboard)/layout.tsx`) — now passed through to `UserMenu` as well, not just displayed next to it. Left the existing header credits chip untouched (out of scope to remove it)
* Inline comment on the Credits block flags that `credits_balance` has no real deduction/balance logic behind it yet and stays display-only until [[TASK-011]] (Credits System) ships — so this doesn't get mistaken for a working balance later
* "Settings" changed from `disabled` to `router.push('/settings')`, matching the `onClick`-based navigation pattern already used by other `DropdownMenuItem`s in the codebase (e.g. `board-actions.tsx`) rather than introducing a `Link`/`render`-prop pattern not used elsewhere. Points at the existing `/settings` page, which stays an "Coming soon" `EmptyState` — not built out here, per the task
* Sign Out was already real (`supabase.auth.signOut()` then `router.push('/login')` + `router.refresh()`) — untouched
* Playwright MCP is not connected in this environment — flagged to the user upfront (same gap as TASK-FIX-011/TASK-036) rather than silently skipping or faking the requested before/after screenshots. User chose to test the rendered menu manually instead of a local-Playwright substitute this time
* `docs/CHANGELOG.md` updated. No `lib/guide/content.ts` change — the dropdown's contents (Settings, Sign Out) were already documented behavior; Credits display is explicitly non-functional pending TASK-011, not a shippable capability yet
* Follow-up same day: the `DropdownMenuLabel` added above threw `Base UI: MenuGroupContext is missing` at runtime — `Menu.GroupLabel` requires a `Menu.Group` (`DropdownMenuGroup`) parent, confirmed by reading `@base-ui/react`'s `MenuGroupLabel.js`/`MenuGroupContext.js` source directly. Fixed by wrapping both `DropdownMenuLabel`s (email, Credits) in their own `DropdownMenuGroup` in `user-menu.tsx`. The same unwrapped-`DropdownMenuLabel` bug was found (by inspection, not by a report) in `components/history/wordpress-usage-badge.tsx` and fixed identically. `DropdownMenuItem`/`DropdownMenuSeparator` confirmed to have no such context requirement (generic `Menu.Separator`, and `Menu.Item` already used bare elsewhere) — no other hidden Base UI structure errors in either menu

---

## [TASK-013] Image Analysis — 2026-08-02

* Out of DEFERRED — reused existing infrastructure rather than inventing new mechanisms: the VISION role and `analyzeImage()` (`lib/ai/services/vision.ts`) already existed since the AI Engine refactor, fully implemented but never called from any route; `generations.reference_image_url` / `pins.image_analysis` already existed since migration 001, never populated. A prior state-of-the-art report (same day) confirmed all of this before implementation started
* **Anti-copyright guardrail, structural not just instructional**: `imageStyleAnalysisSchema` (`lib/validations/vision.ts`) allows exactly 4 abstract fields — `colorPalette` (2-4 named colors), `materials` (2-4 materials/textures), `mood` (one short phrase), `lightingStyle` (one short phrase). No free-text `description`/`scene` field exists in the schema at all, so a response describing composition or object layout has nowhere valid to land — it fails `.safeParse()` before it can influence the Pinterest prompt, regardless of whether the model followed the prompt instructions. See `docs/DECISIONS.md` 2026-08-02 (4) for the full reasoning
* `lib/ai/prompts/vision-style-analysis.ts`: `buildVisionStyleAnalysisPrompt()` — instructions reinforcing the same intent in natural language ("Do NOT describe the composition... Do NOT describe this as a scene to recreate")
* `lib/vision/context.ts`: `buildImageAnalysisContext()` — deliberately the same shape as `buildAnalysisContext()` (TASK-024, Content Analyzer): pure `analysis | null → string`, empty string when null, safe to concatenate directly
* `lib/prompts/pinterest-pins.ts`: new optional `referenceStyleGuidance` on `PromptContext`, concatenated immediately after the niche's `styleGuidanceInstruction` (TASK-034) — additive, never a replacement; a generation can have both a niche art-direction convention and a reference image's style attributes at once
* Orchestration lives in `app/api/pinterest/generate/route.ts`, at the exact same spot `analysisContext` (TASK-024) is already built — same file, same pattern, right next to it. Best-effort: if `analyzeImage()` throws or the response fails schema validation, the error is logged and generation proceeds without `referenceStyleGuidance` — a reference image is a style enhancement, never a required input, and a VISION provider hiccup must not block the whole generation
* New upload path (no prior pattern existed in the app — every existing Storage upload was server-side from AI-generated buffers, never a user-submitted file): `components/pinterest/reference-image-upload.tsx` (drag-drop or click, JPG/PNG/WebP, 5MB max, preview + remove) → `POST /api/pinterest/reference-image` (auth required — 401 if no session, no separate ownership check needed since this creates a new object rather than modifying an existing one; 30/hour rate limit, its own since the VISION call itself already inherits `generate`'s existing 60/hour limit by living inside that route) → new `reference-images` Storage bucket (migration 021, same public/broad-authenticated-policy shape as `generated-images`/`wordpress-images`, no per-object RLS — consistent with every existing bucket), path `${user.id}/{uuid}.{ext}`, returns the public URL
* Optional field in `components/pinterest/pin-form.tsx`, under Board — `generatePinsSchema.referenceImageUrl` (URL, optional)
* **Empirical fix during verification**: `google/gemini-2.5-flash` (VISION role default) spends part of its token budget on internal reasoning before emitting visible JSON. The initially chosen `maxTokens: 400` reliably returned an empty response ("OpenRouter returned empty vision response"); reproduced at 600 and 800 too. Fixed at `maxTokens: 1200` after confirming 1000 was the empirical threshold across several real test images
* Verified: `analyzeImage()` exercised end-to-end (temporary debug route, removed after) against two real existing generated-image URLs already in this project's Storage — both produced valid, schema-passing, purely abstract JSON. Upload route tested end-to-end with a real file POST, correctly failed with "Bucket not found" since migration 021 isn't applied yet (expected — confirms the code path itself is correct)
* Migration 021 not applied by the agent — no DDL access (recurring constraint this session), user applies manually
* Known accepted gap: no delete route for an uploaded-then-removed reference image before generation — the component's remove button only clears local state, the Storage object stays orphaned. Documented as accepted minor debt in `docs/DECISIONS.md` rather than building a dedicated DELETE flow for this one case
* `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/CHANGELOG.md` updated

---

## [TASK-037] External Source → Original SEO Article (WordPress Generator Option 3) — 2026-08-12

* Full detail lives under "[TASK-028] WordPress Generator → Option 3 / TASK-037" in the ROADMAP section above — this entry exists so the feature has its own numbered record in Completed Tasks, same convention as TASK-032/TASK-035/TASK-036 (WordPress-related work that isn't folded only into the Option list)
* Reframed before implementation: `docs/TASKS.md` Option 3 changed from "Blog URL → Rewritten/Optimized Article" to "External Source → Original SEO Article" — the source (a scraped URL or pasted text) is research context only, never text to rewrite or paraphrase closely. See `docs/DECISIONS.md` 2026-08-12 (same anti-copyright/near-duplicate-content SEO rationale as the TASK-013 Image Analysis guardrail)
* New `lib/ai/prompts/source-context-summary.ts` extracts a structured `{ theme, topics, angles, keyPoints }` research index — explicitly instructed to never reproduce the source's sentences, structure, or phrasing. `sourceContextSummarySchema` (`lib/validations/wordpress.ts`) is a structural anti-reproduction guardrail (same philosophy as `imageStyleAnalysisSchema`, TASK-013): every field is a short-phrase array capped at 150 chars, no free-text excerpt field a copied sentence could land in intact
* New `lib/wordpress/generate-article-from-url.ts` reuses the exact same outline → full-article prompts/schemas/image pipeline as Option 1 (`generate-article.ts` — `TEXT_ROLE`, `WORDPRESS_IMAGE_CONFIG`, `OUTLINE_MAX_TOKENS`, `ARTICLE_MAX_TOKENS`, `ARTICLE_GENERATION_TIMEOUT_MS`, `applyOutlineTextLimits()` exported for reuse rather than duplicated) — only the `researchNotes` input differs: a generated source summary instead of user-typed notes. Orchestration itself is duplicated, not shared, matching the same "reasonable duplication over premature shared abstraction" convention already used for Option 4
* New `POST /api/wordpress/generate-from-url` (20/hour) — inserts `wordpress_generations` (`source_type: "url"`) with a placeholder `keyword` before any scrape/AI call, replaced with the AI-derived keyword (scraped title, or the summary's theme for pasted text) once generation succeeds
* Migration 022: `wordpress_generations.source_url` (nullable) — set only for link input, null for pasted text. No new `source_type` enum value, `'url'` already covers both sub-cases
* New `components/ui/checkbox.tsx` (wraps `@base-ui/react/checkbox`, same pattern as the other `components/ui/` primitives). `components/wordpress/article-form.tsx` gained a Source select (Keyword / External Source) with a Link/Paste-text sub-select and a required confirmation checkbox ("I confirm I'm using this content as research inspiration for an original article, not to reproduce it") gating submit
* Verified: `tsc --noEmit`, `eslint`, and `next build` all pass. The source-summary prompt was also exercised live (throwaway script, deleted after use) against a hand-written test article — output validated against the schema and manually checked for zero verbatim sentence reuse from the source
* Migration 022 not applied by the agent — no DDL access (recurring constraint this project), apply manually
* `docs/DATABASE.md`, `docs/API.md`, `docs/UI_UX.md`, `docs/CHANGELOG.md`, `docs/DECISIONS.md`, `lib/guide/content.ts` updated

---

## [TASK-036] Project Detail Page + clickable Project cards + expandable Brand Profile — 2026-08-02

* New `app/(dashboard)/projects/[id]/page.tsx`: header (name, niche, default language, Default badge), Brand Profile (via new `ExpandableText`, "Edit Project" button to the existing edit form), WordPress connection status (connected site URL, or a "Connect WordPress" link when none), quick stats scoped to this Project only (Pinterest generations via `generations.project_id`, WordPress articles via a two-step `wordpress_generations.project_id` → `wordpress_articles.generation_id` query — no `project_id` column on `wordpress_articles` itself, following the existing two-step-query convention from `lib/queries/wordpress-usage.ts` rather than an embedded inner-join filter), and Quick Links pre-filtered to this Project (`/history?project=`, `/wordpress/history?project=`, both existing query params; `/wordpress/categories#project-` — a same-page hash anchor rather than real filtering, since the Categories page already renders every project's section on one page)
* New `components/ui/expandable-text.tsx` — generic truncate-at-N-chars (default 200) with "Read more"/"Read less". Used on the detail page's Brand Profile, and reused with a second behavior on the Project edit form: an existing Brand Profile now starts collapsed as read-only `ExpandableText`, switching to the real editable `Textarea` (auto-focused) only once clicked into or "Read more" is clicked — a create-mode or empty Brand Profile skips this and is always directly editable
* `app/(dashboard)/projects/page.tsx` / new `components/projects/project-card.tsx`: the whole card is now a `Link` to `/projects/[id]` (markup extracted unchanged from the inline card that used to live in `page.tsx`). The existing "..." `ProjectActions` dropdown stays reachable without triggering the card's navigation — its wrapper `div` calls `preventDefault()`/`stopPropagation()` on click, same pattern used for nested-interactive-inside-a-link elsewhere in this codebase
* Caught during verification, not in the original request: `project-card.tsx` initially had no `'use client'` directive — since `app/(dashboard)/projects/page.tsx` is a Server Component, the card's `onClick` guard crashed `/projects` at runtime ("Event handlers cannot be passed to Client Component props"), a Next.js RSC boundary error `tsc`/`eslint` don't catch. Fixed by marking the card a Client Component (it needs the click guard, so this is the minimal client boundary, per CLAUDE.md's "Client Components only when needed")
* `components/wordpress/categories-manager.tsx`: each project's section got `id="project-{projectId}"` (plus `scroll-mt-6`) so the detail page's "Manage Categories" link lands on the right project
* Verified with a local Playwright install (Playwright MCP not connected in this environment, same substitute as TASK-FIX-011), authenticated via the established magic-link + `verifyOtp` + cookie-injection technique: card click → detail page navigation confirmed; "..." click → dropdown opens, no navigation (URL stays on `/projects`); detail page's Brand Profile (a real 3,296-character profile) renders collapsed with "Read more" and expands on click; edit form's Brand Profile renders collapsed (`#description` is not a `<textarea>` on load) and becomes a real, focused `<textarea>` after clicking "Read more"
* `docs/UI_UX.md`, `lib/guide/content.ts`, `docs/CHANGELOG.md` updated. No DB/schema change, no new API route — pure UI/query addition on existing tables
* Follow-up (same day): user reported Niche/Default Language "not showing" in the header. Verified first, not assumed — checked the fetch (`select('*')`, both columns present), the JSX (both already read and conditionally rendered), then confirmed live via DB query + Playwright screenshot: they were rendering, just as 12px muted text easy to miss next to the Edit Project button. Not a data bug. Upgraded to `Badge`-based chips (niche as the same primary-tinted pill used on the Project cards, language/Default via the existing `Badge` component) for visibility, keeping the same "render nothing, not a placeholder" behavior when null
* Second follow-up (same day): badges still lacked an at-a-glance meaning. Added `Tag` (Niche), `Globe` (Language), and `Star` (Default — same icon already used for "Set as Default" in `project-actions.tsx`, for consistency) to each. Default pulled out of the Niche/Language pill group — plain text+icon, no pill background, separated by a thin vertical divider (only shown when Niche or Language is also present) — since it's a status flag on the project, not a content attribute like the other two. Verified with a real before/after Playwright screenshot on "Blog_Home_Decor_Germany" (local Playwright, MCP still not connected in this environment): immediately legible, no hover/click needed

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
