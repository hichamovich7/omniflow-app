# TASK-041 — Pinterest AI Integrated, Phase 2

Date: 2026-09-20

Status: implemented, revalidated and committed locally (2026-09-21); not pushed

## Objective

Add an `AI Integrated` image path to the existing Pinterest generator while retaining the current generated-photo-plus-SVG/Sharp path as `Legacy Composite` and exposing a clean `Photo Only` path. The public UI never selects a provider or model. Image routing remains server-owned through `AI_IMAGE_PROVIDER`, `AI_IMAGE_MODEL`, and `AI_IMAGE_MODEL_TEXT`.

## Audited current architecture

1. `app/(dashboard)/pinterest/page.tsx` loads the user's projects and boards and renders `components/pinterest/pin-form.tsx`.
2. `pin-form.tsx` validates the request with `generatePinsSchema`, then posts metadata-generation input to the existing `POST /api/pinterest/generate` route.
3. `app/api/pinterest/generate/route.ts` verifies the authenticated user and project, optionally analyzes a reference image, calls the FAST text role, validates the Pinterest package, and inserts `generations` and `pins` rows.
4. The generation detail page invokes the existing `POST /api/pinterest/generate-images` route. That route calls the central image service, versions files in `pin_images`, uploads to the existing `generated-images` bucket, and updates `pins.media_url`.
5. `lib/ai/services/image.ts` is the only image-provider router. `photo` uses the IMAGE role (`AI_IMAGE_PROVIDER` / `AI_IMAGE_MODEL`); the text-capable path uses `AI_IMAGE_MODEL_TEXT` through the already configured OpenRouter image endpoint.
6. `lib/ai/prompt-engine/engine.ts` currently asks the image model for a text-free photograph. `app/api/pinterest/generate-images/route.ts` then adds the bottom CTA to every image with `compositeBanner()`. For legacy `text-overlay` pins it also adds the headline via `composeHeadlineWithQualityGate()` (or the `compositeBanner()` fallback). Both ultimately use SVG and Sharp through `lib/pinterest/compositing.ts`.
7. Historical selection/versioning uses the existing `pin_images` rows. Local layout-only recomposition is implemented by the existing recompose routes and `lib/pinterest/manual-recomposition.ts`, using the stored raw source companion only for eligible legacy `text-overlay` pins.

## Target architecture

No route, table, storage bucket, credit rule, provider, package, or public model selector is added.

### Mode mapping

| UI mode | Persisted `pins.visual_format` | Image prompt | Post-processing |
| --- | --- | --- | --- |
| AI Integrated | `ai-integrated` | Exact final headline/subtitle/CTA plus creative direction and strict no-extra-text constraints | Sharp metadata stripping (EXIF/XMP/C2PA) and technical validation; no SVG, banner or text composition |
| Photo Only | `photo-only` | Existing photographic prompt and blanket no-text constraint | Sharp metadata stripping (EXIF/XMP/C2PA) and technical validation; no SVG, banner or text composition |
| Legacy Composite | Existing `photo` / `text-overlay` | Existing photographic prompt | Existing CTA, headline, template selection, Quality Gate and source-companion behavior unchanged |

The two new values are safe without a migration because migration 018 defines `pins.visual_format` as unconstrained `text`; application-level Zod/TypeScript validation is the existing repository convention.

### Strict request contract

`generatePinsSchema` receives a discriminated mode contract:

- `ai-integrated`: creative format, strategy, optional manual angle, headline/subtitle/CTA text modes, maximum line count, and relative importance.
- `photo-only`: no integrated-text settings.
- `legacy-composite`: the existing `textOverlayMode` setting.

AI Integrated uses the selected project's `default_language` as the effective language. The server derives it from the owned project and does not trust a client language override for this path.

### Persistence without schema changes

The resolved, final AI Integrated contract is stored under the private `_pinterestAiIntegrated` key in the existing JSON string `pins.image_analysis`. This follows the established `_pinterestStrategy` and `_pinterestCreativeDiagnostics` convention. It carries only rendering instructions and final approved strings; existing reference-style keys remain intact.

`overlay_text` and banner-template columns stay unused for `ai-integrated` and `photo-only`. Existing rows and values are not rewritten.

### Provider contract

`lib/ai/services/image.ts` remains the single provider boundary:

- `ai-integrated` resolves through the existing text-capable server model configuration (`AI_IMAGE_MODEL_TEXT`).
- `photo-only` and legacy `photo` resolve through `AI_IMAGE_PROVIDER` / `AI_IMAGE_MODEL`.
- Legacy `text-overlay` keeps its current routing.
- The request always generates one `1024x1536` (`2:3`) image. The integrated path requests final/high quality through the existing provider adapter; no fallback model is introduced.

