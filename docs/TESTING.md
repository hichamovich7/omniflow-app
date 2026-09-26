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

# WordPress export — internal links in Copy Markdown / Copy HTML (TASK-FIX-052, 2026-09-26)

```bash
npx playwright test tests/renderer/wordpress-export-internal-links.spec.ts --project=renderer --reporter=list
```

Offline (28 cases, WordPress is a stubbed global `fetch` — no network, no database, no AI call): HTML export with `<a href>` links; Markdown export with `[anchor](url)` links and no HTML, differing from the original only by the inserted links; external links, images, figures, tables, quotes, code (fenced, indented, inline), ATX / setext headings, HTML blocks and FAQ (with and without H3) unchanged, a later H2 eligible again; one link per paragraph, no duplicate URL or post; max 3 (small) / 5 (medium, large); paragraphs with a link, autolink or bare URL skipped; parentheses encoded in Markdown URLs; option off → original export and no WordPress call (both formats); no site → skipped; new blog without posts and no relevant post → original export with the right informative message; WordPress API error → original export + non-blocking warning; success message with the link count; no content or credentials in logs; current article excluded; external post URL ignored; tags looked up, never created, nothing written to WordPress; stored article never modified; Keyword / Pins (source Pinterest keyword) / URL methods; wiring — the review page never computes links on render and always shows the copy buttons, the option is on by default and skips the request when off, the export route validates auth / Zod / ownership and writes nothing.

The existing `wordpress-internal-links.spec.ts` (43) and `wordpress-publish-seo.spec.ts` (36) still pass after the placement engine was shared between HTML and Markdown.

Validation (2026-09-26): TypeScript OK, ESLint (touched files) OK, spec 28/28, WordPress internal-links + publish SEO specs 79/79, full renderer 511/512 (same pre-existing `pinterest-text-importance-none.spec.ts` failure), production build OK, `git diff --check` OK. The authenticated browser tests stay skipped without `PLAYWRIGHT_STORAGE_STATE`; clipboard behavior in a real browser is a manual check.

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
