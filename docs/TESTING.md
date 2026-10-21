# TESTING.md

# Testing Strategy

Objetivo:

Garantizar que cada funcionalidad funciona correctamente antes de considerarse completada.

Ninguna tarea puede marcarse como completada sin ejecutar las pruebas correspondientes.

---

# Testing Philosophy

Prioridades:

1. Funcionalidad
2. Seguridad
3. Integridad de datos
4. UX
5. Rendimiento

---

# Definition Of Done

Una tarea se considera terminada únicamente cuando:

* Código implementado
* Sin errores TypeScript
* Sin errores ESLint
* Pruebas ejecutadas
* Resultado validado manualmente
* TASKS.md actualizado

---

# Global Smoke Tests

Ejecutar antes de cada deploy.

---

## Authentication

### Login

Verificar:

```txt id="8mvnx6"
Usuario puede iniciar sesión
```

---

### Logout

Verificar:

```txt id="5lqdf6"
Usuario puede cerrar sesión
```

---

### Protected Routes

Verificar:

```txt id="hyq9v9"
Usuario no autenticado es redirigido
```

---

# Database Tests

---

## RLS Validation

Verificar:

```txt id="kkwyax"
Usuario A no puede acceder a datos de Usuario B
```

---

## Ownership Validation

Verificar:

```txt id="rl6ub9"
No se pueden consultar recursos ajenos
```

---

## Foreign Keys

Verificar:

```txt id="yc0gzs"
No existen registros huérfanos
```

---

# Projects Module

---

## Create Project

Verificar:

```txt id="b8n1ot"
Proyecto creado correctamente
```

---

## Update Project

Verificar:

```txt id="jshb0r"
Proyecto actualizado correctamente
```

---

## Delete Project

Verificar:

```txt id="ujdfje"
Proyecto eliminado correctamente
```

---

## Project Ownership

Verificar:

```txt id="qrlgbi"
No se pueden modificar proyectos ajenos
```

---

# Content Analyzer

---

## Analyze Button

Verificar:

```txt id="ca01an"
Botón "Analyze" visible tras un Research exitoso
Botón deshabilitado/spinner mientras se analiza
Panel estructurado (Theme, Category, Audience, Tone, Keywords, Summary) se muestra al finalizar
```

---

## Idempotency

Verificar:

```txt id="ca02id"
Re-analizar el mismo research result devuelve el análisis existente sin re-llamar a la IA
```

---

## Ownership & Status Guard

Verificar:

```txt id="ca03ow"
researchResultId de otro usuario es rechazado (400), no filtrado
research_results con status "failed" no puede analizarse
```

---

## Generation Wiring

Verificar:

```txt id="ca04ge"
"Continue to Generate" tras Analyze añade analysisId a la URL de /pinterest
Indicador "Using content analysis from Research" visible en el formulario de Pinterest cuando aplica
Pins generados reflejan el theme/audience/tone del análisis
```

---

## Backward Compatibility

Verificar:

```txt id="ca05bc"
Generación directa por keyword (sin Research/Analyze) sigue funcionando sin cambios
analysisId ausente no rompe la generación
```

---

# Pinterest Generator

---

## Required Fields

Verificar:

```txt id="7ubf8w"
Keyword obligatoria
Language obligatorio
Pins Requested obligatorio
```

---

## Generation Request

Verificar:

```txt id="cxqjvt"
Generación iniciada correctamente
```

---

## OpenRouter Response

Verificar:

```txt id="bvw7z4"
Respuesta JSON válida
```

---

## Pins Quantity

Verificar:

```txt id="x7gq8i"
1 Pin
5 Pins
10 Pins
20 Pins
30 Pins
```

Generados correctamente.

---

## Language Validation

Verificar:

```txt id="l7j3m2"
English
Deutsch
Español
Français
```

Contenido generado en idioma correcto.

---

## Character Limits

Verificar:

```txt id="rfjv7g"
Title <= 100
Description <= 500
```

---

## Keywords

Verificar:

```txt id="1ydk5m"
10-15 keywords relevantes
```

---

## Board Suggestion

Verificar:

```txt id="hfqudx"
Board generado correctamente
```

---

# Pinterest Renderer Reliability (TASK-FIX-025)

Automated, offline renderer suite:

```bash
npx playwright test --project=renderer
```

Coverage:

* Headline: short, medium, long, two lines, three lines, and explicit overlong failure.
* CTA: short and long; compact-template fallback.
* Templates: clean-band, ribbon, pill, torn-paper, corner-tag.
* Text: EN, DE, ES, FR and XML-special characters.
* Output: 1024x1536 and 1000x1500 PNG dimensions.
* Geometry: text bounds, inner template bounds, canvas bounds, line count, minimum font size.
* Static fixtures: light, dark, busy, minimal; no AI, network, database, or Supabase call.

Authenticated preview suite requires `PLAYWRIGHT_STORAGE_STATE` and `PLAYWRIGHT_PIN_GENERATION_URL`, and runs in both desktop and mobile Playwright projects. It verifies complete 2:3 images with `object-contain` in the Pin grid, detail dialog, and versions dialog. When credentials or a suitable generation are absent, these read-only browser tests are intentionally skipped.

Latest Phase 1 validation (2026-09-12): TypeScript OK, ESLint OK, renderer 10/10, global Playwright 10 passed / 18 skipped, production build OK, `git diff --check` OK, and a real manual rendering check OK.

---

# Pinterest Local Contrast + Safe Areas (TASK-FIX-026 / Phase 2)

The same offline command now runs 22 renderer tests:

```bash
npx playwright test --project=renderer --reporter=list
```

Phase 2 coverage:

* Very light and very dark images select `#141414` and `#FFFFFF` respectively.
* Top-light/bottom-dark and top-dark/bottom-light regions are measured independently.
* Busy-top/calm-bottom and calm-top/busy-bottom fixtures select the calmer readable zone.
* A high-variance full-frame fixture requires a bounded local overlay; uniform fixtures require none.
* Headline text remains inside 5% horizontal / 4% vertical safe areas at 1024×1536 and 1000×1500.
* The lower headline candidate remains above the fixed CTA in the real two-composition sequence.
* Final PNG dimensions remain unchanged.
* Phase 1 versus Phase 2 artifacts are written to the ignored `test-results/pinterest-phase2/` directory.
* The performance case writes `performance.json`; isolated reference result: 39.9 ms Phase 1 versus 98.4 ms Phase 2 (+58.5 ms, 2.47×). Guards: under 250 ms added and under 4×.

All fixtures are local SVGs and all analysis is Sharp-only. No AI, network, database, Supabase, upload, or authenticated browser session is involved.

Final automated validation (2026-09-12): TypeScript OK, ESLint OK, renderer 22/22, global Playwright 22 passed / 18 intentionally skipped, production build OK, and `git diff --check` OK. Manual validation on newly generated real Pins was completed 2026-09-12 before the Phase 2 commit.

---

# Pinterest Templates v2 (TASK-FIX-027 / Phase 3)

The offline renderer command now runs 27 tests:

```bash
npx playwright test --project=renderer --reporter=list
```

Phase 3 coverage:

* `editorial`, `minimal`, `split`, and `magazine` each register distinct Headline and CTA SVG/spec variants.
* Headline variants are intentionally taller than their matching CTA variants.
* Long English Headline text and a Spanish CTA fit without fallback at 1024×1536 and 1000×1500.
* Both text roles stay inside their measured text areas and the proportional safe area.
* The auto-positioned Headline remains above the fixed CTA for every v2 family.
* Final PNG dimensions remain unchanged.
* A deterministic 2×2 review sheet is written to the ignored `test-results/pinterest-templates-v2/templates-v2-contact-sheet.png` path.

Final Phase 3 validation (2026-09-12): TypeScript OK, ESLint OK, renderer 27/27, global Playwright 27 passed / 18 intentionally skipped, production build OK, `git diff --check` OK, generated contact sheet reviewed, and real generated-photo output manually approved before commit.

---

# Pinterest Strategy Engine (TASK-FIX-028 / Phase 4)

Focused command:

```bash
npx playwright test tests/renderer/pinterest-strategy.spec.ts --project=renderer --reporter=list
```

Coverage:

* `angle` is required and restricted to the five canonical values.
* Complete 5-pin batches require one occurrence of every angle; complete 10-pin batches require two.
* Valid 10-pin batches accept two distinct variants per angle.
* Missing angle coverage and titles that differ only by a minor modifier are rejected.
* Repeated promises/scenes within the same angle are rejected without penalizing normal shared niche vocabulary.
* Numbers plus multilingual free and beginner/easy claims are rejected unless source evidence confirms them.
* Each angle maps to the expected Templates v2 family, including niche-compatible fallback behavior.
* Prompt snapshots assert exact 5/10 distribution, grounded-claim rules, keyword distribution, and the structured JSON field.

The ten Strategy Engine cases are pure and offline: no Supabase, provider, image generation, renderer, storage, or authenticated browser session.

Current local validation (2026-09-12): TypeScript OK, ESLint OK, focused Strategy Engine 10/10, full renderer 44/44, production build OK, and `git diff --check` OK.

---

# Pinterest Auto Template Selection + Variation Engine (Phase 5)

Focused command:

```bash
npx playwright test tests/renderer/pinterest-auto-template-selection.spec.ts --project=renderer --reporter=list
```

Coverage:

* Every structured angle selects only from its mapped v2 family when that family is niche-compatible.
* Measured text-fit failure falls back to a readable neutral template; missing niche compatibility also has an explicit fallback reason.
* Five-pin batches use at least three template families and four template/position combinations on controlled fixtures.
* Ten-pin batches avoid duplicate angle/template/position combinations for both variants of every angle.
* Ordered input produces deterministic selections across repeated runs.
* Angle metadata preserves existing reference-style fields and safely ignores malformed or legacy values.
* The renderer honors the selected readable position and still reaches the Phase 2 contrast target.

The nine focused cases are local and offline. They use controlled Sharp fixtures and do not call Supabase, an AI provider, Storage, or a Vision API.

Current local validation (2026-09-12): TypeScript OK, ESLint OK, focused Auto Template Selection 9/9, full renderer 53/53, production build OK, and `git diff --check` OK.

---

# Pinterest Quality Gate Before Export (Phase 6)

Focused command:

```bash
npx playwright test tests/renderer/pinterest-quality-gate.spec.ts --project=renderer --reporter=list
```

Coverage:

* Explicit `PASS`, `WARN`, `RECOMPOSE`, and `FAIL` outcomes.
* Contrast below 4.5, text overflow, and safe-area violations.
* Angle/template incompatibility, excessive batch similarity, local complexity, and image/text balance signals.
* Successful local recomposition using the same input bitmap, without an AI generation dependency or network call.

The focused cases are pure and offline. The Quality Gate module does not import an AI engine, Supabase client, Storage client, or provider SDK.

Current local validation (2026-09-13): TypeScript OK, ESLint OK, focused Quality Gate 11/11, full renderer 64/64, production build OK, and `git diff --check` OK.

---

# Pinterest Manual Recomposition (Phase 7)

Focused command:

```bash
npx playwright test tests/renderer/pinterest-manual-recomposition.spec.ts --project=renderer --reporter=list
```

Coverage:

* The local recomposition module and route have no image-provider dependency.
* Explicit and automatic template/position choices pass through the existing selector and Quality Gate.
* The final safe fallback is returned when a requested layout is rejected.
* A new active image version is added while every prior version remains in history.
* Raw companion paths are derived deterministically without a database column.

The focused logic is offline. Supabase Storage/row activation remains covered by manual integration validation because it requires an authenticated project and a Phase 7 source companion.

Current local validation (2026-09-13): TypeScript OK, ESLint OK, focused Manual Recomposition 6/6, full renderer 70/70, production build OK, and `git diff --check` OK.

---

# Pinterest Live Recomposition Preview (Phase 8)

Focused command:

```bash
npx playwright test tests/renderer/pinterest-manual-recomposition.spec.ts --project=renderer --reporter=list
```

Coverage adds template/position preview-key invalidation, all four visible Quality Gate labels, `Apply` gating, and a guard proving the preview route contains no DB/Storage mutation or AI engine import. Existing Phase 7 cases continue to verify valid version creation and prior-version preservation.

Current local validation (2026-09-13): TypeScript OK, ESLint OK, focused Manual Recomposition + Live Preview 10/10, full renderer 74/74, production build OK, and `git diff --check` OK.

---

# Pinterest Creative Diagnostics & Batch Review (Phase 9)

Focused command:

```bash
npx playwright test tests/renderer/pinterest-creative-diagnostics.spec.ts --project=renderer --reporter=list
```

Coverage includes metadata parsing and legacy fallback, compact diagnostic fields, status/angle/template filters, five-angle coverage, ten-Pin layout diversity, repetition warnings, the Batch Review → Change layout hand-off, and persistence through the existing generation/recomposition routes.

The aggregation and filtering cases are pure and offline. Visual responsive behavior and authenticated Supabase persistence remain manual integration checks.

Current local validation (2026-09-13): TypeScript OK, ESLint OK, focused Creative Diagnostics 7/7, full renderer 81/81, production build OK, and `git diff --check` OK.

---

# Pinterest AI Integrated Generation Modes (TASK-041 Phase 2)