The integrated prompt names only the resolved final text and explicitly forbids all additional words, pseudo-text, logos, watermarks and brand marks. It includes grounded creative directions for Hero Pin, Pattern Guide, Editorial Story and AI choice. Pattern Guide is disallowed from inventing materials, steps or instructions; Crochet and Home Decor directions remain niche-specific.

## Files concerned

Planned production changes:

- `components/pinterest/pin-form.tsx`
- `lib/validations/pinterest.ts`
- `types/database.ts`
- `types/pinterest.ts`
- `lib/prompts/pinterest-pins.ts`
- `lib/pinterest/strategy.ts`
- `lib/pinterest/ai-integrated.ts` (isolated contract, metadata, prompt and technical validation)
- `lib/ai/services/image.ts`
- `lib/ai/providers/openai.ts`
- `lib/ai/providers/openrouter.ts`
- `app/api/pinterest/generate/route.ts`
- `app/api/pinterest/generate-images/route.ts`

Tests/documentation:

- `tests/renderer/pinterest-ai-integrated.spec.ts` (new), `tests/renderer/ai-image-model.spec.ts` (one added case)
- `lib/guide/content.ts` (user-facing Guide, `generate` section)
- `components/pinterest/pin-diagnostic-badges.tsx`, `components/pinterest/pin-detail-dialog.tsx`, `components/pinterest/pin-batch-review-dialog.tsx` (mode labels and legacy-only layout diagnostics)
- `docs/API.md`, `docs/DATABASE.md`, `docs/UI_UX.md`, `docs/PROJECT.md`, `docs/TESTING.md`, `docs/CHANGELOG.md`, `docs/TASKS.md`
- this task file

No Supabase migration is planned or required.

## Compatibility risks and controls

1. **Historical pins accidentally taking the new path.** Control: only the two new explicit `visual_format` values bypass legacy composition; existing `photo` and `text-overlay` branches remain unchanged.
2. **Exact text being rewritten.** Control: exact strings are resolved server-side after FAST output validation and stored as the source of truth; the image prompt quotes them verbatim.
3. **Generated text missing or too long.** Control: Zod validates the generated integrated-text object, then a server resolver checks mode-specific presence and line limits before persistence.
4. **Manual strategy conflicting with batch validation.** Control: the server applies the manual angle deterministically; balanced coverage is enforced only for `Balanced angles`, while legacy keeps its present behavior.
5. **Pattern Guide hallucinating instructions.** Control: prompt eligibility is tied to supplied content evidence and explicitly prohibits invented steps/materials/instructions.
6. **SVG/Sharp text leaking into the new path.** Control: mode dispatch occurs before accent extraction, CTA selection, template selection and all compositing calls. Offline regression tests inspect this invariant.
7. **Unexpected provider parameters.** Control: adapters receive only the existing model, prompt and size plus the path-specific supported quality option; no user-controlled model/provider value enters the request.
8. **Malformed private JSON metadata.** Control: read helpers fail closed; legacy malformed metadata continues to be tolerated as it is today.
9. **Existing recompose UI on unsupported modes.** Control: it remains gated by legacy `visual_format === 'text-overlay'`, so AI Integrated and Photo Only cannot enter local SVG recomposition.

## Implementation and verification plan

1. Add the discriminated Zod contract and shared enums/types.
2. Add isolated AI Integrated metadata resolution, prompt construction and Sharp technical validation.
3. Extend FAST prompting/response validation for final integrated text while preserving the legacy response shape.
4. Persist the new mode values and private metadata through the existing generation route.
5. Dispatch the existing image route by stored mode before any legacy renderer call.
6. Add the progressive-disclosure mode UI, effective-language display and integrated settings, following the existing design system.
7. Add offline tests for text modes, lines, language, strategy, creative format, provider routing, and legacy/new renderer separation.
8. Run targeted tests, TypeScript, targeted ESLint, the production build, and `git diff --check`. Do not execute an image request.


## Exact provider contract (verified offline with a stubbed `fetch`)

With `AI_IMAGE_PROVIDER=openrouter` and `AI_IMAGE_MODEL_TEXT` set (currently `openai/gpt-image-2.5-flare`), an `ai-integrated` pin sends exactly one request:

```json
POST https://openrouter.ai/api/v1/images
{
  "model": "<AI_IMAGE_MODEL_TEXT>",
  "prompt": "<buildAiIntegratedImagePrompt(...)>",
  "aspect_ratio": "2:3",
  "quality": "high"
}
```

