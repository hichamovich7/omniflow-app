# TASK-042 — Pinterest AI Integrated: one reference image per generation

Date: 2026-09-21

Status: PLANNED — documentation only. Nothing here is implemented, and this is not the active task.

Depends on: TASK-041 Phase 2 (`AI Integrated` generation mode). Follows the Phase 1/1.1/1.2 benchmark record in `TASK-041-PINTEREST-AI-INTEGRATED-PHASE-1.md`.

Every file, contract and provider field below is a proposal to be confirmed against the code and the provider's current documentation at implementation time.

## Goal

Let the user optionally attach **one** reference image to a `AI Integrated` Pinterest generation and have the server-configured image model receive it as a visual reference, to guide style, composition or subject — never to copy the image or reproduce its text.

- No reference → the current `AI Integrated` behavior, unchanged: same prompt, same provider payload, **no Vision call, no additional cost**.
- The model and provider remain entirely server-owned (`AI_IMAGE_PROVIDER`, `AI_IMAGE_MODEL`, `AI_IMAGE_MODEL_TEXT` in `.env.local`). The user never selects or sees a model.

## Constraints for this initial task

- One reference per generation. No reference library, no shared folder, no reuse across generations.
- No Supabase migration in this task. A choice that needs one is out of scope and must be split into a separately approved task (see open decision 1).
- No public model selector, no new provider, no fallback model, no new package.
- Compatible with `AI Integrated` only. `Photo Only` and `Legacy Composite` never receive a provider reference.
- Historical generations and pins are untouched. The SVG/Sharp legacy renderer, recomposition routes and Quality Gate are not modified.
- No API key, durable/signed URL, storage path or private image content in any API response, log or error.

## Current state (audited 2026-09-21)

1. **A reference-image feature already exists (TASK-013), and it is not the same thing.** `components/pinterest/reference-image-upload.tsx` (JPG/PNG/WebP, 5 MB) → `POST /api/pinterest/reference-image` → bucket `reference-images` → returns a **permanent public URL** → sent as `referenceImageUrl` to `POST /api/pinterest/generate` → a Vision call (`analyzeImage`) extracts palette/materials/mood/lighting as **text** guidance for the FAST prompt and `pins.image_analysis`. The image itself is never sent to an image model. The URL is stored in `generations.reference_image_url`.
2. **Modes after the TASK-041 Phase 2 reference hotfix (2026-09-21):** `AI Integrated` and `Photo Only` accept **no** reference. Any `referenceImageUrl` (URL, malformed URL, empty string or `null`) is rejected with HTTP 400 `invalid_request` before any Vision or provider call, and the AI Integrated form shows "Reference images for AI Integrated are coming soon. A reference is not yet sent to the image model." Only `Legacy Composite` (and payloads without `generationMode`) temporarily keeps the old reference + Vision flow described above, unchanged. This task remains responsible for adding, later, a reference that is actually sent to the image model through private storage and `input_references`; it is what will lift the `AI Integrated` rejection, and how the two flows combine is open decision 7.
3. **Weaknesses of the existing flow that this task must not inherit:** the bucket is public with permissive policies and no per-user RLS scoping (migration 021, `docs/DECISIONS.md`); the upload route trusts the client-declared `file.type` and does not check dimensions; `POST /api/pinterest/generate` validates `referenceImageUrl` only as a well-formed URL — there is no server-side check that it points to the caller's own object.
4. **Images are generated in a second, later and repeatable request** (`POST /api/pinterest/generate-images`, invoked from the generation detail page; also for new versions and selective regeneration). The reference must therefore still be readable server-side at that time — it cannot live only in the browser or in the first request.
5. **Production adapters have no reference support.** `lib/ai/services/image.ts` routes `ai-integrated` to OpenRouter with `{ model, prompt, aspect_ratio: "2:3", quality: "high" }`.
6. **The only reference-capable code is the Phase 1.1 benchmark runner** (`scripts/pinterest-ai-benchmark.ts`): it reads the endpoint's `supported_parameters.input_references` capacity and sends `input_references: [{ type: "image_url", image_url: { url: "<data URL>" } }]`. Discovery on 2026-09-20 recorded capacities of 16 (both `gpt-image-2.5-*`), 14 (Gemini) and 4 (Qwen). **This request shape was never exercised live** (the 8-call run used zero references), so it is unverified for production.