Focused command:

```bash
npx playwright test tests/renderer/pinterest-ai-integrated.spec.ts tests/renderer/ai-image-model.spec.ts --project=renderer --reporter=list
```

Coverage: request contract per mode (legacy default, Photo Only, AI Integrated, no client model/provider, `None` only for Subtitle/CTA, manual-angle and line-budget rules), exact/generated/none text resolution, inherited language, private metadata round trip, creative-format directions (Pattern Guide never invents steps, Editorial Story 75-80 % photo), the FAST prompt for integrated text, the integrated prompt's ban on any extra text and on renderer vocabulary, the Photo Only no-text constraint, static proof that the new-mode branch of the image route calls no SVG/Sharp composition while the legacy branch still does, recomposition gating, and the exact provider payloads (`aspect_ratio 2:3` + `quality high` for AI Integrated; unchanged bodies for Legacy/Photo Only).

All cases are offline: `fetch` is stubbed, no paid image request is possible. Text fidelity of a real generated image is a manual visual check — Sharp never reads typography.

Reference images (2026-09-21): AI Integrated accepts no `referenceImageUrl` (any URL, malformed URL, empty string or `null` is rejected with the exact message and path, before Vision or a provider), Photo Only stays reference-free, Legacy Composite (and payloads without `generationMode`) keep the existing reference behavior, static checks prove the Vision step is only reachable after validation and only for Legacy Composite, and the form offers/sends a reference only in Legacy Composite while showing the "coming soon" note in AI Integrated. All offline; no Vision or provider call.

Latest validation (2026-09-21): TypeScript OK, ESLint OK, renderer 178/178, production build OK. The continuation added offline checks for full metadata serialization, historical Pins without the private key, and clear generation-mode labels in the card/detail/review readers.

---

# Pinterest Generation Plan Parsing

Focused command:

```bash
npx playwright test tests/renderer/pinterest-generation-plan.spec.ts --project=renderer --reporter=list
```

Coverage: `parsePinterestGenerationPlan()` accepts a raw JSON plan, a Markdown `json` block and plain text around a complete object; rejects — without repairing — truncated JSON (the production `Unterminated string in JSON at position 11038` case), empty or non-JSON text, ambiguous text and syntactically valid JSON that fails the Zod contract; errors are generic with bounded, redacted diagnostics. Also covers the planning prompt's strict-JSON instructions, the larger token budget for AI Integrated only (`estimateMaxTokens`), and the real `POST /api/pinterest/generate` route executed with Supabase, the AI engine, the rate limiter and the board query replaced: an invalid plan returns 422 `invalid_pin_plan` in both AI Integrated and Legacy Composite, writes no pin, creates no board and calls neither an image provider nor `fetch`; valid plans still persist for both modes.

All cases are offline. `npm run test:renderer` is not defined in `package.json`; the equivalent is `npx playwright test --project=renderer`.

---

# Pinterest Image Metadata Stripping

Focused command:

```bash
npx playwright test tests/renderer/pinterest-image-metadata.spec.ts --project=renderer --reporter=list
```

Coverage: a PNG carrying a synthetic C2PA `caBX` chunk and an XMP `iTXt` chunk is re-encoded without either and with byte-identical pixels; a JPEG loses its EXIF block and a file flagged "rotate 90°" is rotated for real; the sanitizer still rejects non-2:3, empty, unreadable and unsupported (TIFF) images; and the real `POST /api/pinterest/generate-images` route, executed with Supabase, the rate limiter and the provider replaced, uploads a metadata-free image for AI Integrated and Photo Only (one file, no raw companion) while Legacy Composite stays metadata-free. With the fix reverted, the two new-mode route tests fail.

All cases are offline; no provider or network call is possible.

---

# Image Analysis

---

## Upload

Verificar:

```txt id="4u3m1z"
PNG
JPG
WEBP
```

Aceptados correctamente.

---

## Analysis

Verificar:

```txt id="xhj4l8"
Image Analysis generado
Image Prompt generado
```

---

## Invalid File

Verificar:

```txt id="y6rj7v"
Archivo inválido rechazado
```

---

# CSV Export

---

## Download

Verificar:

```txt id="4y7ec7"
CSV descargado correctamente
```

---

## Column Order

Verificar:

```txt id="yj2b5t"
Title
Media URL
Pinterest board
Description
Link
Publish date
Keywords or tags
```

---

## Encoding

Verificar:

```txt id="o7rlg5"
UTF-8 BOM
```

---

## Pinterest Compatibility

Verificar:

```txt id="z0qf3q"
CSV importable en Pinterest
```

---

# Credits System

---

## Sufficient Credits

Verificar:

```txt id="1n2h7u"
Generación permitida
```

---

## Insufficient Credits

Verificar:

```txt id="p5d8zj"
Generación bloqueada
```

---

## Credit Consumption

Verificar:

```txt id="t1j6n4"
Balance actualizado correctamente
```

---

## Transaction Log

Verificar:

```txt id="r7h4xa"
Movimiento registrado
```

---

# Stripe

---

## Checkout

Verificar:

```txt id="r9j2vx"
Checkout creado correctamente
```

---

## Successful Payment

Verificar:

```txt id="1w5qbg"
Créditos añadidos
```

---

## Failed Payment

Verificar:

```txt id="w0h7yb"
No se añaden créditos
```

---

# Storage

---

## Reference Images

Verificar:

```txt id="d3k8tx"
Imagen almacenada correctamente
```

---

## CSV Exports

Verificar:

```txt id="o6x1zp"
Archivo exportado correctamente
```

---

# Performance Tests

---

## Pinterest Generation

Objetivo:

```txt id="x8y7uq"
< 30 segundos
```

para 10 pines.

---

## Dashboard

Objetivo:

```txt id="l9g4mr"
< 2 segundos
```

para carga inicial.

---

# Pre-Release Checklist

Antes de producción:

```txt id="s4f6dx"
Auth Working
RLS Verified
Projects Working
Generation Working
CSV Export Working
History Working
Credits Working
Stripe Working
Storage Working
No TypeScript Errors
No ESLint Errors
```

---

# Rules For AI Agents

Antes de marcar una tarea como completada:

1. Implementar funcionalidad.
2. Ejecutar pruebas relevantes.
3. Verificar criterios de éxito.
4. Actualizar TASKS.md.

Si alguna prueba falla:

```txt id="6j8zvt"
La tarea NO está completada.
```

---

# TASK-FIX-043 — Planned streams + manual publishing activity

Focused command:

```bash
npx playwright test tests/renderer/stream-planned-and-activity.spec.ts --project=renderer --reporter=list
```

Offline (29 cases): `planned` validation, create and Planned → Warming / Active through `createContentStream` / `updateContentStream` (in-memory Supabase stub), no urgency / focus / active-project / weekly-target / coverage row for Planned streams, the Planned badge, the activity Zod schema, add / update (upsert, no duplicate) / note, ownership (403 / 404, nothing written), future dates refused, "Mark target met" = `target_pins_per_day`, external activity reaching Target met, Created / Planned counters unchanged, future planned Pins computed normally, and static checks of migrations 035 (unique key, `published_count >= 0`, source CHECK, RLS `WITH CHECK` on stream ownership) and 036.

Live RLS enforcement (a user B session cannot read or write user A's rows) needs a real Postgres and stays a manual check after applying 035/036. Gated browser cases (skip without `PLAYWRIGHT_STORAGE_STATE`): create a Planned stream and move it to Active (`tests/playwright/content-streams.spec.ts`), open / cancel the Publishing activity modal (`tests/playwright/dashboard.spec.ts`).

---

# TASK-FIX-054 — Manual external activity on any date, Europe/Madrid

Focused command (run it also with `TZ=UTC`):

```bash
npx playwright test tests/renderer/publishing-activity-madrid.spec.ts tests/renderer/publishing-coverage-expected.spec.ts tests/renderer/stream-planned-and-activity.spec.ts --project=renderer --reporter=list
```

Offline (`publishing-activity-madrid.spec.ts`, 17 cases): creation for yesterday / today (published) / tomorrow (expected, `published` refused), Madrid day keys vs UTC (summer and winter), 23:59:59 / 00:00 Madrid boundary for the API rule, grid first cell = Madrid today and recordable, week plan aligned, edit + delete for each of the three dates, confirm of today's expected entry, API validation (format, real date, count, status), ownership 403 / 404 on every date, `user_id` from the session, missing migration 038 → `503 schema_outdated` (PGRST204 and 42703), separate Published / Expected counters with unchanged OmniFlow planned counts, future published and stale expected entries ignored.

Manual: after applying 038, click today's, a future and (via API) a past cell; check the saved `activity_date` / `status` in `content_stream_publishing_activity`.

---

# TASK-FIX-053 — Expected (future) external publishing activity

Focused command:

```bash
npx playwright test tests/renderer/publishing-coverage-expected.spec.ts tests/renderer/stream-planned-and-activity.spec.ts tests/renderer/dashboard-coverage.spec.ts --project=renderer --reporter=list
```

Offline (`publishing-coverage-expected.spec.ts`, 26 cases): status per date (past / today = published, future = expected, `published` on a future day refused), creation for a past day, today and a future day, edit of a future entry on the same row, confirmation of today's expected entry as published, delete (one stream + day only, 404 when nothing, bad date refused), permissions (another user's stream refused for create and delete, nothing written or removed), confirmed / expected counters kept apart, a past expected and a future published entry ignored, no double counting with OmniFlow planned dates (planned count unchanged, credit capped at the day's gap), forecast improvement (coverage run, This week), static checks of migration 038 (status column + CHECK, no RLS / grant / unique / pins change, 035 untouched) and the DELETE route, and the grid cell props (all 14 cells clickable, future cells labelled "Plan external publishing", confirm flow on today's expected entry).

Live RLS enforcement still needs a real Postgres after applying 038. Gated browser case (skips without `PLAYWRIGHT_STORAGE_STATE`): a future coverage cell opens the Expected publishing modal and Cancel saves nothing (`tests/playwright/dashboard.spec.ts`).

---

# WordPress outline model (`AI_OUTLINE_MODEL`, 2026-09-26)

Focused command:

```bash
npx playwright test tests/renderer/wordpress-outline-model.spec.ts --project=renderer --reporter=list
```

Offline (10 cases, `fetch` stubbed — no network, no paid call, Supabase Storage stubbed): `getOutlineConfig()` with `AI_OUTLINE_MODEL` / `AI_OUTLINE_PROVIDER`, provider fallback to FAST, full fallback to the FAST config when `AI_OUTLINE_MODEL` is unset / empty / whitespace, FAST unaffected; a keyword generation (`generateWordPressArticle`) and a pins generation (`generateArticleFromPins`) send the outline to `AI_OUTLINE_MODEL` and the article + external link to `AI_FAST_MODEL`, log both models without the API key, keep the same output contract (outline fields, resolved image markers); an invalid outline from the outline model is still rejected by the unchanged Zod schema before any article call. Without `AI_OUTLINE_MODEL`, both steps use `AI_FAST_MODEL` (no regression).

---

# WordPress pipeline P0 quality (TASK-FIX-044, 2026-09-26)

Focused command:

```bash
npx playwright test tests/renderer/wordpress-pipeline-quality.spec.ts tests/renderer/wordpress-outline-model.spec.ts --project=renderer --reporter=list
```

Offline (25 cases, `fetch` stubbed — no network, no paid call, Supabase Storage stubbed): real keyword and Brand Profile / research notes / type / tone / POV / country / SEO keywords in the article prompt (keyword method), URL method wiring, `generations.keyword` first for Pins with `deriveThemeKeyword()` fallback and the route reading it; no web-search instruction and no invented URL allowed; meta/slug rules only in the outline; anti-fabrication and editorial rules in the three prompts; small / medium / large section and word ranges (and the default); H3 and disabled-block toggles; FAQ rendered once at the marker when enabled, absent when disabled, without H3 when `includeH3 = false`; `insertFaqSection()` edge cases; Pinterest images reused unchanged (one featured image generated/uploaded); keyword-method image regression; `insertLinkAtAnchor()` / `addExternalLink()` never rewriting the article.

Validation (2026-09-26): TypeScript OK, ESLint (touched files) OK, WordPress renderer specs 44/44, full renderer 341/342 (one pre-existing Pinterest failure in `pinterest-text-importance-none.spec.ts`, reproduced without this change), production build OK, `git diff --check` OK.

---

# WordPress Article Quality Gate V1 (TASK-FIX-045, 2026-09-26)

Focused command:

```bash
npx playwright test tests/renderer/wordpress-quality-check.spec.ts --project=renderer --reporter=list
```

Offline (21 cases): a clean fixture passes all 17 checks in a fixed order; aggregate status (failed > warning > passed) and `qualityIssues` / `warnings`; one or more failing/warning variants per check (word count for small/medium/large/default with tolerance, H1, H2, H3 toggles, FAQ toggle and duplicates, `{{FAQ}}`/`{{IMAGE_N}}` leftovers, first sentence, unauthorized links and bare URLs, meta title/description lengths, slug, `finish_reason` length/missing, generic phrasing, repetition, image markers, disabled Key Takeaways/Conclusion/table/blockquote, language); an end-to-end keyword generation (`fetch` + Storage stubbed) where a `finish_reason: "length"` article call yields `truncation = failed` while the article is still returned; static check that the three routes return `quality`.