No `size`, reference image, fallback model or user-controlled field is sent, and the API key stays in the `Authorization` header only. The provider file is re-encoded by `sanitizeFinalPinterestImage()` before storage, which strips EXIF, XMP and the C2PA content-credentials manifest (TASK-FIX-033) without changing a pixel; no Sharp composition runs. Legacy `photo` / `photo-only` requests keep `{ model, prompt, size }` (OpenRouter) or `{ model, prompt, n, size, quality: "low" }` (OpenAI), byte for byte as before.

Real-world check against the Phase 1.2 benchmark output: the four shortlisted models returned 1024×1536, 1024×1536, 1366×2048 and 1696×2528 (ratios 0.6667-0.6709), all inside the ±0.01 technical tolerance. The configured model returns exactly 1024×1536.

## Difference between the three modes

| | AI Integrated | Photo Only | Legacy Composite |
| --- | --- | --- | --- |
| Who draws text | The image model, from the approved strings | Nobody — no text at all | SVG/Sharp after generation |
| `pins.visual_format` | `ai-integrated` | `photo-only` | `photo` / `text-overlay` (unchanged) |
| Image model | `AI_IMAGE_MODEL_TEXT` | `AI_IMAGE_PROVIDER` / `AI_IMAGE_MODEL` | Unchanged per legacy routing |
| Prompt | Approved headline/subtitle/CTA + creative format + strict no-extra-text | Photographic prompt + blanket no-text constraint | Photographic prompt |
| CTA "Save the Pin!" banner | Never | Never | Always |
| Headline template / Quality Gate / recomposition | Never | Never | Unchanged |
| Language | Inherited from the owned project | Requested | Requested |
| Post-processing | Sharp metadata stripping (EXIF/XMP/C2PA) and technical validation | Sharp metadata stripping (EXIF/XMP/C2PA) and technical validation | Existing renderer |

## Verification results (2026-09-21)

- `npx tsc --noEmit`: pass.
- ESLint on `app/api/pinterest`, `components/pinterest`, `lib/pinterest`, `lib/ai`, `lib/validations`, `lib/prompts`, `lib/guide`, `types`, `tests/renderer`: pass.
- `npx playwright test --project=renderer`: 178 passed (37 in the two AI-model specs, including 29 offline cases for the contract, text modes, lines, language, strategy, creative formats, FAST prompt, provider payloads, renderer isolation, historical metadata and UI mode labels).
- `npm run build`: pass.
- No image or paid provider request was made: every provider test stubs `fetch`.

The 2026-09-21 continuation also checked every `visual_format` reader. `PinDiagnosticBadges` now labels all three modes and does not show absent legacy template/position/Quality Gate fields for AI Integrated or Photo Only. The detail dialog displays the mode, and Batch Review applies layout metrics only to Legacy Composite Pins. Historical `photo` and `text-overlay` Pins remain readable without `_pinterestAiIntegrated`.

## Known limits and follow-ups (not implemented — outside this task)

- `quality: "high"` and `aspect_ratio: "2:3"` are verified for the configured OpenAI model. Phase 1 showed Gemini/Qwen endpoints advertise `resolution` rather than `quality`; if `AI_IMAGE_MODEL_TEXT` is later pointed at one of them, capability-aware parameter resolution (the benchmark runner already has it) would need to move into the production adapter. No fallback was invented.
- Text fidelity of the generated image (exact spelling, mobile legibility) is a property of the model and can only be judged visually; Sharp strips metadata and validates format/ratio/size, never the typography. A real-image review on a first `AI Integrated` generation is recommended before relying on it at scale.
- The resolved text is persisted before the image request, but there is no dedicated human approval/edit screen for AI-generated Headline, Subtitle or CTA in this phase. `Use exact text` is the only way to guarantee a user-specified string before generation.
- Pattern Guide grounding is currently expressed as a prompt constraint, not a deterministic server-side proof that the supplied content contains a complete pattern. Do not treat generated steps/materials as verified source facts.
- Credits are not touched: the Pinterest routes do not consume credits today, and this task adds no credit logic.

## Addendum — reference images in AI Integrated (2026-09-21)

### Problem

The pre-existing TASK-013 "Reference Image" control was shown, and its value sent, in every generation mode. In `AI Integrated` it only fed a Vision analysis whose result is text style guidance for the FAST prompt: the image itself was never sent to the configured image model (`AI_IMAGE_MODEL_TEXT`). A user could therefore believe the reference influenced the final image when it did not. `Photo Only` had the same shared control and the same Vision call.

### Decision

Until the real implementation (TASK-042: private storage and a provider `input_references` call) exists, `AI Integrated` accepts no reference at all, and `Photo Only` stays reference-free. The TASK-013 mechanism is kept, unchanged, for `Legacy Composite` only. TASK-042 is not modified.

