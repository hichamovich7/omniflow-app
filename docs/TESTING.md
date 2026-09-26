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