Validation (2026-09-26): TypeScript OK, ESLint (touched files) OK, spec 21/21, full renderer 362/363 (same pre-existing `pinterest-text-importance-none.spec.ts` failure), production build OK, `git diff --check` OK.

---

# WordPress Quality Report V1 display (TASK-FIX-046, 2026-09-26)

Focused command:

```bash
npx playwright test tests/renderer/wordpress-quality-report.spec.ts --project=renderer --reporter=list
```

Offline (12 cases): migration 037 is the latest and only adds `quality_report jsonb` (nullable) to `wordpress_generations`; no tracked migration modified (`git diff`); `parseQualityReport()` round trip and rejection of null / malformed values; `saveQualityReport()` payload and never-throw behavior (missing column, network error); the three routes save after `status = completed` and never inside that update; `getWordPressArticleByGenerationId()` returns the validated report or `null` (in-memory Supabase stub); the card's display model (status label/tone, summary and plurals, labels, unknown keys); static checks that the card uses the model, has no button/form/link, is not a client component, and that the review page renders it while the publish route ignores it.

Playwright's runner rewrites JSX in imported `.tsx` files, so the card is not server-rendered in this suite; its labels and counts live in `lib/wordpress/quality-report-view.ts`. Manual check after applying 037: generate an article, open `/wordpress/[id]`, expand "All checks".

Validation (2026-09-26): TypeScript OK, ESLint (touched files) OK, spec 12/12, full renderer 374/375 (same pre-existing `pinterest-text-importance-none.spec.ts` failure), production build OK, `git diff --check` OK.

---

# WordPress method A — Pins → article coherence (TASK-FIX-047, 2026-09-26)

Focused command:

```bash
npx playwright test tests/renderer/wordpress-pins-coherence.spec.ts --project=renderer --reporter=list
```

Offline (18 cases, fetch stub, no network, no database): `generations.keyword` first and `deriveThemeKeyword()` fallback; title, description, keywords, `overlay_text`, `image_analysis` summary, board, board section, Content Stream, `link_url`, research notes and Brand Profile in the outline and the article prompts; board/section/stream framed as theme only; `link_url` as the only Pin URL (accepted by the Quality Gate, never inserted by code); no URL in the prompts without `link_url` and an invented one flagged; invalid `link_url` dropped; `promise` requested and required by the pins outline schema, passed to the article with the coherence rules; injected instructions kept inside one `<pins_context>` block; Pinterest images reused unchanged (one image call, only `FEATURED.png` uploaded); no style notes when `image_analysis` is absent; one Pin and several Pins in order; method B prompts and sources without Pins context; route source checks. The existing pins fixtures of `wordpress-pipeline-quality.spec.ts` and `wordpress-outline-model.spec.ts` now carry a `promise`.

Validation (2026-09-26): TypeScript OK, ESLint (touched files) OK, spec 18/18, WordPress specs 95/95, full renderer 392/393 (same pre-existing `pinterest-text-importance-none.spec.ts` failure), production build OK, `git diff --check` OK. A real Pins generation is still needed to judge output quality.

---

# Collapsible Quality report + method A External URL (TASK-FIX-048, 2026-09-26)

Focused command:

```bash
npx playwright test tests/renderer/wordpress-quality-report.spec.ts tests/renderer/wordpress-pins-coherence.spec.ts --project=renderer --reporter=list
```

Quality report (4 new cases, plus the updated card/page checks): default open state (Passed collapsed, Warning / Failed / no report open); storage key per `generationId` and value round trip; toggle button with `aria-expanded` / `aria-controls` and a `hidden` panel, `useSyncExternalStore` with a `null` server snapshot, guarded storage and in-memory fallback; export / copy / publish / category rendered outside the card. The old `not.toMatch(/<(button|…)\b/)` assertion carried a literal backspace instead of `\b` and could never fail — fixed. The card is not rendered in this runner (JSX), so the open/close click itself is covered by source checks; a manual check on `/wordpress/[id]` is still recommended.

External URL (8 new cases): schema (optional, blank → none, http/https only, clear error); form → route → generator wiring and storage in `manual_external_urls`; prompt wording (relevant only, at most once, exact copy) and Quality Gate acceptance; never linked twice even when the model or the verified-source pass repeat it; a URL equal to a Pin `link_url` listed once; no External URL keeps the automatic verified source; `keepFirstLinkOnly()`; method B keeps its Manual URLs field and schema.

Validation (2026-09-26): TypeScript OK, ESLint (touched files) OK, both specs 42/42, full Playwright 404 passed / 88 browser cases skipped (no `PLAYWRIGHT_STORAGE_STATE`) / 1 failed (same pre-existing `pinterest-text-importance-none.spec.ts`), production build OK, `git diff --check` OK.

---

# Pinterest History — source WordPress article badge (TASK-044 follow-up, 2026-09-27)

```bash
npx playwright test tests/renderer/pinterest-history-wordpress-source.spec.ts --project=renderer --reporter=list
```