### Before / after

| | Before | After |
| --- | --- | --- |
| AI Integrated — UI | Reference upload shown | Upload removed; visible note: "Reference images for AI Integrated are coming soon. A reference is not yet sent to the image model." |
| AI Integrated — request with `referenceImageUrl` | Accepted; Vision analysis ran; URL stored in `generations.reference_image_url` | Rejected with HTTP 400 `invalid_request` and a clear message, before any Vision or provider call; nothing stored |
| Photo Only | Upload shown, Vision ran | Upload hidden; a reference is rejected the same way (Photo Only is unreleased, so no history is affected) |
| Legacy Composite (and payloads with no `generationMode`) | Upload, Vision style analysis, stored URL | Identical |

Rejection covers any present value: a URL, a malformed URL, an empty string or `null`, so an obsolete client or a crafted request cannot slip a reference through. The form also no longer includes `referenceImageUrl` in the payload of the two new modes, so a reference attached under Legacy Composite and then abandoned by switching modes is never sent.

### Implementation

- `lib/validations/pinterest.ts`: `referenceImageUrl` moved out of the shared base schema; kept as-is on `legacy-composite`; `z.never()` with an explicit message on `ai-integrated` and `photo-only`. Exports `AI_INTEGRATED_REFERENCE_UNSUPPORTED_MESSAGE` and `PHOTO_ONLY_REFERENCE_UNSUPPORTED_MESSAGE`.
- `app/api/pinterest/generate/route.ts`: `referenceImageUrl` is derived only for `legacy-composite`, a second guard in front of the existing Vision step (the schema already rejects the request first).
- `components/pinterest/pin-form.tsx`: upload rendered only in Legacy Composite; notice in AI Integrated; the payload keeps the reference only in the legacy branch.
- No migration, bucket, storage, route, package or `.env` change. The SVG/Sharp renderer and the image route are untouched.

### Verification

- `npx tsc --noEmit`: pass. ESLint on the four touched files: pass.
- `npx playwright test --project=renderer`: 178 passed. The AI Integrated spec has 29 cases; 6 cover this correction: AI Integrated valid without a reference; AI Integrated rejects URL/malformed/empty/null with the exact message and path; Photo Only stays reference-free; Legacy Composite keeps its behavior, including payloads without `generationMode`; route ordering proves Vision is reachable only after validation and only for Legacy Composite; form source check.
- `npm run build`: pass.
- No Vision, OpenRouter or image call was made: every check is a schema or static test.

## Addendum — metadata stripping for the new modes (2026-09-22)

### Problem

TASK-FIX-033 removes embedded metadata (including the C2PA content-credentials manifest) from generated images, but only inside the OpenAI adapter (`sharp(...).png()`), and the legacy compositing re-encoded every image as a side effect. The first AI Integrated / Photo Only implementation skipped both — it stored the provider's bytes unchanged (`preserveOriginal`, Sharp used only to read dimensions) — so those images kept their metadata. Inspecting the Phase 1 originals showed a `caBX` C2PA chunk (~22-24 KB) in the configured `openai/gpt-image-2.5-flare` output, in `sunburst` and in Gemini (plus XMP); Qwen only had a small text chunk.

### Fix

- `sanitizeFinalPinterestImage()` in `lib/pinterest/ai-integrated.ts` re-encodes the provider file with Sharp (no `.withMetadata()`), then validates it: PNG is re-encoded losslessly (identical pixels); JPEG/WebP at quality 95 with EXIF orientation applied first, so a rotated file is not turned sideways.
- `POST /api/pinterest/generate-images` calls it in the `ai-integrated` / `photo-only` branch and uploads the result. Nothing is drawn or composed, the raw file is never stored for these modes, and the legacy branch, its raw source companion and the OpenAI adapter's re-encode are untouched.
- The now-unused `preserveOriginal` option of the OpenAI adapter was removed.

### Verification

`tests/renderer/pinterest-image-metadata.spec.ts` (offline): a PNG carrying a synthetic `caBX` C2PA chunk and an XMP `iTXt` chunk comes out with neither and with byte-identical pixels; a JPEG loses its EXIF and stays upright; the 2:3 / format / empty / unreadable checks still apply; and the real image route, run with Supabase and the provider replaced, uploads a metadata-free image for both new modes. With the fix reverted, the two new-mode route tests fail.

### Not covered

- Images already stored keep their metadata; only new generations are cleaned.
- Legacy `text-overlay` pins also store a raw "source companion" file used for recomposition; it is the provider file as returned and is not stripped (pre-existing, outside this fix).