## User flow

1. On `/pinterest`, the user selects `AI Integrated`. An optional "Reference image" control appears inside the AI Integrated settings, with a short explanation: it guides style, composition or subject; the AI will not copy it or its text.
2. The user attaches one JPG/PNG/WebP file, sees a local preview, and can remove it before submitting. Switching to `Photo Only` or `Legacy Composite` removes or disables the control and explains why.
3. On submit the server validates the file (see Security), decides how it is stored, and creates the generation. Without a reference, nothing new happens.
4. On the generation detail page, image generation loads the reference server-side and sends it to the configured image model with the approved-text prompt. The approved text remains the only text allowed in the image.
5. New versions and regenerations of pins in that generation reuse the same reference while it is retained (decision 2).
6. The pin detail dialog (`components/pinterest/pin-detail-dialog.tsx`) shows a clear indicator such as "Reference image used" — a label only; no URL, no path and, by default, no image (decision 10).
7. If the configured model does not support references, the user gets an explicit message before any paid call (decision 6).

## Files and zones probably concerned (to confirm)

- UI: `components/pinterest/pin-form.tsx`, `components/pinterest/reference-image-upload.tsx`, `components/pinterest/pin-detail-dialog.tsx`.
- Contract: `lib/validations/pinterest.ts`, `types/pinterest.ts`, `lib/pinterest/ai-integrated.ts` (optional `reference` metadata, prompt guidance sentence).
- Provider boundary: `lib/ai/services/image.ts`, `lib/ai/providers/openrouter.ts`. The OpenAI adapter is unaffected because `ai-integrated` always resolves through OpenRouter.
- Routes: `app/api/pinterest/generate/route.ts` (mode gating, ownership, Vision decision), `app/api/pinterest/generate-images/route.ts` (load bytes, pass to the adapter), and `app/api/pinterest/reference-image/route.ts` only if the upload endpoint is reused and hardened.
- Documentation: `docs/API.md`, `docs/UI_UX.md`, `docs/TESTING.md`, `docs/TASKS.md`, `docs/CHANGELOG.md`, `docs/PROJECT.md`, `docs/DATABASE.md` (only if storage semantics change), and the in-app Guide `lib/guide/content.ts` (mandatory, user-facing feature).
- Tests: `tests/renderer/` (offline) and `tests/playwright/` (gated browser tests).
- **Not touched:** `lib/pinterest/compositing.ts` and the rest of the SVG/Sharp renderer, recomposition routes, Quality Gate, existing migrations, `.env.local`, existing tests (new tests are added beside them).

## Envisaged data contract

### Request — `POST /api/pinterest/generate`

Additive and optional; a payload without it parses exactly as today.

- Reuse the existing `referenceImageUrl` field, accepted **only** when `generationMode = "ai-integrated"`. Any other mode with a reference is rejected with a clear validation error rather than silently ignored (decision 14).
- The server never trusts the value: it derives the storage object from the URL/key, requires the caller's own prefix (`<user.id>/`) in the expected bucket, and downloads the bytes with its own server client. An external URL is rejected.
- No field selects a provider or model; unknown keys stay rejected/dropped as today.

### Persistence (no migration)

- The object reference stays where it already lives: `generations.reference_image_url` (existing column). Whether that value may remain a public URL is open decision 1.
- Per-pin metadata: an optional `reference` object added to the strict `_pinterestAiIntegrated` schema in `pins.image_analysis`, e.g. `{ "used": true, "mimeType": "image/jpeg", "width": 1200, "height": 1800, "bytes": 412345 }`. It carries technical facts only — never a URL, path or pixel data. Historical rows have no `reference` key and stay valid.

### Provider call