Offline (15 cases, in-memory Supabase fake recording each query): generation from an article → title + `/wordpress/[id]`; keyword and legacy rows → no entry; missing article row → unavailable; user isolation (another user's article never exposed, `user_id` filters on both owned tables); no N+1 (exactly 3 queries for 26 rows, 1 when nothing is linked, 0 for an empty page); column error (040 not applied) → empty map; badge display (label, link, unavailable without link, keyboard / screen-reader markup, long-title truncation); wiring in the history page / table; reverse-flow helper and badge untouched.

Validation (2026-09-27): TypeScript OK, ESLint (touched files) OK, spec 15/15, full renderer 688/689 (same pre-existing `pinterest-text-importance-none.spec.ts` failure), production build OK, `git diff --check` OK. Not checked in an authenticated browser (no session in this environment).

# Social Content Studio — Pinterest from a WordPress article (TASK-044 phases 1-2, 2026-09-27)

```bash
npx playwright test tests/renderer/social-content-studio.spec.ts --project=renderer --reporter=list
```

Offline (45 cases; the AI text service is an injected stub, Supabase an in-memory fake recording every operation and write payload — no network, no database, no AI call): platform config and the Studio card (Pinterest is a link to `/pinterest/create?source=wordpress&articleId=…`, no fetch; unavailable platforms disabled with no handler); phase 1 endpoint removed; `/pinterest/create` guards (source, UUID, ownership + completion, error state, no AI on load, real boards / Content Streams, result only for an owned generation of the same project); form pre-fill (keyword, language, 5 Pins, article id, no website / Pinterest URL / analysis, no destination field, no free-text board); request schema (article id, every existing Pin count up to 30, URLs / analysis refused with the article, keyword flow unchanged, real board); generation route reuse (article loaded before the AI call, same prompt builder / parser / safeguards, distinct angles, `withoutUrls`, no `link_url`, no board creation, best-effort source id, no write on WordPress tables); article context (all fields, user keyword, no permalink / image URL / bare URL / domain in the full prompt, excerpt stripped, model URLs removed); distinct angles below 5; board pre-selection vs suggestion and `create: false` writing nothing; ownership (another user's article / project, 404, 409, Pins-method keyword); Pin edit (only title / description / keywords written, other user forbidden with no write, schema limits); single-Pin regeneration (same prompt with 1 Pin, same angle, siblings passed, AI Integrated via Manual strategy with stored settings, wrong angle / invented number / near-duplicate refused, provider and plan errors, checks before any write, one `pins` update without link / board / image / schedule keys, article untouched); result cards (fields, labels, no "not saved", every action, confirmed batch images); Copy full Pin without link; CSV exporter unchanged (empty Link column when no link, stored link otherwise).

The gated browser spec `tests/playwright/wordpress-social-content.spec.ts` (needs `PLAYWRIGHT_STORAGE_STATE` + `PLAYWRIGHT_WP_ARTICLE_ID`; `/api/pinterest/generate` always mocked) covers the six platform cards, no request from unavailable platforms, the redirect with pre-filled keyword / 5 Pins / no destination field and no API call, the Generate Pins payload (article id, no URL) and the error state for an unknown article.

Validation (2026-09-27): TypeScript OK, ESLint (touched files) OK, spec 45/45, full renderer 673/674 (same pre-existing `pinterest-text-importance-none.spec.ts` failure), browser projects 106 skipped (no session / article id in this environment), production build OK, `git diff --check` OK. No real AI generation run; migration 040 not applied by the agent.

# WordPress blog-post form — array payload fix + required fields (TASK-FIX-056, 2026-09-27)

```bash
npx playwright test tests/renderer/wordpress-article-form-validation.spec.ts --project=renderer --reporter=list
```

Offline (29 cases, pure Zod + helpers + source assertions — no Supabase, no AI call, no browser): reproduction of "Invalid input: expected string, received array" with the previous string-only `manualExternalUrls` schema (client parse → JSON → server re-parse); the fixed schema survives that round trip with and without URLs; string payload, array payload, empty values, invalid / too many URLs in both shapes, wrong types with a readable message; `seoKeywords` stays an array and `researchNotes` / `hookBrief` stay strings; every required field (Project, Language, Primary keyword; Source URL / Pasted text for the URL method) with its message; first invalid field in page order; optional fields stay optional; a fully valid form; URL and Pins methods round trip (non-regression); raw Zod messages replaced; routes use `formatArticleValidationError()`; `*` markers, `aria-required` and inline error slots wired in the form.

The gated browser spec `tests/playwright/wordpress-blog-post.spec.ts` gets three new cases (inline error + focus + no request on an empty keyword, Advanced Options opened on an invalid manual URL, `*` legend and `aria-required`) and the renamed "Primary keyword is required" message; it needs `PLAYWRIGHT_STORAGE_STATE`.

Validation (2026-09-27): TypeScript OK, ESLint (touched files) OK, spec 29/29, full renderer 629/630 (same pre-existing `pinterest-text-importance-none.spec.ts` failure), production build OK, `git diff --check` OK. The real controlled generation was **not** run by the agent (no authenticated session available; creating one with the service-role key was refused) — to be done by the founder from `/wordpress/blog-post`.

# WordPress — structured FAQ and FAQPage schema (TASK-FIX-055, 2026-09-26)

```bash
npx playwright test tests/renderer/wordpress-faq-schema.spec.ts --project=renderer --reporter=list
```

Offline (23 cases, Supabase stubbed in memory, WordPress a stubbed global `fetch` — no database, no network, no AI call): migration 039 (single nullable `faq jsonb` column, nothing else); Zod structure (missing / blank / wrong-type fields, non-array, max 20); `parseStoredFaq()` (null = legacy, invalid → [], trimmed); `applyFaqSection()` renders one section and returns exactly the rendered items, [] when disabled or when the model wrote its own FAQ; `saveArticleFaq()` write, missing column / network error / invalid data never thrown and logged without content; jsonb round trip through `getWordPressArticleByGenerationId()`; the three generate routes save after the insert; legacy fallback (H3 section only, no plain-paragraph or unanswered question); `resolveArticleFaq()` precedence; JSON-LD content (plain text, links as anchors, no URL but `@context`), `</script>` / `&` / U+2028 escaping that still parses back; existing Rank Math / Yoast FAQ block or FAQPage detection; absent / empty / invalid / disabled / existing / not-visible → no schema; one FAQPage for stored and legacy articles, and after an external link lands in an answer; HTML and Markdown exports unchanged with no JSON-LD; publish with one script after the body and Rank Math saved, republish never stacks a second schema, kses-filtered or unverifiable script → post re-sent without it + warning, no schema when none decided, Rank Math failure never blocks; route wiring.

Validation (2026-09-26): TypeScript OK, ESLint (touched files) OK, spec 23/23, WordPress suites (pipeline quality, quality check, quality report, pins coherence, internal links, export internal links, publish SEO) 195/195, full renderer 577/578 (same pre-existing `pinterest-text-importance-none.spec.ts` failure), production build OK. Not checked on the real WordPress site (script kept after save, Google Rich Results test) — manual check after applying 039.

# WordPress export — internal links in Copy Markdown / Copy HTML (TASK-FIX-052, 2026-09-26)

```bash
npx playwright test tests/renderer/wordpress-export-internal-links.spec.ts --project=renderer --reporter=list
```

Offline (28 cases, WordPress is a stubbed global `fetch` — no network, no database, no AI call): HTML export with `<a href>` links; Markdown export with `[anchor](url)` links and no HTML, differing from the original only by the inserted links; external links, images, figures, tables, quotes, code (fenced, indented, inline), ATX / setext headings, HTML blocks and FAQ (with and without H3) unchanged, a later H2 eligible again; one link per paragraph, no duplicate URL or post; max 3 (small) / 5 (medium, large); paragraphs with a link, autolink or bare URL skipped; parentheses encoded in Markdown URLs; option off → original export and no WordPress call (both formats); no site → skipped; new blog without posts and no relevant post → original export with the right informative message; WordPress API error → original export + non-blocking warning; success message with the link count; no content or credentials in logs; current article excluded; external post URL ignored; tags looked up, never created, nothing written to WordPress; stored article never modified; Keyword / Pins (source Pinterest keyword) / URL methods; wiring — the review page never computes links on render and always shows the copy buttons, the option is on by default and skips the request when off, the export route validates auth / Zod / ownership and writes nothing.

The existing `wordpress-internal-links.spec.ts` (43) and `wordpress-publish-seo.spec.ts` (36) still pass after the placement engine was shared between HTML and Markdown.

Validation (2026-09-26): TypeScript OK, ESLint (touched files) OK, spec 28/28, WordPress internal-links + publish SEO specs 79/79, full renderer 511/512 (same pre-existing `pinterest-text-importance-none.spec.ts` failure), production build OK, `git diff --check` OK. The authenticated browser tests stay skipped without `PLAYWRIGHT_STORAGE_STATE`; clipboard behavior in a real browser is a manual check.

# WordPress media reuse (TASK-FIX-060, 2026-10-11)

```bash
npx playwright test tests/renderer/wordpress-media-reuse.spec.ts --project=renderer --reporter=list
```

Offline (24 cases; WordPress — two sites — and image storage are a stubbed global `fetch`, Supabase an in-memory `wordpress_media_assets` enforcing the `(wordpress_site_id, source_asset_key)` unique key and the conditional claim updates — no network, no database, no AI call): source keys (Supabase public / sign / render / encoded URLs, other Supabase host, same file name in another folder, CDN origin = same key, foreign URL fallback without query, invalid / `data:` URLs, no `..`); first publish → one upload per image, mapping complete (id, URL, hash, claim cleared) when the post is written; second publish → no `POST /wp/v2/media`, same `featured_media`, same internal URLs, one `GET /wp/v2/media/<id>` per image; featured alone and internal alone reused; same image in two articles of one site; same image on two sites (one upload and one row per site, site B never checks site A's ids); same file name, different key → two uploads; rewritten version (copied path, same bytes) reused via `source_hash`; Keyword / Pins / URL; attachment deleted (404) or no longer an image → one new upload, mapping updated, no DELETE, no warning; re-upload failing → featured warning, claim freed, row kept; first upload failing → own claim row removed, Storage URL kept, next publish uploads; media check timeout / 5xx → reused unverified, no upload, no warning; connection edited to another site URL → not reused; two simultaneous publishes → one upload per image, same attachment; unique collision → re-read and reused; stale claim taken over, fresh claim waited for then given up without uploading; migration 043 absent → all images uploaded, publish OK, one `unavailable_migration_043_not_applied` log; no store / broken store → post still published; Supabase → CDN switch keeps the mapping, undeclared CDN URL reused by hash; logs without password, auth header, URLs or content; migration 043 static checks (only 043, unique key, columns, RLS `WITH CHECK` on site ownership, no change to other tables); route wiring. Uploads avoided in the spec: 26.

`wordpress-seo-alt-outbound.spec.ts`: one source assertion adapted to the new upload call in `publish-media.ts`.

Manual, after applying migration 043 in the Supabase SQL Editor: publish an article as Draft, note the Media Library count, then Publish Now — the post is updated and the Media Library gets no new item; logs show `media_featured … result=reused`. Delete the featured image in WordPress and publish again — one new item, `wordpress_media_assets.wp_media_id` updated. Before 043: same behavior as before (every publish uploads) plus the `unavailable_migration_043_not_applied` log line.

# WordPress publish — time budget (TASK-FIX-059, 2026-10-09)

```bash
npx playwright test tests/renderer/wordpress-publish-budget.spec.ts --project=renderer --reporter=list
```

Offline (20 cases, WordPress = a stubbed global `fetch` whose routes answer after real delays that honour the request's `AbortSignal`; the budget is scaled to 3 s so the suite runs in ~13 s — no network, no database, no AI call): budget deadlines derived from `maxDuration` (25 / 45 / 51 s for 60 s) and the limiter's minimums; concurrency helper (cap 3, order kept) and `withDeadline`; `budget` error kind never uncertain; media placeholder tokens (12 images, no prefix clash, every token resolved, images not in the content skipped); featured image slow but in time → uploaded; featured image timeout → post created without `featured_media` + warning, bounded by the preparation deadline; ≤ 3 uploads in flight, a slow internal image keeps its Storage URL; slow tags → post in time, `TAGS_TIME_LIMIT_WARNING`; slow internal links → skipped + warning; links run in parallel with media; everything optional slow → post created before expiry with all warnings; budget exhausted before creation → nothing sent, real failure; slow Rank Math → id saved first, warning; FAQ filtered with no time to re-send → warning, the retry fixes it on the same post; retry after a publish without featured image → same post updated, existing featured image untouched, no duplicate; existing post adopted under budget; Keyword / Pins / URL non-regression; client headlines (success / with warnings / uncertain / failure, 504 non-JSON, network error); route wiring (budget from `maxDuration`, no inline upload, no featured failure path, lock released in `finally`, `maxDuration` still 60).

Validation (2026-10-09): TypeScript OK, ESLint (touched files) OK, new spec 20/20 (3 consecutive runs), full renderer 907/908 (same pre-existing `pinterest-text-importance-none.spec.ts` failure), production build OK, `git diff --check` OK.

Manual, minimal real test (no AI call): on one article, Save as Draft and read the Vercel logs `[wordpress publish] attempt=…` (`media_featured`, `media`, `tags`, `internal_links`, `post_create`, `rank_math`, `publish_end` with `ms=`) — `publish_end` must stay under ~55 000 ms; then Publish Now on the same article — the same WordPress post id is updated, no new post, no `-2` slug.

# WordPress publish — idempotency, lock, uncertain outcomes (TASK-FIX-058, 2026-10-06)

```bash
npx playwright test tests/renderer/wordpress-publish-idempotency.spec.ts --project=renderer --reporter=list
```

Offline (34 cases, WordPress = a stateful stubbed global `fetch` that can commit a post and still lose the answer; Supabase = an in-memory stub evaluating the lock's conditional UPDATE — no network, no database, no AI call): id saved before Rank Math; creation then FAQ re-send failure (id kept, retry updates the same post) and re-send timeout (uncertain with the id); creation then Rank Math timeout / 403 (id kept, warning); answer lost after commit by timeout, network error, invalid 2xx JSON and 5xx → reconciled, adopted, one creation, retry updates; invalid 2xx with failed lookup → uncertain, never a raw `SyntaxError`; timeout with the post landing late → uncertain, then the retry adopts it (no duplicate); 5xx with the post absent → real failure; existing exact match adopted before creating; same slug / other title never adopted; id held by another article or unverifiable claim never adopted; existing duplicates: oldest adopted, nothing deleted; lookup failure → normal creation; known id: plain update, update timeout uncertain with the id, 404 → one fresh creation; slug decoding / title trimming; Keyword, Pins and URL methods (focus keyword, Rank Math unchanged); concurrent publishes → one lock, the other busy (409), one creation; stale lock taken over, fresh lock busy; migration 042 absent → `unavailable`, nothing written, publish still reconciles; stale `publishing` shown as uncertain; claimed-id query scoped to the project; client: non-JSON 504 and network error → uncertain, 409 / uncertain / failed / success told apart, `finally` releases the button, double-click guard; route wiring (lock, 409, 504, every terminal write releases the lock and keeps the id); logs carry attempt / step / ms / http / wp_post_id and never the password, the auth header or the content; migration 042 is the only 042 and only adds the column.

Manual, after applying migration 042 in the Supabase SQL Editor: (1) publish a draft, then simulate a lost answer (e.g. a very slow site or a network cut during "Publishing...") and publish again — the same WordPress post must be updated, no `-2` slug created; (2) open the article in two tabs and click Publish in both — one gets "Another publish of this article is already in progress". Before 042, (2) is not protected; (1) still is.

# WordPress publish — automatic internal links (TASK-FIX-051, 2026-09-26)

```bash
npx playwright test tests/renderer/wordpress-internal-links.spec.ts --project=renderer --reporter=list
```

Offline (43 cases, the WordPress site is a stubbed global `fetch` — no network, no database, no AI call): published posts request (`status=publish`, `_fields` without content), published-only filter, rendered-title decoding, pagination (short page stops, full pages followed, later page failure keeps loaded posts), exclusion of the post being updated (id and slug), external / invalid / `javascript:` / relative URLs ignored with a warning, URL policy (www, port, base path, credentials); selection by primary keyword, SEO keywords, H2/H3 words, categories and tags (taxonomy never enough alone); no match → HTML byte-for-byte unchanged; generic anchors refused; max 3 (short) / 5 (medium, long) links; one link per paragraph; no duplicate URL or post, URL already linked skipped; no link in H1/H2/H3, FAQ (with and without H3), images/figures, existing external or internal links; entities, inline markup and attributes preserved; accent/case-insensitive matching keeping the original text; escaped href; API error / unreachable site / no posts non-blocking; no content or credentials in logs; publish flow opt-in, Keyword / Pins (source Pinterest keyword, never the pin-title label) / URL methods, draft / publish / future with date, API failure still publishes, no self-link on update.

Validation (2026-09-26): TypeScript OK, ESLint (touched files) OK, spec 43/43, WordPress publish SEO spec unchanged, full renderer 483/484 (same pre-existing `pinterest-text-importance-none.spec.ts` failure). Not yet checked against a real WordPress site.

# WordPress publish — slug, excerpt, tags, Rank Math (TASK-FIX-049 / TASK-FIX-050, 2026-09-26)

```bash
npx playwright test tests/renderer/wordpress-publish-seo.spec.ts --project=renderer --reporter=list
```

Offline (36 cases, the WordPress site is a stubbed global `fetch`, Supabase stubbed — no network, no paid call): post payload (H1 `title`, `excerpt` = meta description, explicit `slug`, categories, featured image, draft / publish / future + date), update of the existing post and 404 fallback; tags from `seo_keywords` → Pin keywords → focus keyword, existing tag reused, missing tag created, refused creation skipped, no minimum, max 8, duplicates / empty / over-long / placeholder / pin-title label dropped, post sent without tags + warning; focus keyword per method (Keyword user keyword, URL resolved keyword only when completed, Pins source Pinterest keyword, never the pin-title concatenation, empty + warning when unreliable); `getPinsSeoSource()` order and shared keyword; Rank Math `updateMeta` payload, absent / route missing / HTTP error never blocking; retry with no duplicate post or tag; no credentials or content in logs; route wiring.

Validation (2026-09-26): TypeScript OK, ESLint (touched files) OK, spec 36/36, full renderer 440/441 (same pre-existing `pinterest-text-importance-none.spec.ts` failure), production build OK, `git diff --check` OK. La validation d'écriture réelle sur Rank Math et la vérification finale des tags sur le site WordPress n'ont pas été exécutées, afin d'éviter une consommation supplémentaire d'API payante. Les tests offline et les mocks couvrent le comportement attendu. À vérifier ultérieurement si un problème Rank Math ou tags est signalé.

---

# Niche Profiles — Phase 1 and Phase 2 per-project niche settings (TASK-045, 2026-09-28)

Focused command:

```bash
npx playwright test tests/renderer/niche-profiles.spec.ts tests/renderer/niche-settings.spec.ts tests/renderer/project-niche-clay-crafts.spec.ts --project=renderer --reporter=list
```

Offline (no AI call, no network, no database — prompt builders are pure, `generateText` is a stub, Supabase is a recording fake query chain):

* `niche-profiles.spec.ts` (38, Phase 1): the four priority niches and their aliases, generic fallback, Content Stream sub-niche and priority, visual conventions, WordPress outline / article / Pins / URL and Pinterest normal / from article / regeneration prompts, WordPress vs Pinterest rule separation, no destination URL, contradiction fixes, legacy prompts unchanged, stream lookups.
* `niche-settings.spec.ts` (27, Phase 2): `niche_settings` NULL / valid / invalid / future version, Zod (extra keys, empty, too long, too many, links), add / disable / enable / replace / remove / reset, only customizations stored, the four priority niches with settings, unknown and empty niches, priority settings > stream > niche, disabled sub-niche, final values in every WordPress and Pinterest prompt and in the image rules, no destination URL, legacy prompts unchanged, migration not applied (reads → defaults, save → `migration_required`), reads never write, saves write only `projects.niche_settings` of the owner.

Browser (`tests/playwright/niche-settings.spec.ts`, 4): the seven fields, Add custom value / unsaved state, inline link rejection, Create new Content Stream dialog — skipped without `PLAYWRIGHT_STORAGE_STATE`, and never clicks Save (no write to a real project).

Manual check after applying migration 041: open a Clay project, disable a recommended tone, add a custom keyword, save, reload (values kept), generate one WordPress article and one Pinterest batch, then "Reset to defaults".

Validation (2026-09-28): TypeScript OK, ESLint (touched files) OK, niche specs 73/73, full renderer 785 passed / 1 failed (same pre-existing `pinterest-text-importance-none.spec.ts`), browser spec 4 skipped (no session), production build OK, `git diff --check` OK.

---

# Custom number of Pins + Rewrite article (TASK-046, 2026-10-04)

Focused command:

```bash
npx playwright test tests/renderer/pinterest-custom-pin-count.spec.ts tests/renderer/wordpress-rewrite-article.spec.ts --project=renderer --reporter=list
```

Offline (no AI call, no network, no WordPress call — prompt builders are pure; the rewrite route runs with a fake Supabase / Storage and a stub `generateText` injected through `require.cache`):

* `pinterest-custom-pin-count.spec.ts` (16): defaults 10 / 5 and presets unchanged; custom 6 (number and string), 7, 12; bounds 1 and 30 in both flows; 0, negatives, decimals, > 30, empty, non-numeric, boolean, NaN refused with the right message; form "Custom…" field checked before the request; Regenerate re-sends the stored count; angle plan (all five before any repeat, counts within one); prompt order for 3 / 6 / 30 and unchanged 5 / 10 wording; balanced 6 / 7 / 12 accepted; early repeats refused (3, 6) unless the strategy is free; near-copy variants refused above 5; partial batch not judged; no `link_url`, `website_url` only from the request, article flow refuses URLs for any count; Guide.
* `wordpress-rewrite-article.spec.ts` (28): source preparation (images → markers, single `{{FAQ}}`, headings, links; stored and legacy FAQ; preserved and absent FAQ; article without images); finalization (stored H1, every image kept with its URL / alt, dropped marker restored before the FAQ, duplicate removed, regenerated or preserved FAQ, copied URLs applied); prompt carries brief, options, niche block, keywords, outline, images, links, FAQ questions; article prompt unchanged by the shared helpers; new rows (options copied, slug / meta / category / featured image kept, no `wp_post_id` / publish status, image rows with new URLs, Pin images untouched); confirmation required; completed-only; link back; UI (button, confirmation before request, state, errors, locked dialog, notice); route — new version with the original context, images copied, new Quality Gate and FAQ saved on the new rows; previous version never updated / deleted, no publish import; no confirmation → nothing; invalid id / other user / not completed → no AI call; provider error, invalid JSON, wrong FAQ count → only the new generation `failed`; failed copy → old URL + warning; legacy article; Guide.

Browser (`tests/playwright/pins-count-and-article-rewrite.spec.ts`, 3 × desktop + mobile): Custom 0 / 31 refused without request and 6 sent; Rewrite dialog Cancel sends nothing; Confirm shows progress then the error and stays on the page. All routes mocked. **Skipped without `PLAYWRIGHT_STORAGE_STATE`** (and `PLAYWRIGHT_WP_ARTICLE_ID` for the rewrite cases).

Validation (2026-10-04): TypeScript OK, ESLint (touched files) OK, new specs 16/16 and 28/28, Pinterest specs (strategy, generation plan, AI Integrated, board section, Social Content Studio, niche) and WordPress specs pass, full renderer 829 passed / 1 failed (same pre-existing `pinterest-text-importance-none.spec.ts`, also failing without this change), browser spec 6 skipped (no session), production build OK, `git diff --check` OK. No real AI generation was run.

---

# Pinterest scheduling timezone (TASK-048, 2026-10-04)

```bash
npx playwright test tests/renderer/pinterest-schedule-timezone.spec.ts --project=renderer --reporter=list
```

Offline (24 cases, no AI, no network; the schedule route runs against a recording Supabase fake; the process zone is switched with `process.env.TZ` to prove nothing depends on the server machine's zone): 13:00 Europe/Madrid summer → 11:00 UTC, winter → 12:00 UTC, on UTC / Tokyo / Los Angeles / Madrid runtimes; day change after conversion (00:30 Madrid, New York evening, New Year in Los Angeles); spring forward (02:30 refused, 01:30 / 03:30 correct) and fall back (first occurrence); daily 13:00 across the change stays 13:00; other zones (Kolkata, New York, UTC, Sydney); invalid / missing zones refused (offsets, abbreviations, unknown names) by the helper and the schema; minutes and seconds kept; every-weekday in the chosen calendar; display after reading the stored instant (13:00); dialog sends / previews the browser zone; pin table displays in the browser zone; CSV in UTC, identical whatever the browser zone, end to end converted once, seconds and day change kept; dashboard buckets by Madrid day, coverage and week plan correct on any runtime; query margin; route stores 11:00Z on a UTC server, refuses a missing / invalid zone and a skipped time without writing, judges "future" in the zone, writes only the requested Pins; legacy dates read as stored, never rewritten.

Validation (2026-10-04): see TASKS.md TASK-048 — TypeScript, ESLint (touched files), spec 24/24, dashboard / CSV / publishing-activity specs (also under `TZ=UTC`), full renderer, production build, `git diff --check`.

### Manual Pinterest check (pending — founder)

1. Schedule one Pin at 13:00 (browser in Europe/Madrid), confirm; OmniFlow must show 13:00 and the preview "Times in Europe/Madrid".
2. Export the CSV: the "Publish date" cell must be `YYYY-MM-DDT11:00:00` (summer) / `T12:00:00` (winter).
3. Controlled import with two rows of a future day, same Pin data otherwise: row A `…T11:00:00` (UTC, new format), row B `…T13:00:00` (local, as the former export would write the typed time). Expected if Pinterest reads UTC: A shows 13:00, B shows 15:00.
4. Record which row shows 13:00 in TASKS.md TASK-048 ("CSV format"). If row B shows 13:00 instead, Pinterest reads local time and the CSV must be switched back to local wall time in the planning zone.

---

# Cloudflare R2 media storage (TASK-049, 2026-10-11)

```bash
npx playwright test tests/renderer/media-storage-r2.spec.ts --project=renderer --reporter=list
```

Offline (27 cases; the S3 client, `fetch` and Supabase are fakes — no network, no bucket, no AI call; fake credentials checked never to be printed): provider selection (unset / empty / `supabase` → Supabase, `r2`, invalid value refused), R2 config (missing / non-https variables named, values never echoed, region default `auto`), `r2` without config throws — no fallback, no Supabase call; no `NEXT_PUBLIC_` R2 variable and no `components/` import of `lib/storage`; key layout and separation (`images/pinterest/`, `images/wordpress/`, `images/facebook/`, `videos/reels/`, `videos/facebook/`, `videos/tiktok/`), unsafe / `..` segments refused, Supabase paths unchanged; R2 provider upload (key, content type, public URL on `https://media.n8nflow.org`), read, list, delete, failure → `MediaStorageError` without URL; SigV4 against the AWS S3 reference vectors; path-style signed PUT (content type signed, payload hash), 403 / network errors without secrets; ListObjectsV2 continuation; Supabase provider = exact historical calls (bucket, path, options, `upsert` only when given); Pinterest keys (Supabase unchanged, R2 grouped by generation), `.source` always on Supabase, storage resolved before any paid image call and before the DB rows; WordPress image keys for both providers, generators create the storage before any AI call; media reuse keys (`storage:omniflow-media/<key>`, Supabase keys unchanged); rewrite copies R2 → R2 and Supabase → Supabase, never reused Pin images; delete routes (R2 folder cleanup after the unchanged Supabase cleanup, no-op without config); `next/image` pattern.

Non-regression: the full renderer suite (`npx playwright test --project=renderer`) — Pinterest generation, WordPress generation / publish / media reuse / rewrite specs unchanged and passing.

Controlled real smoke test (optional, only when the R2 variables are set locally; no AI): upload a small temporary text file under `healthcheck/`, check it is listed, read it through S3 and through `https://media.n8nflow.org/…` (200, same bytes, content type kept), delete only that file, check it is gone (404). Never print the keys. Run 2026-10-11: all steps OK.

Manual (costs AI credits — founder): set `MEDIA_STORAGE_PROVIDER=r2`, generate Pinterest images and a WordPress article, check the URLs start with `https://media.n8nflow.org/images/`, thumbnails display, recomposition works (source on Supabase), publish the article to WordPress, then delete the generations and check the R2 folders are emptied. Switch back to `supabase` → old and new images still display.

---

# Image optimization + media profiles (TASK-050, 2026-10-11)

```bash
npx playwright test tests/renderer/media-optimization.spec.ts --project=renderer --reporter=list
```

Offline (20 cases; fixtures generated with sharp — photo-like gradients with grain and a headline band —, storage faked, no network, no AI call): active profiles (Pinterest 1000×1500 JPEG q88, WordPress ≤ 1600 WebP q85 + JPEG fallback with the same resize), the nine planned profiles (dimensions, platform, R2 prefix incl. `images/instagram/`), planned profiles refused by the optimizer and only `pinterest-pin` (×2) / `wordpress-article` (×1) used in the code; Pinterest 1024×1536 PNG → exactly 1000×1500 JPEG, < ½ the PNG, no EXIF / XMP / orientation, input buffer untouched; WordPress 2400×1600 → 1600×1067 WebP, 1024×1024 kept; no enlargement (600×900 Pin, 500×300 article); EXIF orientation 6 corrected before resizing; a square image refused for a Pin (no aggressive crop); transparency flattened on white for JPEG, kept in WebP; empty / corrupt input → `ImageOptimizationError`; route wiring (optimization before key / source / upload, real extension + content type, raw `.source` upload); `.source.png` naming (old paths unchanged); Pinterest vs WordPress keys; Supabase default provider with `.webp` path + `image/webp`; R2 `media.n8nflow.org` URL, `.webp` key, smaller than the PNG; a corrupt image is never uploaded; WordPress filenames follow the real format, old PNG URLs keep `.png`; media reuse keys (old PNG key unchanged, new `.webp` key, query ignored); optimized download keeps `image/webp` and a stable hash; logs carry sizes / formats only.

Fixture sizes (synthetic, smoother than real generated photos): Pin 1024×1536 PNG 3562 KB → 1000×1500 JPEG q88 140 KB; article 2400×1600 PNG 9613 KB → 1600×1067 WebP 32 KB; article 1024×1024 PNG 2630 KB → WebP 20 KB.

Adapted older specs: `pinterest-image-metadata.spec.ts` (stored Pin is now `.jpg` / `image/jpeg`, no metadata, not enlarged — pixels no longer byte-identical by design), `media-storage-r2.spec.ts` (`.source.png`, `.webp` article images, valid PNG input), `wordpress-outline-model`, `wordpress-pins-coherence`, `wordpress-pipeline-quality` (fake provider returns a valid 1×1 PNG, expected paths `.webp`), `wordpress-seo-alt-outbound` (publish filename via `mediaFilename()`).

R2 smoke test (no AI, 2026-10-11): 1024×1536 PNG fixture optimized with `pinterest-pin` (42 KB → 19 KB), uploaded to `healthcheck/task-050-smoke-<ts>.jpg`, read from `https://media.n8nflow.org/…` (200, `image/jpeg`, 1000×1500, same bytes), deleted (404).

Manual (costs AI credits — founder): generate Pins and check text legibility on the 1000×1500 JPEG; generate a WordPress article, publish it, check the `.webp` featured image in the Media Library; republish → no new media item.

# Pinterest from WordPress articles (TASK-051, 2026-10-11)

```bash
npx playwright test tests/renderer/pinterest-article-grounding.spec.ts tests/renderer/pinterest-wordpress-post-source.spec.ts --project=renderer --reporter=list
```

Offline (58 cases, no network, no AI call, WordPress and Supabase faked):

* `pinterest-article-grounding.spec.ts` (29) — synthetic list article shaped like the real one (numbered H2 per pattern with captioned photo, support / FAQ sections, a related-posts block mentioning a cowl, nav, ads, share bar, script, hidden injection): H1/H2/H3 sections keep their own text and images; chrome, ads, hidden text and related posts dropped (no cowl / chunky left); instruction-like text neutralized, no angle bracket, no URL, permalink kept for traceability only; materials / colors / techniques / patterns / visual details found only when present ("Red Heart" is not a color); Markdown (OmniFlow) gives the same model; bounded prompt text keeps every heading; 5 Pins of 10 patterns → five spread sections, deterministic, 1 / 7 / 12 Pins; brief with the 11 fields, only article facts, cowl / chunky / hat / knit forbidden; photo descriptions enrich the brief; validator accepts grounded Pins and refuses a missing / unknown / repeated section, invented cowl / chunky / knit / wool / fringe / emerald green, an image without the section's project, ignores negations and neutral backdrops, skips the English vocabulary on non-English articles; context reaches the text prompt (`<pin_plan>`, briefs, `sourceSectionId`, niche + Content Stream + angle rules kept, keyword flow unchanged) and the image prompt (brief appended, unchanged for other Pins); regeneration keeps the section and refuses an invented cowl; Vision: descriptive alt used without a call, non-descriptive alt → VISION on allowed hosts only, failures fall back to text, only counts logged; no `input_references`, 1024×1536 → 1000×1500, no `link_url`, no WordPress write helper, Vision before any row is written.
* `pinterest-wordpress-post-source.spec.ts` (29) — search = one authenticated GET with search / status / embeds and display fields (title, date, status, category, featured image); drafts listed when allowed, refused listing → `forbidden`; query and source schemas; one GET per post (content, featured image, categories, tags); draft accepted; 401 / 403 / 404 / 500 / empty / password-protected / not JSON / too large / other post id / timeout / network → readable codes, no credential in messages; connection and project ownership (no WordPress call when refused); an existing post becomes the same `WordPressArticleContext` with zero database writes and only GET requests, Content Stream from the mapped category, no permalink in the prompt; generate / regenerate schemas (post accepted, never with a destination URL or a second source); source columns; migration 044 additive; regeneration refused before contacting WordPress when the Pin is not found; routes / page / picker source checks (GET only, public site columns only, no AI on load).

Adapted: `social-content-studio.spec.ts` (test source carries its `WordPressArticleContext`, route calls), `pinterest-generation-plan.spec.ts` (`pinterest-pins-v13`), `pinterest-history-wordpress-source.spec.ts` (one more grouped query for existing posts + a new case).

Latest run (2026-10-11): TypeScript OK, ESLint OK on the touched files (the only errors are in the untracked `.claude/hooks/`), new specs 58/58, full renderer 1036/1037 (same pre-existing `pinterest-text-importance-none.spec.ts` failure).

Dry run on the real article (no AI, public GET 2026-10-11): post 1527 "10 Free Colorful Crochet Scarf Patterns: Stripes, Ombre and Waves", published, category "Crochet Scarf Patterns", featured image + 9 distinct internal images; 10 subject sections (the 10 scarves; no cowl, no chunky scarf — "cowl" only appears in the dropped related-posts block); plan for 5 Pins: patterns 1, 3, 5, 7, 9.

## Real controlled test (authorized — consumes AI credits)

Scope: only `https://crochet.ciencia-y-tecnologia.com/colorful-crochet-scarf-patterns/`, the Crochet project, an existing Crochet board, 5 Pins, existing angles, no Destination URL. Through `/pinterest/from-wordpress` (or `POST /api/pinterest/generate` with `wordpressPost`) then `POST /api/pinterest/generate-images`. Check: 5 Pins on 5 different scarves of the article (source section badge), no cowl / chunky scarf, images 1000×1500 JPEG, Pins in the history, `pins.link_url` and `generations.website_url` empty, the post's `modified` date unchanged, nothing published to Pinterest, no secret or article content in the server logs.

Status: **done 2026-10-11** (founder session saved with a Playwright helper — the service-role keys of `.env.local` are refused by the database). Driven through the real UI (`/pinterest/from-wordpress?siteId=…&postId=1527`, headless, default form settings) on the local dev server.

* Source: post 1527 read with GET; summary showed 10 subjects (the 10 scarves), no cowl. Project "Crochet Blog EN", existing board "crochet scarf pattern" (pre-selected after the board-matching fix below), Content Streams kept. Payload: 5 Pins, `generationMode: ai-integrated` (form default, `ai-recommends`), `wordpressPost: { siteId, postId: 1527 }`, no `websiteUrl` / `pinterestUrl`.
* `POST /api/pinterest/generate` 201 in 23.5 s; log `Article image descriptions: {"fromAltText":0,"visionCalls":5,"visionFailures":0,"skippedHosts":0}`. `POST /api/pinterest/generate-images` 200 in 35.6 s: 5/5 images, 1024×1536 → 1000×1500 JPEG q88 (287-420 KB), stored on R2.
* Models: text `openai/gpt-6-luna` (FAST), vision `openai/gpt-5` (VISION), image `openai/gpt-image-2.5-flare` (AI Integrated).
* Cost: OpenRouter usage 40.1959 → 40.4294 USD = **≈ 0.23 USD** for the whole lot (1 text call + 5 vision calls + 5 images; both keys share one account; the credits endpoint can lag slightly).
* Pins (angle — source section — title): curiosity — 3. Shaded Triangles Magic Scarf — "What Makes These Crochet Scarf Color Sections Shift Direction?"; discovery — 1. On the Bias Crochet Scarf — "A Graphic Crochet Scarf Built Around Colorful Diagonal Bands"; article-promise — 9. Gradient Sparkle Scarf — "Find a Crochet Scarf Pattern That Lets Gradient Color Take the Lead"; problem-solution — 5. Diagonal Scarf — "When Shaded Yarn Needs a More Directional Crochet Scarf Design"; listicle — 7. Caron On the Bias Crochet Scarf — "Colorful Crochet Scarf Patterns for a Fresh Diagonal Look".
* Database: generation `completed` / images `completed`, `source_type = external_wordpress_post`, site + post 1527 recorded, `source_wordpress_generation_id` null, `website_url` / `pinterest_url` null; every Pin `link_url` null, `scheduled_at` null, real board id, `_articleSource` section + brief stored. Nothing published to Pinterest.
* WordPress: post `modified` 2026-10-11T13:59:33 before and after — no write.
* Logs: no secret, no article text, no image URL, no Authorization header.
* Visual check (each Pin next to its section's original photo): five different scarves, each matching its section's construction and palette (shaded triangles, diagonal bands, gradient with sparkle, diagonal shaded yarn, Caron bias bands); no cowl, no chunky scarf, no generic image. Observed: Pin 1 shows fringe the Shaded Triangles original does not have (invented by the image model, not in the prompt); the Gradient Sparkle Pin shows a horizontal gradient while the original is worked on the bias; AI Integrated headlines can carry the pattern's brand name ("Caron On the Bias Scarf").

Board pre-selection fix found by this test: `suggestBoardForArticle()` picked "Free Crochet Cat Patterns" (shared "free" / "patterns") over "crochet scarf pattern"; generic words (free, easy, ideas…) are now ignored and simple plurals folded. New case in `pinterest-wordpress-post-source.spec.ts` (29 cases). The script stopped before any AI call on that first attempt.

# Pinterest source chooser (TASK-051 UX, 2026-10-11)

```bash
npx playwright test tests/renderer/pinterest-source-chooser.spec.ts --project=renderer --reporter=list
set PLAYWRIGHT_STORAGE_STATE=path\\to\\authenticated-state.json
npx playwright test tests/playwright/pinterest-source-chooser.spec.ts --project=chromium --project=mobile-chrome
```

Offline (9): three sources and their targets, exactly one current, disabled existing-post option without a site (no link, explicit message, connect link), navigation-only component (no fetch / client state / AI), `hasWordPressSite()` head count on `wordpress_sites` filtered by user (error → false), wiring in `/pinterest`, `/pinterest/create`, `/pinterest/from-wordpress` and the dashboard, no AI on load, keyword and OmniFlow-article entry points unchanged.

Browser (4 cases × chromium + mobile-chrome, real session, 2026-10-11: 8/8): `/pinterest` shows the chooser and "From existing WordPress article" opens the post picker; search + select a real post shows the summary and "Generate Pins" only; a connection that is not the user's → "This post can't be used"; dashboard quick action → picker. Each case fails if `/api/pinterest/generate*`, a regenerate route, a non-GET `/api/wordpress` route or OpenRouter / OpenAI is called. The disabled no-site state is covered offline (the test account has connected sites).

Same run: `dashboard.spec.ts` "every section renders" ("Publishing coverage" is a `CardTitle`, not a heading) and "all seven KPIs…" (the `credits` text matches two elements) fail on assertions unrelated to this change; "quick actions are kept" passes. Full renderer 1047/1047.

---

# Medium summary from WordPress articles (TASK-062, 2026-10-11)

```bash
npx playwright test tests/renderer/medium-summary.spec.ts --project=renderer --reporter=list
npx playwright test tests/renderer/medium-summary.spec.ts tests/renderer/social-content-studio.spec.ts tests/renderer/pinterest-wordpress-post-source.spec.ts tests/renderer/pinterest-article-grounding.spec.ts --project=renderer --reporter=list
set PLAYWRIGHT_STORAGE_STATE=path\\to\\authenticated-state.json
set PLAYWRIGHT_WP_ARTICLE_ID=<completed wordpress_generations.id>
npx playwright test tests/playwright/wordpress-social-content.spec.ts --project=chromium
```

Offline, `tests/renderer/medium-summary.spec.ts` (41, fake Supabase + fake `fetch` + stubbed model — no network, no AI):

* **OmniFlow article**: ownership (generation, project, connection used for the permalink), not found, not completed; published article → exactly one `GET /wp-json/wp/v2/posts/<wp_post_id>`, CTA with the exact permalink; unpublished (no `wp_post_id`) → no WordPress call, no link, warning; WordPress draft (`?p=` link) or 404 → no link.
* **Existing post**: one GET only, exact permalink; ownership of connection and project, missing connection; 404 / 401 / empty / password-protected → explicit read errors; draft, off-site link or empty link → no CTA link; French post → `language: fr`, prompt "Write in French".
* **Content rules**: prompt carries the article as data and no URL (never the permalink); URLs written by the model (Pinterest Pin, shop link, bare `www.` destination) removed — the permalink is the only URL / `href`; 300-600 words (too short / too long → one retry naming the issue, then `invalid_summary`); invented number (75 %, 3 hours) or detail (cowl, merino) refused and retried; numbers of the article and list markers accepted; summary in the wrong language refused; FR CTA; verbatim copy refused; article < 350 words refused before any AI call; unreadable JSON retried then refused.
* **Export**: Markdown (title, italic subtitle, subheadings, CTA last, no model HTML), HTML (escaped title, rendered body, exact `href`), permalink with parentheses, download file name, permalink validation (published + connected site only, `javascript:` refused).
* **Image** (12): featured image first (exact URL, alt, after the subtitle, no extra request); without it the most relevant internal image (descriptive alt in a subject section beats a generic intro image); alt built from the section heading when missing; off-site / Jetpack CDN images refused even with a better alt; exact URL with query string in Markdown and in the decoded HTML attribute; every URL of the result is the permalink or a real article image; all images invalid → no image + warning; URL checks (http, other host, look-alike host, IP, localhost, `.internal`, credentials, signed URLs, `data:`, relative, OmniFlow storage refused for an existing post; public Supabase / R2 accepted for an OmniFlow article, signed / authenticated Supabase objects refused); OmniFlow article: WordPress featured image first when published, else `featured_image_url`, else an internal Markdown image; no image generation / upload / storage call.
* **API / UI / safety**: strict request schema (exactly one source); route has auth, Zod, rate limit + trial cap, `lib/ai/engine`, no DB write; no Medium API / token, no WordPress write in the feature files; the panel's single `fetch` is the summary endpoint; Copy Markdown / Copy HTML (`clipboard.writeText`) / Download Markdown (`text/markdown` Blob) / Regenerate / word count / CTA URL / warnings; entry points on the Studio and `/pinterest/from-wordpress`, Pinterest flows unchanged.

Adapted: `social-content-studio.spec.ts` (Medium `available`; the studio stays a Server Component, Medium panel wired); browser `wordpress-social-content.spec.ts` (4 disabled platforms, Medium button enabled, new case with `/api/social/medium-summary` **mocked by `page.route`** — one request with `{ wordpressArticleId }`, preview, "420 words", CTA URL, the four buttons; no real AI call).

Results 2026-10-11: new spec 29/29; full renderer **1076/1076**; with the image (2026-10-12): 41/41, full renderer **1088/1088**; TypeScript, ESLint (touched files), `next build` and `git diff --check` pass. Browser spec not run (needs an authenticated storage state).

**Real test (founder, one AI text call each, optional):** (1) open a completed **published** OmniFlow article → Social Content Studio → Medium → "Generate Medium summary": 300-600 words, article language, nothing absent from the article, CTA = the post's exact URL, image = the post's featured image (exact URL shown, visible in the preview and after pasting into Medium), Copy Markdown / Copy HTML / Download Markdown work; (2) same on an **unpublished** article → no link + warning; (3) `/pinterest/from-wordpress`, select an existing post → "Medium summary" card → same checks; (4) WordPress post unchanged (modified date), nothing in Medium.

---

# Medium from Pins + New Medium summary on /medium (TASK-064, 2026-10-12)

```bash
npx playwright test tests/renderer/medium-sources.spec.ts tests/renderer/social-content-history.spec.ts tests/renderer/medium-summary.spec.ts --project=renderer --reporter=list
```

Offline, `tests/renderer/medium-sources.spec.ts` (9): `pinterestGenerationHasArticle` (OmniFlow article, existing post with site + post id, keyword → false); the Pins button (request `{ pinterestGenerationId }`, disabled with the keyword explanation, saved → `/medium/<id>`, unsaved → dialog, no own fetch, selection ignored); button in both Pin bars and wired by `/pinterest/[id]`; source lists (completed OmniFlow articles of the user with the published flag, limit 50; Pinterest generations of the user made from an article — `or(...)` filter — and none on a query error; sites with public columns only); chooser (three sources, the three request bodies, post picker in place, panel keyed by source, history refreshed, existing-post disabled without a site, no own request); post picker keeps the Pinterest link by default; `/medium` loads the lists read-only, no AI on load.

Results 2026-10-12: 9/9; full renderer **1119/1119**; TypeScript, ESLint (touched files), `next build` and `git diff --check` pass.

**Real test (founder, migration 045 applied, one AI text call each):** (1) open a Pinterest generation made from an article → "Generate Medium summary" (default bar, and with Pins selected) → opens the saved summary; (2) a keyword generation → the button is disabled with its explanation; (3) `/medium` → New Medium summary → each of the three sources → Select → Generate → the summary appears in the history below.

---

# Medium history — social_content_generations (TASK-063, 2026-10-12)

```bash
npx playwright test tests/renderer/social-content-history.spec.ts tests/renderer/medium-summary.spec.ts tests/renderer/social-content-studio.spec.ts --project=renderer --reporter=list
```

Offline, `tests/renderer/social-content-history.spec.ts` (22, fake Supabase recording every call + fake `fetch` — no network, no AI, no database):

* **Save**: one insert with user, project, `platform = medium`, `status = completed`, title, subtitle, Markdown, HTML, word count, image URL / alt, exact CTA, language → `id` returned.
* **Relations**: OmniFlow article (generation id, + site and WordPress post id when published; unpublished → no site / post / CTA); existing post (project of the connected site, site id, post id); Pinterest generation from an OmniFlow article (Pinterest id + article ids) and from an existing post (Pinterest id + site + post id); keyword generation → `no_article_source`; another user's generation → `forbidden`; other project → `project_mismatch`; missing → `not_found`; the Pinterest source never reads Pin URLs and the CTA stays the validated permalink; a post id is never saved without its site.
* **Save failure**: insert error → summary returned unchanged, `id: null`, "could not be saved" warning; missing table (`PGRST205`) → "migration 045 not applied" warning.
* **History**: list scoped to the user and to `medium` (rows of other users and Facebook rows excluded), filters project / source / date (30 days) / status, invalid filter values ignored, period bounds; detail only for the owner; delete only the owner's row and nothing else; Regenerate builds a valid request for each source type, null when the source is gone; source links stay inside OmniFlow; preview without URL / Markdown.
* **Static**: migration 045 (table, platform CHECK incl. future platforms, nullable sources with `ON DELETE SET NULL`, RLS `USING user_id` + `WITH CHECK` on project and every source, no token / secret / password column); DELETE route (auth, UUID, user-scoped); actions (Open, Copy Markdown, Copy HTML, Download Markdown, Regenerate, Delete only from the confirm button of the dialog, unsaved regeneration kept on screen); `/medium` list + filters + meta + detail; sidebar (Medium enabled, Facebook / LinkedIn disabled); no Medium API, no `wp-json`, no credentials / service key in the new files; client components import no server module.

Adapted: `medium-summary.spec.ts` (41 — the copy / download / request code moved to `medium-summary-result.tsx` and `medium-export.ts`; the route saves through `saveMediumSummary`).

Results 2026-10-12: new spec 22/22; Medium spec 41/41; full renderer **1110/1110**; TypeScript, ESLint (touched files), `next build` and `git diff --check` pass. **Migration 045 not applied** (no DDL access) — the real checks below need it.

**Real test (founder, after applying 045 in the Supabase SQL Editor):** (1) generate a Medium summary from an OmniFlow article → "Saved to your Medium history" link; (2) sidebar **Medium** → the summary is listed with project, source, date, status, image and CTA; (3) filters (project, source, date, status); (4) open it, Copy Markdown / Copy HTML / Download Markdown; (5) Regenerate → a new entry, the old one kept; (6) Delete → dialog, Cancel keeps it, Delete removes only it (the article is unchanged); (7) another account cannot open `/medium/<id>` (404). Nothing is published to Medium, WordPress posts unchanged.

---

# Pinterest strategy-safeguard errors (TASK-066, 2026-10-14)

```bash
npx playwright test tests/renderer/pinterest-strategy-errors.spec.ts tests/renderer/pinterest-generation-plan.spec.ts tests/renderer/social-content-studio.spec.ts tests/renderer/pinterest-article-grounding.spec.ts tests/renderer/pinterest-strategy.spec.ts tests/renderer/pinterest-custom-pin-count.spec.ts --project=renderer --reporter=list
npx playwright test tests/playwright/pinterest-safeguard-error.spec.ts --project=chromium   # needs PLAYWRIGHT_STORAGE_STATE + PLAYWRIGHT_WP_ARTICLE_ID
```

Offline, `tests/renderer/pinterest-strategy-errors.spec.ts` (19), through the real validators where they exist: a clean batch still passes; `UNBALANCED_ANGLES` (batch-wide, no Pin number, counts), `DUPLICATE_ANGLE` (article flow below 5), `DUPLICATE_TITLE` (later Pin + related Pin), `DUPLICATE_PIN` (repeated-angle copy, field), `UNSUPPORTED_NUMBER` / `UNSUPPORTED_CLAIM` (Pin + field), the four article-grounding codes, family fallback; several problems in one batch (count, codes, retryable), cap at 20 with the total kept, single-Pin wording (no Pin number); retryable vs not (`isStrategySafeguardError`, `strategySafeguardView().showRetry`); readable view (message, count, "Pin 2 · Title", batch-wide "Angle", action); no secret / prompt / raw model text in the response, the stored message, the view or the log line; log line keys limited to step / model / role / issueCount and reason / code / pinIndex / field; one code path for Keyword, OmniFlow article, existing post (and articles from Pins), regeneration through `toApiError()`, UI wiring, unchanged thresholds. Updated: `pinterest-generation-plan.spec.ts` (exact structured 422 body, nothing written, log without Pin text), `social-content-studio.spec.ts` (regeneration: `ANGLE_MISMATCH`, `UNSUPPORTED_NUMBER`, `DUPLICATE_TITLE`), `pinterest-article-grounding.spec.ts` (`UNGROUNDED_IMAGE_ELEMENTS`). Browser spec `tests/playwright/pinterest-safeguard-error.spec.ts` (2, route mocked): issues displayed, "Try again" resends once and disappears on a non-retryable answer; another error keeps the plain message.

Results 2026-10-14: 19/19; affected Pinterest / WordPress-to-Pinterest specs 118/118; full renderer **1137/1138** — the only failure is the timing benchmark `pinterest-local-contrast.spec.ts` "records the local-analysis rendering overhead" under full-suite load, which passes when run alone (12/12); TypeScript, ESLint (excluding the untracked `.claude/hooks/`), `next build` and `git diff --check` pass. The browser spec was **skipped** (no authenticated session locally). No AI call.

**Manual check (founder, optional, no AI cost):** in DevTools, override the `/api/pinterest/generate` response with the JSON example of API.md → the form lists the problems; "Try again" resends the form.

---

# Home Decor image subject check (TASK-067, 2026-10-14)

```bash
npx playwright test tests/renderer/pinterest-home-decor-grounding.spec.ts --project=renderer --reporter=list
npx playwright test tests/renderer/pinterest-*.spec.ts tests/renderer/wordpress-pins-coherence.spec.ts tests/renderer/niche-*.spec.ts tests/renderer/project-niche-clay-crafts.spec.ts tests/renderer/social-content-studio.spec.ts --project=renderer --reporter=list
```

Offline, `tests/renderer/pinterest-home-decor-grounding.spec.ts` (17) — `fetch` is trapped in every test (0 calls) and the article context is deep-frozen: German normalization (case, umlauts → ae/oe/ue, ß, inflections, compounds such as Küchenschränke / Eichenholz / salbeigrün; look-alikes Kuchen / Frost / Grundriss / -istisch create no anchor); niche selection (Home Decor aliases → `home-decor`, Crochet / Clay / unknown → `project`); (1) German Home Decor valid — the same Pins fail with the Crochet check, which reproduces the reported bug; (2) English Home Decor valid without the word "project"; (3) kitchen vs living room in both languages; (4) article colors accepted, palette in the expected anchors; (5) marble / fireplace / red / leather absent from the German article → `UNGROUNDED_IMAGE_ELEMENTS`, negations and neutral backdrops ignored; (6) generic interior rejected ("Detected: generic interior"); (7) off-topic images rejected; a section without a room still needs two of its own anchors; (8) Crochet and Clay keep the project check, its message and the vocabulary check, German Crochet unchanged; (9) the user message "Pin 1 does not clearly represent the article section. Expected: … Detected: generic interior. Missing: …" + action, retryable, no article / model text; (10) the Pin plan lists English anchors and no URL; (11-12) single-Pin regeneration from a stored German brief: faithful prompt passes, living room refused, stub model only, article unchanged.

Results 2026-10-14: 17/17; Pinterest + WordPress-to-Pinterest + niche specs 472/472; full renderer **1155/1155**; TypeScript, ESLint (touched files), `next build` and `git diff --check` pass.

**Manual check (founder, costs one text generation):** in a Home Organization & Decor project, generate 2-3 Pins from a German Home Decor article (the one that failed) → no "image description" rejection; open the image prompts — each shows the section's room and palette. Record the result in TASKS.md (TASK-067).

---

# Pinterest step briefs require the project (TASK-075, 2026-10-21)

```txt
npx playwright test tests/renderer/pinterest-article-grounding.spec.ts tests/renderer/pinterest-generate-errors.spec.ts --project=renderer --reporter=list
```

Offline: every brioche step brief carries "Required subject: … must explicitly mention cardigan and must show a cardigan", also in the brief appended to the image prompt; the real Pin 2 answer (gauge swatch alone) is refused, a swatch beside the crochet cardigan passes; clothing / outfit / garment / fashion piece are refused as "no recognizable project"; headed sections and Home Decor briefs get no such line; route: a step Pin showing only a swatch → 422 `IMAGE_SUBJECT_MISMATCH` (Pin 2, "Expected: cardigan…"), no Pin insert, generation `failed`.

Validation (2026-10-21): TypeScript OK, ESLint (touched files) OK, grounding + Clay + Home Decor + niche + generate/strategy error specs 142/142, Pinterest + WordPress + social + niche renderer specs 992/992, production build OK, `git diff --check` OK. One controlled real AI call before the fix (7 Pins, post 1957, nothing saved): only Pin 2 refused, swatch-only image prompt.

# Pinterest generate errors (TASK-074, 2026-10-21)

```txt
npx playwright test tests/renderer/pinterest-generate-errors.spec.ts --project=renderer --reporter=list
```

Offline route tests (Supabase, AI engine, rate limit, boards and the WordPress read replaced; `fetch` blocked): `AbortError` / `TimeoutError` → 504 `ai_timeout`, generation `failed`, no Pin insert; article-grounded call gets `timeoutMs` 120000, keyword call none; safeguard failure → 422, nothing saved; non-JSON answer → 422 `invalid_pin_plan`; provider 503 → unchanged 500 `generation_failed`; refused Pin insert → 500 `server_error`, generation `failed`, never `completed`; a retry after a timeout saves its Pins once on its own generation; `maxDuration = 180`. Against the previous route the 5 timeout cases fail (500), the 4 others pass.

Validation (2026-10-21): TypeScript OK, ESLint (touched files) OK, focused 9/9, Pinterest + WordPress + social + niche renderer specs 987/987, production build OK, `git diff --check` OK. One controlled real AI call (7 Pins, post 1957, same prompt as the route, nothing saved): 19.9 s with the local FAST model.

# Pinterest step sections expect the article project (TASK-073, 2026-10-21)

```txt
npx playwright test tests/renderer/pinterest-article-grounding.spec.ts --project=renderer --reporter=list
```

Offline, on the heading structure of the real brioche cardigan article: the H1's first object is the main project (cardigan / sweater / scarf; a later "tote bag" never wins; none → null); 7 Pins → steps 1, 2, 3, 5, 6, 8, 9, each brief "cardigan of this article — step: …"; a neutral crochet cardigan prompt passes every step; an article color (forest green) passes, an absent one (purple) is refused; a bag alone is refused with "Expected: cardigan. Detected: bag. Missing: cardigan."; an image without the project is still refused; a cardigan with a tote the article never mentions passes the subject check but is still flagged as an invented element; a title without a project keeps the former step-word check; Home Decor briefs unchanged; Clay keeps the project check — headed sections unchanged, step sections expect the H1 project (vase).

Validation (2026-10-21, tests hardened the same day): TypeScript OK, ESLint (touched files) OK, focused 46/46, Home Decor + Clay + niche specs 63/63, Pinterest + WordPress + social + niche renderer specs 978/978, production build OK, `git diff --check` OK. Real article re-checked offline (public GET only): 7 sections expect `cardigan`. No AI call.

# Pinterest coatigan = cardigan (TASK-072, 2026-10-20)

```txt
npx playwright test tests/renderer/pinterest-article-grounding.spec.ts --project=renderer --reporter=list
```

Offline: `coatigan(s)` → `cardigan` (never a separate object); a coatigan image prompt, with or without a tote bag, passes a cardigan section; a cardigan section without a recognized cardigan is still refused (expected cardigan, detected bag); other objects unchanged.

Validation (2026-10-20): TypeScript OK, ESLint (touched files) OK, focused 34/34, Pinterest suite + niche specs 415/415, production build OK, `git diff --check` OK. No AI call.

# Pinterest Destination URL (TASK-071, 2026-10-19)

```txt
npx playwright test tests/renderer/pinterest-destination-url.spec.ts tests/renderer/pinterest-utm.spec.ts tests/renderer/pinterest-wordpress-post-source.spec.ts tests/renderer/social-content-studio.spec.ts --project=renderer --reporter=list
```

Offline (in-memory Supabase and WordPress fakes, no AI). `pinterest-destination-url.spec.ts` (21): valid manual URL kept as typed; invalid URLs (no scheme, relative, `ftp:`, `javascript:`, spaces, credentials) refused with the message; blank = no link; accepted with every source while Research URLs stay refused with an article; typed URL wins over the permalink; route writes `link_url: destination.linkUrl` and the prompt call carries no destination; PATCH `{ linkUrl }` sets / changes / removes and writes only `link_url`; another user's Pin → 403, nothing written; link and text edits never mixed; PATCH route and `updatePinLink` without AI; bulk dialog and per-Pin editor wired through PATCH; existing post with permalink (GET only, no write, not in the prompt); no permalink / draft / foreign host / invalid link → no URL + warning; WordPress 403 / 500 / network error → `WordPressReadError`, nothing written; OmniFlow article unchanged; WordPress never written; UTM: clean saved URL → `pin-01` / `pin-02` in the CSV only, no duplicates, parameters and fragment kept, UTM builder never imported by the save paths. Six older specs updated to the new rule (`pinterest-ai-integrated`, `pinterest-article-grounding`, `pinterest-custom-pin-count`, `pinterest-wordpress-post-source`, `social-content-studio` ×3).

Manual check (no paid call needed beyond one normal generation): generate with a Destination URL → every Pin of `/pinterest/[id]` shows it in its detail; select 2 Pins → "Add destination URL" → both changed, the others not; "Edit destination URL" → Remove URL → "No destination URL"; export CSV with UTM → `?utm_source=pinterest&utm_medium=organic&utm_content=pin-01`, the Pin detail still shows the clean URL; from an existing published post → summary shows its permalink and the Pins get it; from a draft → amber notice, Pins without link, warning toast; the WordPress post is unchanged.

Validation (2026-10-19): TypeScript OK, ESLint (touched files) OK, focused 21/21, full renderer 1229/1229, production build OK, `git diff --check` OK.

---

# Pinterest CSV UTM tracking (TASK-070, 2026-10-19)

```txt
npx playwright test tests/renderer/pinterest-utm.spec.ts tests/renderer/pinterest-csv.spec.ts --project=renderer --reporter=list
```

Offline (no network, no Supabase, no AI). `pinterest-utm.spec.ts` (15): exact three parameters; `pin-01` / `pin-02` / `pin-03` in CSV order and deterministic; no link → empty cell (row number still counted); option off / omitted → URL unchanged; other parameters kept with their encoding (`utm_campaign` / `utm_term` included); old OmniFlow UTM replaced, never duplicated; `#fragment` kept; non-ASCII encoded by `URL`, comma-containing link quoted in the CSV; relative / invalid / `mailto:` left as is; the Pin object is not mutated; no-link CSV identical to the previous output; UTM module and CSV builder import no AI / network / database; both export entry points pass `{ utmTracking }` with `useState(true)`; only `lib/csv/pinterest.ts` imports the UTM builder.

Manual check: export a generation with a linked Pin, open the CSV — Link ends with `?utm_source=pinterest&utm_medium=organic&utm_content=pin-01`; uncheck "Add UTM tracking", export again — Link is the stored URL; reopen the Pin — its link is unchanged.

Validation (2026-10-19): TypeScript OK, ESLint (touched files) OK, focused 21/21, full renderer 1208/1208, production build OK, `git diff --check` OK.

---

# Legal pages (TASK-069, 2026-10-18)

```bash
npx playwright test tests/renderer/legal-pages.spec.ts --project=renderer --reporter=list
```

Offline (7 tests): every footer route has content and an `app/(legal)/<slug>/page.tsx`; `isLegalPath` makes only those paths public; inline links point to existing legal pages; the Privacy Policy names the real processors and the five Facebook permissions; the Data Deletion page has the steps Meta requires; the Cookie Policy matches the cookie and localStorage names in the code; the GDPR page covers Art. 7, 15–18, 20, 21.

Manual: signed out, open `/privacy`, `/terms`, `/gdpr`, `/cookies`, `/data-deletion`, `/legal-notice` (no redirect to `/login`); the footer shows on `/login` and `/register`; signed in, the same pages open (no redirect to `/dashboard`) and the sidebar footer lists them.

# Facebook Pages (TASK-068, 2026-10-15)

```bash
npx playwright test tests/renderer/facebook-content.spec.ts --project=renderer --reporter=list
npx playwright test tests/renderer/social-content-studio.spec.ts tests/renderer/social-content-history.spec.ts tests/renderer/medium-summary.spec.ts tests/renderer/medium-sources.spec.ts --project=renderer --reporter=list
npx playwright test tests/playwright/facebook.spec.ts tests/playwright/wordpress-social-content.spec.ts --project=chromium   # needs PLAYWRIGHT_STORAGE_STATE (+ PLAYWRIGHT_WP_ARTICLE_ID, PLAYWRIGHT_PROJECT_ID, PLAYWRIGHT_FACEBOOK_CONTENT_ID)
```

Offline, `tests/renderer/facebook-content.spec.ts` (31) — Supabase (fake client), WordPress (fake fetch, GET only) and the Meta Graph API (fake fetch behind the real `MetaGraphClient`, 50 ms timeout) are all simulated; no AI call, no Meta call:

* Generation: (1) OmniFlow article — `WordPressArticleContext`, exact permalink, article image, default First comment, WordPress GETs only; (2) existing WordPress post — source ref, permalink, Content Stream through the mapped category; (3-5) prompt with the article sections, `<niche_context>` (niche, Content Stream), Brand Profile, no URL anywhere; (6) German article → "Write in German", an English post refused; (7) invented number refused, corrective retry with the feedback, `invalid_post` after two failures; (8/11) URLs and domains written by the model removed (scheme, `www.`, bare domains, any `host.tld/path`), only the permalink kept; no permalink → only No link, warnings; (12) saved row (platform, sources, language, post, CTA, comment text, link placement, Content Stream, image, `cta_url`); (13-14) another user → 403.
* Link placement: (9-10) First comment → no URL in the post, comment = lead-in + exact permalink; Main post → permalink at the end, no comment; No link → nothing; (11) edits refuse any URL / domain in every field, unknown placement refused; (15) publish needs `connectionId` + `confirm: true`; Page id must be digits.
* Meta client: token never in a URL (Bearer header, `appsecret_proof` = HMAC of the token), OAuth secret / tokens in the POST body; error mapping (190 → expired, 10 / 200 → permission, 100/33 → Page unavailable, 4 → rate limit, 506 → duplicate), Meta message never kept, `fbtrace_id` kept; (21) timeout → `timeout` + ambiguous; (22) OAuth answer without token → `oauth_failed`.
* Publication: (17-18) photo post, id saved before the comment request, comment with lead-in + permalink, only `graph.facebook.com` called (26: no WordPress write); text post without image; (19-20) comment refused → `partial`, publish again refused, Retry comment calls `/comments` only; post refused → `failed`, no comment, Retry posts once (one row); (21) timeout → `unknown`, Retry adopts the post found on the Page by exact text (no second `/photos`), or posts once when the Page does not have it; (23-24) expired token / deleted Page → `failed`, clear message, one call; concurrent click while a fresh lock exists → `in_progress`, no call; (16) the Page token and App Secret never appear in any log line (errors and timeouts included); (14) every publication store query filters on the caller.
* Tokens / OAuth: `SOCIAL_TOKEN_ENCRYPTION_KEY` only (missing key throws, a WordPress ciphertext cannot be opened); encrypted state and pending cookies bound to user + project, expiring after 10 min, tampered → null; constant-time state compare; exact minimal scope list, `business_management` only on request, no profile / group scope; config without secret → null.
* Schema / routes / UI (source checks): token column absent from the `authenticated` grant, REVOKE ALL, UNIQUE constraints, Content Stream RLS check, link needs URL; routes check ownership + same project, separate publish limit (no trial cap), generation limit = Medium; no JSON response body mentions a token; Page must have `CREATE_CONTENT`; Facebook available, Instagram / Reels / TikTok Coming soon, sidebar entry, Studio panel; client components import no server module and never call Meta.

Updated: `social-content-studio.spec.ts` (platform statuses), `social-content-history.spec.ts` (active platforms, sidebar), `tests/playwright/wordpress-social-content.spec.ts` (Facebook enabled, 3 Coming soon). Browser spec `tests/playwright/facebook.spec.ts` (7, every API mocked): Facebook page and sidebar; Page picker (lists, read-only Page disabled, select body); Studio generation (one request, link to the review page); First comment on/off preview without URL; publish success through the confirmation dialog; partial publication → only Retry comment, which calls `/retry-comment` only.

Results 2026-10-15: 31/31; Social Content Studio + Medium specs 148/148 (with the new spec); full renderer **1186/1186**; TypeScript, ESLint (excluding the untracked `.claude/` and `.opencode/`), `next build` and `git diff --check` pass. Browser specs **skipped** (no authenticated session locally). No AI call, no Meta call.

**Real test (founder approval required — one text generation, one post on a test Page):** prerequisites: migrations 045 + 046 applied; Meta app (Business, Facebook Login) with the redirect URI `<app URL>/api/social/connections/facebook/oauth/callback`; `META_APP_ID`, `META_APP_SECRET`, `SOCIAL_TOKEN_ENCRYPTION_KEY` set; a **test** Facebook Page you manage (your account has a role on the Meta app).

| # | Step | Expected | Result |
|---|---|---|---|
| 1 | `/facebook` → Connect a Facebook Page (test project) → accept the five permissions | Page picker lists your Pages; Select → "Connected", Page name + ID; no token visible in the URL, the page or the network responses | ☐ |
| 2 | Verify | "connected and reachable" toast | ☐ |
| 3 | Studio of a **published** article → Generate Facebook post | Post in the article language, nothing invented, Link: First comment, article image | ☐ |
| 4 | Open it → edit the text, try to add a URL → Save | URL refused with a clear message; a plain edit is saved | ☐ |
| 5 | Publish to Facebook → Publish now | Photo post on the Page without link; first comment by the Page = lead-in + exact permalink; status "Published + comment"; "View on Facebook" opens it | ☐ |
| 6 | Click Publish / Retry again | No button to publish again; no second post on the Page | ☐ |
| 7 | Second post with Main post / No link | Link at the end of the post / no link anywhere, no comment | ☐ |
| 8 | Disconnect Page | Row back to "No Facebook Page connected"; published posts still on Facebook | ☐ |
| 9 | Check the WordPress article | Unchanged | ☐ |

Record the date, the Page id and the results here and in TASKS.md (TASK-068). Delete the test posts on Facebook afterwards if wanted.

---

# TASK-061 — Real WordPress validation on R2 + production R2 activation (planned 2026-10-11)

Manual, founder-run, in this order. Costs one WordPress article generation (featured + internal images); everything else makes no AI call. Prerequisites: local `MEDIA_STORAGE_PROVIDER=r2` + the six `R2_*` variables; migrations 042 / 043 applied (verified 2026-10-11); a connected **test** WordPress site (≥ 5.8) with Media Library access. Background: Pinterest already runs on R2 locally (25 optimized Pins under `images/pinterest/`, 1000×1500 JPEG ≈ 280-330 KB, read-only check 2026-10-11); `images/wordpress/` is still empty.

| # | Step | Expected | Result |
|---|---|---|---|
| 1 | Generate an article (Keyword method, with internal images) with R2 enabled | Generation completes; article page shows every image | ☐ |
| 2 | Check the files under `images/wordpress/` in bucket `omniflow-media` | `images/wordpress/<user>/<generation>/FEATURED.webp` (+ `IMAGE_N.webp`); each URL `https://media.n8nflow.org/images/wordpress/...` answers 200 with `Content-Type: image/webp`, longest side ≤ 1600 px; stored URLs start with `https://media.n8nflow.org/` | ☐ |
| 3 | Save as Draft on WordPress; note the Media Library count | One post, `wp_post_id` saved; media named `<slug>-featured.webp` / `<slug>-<n>.webp`; `wordpress_media_assets` rows keyed `storage:omniflow-media/images/wordpress/...` | ☐ |
| 4 | Publish / save the same article again | Same `wp_post_id` updated; Media Library count unchanged — **no new media** (logs: `media_featured … result=reused`) | ☐ |
| 5 | Start a publish, interrupt it (close the tab / cut the network), then publish again | "Publication status is uncertain…" or the final status; the retry updates the **same** post; no duplicate post, no duplicate media | ☐ |
| 6 | Two simultaneous publishes (two tabs, Publish within a few seconds) | One runs, the other gets `409 publish_in_progress` ("wait and refresh"); one post, no duplicate media | ☐ |
| 7 | Check WordPress | Exactly one post for the article (by slug), content / date updated, featured image set, no duplicate attachments | ☐ |
| 8 | Vercel: add `R2_ENDPOINT`, `R2_BUCKET`, `R2_PUBLIC_URL`, `R2_REGION`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (Production, server-side), flag still `supabase`; redeploy | App unchanged (Supabase URLs); no `NEXT_PUBLIC_` R2 variable | ☐ |
| 9 | Only if 1-7 passed: set `MEDIA_STORAGE_PROVIDER=r2` on Vercel, redeploy, generate one Pin | Pin URL starts with `https://media.n8nflow.org/images/pinterest/`, thumbnail displays; old Supabase images still display | ☐ |

Failure handling: WebP refused or not displayed by the WordPress host → switch the `wordpress-article` profile to its JPEG fallback (`lib/media/media-profiles.ts`, separate small fix) and redo steps 1-4. Duplicate post or media → stop, keep the flag on `supabase` in production, open a fix task with the publish logs (`[wordpress publish]` lines, no secrets). Rollback after step 9: flag back to `supabase` + redeploy (R2 URLs already stored keep working, nothing is migrated).

Record the date, the article / post ids and each step's result in this table and in TASKS.md (TASK-061).
