# TASK-041 — Pinterest AI Integrated, Phases 1/1.1: Model Benchmark and Safe Preflight

Status: implemented locally; discovery preflight passed; paid image execution intentionally not run.

## Scope

This task adds an isolated, reproducible benchmark for image models that may be able to generate a finished 2:3 Pinterest Pin with photography and exact integrated typography. It does not change `/pinterest`, production API routes, the database, credits, or the SVG/Sharp legacy renderer.

## Architecture

- `scripts/pinterest-ai-benchmark.ts`: standalone Node 22 TypeScript CLI.
- `benchmarks/pinterest-ai-integrated/fixtures/*.json`: four exact-text fixtures.
- `tests/renderer/pinterest-ai-benchmark.spec.ts`: offline CLI, fixture, dry-run and scoring tests.
- `.benchmark-output/pinterest-ai-integrated/`: local execution artifacts, ignored by Git.

Dry-run reads only local configuration and fixture files. `--preflight` performs only `GET` requests against OpenRouter's image-model catalog and per-model endpoint records; it cannot call the generation endpoint. `--execute` remains the only flag that can generate images, and it is mutually exclusive with `--preflight`. Execute mode reruns the same preflight and stops before generation if any exact slug is absent or incompatible. No alias or fallback is substituted.

The provider output is saved unchanged. Sharp is used only to inspect width, height, format, byte size and ratio; it never renders typography or other visual content.

The production abstraction in `lib/ai/services/image.ts` was deliberately not called by the runner: it exposes only prompt/size routing, while `lib/ai/providers/openai.ts` currently fixes `quality: 'low'` and neither production adapter exposes the optional reference/capability preflight required here. The isolated adapters reuse the same configured providers, exact model ids, credentials and response conventions without changing production behavior.

## Verified shortlist — live discovery on 2026-09-20

| Exact model id | Exists | Modalities in → out | References | Resolved parameters | Endpoints |
|---|---:|---|---:|---|---:|
| `openai/gpt-image-2.5-flare` | Yes | text, image → image | 16 | `aspect_ratio=2:3`, `quality=high` | 1 |
| `openai/gpt-image-2.5-sunburst` | Yes | text, image → image | 16 | `aspect_ratio=2:3`, `quality=high` | 1 |
| `google/gemini-3.1-flash-image` | Yes | image, text → image, text | 14 | `aspect_ratio=2:3`, `resolution=2K` | 2 |
| `qwen/qwen-image-3-pro` | Yes | text, image → image | 4 | `aspect_ratio=2:3`, `resolution=2K` | 1 |

All four exact slugs passed. No fallback was needed. Repeated `--model` options are accepted and deduplicated by `provider:model`. The discovery records did not advertise `output_format=png` for these endpoints, so the resolved request omits that parameter instead of sending an unsupported field.

## Capability policy

| Rule | Behavior |
|---|---|
| Ratio | `aspect_ratio=2:3` is mandatory on a compatible endpoint |
| OpenAI image models | `quality=high` is mandatory |
| Gemini/Qwen | `resolution=2K` is added only when advertised |
| Output format | `output_format=png` is added only when advertised |
| Reference | Added only to the explicitly paired fixture and only when endpoint capacity is at least 1 |
| Unsupported parameter | Omitted; never sent optimistically |

OpenRouter documents that supported parameters and pricing are endpoint-specific. The runner therefore reads both `/api/v1/images/models` and each returned endpoint-record URL before resolving a future request.

## Fixtures

1. Crochet Cat EN — headline, subtitle and CTA exactly as supplied.
2. Crochet Sweater EN — headline and subtitle; no CTA is invented.
3. Bathroom DE — headline and subtitle; full-room 75–80% photo plus compact cream upper text zone.
4. Kitchen DE — headline and subtitle; full-room 75–80% photo plus compact cream upper text zone.

## Evaluation

The JSON result created for every image contains nullable 0–5 fields for:

- exact text;
- mobile legibility;
- photographic quality;
- reference fidelity;
- aspect ratio;
- headline/subtitle/CTA hierarchy;
- absence of stray text;
- unobstructed subject;
- diversity;
- cost and duration.

Initial successful generations are `NEEDS_REVIEW`. Provider errors are `FAIL`. `PASS` requires completed strong human scores. Sharp's ratio inspection is technical evidence only and cannot promote a result to PASS. No OCR or Vision claim is made.

## Commands

Offline dry-run:

```powershell
npm run benchmark:pinterest-ai
```

Paid execution — documented but not run:

```powershell
npm run benchmark:pinterest-ai -- --execute
```

Discovery-only preflight:

```bash
npm run benchmark:pinterest-ai -- --preflight
```

Future paid benchmark with the shortlist frozen explicitly:

```bash
npm run benchmark:pinterest-ai -- --execute \
  --model openrouter:openai/gpt-image-2.5-flare \
  --model openrouter:openai/gpt-image-2.5-sunburst \
  --model openrouter:google/gemini-3.1-flash-image \
  --model openrouter:qwen/qwen-image-3-pro
```

Optional fixture-scoped reference; applying one global reference is rejected:

```powershell
npm run benchmark:pinterest-ai -- --execute --fixture crochet-cat-en --reference D:\path\cat-reference.png
```

## Calls and cost

Current default plan: 4 models × 4 fixtures × 1 variant = **16 future paid image-generation calls**. Preflight made 5 non-generation GETs: one catalog plus four endpoint-detail requests.

Discovered pricing:

- Flare and Sunburst: input image `$0.000008/token`, input text `$0.000005/token`, output image `$0.00003/token`.
- Gemini: output image `$0.00006/token` on both discovered endpoints.
- Qwen: input image `$0.003/image`, output `$0.04/image` at 1K or `$0.075/image` at 2K.

The selected Qwen 2K portion is exactly estimable at **$0.30 for four fixtures**. The complete 16-image benchmark cannot be estimated honestly before knowing OpenAI/Gemini token consumption, so `$0.30` is reported only as a known partial amount, not as the total or a guaranteed lower bound.

For diversity scoring, use at least `--variants 2`; the current single-variant plan cannot support a meaningful diversity judgment.

## Verification performed

- Default dry-run: 4 models, 4 fixtures, 1 variant, 16 planned future calls, zero calls executed.
- Live discovery-only preflight: all four models compatible; 5 GET requests; zero image calls.
- TypeScript: `npx tsc --noEmit` — passed.
- Targeted ESLint: runner and benchmark spec — passed.
- Focused benchmark tests: 8/8 passed.
- Full offline renderer suite: 146/146 passed.
- `git diff --check` — passed (line-ending warnings only on pre-existing working-tree conventions).

## Safety and limitations

- Dry-run is default and makes no network request.
- Preflight never calls `POST /api/v1/images`; incompatible or missing models produce a non-zero process exit code.
- Network behavior is mocked in automated tests; no test calls a provider.
- `--reference` without a preceding `--fixture <id>` is rejected. Unknown fixtures and duplicate reference assignments are rejected.
- Reference paths are converted to data URLs only in execute mode.
- Secrets are never written to prompts, fixtures, output metadata or errors.
- Provider errors are sanitized and truncated.
- No automatic text-quality verdict is presented without human review or a separately validated OCR/Vision process.
- The benchmark does not use or modify the legacy renderer.

## Phase 1.2 — Limited real benchmark (2026-09-20)

Authorized scope was enforced with `--max-calls 8`: two fixtures (`crochet-cat-en`, `bathroom-de`) × four exact models × one variant, with zero references and no retry behavior. The exact preflight passed immediately before generation. The paid pass then completed with **8 attempted, 8 generated, 0 failed**.

Output root:

`.benchmark-output/pinterest-ai-integrated/2026-09-20T07-05-28-210Z`

The output contains every original provider image, one `result.json` per image, `benchmark-plan.json`, `benchmark-summary.json`, and `comparison.html`. The comparison page shows all eight outputs side by side and exposes ten blank human-review criteria per image. Successful images start at `NEEDS_REVIEW`; no automatic winner is selected.

Provider-returned costs:

| Model | Bathroom | Crochet Cat | Model total |
|---|---:|---:|---:|
| `openai/gpt-image-2.5-flare` | $0.043025 | $0.042980 | $0.086005 |
| `openai/gpt-image-2.5-sunburst` | $0.043025 | $0.042980 | $0.086005 |
| `google/gemini-3.1-flash-image` | $0.1009885 | $0.1009790 | $0.2019675 |
| `qwen/qwen-image-3-pro` | $0.075000 | $0.075000 | $0.150000 |
| **Total** | **$0.2620385** | **$0.2619390** | **$0.5239775** |

Technical inspection confirmed eight valid PNG files and a ratio within 1% of 2:3 for every result. Dimensions were 1024×1536 for both OpenAI models, 1696×2528 for Gemini, and 1366×2048 for Qwen. No reference path or secret was present in the plan or result artifacts.