- `generateImage({ prompt, size, visualFormat, reference? })` where `reference` is `{ buffer, mimeType }` prepared server-side.
- OpenRouter adapter, only when `reference` is present, adds the reference as a base64 data URL built from bytes the server read itself. The provider never receives a durable Supabase URL. Candidate shape (from the benchmark runner, **to verify against OpenRouter's current documentation before coding**): `input_references: [{ type: "image_url", image_url: { url: "data:<mime>;base64,<…>" } }]`.
- Without a reference, the body stays exactly `{ model, prompt, aspect_ratio: "2:3", quality: "high" }` (the TASK-041 test already pins this).
- The prompt gains one guidance sentence only when a reference is present, along the lines of: use the reference image as visual guidance for style, composition or subject; do not copy it; do not reproduce any text, logo, watermark or brand mark visible in it. The existing strict "render only the approved text" constraint stays authoritative.

### Response

Responses expose at most a boolean such as `referenceUsed`. No URL, path, signed URL, data URL, key or provider payload. Any existing server-rendered/API payload that carries `generations.reference_image_url` to the client must be audited so the new feature does not widen exposure.

## Security validations (server-side, all required)

- **Auth and ownership:** authenticated user; object prefix equals the caller's id; fixed bucket; reject external hosts (SSRF), path traversal, foreign ids.
- **Type:** verify the real format by decoding with Sharp (magic bytes), not the client-declared `Content-Type`. Allow JPG/PNG/WebP only; reject SVG, GIF, animated images, HEIC/AVIF and corrupt files.
- **Size and dimensions:** enforce the byte limit (decision 3), a minimum/maximum dimension range and a total-pixel cap (Sharp `limitInputPixels`) against decompression bombs (decision 5).
- **Metadata:** re-encode before sending to the provider so EXIF/GPS and other embedded metadata are stripped and orientation is applied.
- **Mode gating:** reference only with `ai-integrated`, enforced on the server, not only hidden in the UI.
- **Rate limiting:** keep the existing upload limit (30/hour) and the existing generation limits.
- **No leakage:** never log the request body (it contains the image), the data URL, keys or storage paths; provider errors are surfaced without echoing the request; no secret or durable URL in any response.
- **Prompt injection:** text inside the reference image is never instruction. The approved-text contract and the no-extra-text ban take precedence; no OCR of the reference is performed.
- **Fail closed:** any validation failure stops the call before the provider is contacted.

## Tests expected

### Unit / offline (renderer project, `fetch` and Supabase stubbed — no paid call)

- Schema: reference accepted only with `ai-integrated`; rejected with `photo-only` and `legacy-composite`; a payload without a reference is byte-for-byte unchanged in behavior.
- Ownership parsing: own prefix accepted; foreign user id, external host, `../` traversal and wrong bucket rejected.
- File validation: real format vs declared type, renamed GIF/SVG, corrupt file, oversize bytes, oversize/undersize dimensions, pixel-cap bomb, animated WebP.
- Metadata: EXIF/GPS removed from the re-encoded buffer.
- Adapter payload (stubbed `fetch`): with a reference the body adds only the reference field and the other keys are unchanged; without one the body equals `{ model, prompt, aspect_ratio, quality }`; no key, storage URL or path appears in the body or logs.
- Prompt: guidance sentence present only with a reference and the strict text ban still present; without a reference the prompt is identical to today's.
- No Vision call without a reference (spy/static check); behavior with a reference follows decision 7.
- Unsupported-model behavior per decision 6 (fails before any provider call).
- Route static checks: the legacy branch of `generate-images` is unchanged; responses contain no URL/path/data URL.
- Regression: all existing TASK-041 and renderer tests still pass unmodified.

### Playwright (browser; gated by `PLAYWRIGHT_STORAGE_STATE` like the existing suites — skipped, never bypassed, when absent; desktop and mobile)

- AI Integrated shows the optional Reference control; Photo Only and Legacy Composite do not, with an explanation.
- Attach → local preview → remove → submit without a reference.
- Invalid type and oversize file produce the expected messages and no request is sent.
- After generation with a reference, the pin detail shows "Reference image used" and the DOM contains no image URL, storage path or data URL for it; a pin without a reference shows nothing; a historical pin is unchanged.
- No network response body contains a `reference-images` URL or a data URL.
- Provider calls are mocked or use fixtures in CI. A real-provider check (request shape, actual fidelity) is a separate manual step requiring explicit user authorization and a call budget, as in Phase 1.2.

## Open decisions

1. **Stored temporarily or persistently?** The image must survive between `generate` and a later, repeatable `generate-images` (versions, selective regeneration), so a transient in-request approach only works if the upload moves to the image request. Options: (a) reuse the `reference-images` bucket and `generations.reference_image_url` — no migration, but the bucket is public and the upload route returns a permanent URL, which conflicts with the "no durable URL in responses" constraint; (b) a private bucket/path read only by the server — needs a migration/policies and therefore a separate approved task; (c) upload at image time and do not persist — no versions or regeneration. Recommendation to validate: implement (a) with strict server-side checks and never re-expose the URL after upload, and split (b) into a follow-up.
2. **Retention and deletion:** keep for the generation's lifetime, delete after N days, delete with the generation/account, or delete immediately after the last image version.
3. **Weight limit:** keep 5 MB (current) or lower (for example 2-3 MB after server re-encode). Base64 inflates the body by about a third on every pin call of the batch, and the provider's request-size limit is unverified.
4. **Accepted formats:** JPG, PNG and WebP as today (verified by decoding); HEIC, AVIF, GIF and animated WebP excluded — confirm.
5. **Dimension bounds and downscaling:** minimum and maximum size, pixel cap, and whether to downscale to a maximum long edge before sending (also reduces cost and payload).
6. **Provider does not support references:** (a) fail closed with an explicit message before any paid call — recommended; (b) proceed without the reference but tell the user — acceptable only if explicit, never silent; never fall back to another model. Where to detect it: the endpoint's `supported_parameters.input_references` capacity (as in the benchmark preflight), at the cost of an extra discovery request per generation, or a cached result.
7. **Vision analysis when a reference is attached in AI Integrated:** keep the existing Vision text guidance (extra cost and latency) or skip it because the image itself now guides the model. "No reference means no Vision call" holds in both cases. Leaning: skip.
8. **One reference for every pin of the generation:** each pin call carries the image (cost) and pins may look too similar. Confirm this is acceptable versus a subset of pins, and how it interacts with the version variation directive.
9. **Guidance strength:** one fixed instruction (style/composition/subject) or a Style / Composition / Subject / Auto selector. A selector is scope expansion; leaning: no selector initially.
10. **Pin detail display:** indicator only (recommended) or an owner-only thumbnail.
11. **UI shape:** one control whose meaning depends on the mode (style analysis in Photo Only/Legacy as today, visual reference in AI Integrated) or two distinct controls.
12. **Cost visibility:** a reference adds provider input cost on every pin call. Credits are not consumed by Pinterest routes today (`credits_used: 0`), so decide whether this is shown to the user.
13. **Live validation:** which authorized real call confirms the request shape and fidelity before release (needs explicit authorization and a budget cap).
14. **Reference sent with a non-AI-Integrated mode:** reject with a clear error (recommended) versus ignore.
15. **Hardening the existing TASK-013 upload route** (magic-byte check, dimension limits): in scope, or left as is for the Vision flow.

## Success criteria

- An `AI Integrated` generation with one valid reference produces provider requests that carry it as a visual reference and images that follow its style/composition/subject without copying it or its text.
- Without a reference, prompts, provider payloads and Vision usage are identical to today's.
- `Photo Only`, `Legacy Composite`, historical pins, the SVG/Sharp renderer and recomposition are unchanged.
- No secret, durable URL, path or private image content appears in any response, log or error.
- The pin detail clearly indicates when a reference was used.
- TypeScript, ESLint, offline tests, production build and the gated Playwright tests pass; the Guide, API, UI_UX, TESTING, TASKS and CHANGELOG are updated; no paid call is made without explicit authorization.
