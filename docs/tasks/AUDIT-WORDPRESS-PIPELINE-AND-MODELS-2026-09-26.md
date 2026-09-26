# Audit — WordPress pipeline & AI models (2026-09-26)

Status: AUDIT ONLY — no functional code, `.env*`, model or database was changed. No paid AI call was made. The OpenRouter catalog was read from the free public endpoints `GET https://openrouter.ai/api/v1/models` and `GET https://openrouter.ai/api/v1/models?output_modalities=image` on 2026-09-26.

Model identifiers below are copied from that catalog, never guessed. Quality judgments are marked **unmeasured** unless an OmniFlow benchmark exists; prices are the catalog's list prices.

---

## 1. How models are resolved (code, not `.env`)

| Layer | File | Rule |
| --- | --- | --- |
| Role → model | `lib/ai/config.ts` `getRoleConfig()` | `AI_<ROLE>_PROVIDER` / `AI_<ROLE>_MODEL`, else legacy env, else hard default (`google/gemini-2.5-flash` for FAST/SMART/VISION, `openai` + `gpt-image-1` for IMAGE) |
| Text | `lib/ai/services/text.ts` | Roles `FAST` / `SMART` only. `FAST` always sends `reasoning.effort = "minimal"`; `SMART` sends no effort (provider default) |
| Image | `lib/ai/services/image.ts` `resolveImageModel()` | `photo` (default) → role `IMAGE` (`AI_IMAGE_PROVIDER` + `AI_IMAGE_MODEL`). `text-overlay` / `ai-integrated` → always OpenRouter + `AI_IMAGE_MODEL_TEXT` (throws if unset) |
| Vision | `lib/ai/services/vision.ts` | Role `VISION`, OpenRouter only |
| Transport | `lib/ai/providers/openrouter.ts` | Every text call sends `response_format: json_object`, `temperature` (default 0.7), `max_tokens`; 3 retries on mid-stream `finish_reason: error`; logs (does not repair) `finish_reason: length` |

Effective values in `.env.local` (keys excluded):

```env
AI_FAST_PROVIDER=openrouter    AI_FAST_MODEL=openai/gpt-5-mini
AI_SMART_PROVIDER=openrouter   AI_SMART_MODEL=openai/gpt-5
AI_VISION_PROVIDER=openrouter  AI_VISION_MODEL=openai/gpt-5
AI_IMAGE_PROVIDER=openrouter   AI_IMAGE_MODEL=openai/gpt-image-2.5-flare
                               AI_IMAGE_MODEL_TEXT=openai/gpt-image-2.5-flare
```

`.env.example` still documents `AI_IMAGE_PROVIDER=openai` / `AI_IMAGE_MODEL=gpt-image-1` and an empty `AI_IMAGE_MODEL_TEXT` — drift from the real configuration.

## 2. Every AI call actually made

| Step | Call site | Role | Real model today | Limits |
| --- | --- | --- | --- | --- |
| WP outline (keyword, URL, pins) | `lib/wordpress/generate-article.ts`, `generate-article-from-url.ts` (`TEXT_ROLE`) | FAST | `openai/gpt-5-mini` | 3 000 tokens, 60 s |
| WP full article | same | FAST | `openai/gpt-5-mini` | 8 000 tokens (11 000 for `large`), 120 s |
| WP external link (web search) | `lib/ai/services/external-link.ts` | FAST + OpenRouter `web` plugin (Exa) | `openai/gpt-5-mini` | best-effort, 90 s |
| WP source summary (Option 3 URL) | `generate-article-from-url.ts` | FAST | `openai/gpt-5-mini` | — |
| WP SEO keyword suggestions | `app/api/wordpress/suggest-keywords/route.ts` | FAST | `openai/gpt-5-mini` | — |
| WP featured image | `generate-article.ts` → `generateImage({ size: '1024x1024' })` | IMAGE (`photo`) | `openai/gpt-image-2.5-flare` via OpenRouter | no `quality` sent (provider default) |
| WP internal images (keyword/URL) | same | IMAGE (`photo`) | `openai/gpt-image-2.5-flare` | concurrency 3 |
| Pinterest titles/descriptions/keywords/image prompts | `app/api/pinterest/generate/route.ts` (prompt `pinterest-pins-v10`) | FAST | `openai/gpt-5-mini` | `estimateMaxTokens()` |
| Pinterest images `photo` | `app/api/pinterest/generate-images/route.ts` | IMAGE | `openai/gpt-image-2.5-flare` | — |
| Pinterest images `text-overlay` / `ai-integrated` | same | `AI_IMAGE_MODEL_TEXT` | `openai/gpt-image-2.5-flare` | AI Integrated: `aspect_ratio 2:3`, `quality high` |
| Vision style analysis (Legacy Composite reference only) | `app/api/pinterest/generate/route.ts` → `analyzeImage` | VISION | `openai/gpt-5` | 1 200 tokens |
| Content Analyzer | `lib/analyzer/engine.ts` | SMART | `openai/gpt-5` | — |

Observations:

* **No WordPress step uses SMART.** `TEXT_ROLE` in `lib/wordpress/generate-article.ts` is `'FAST'`. Outline and article cannot use different models today — they share one constant and one role.
* There is **no automated research step** in Method A. "Research" is only optional user-pasted `researchNotes`. Firecrawl scraping exists only in Option 3 (URL source).
* No step records the model used: `wordpress_generations` has no `model_used`, `wordpress_article_images` has no `image_model` (Pinterest has both since TASK-FIX-018).
* If `TEXT_ROLE` were switched to `SMART` (`openai/gpt-5`, default reasoning effort), hidden reasoning would consume part of the 8 000-token budget → higher truncation risk. Any switch needs the budget re-sized.
* OpenAI models on OpenRouter list `temperature` as **unsupported**; the code always sends it (OpenRouter drops unsupported params). Harmless but misleading.

## 3. Method A — Keyword → article (`POST /api/wordpress/generate`)

```text
Form /wordpress/blog-post (keyword, project, language, Core Settings, Structure, SEO keywords, manual URLs, research notes)
→ [optional, before submit] "Generate with AI" SEO keywords  — FAST
→ auth + rate limit 20/h + trial cap (checkRateLimit, enforceTrialLimit) + Zod + project/category ownership
→ INSERT wordpress_generations (status processing)
→ outline — FAST, Zod-validated, title/metaTitle/slug/metaDescription truncated deterministically
→ article (Markdown in JSON) — FAST, Zod-validated; H1, 10-block AEO structure, Key Takeaways, FAQ (structured field)
→ addExternalLink — FAST + web search, best-effort (article kept unchanged on failure)
→ images — featured + 2-3 internal, generated in parallel from the outline's English prompts
   storage: bucket wordpress-images/{userId}/{generationId}/{FEATURED|IMAGE_N}.png, public URL
   a failed image is dropped (marker removed), never blocks the article
→ INSERT wordpress_articles (featured_image_url on the row) + wordpress_article_images (internal only)
→ status completed
→ review: /wordpress/[id] — read-only render, category editor, Copy Markdown / Copy HTML / Download .md
→ publish: POST /api/wordpress/[id]/publish — uploads featured + internal images to the WP media library
   (internal-image upload failure → Supabase URL kept), status draft / publish / future
```

* **No Pinterest Pins are generated** from Method A; there is no article → pins link at all.
* No content editing, no image regeneration, no versioning of the article after generation.
* **Credits are not consumed**: TASK-011 (Credits System) is still PLANNED; `credit_transactions` is not written anywhere. Only the rate limit and the lifetime trial counter apply.

Images in Method A: **generated for the article**, prompts written by the outline step (English, photorealistic scene, no text), stored in Supabase `wordpress-images`, associated through `wordpress_articles.featured_image_url` and `wordpress_article_images.article_id`, deleted with the generation (`DELETE /api/wordpress/[id]` removes the storage folder).

## 4. Method B — Existing Pins → article (`POST /api/wordpress/generate-from-pins`)

```text
Pinterest generation page → select pins (SelectionActionBar) → "Generate WordPress Article"
→ auth + rate limit + trial cap + Zod
→ all pins must exist and belong to ONE generation owned by the caller (else 404 / 400 / 403)
→ project and language derived from the pins (pins[0].language) — no selectors
→ read pin title, description, keywords  (NOT image_prompt, board, overlay text or image_analysis)
→ read the active pin_images.url of every selected pin (uncapped, TASK-FIX-009)
→ INSERT wordpress_generations (source_type 'pins', source_pin_ids, keyword = first 3 titles joined)
→ outline from pins — FAST (wordpress-from-pins-prompt); one image slot per pin that has an image
→ article — FAST, same article prompt as Method A but with NO Core Settings / Structure / SEO keywords / manual URLs
→ addExternalLink — same as A
→ featured image — NEWLY generated from a new "unified theme" prompt (IMAGE role, flare), stored in wordpress-images
   unguarded: a featured-image failure fails the whole article (unlike A)
→ internal images — the pins' own images, REUSED by URL as-is (no generation, no copy, no re-upload)
→ INSERT wordpress_articles + wordpress_article_images → completed → same review / export / publish as A
```

| Question | Answer |
| --- | --- |
| Images reused from the Pins? | **Internal images: yes**, the active version's public URL, unchanged |
| Regenerated for the article? | **Featured only**, always newly generated |
| Different prompt? | Featured: yes, a new prompt written by the outline. The `prompt` stored in `wordpress_article_images` for reused images is an AI-written description, **not** the pin's real `image_prompt` |
| Stored in Supabase? | Featured: `wordpress-images` bucket. Internal: stay in the Pinterest storage, referenced by URL only |
| Correctly associated? | Article ↔ generation: yes (`generation_id`, `source_pin_ids`). Article ↔ pin image: only by URL — no FK to `pin_images` |

Risks found in Method B:

1. **Pinterest creatives inside the article body.** Reused images are 2:3 Pins that can carry integrated text, the title banner or the "Save the Pin" CTA (Legacy Composite / AI Integrated). Unsuitable as in-article illustrations.
2. **Alt text is written blind.** The text model writes alt text from the pin's title/description without seeing the image (no Vision step) → possible mismatch.
3. **Dangling URLs (confirmed for image versions).** `DELETE` in `app/api/pinterest/pin-images/[id]/route.ts` removes the storage file (and its source companion) that an article may still reference → broken image in the article and in the next WordPress publish. Pin/generation deletion paths not audited.
4. Article options from `/wordpress/blog-post` (size, tone, structure, SEO keywords) are unavailable in this mode.
5. A raw, pre-composition source image already exists next to each composited pin image (`getPinSourceStoragePath()`), which would be a text-free alternative for in-article use.

## 5. Cross-cutting findings

* **C2PA/metadata stripping is bypassed for WordPress images.** TASK-FIX-033 re-encodes through `sharp` only in `lib/ai/providers/openai.ts`. With `AI_IMAGE_PROVIDER=openrouter`, WordPress images (and Pinterest `photo` images unless composited) come from `lib/ai/providers/openrouter.ts`, which returns the raw bytes. They are uploaded as `image/png` even if the provider returned another format.
* **No model traceability for WordPress** (text or images).
* **No credit accounting** anywhere (TASK-011).

## 6. OpenRouter catalog check (2026-09-26)

Requested models, verified identifiers:

| Screenshot name | Catalog id | Status |
| --- | --- | --- |
| DeepSeek V4.1 Flash | `deepseek/deepseek-v4.1-flash` | Available (2026-09-10) |
| Z.ai GLM-5.3 Flash | `z-ai/glm-5.3-flash` | Available (2026-08-26); faster variant `z-ai/glm-5.3-flashx` |
| OpenAI GPT-5.6 Luna | `openai/gpt-5.6-luna` (+ `-pro`) | Available |
| OpenAI GPT-5.6 Terra | `openai/gpt-5.6-terra` (+ `-pro`) | Available |
| OpenAI GPT-6 Luna | `openai/gpt-6-luna` | Available (2026-09-22) |
| OpenAI GPT-6 Luna Pro | `openai/gpt-6-luna-pro` | Available — same model served with `reasoning.mode = pro` |
| OpenAI GPT-6 Terra | — | **Not in the catalog.** GPT-6 exists only as Luna, Sol (and Astra, mentioned in the description) |
| Current image model | `openai/gpt-image-2.5-flare` | Available; sibling `openai/gpt-image-2.5-sunburst` (precision tier) |

### Text models

Prices in USD per million tokens (input / output). "Est. / article" = outline + article + external link, **assumption: ~8k input and ~10k output tokens including hidden reasoning** — an order of magnitude, not a measurement.

| Model | In / Out | Context · max out | JSON (`response_format` / structured) | Temp. | Est. / article | Positioning (vendor) |
| --- | --- | --- | --- | --- | --- | --- |
| `openai/gpt-5-mini` (current FAST) | 0.25 / 2.00 | 400k · 128k | Y / Y | n | ~$0.022 | Previous-generation small model |
| `openai/gpt-5` (current SMART/VISION) | 1.25 / 10.00 | 400k · 128k | Y / Y | n | ~$0.11 | Previous-generation flagship |
| `openai/gpt-5.6-luna` | 0.20 / 1.20 | 1.05M · 128k | Y / Y | n | ~$0.014 | Fast, cost-efficient |
| `openai/gpt-5.6-terra` | 2.00 / 12.00 | 1.05M · 128k | Y / Y | n | ~$0.14 | Balanced tier between Luna and Sol |
| `openai/gpt-6-luna` | 0.10 / 0.50 | 1.05M · 128k | Y / Y | n | ~$0.006 | Fast, cost-efficient, newest |
| `openai/gpt-6-luna-pro` | 0.10 / 0.50 | 1.05M · 128k | Y / Y | n | > Luna (more reasoning tokens) | Luna with `reasoning.mode = pro` |
| `openai/gpt-6-sol` | 2.00 / 10.00 | 1.05M · 128k | Y / Y | n | ~$0.12 | High-end, below Astra |
| `deepseek/deepseek-v4.1-flash` | 0.10 / 0.60 | 1.05M · 944k | Y / Y | Y | ~$0.007 | Sparse MoE, text + image input |
| `z-ai/glm-5.3-flash` | 0.04 / 0.14 | 1.31M · 128k | Y / Y | Y | ~$0.002 | Coding / agent oriented |
| `google/gemini-3.8-flash` | 0.75 / 3.75 | 1.05M · 65k | Y / Y | Y | ~$0.044 | Most capable Flash |
| `anthropic/claude-sonnet-5` | 2.00 / 10.00 | 1.0M · 128k | Y / Y | n | ~$0.12 | Frontier writing / professional work |

### Qualitative comparison (unmeasured — to be confirmed by a benchmark)

Legend: ● strong expectation, ◐ probable, ○ uncertain / known risk, ? no signal. Priors from vendor positioning and model tier, **not OmniFlow measurements**.

| Criterion | gpt-5-mini (now) | gpt-6-luna | gpt-5.6-terra | gpt-6-sol | deepseek-v4.1-flash | glm-5.3-flash | claude-sonnet-5 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Long SEO writing (2-5k words) | ◐ | ◐ | ● | ● | ◐ | ○ | ● |
| Outline / H2-H3 structure | ● | ● | ● | ● | ◐ | ◐ | ● |
| Language adherence EN/DE/FR/ES | ● | ◐ | ● | ● | ◐ | ○ | ● |
| Idiomatic DE/FR/ES | ◐ | ? | ● | ● | ○ | ○ | ● |
| Factual consistency | ◐ | ◐ | ● | ● | ◐ | ○ | ● |
| Meta title / description in limits | ◐ (truncated by code anyway) | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ |
| FAQ / Key Takeaways arrays | ● | ● | ● | ● | ◐ | ◐ | ● |
| Instruction following (toggles, bans) | ◐ | ◐ | ● | ● | ◐ | ○ | ● |
| JSON validity (json_object mode) | ● | ● | ● | ● | ◐ | ◐ | ● |
| Truncation risk at 8k/11k budget | low (minimal effort) | low if `minimal` accepted — verify | medium (reasoning) | medium (reasoning) | low | low | low–medium |
| Cost | low | lowest tier | high | high | very low | very low | high |
| Latency | fast | fast | medium | medium–slow | fast | fast | medium |
| Image-prompt quality (outline) | ◐ | ◐ | ● | ● | ◐ | ○ | ● |

### Image models

| Model | Pricing (catalog) | OmniFlow evidence | Notes |
| --- | --- | --- | --- |
| `openai/gpt-image-2.5-flare` (current) | out image $30 / M image tokens | **Measured** (TASK-041 Phase 1.2): ~$0.043 per 2:3 image at `quality high`, 2 Pinterest fixtures | Speed tier. WordPress sends 1024×1024 **without** `quality` → cost/quality at default unmeasured |
| `openai/gpt-image-2.5-sunburst` | same list price | **Measured** same $0.043/image in the same benchmark; human review pending (`comparison.html`) | Precision tier at identical measured cost — strongest candidate for featured images |
| `google/gemini-3.1-flash-image` | out image $60 / M | Measured ~$0.10 / image | 2.3× more expensive in the benchmark |
| `qwen/qwen-image-3-pro` | $0.003 in + per-image | Measured $0.075 / image | — |
| `openai/gpt-image-2`, `openai/gpt-image-1-mini`, `black-forest-labs/flux.2-pro`, `bytedance-seed/seedream-5-0-pro` | see catalog | none | Candidates only |

Image/article coherence depends mostly on the **prompt source**, not the image model: Method A prompts come from the same outline as the text (coherent by construction); Method B internal images are Pinterest creatives, not article illustrations.

### Vision

Current `openai/gpt-5` ($1.25 / $10) is used only for the Legacy Composite reference analysis (1 200 tokens). `openai/gpt-6-luna`, `openai/gpt-5.6-luna` and `deepseek/deepseek-v4.1-flash` accept image input at 1/10 of the price or less. Output is short structured JSON → a small model is sufficient a priori.

## 7. Recommendation (NOT applied — requires founder approval)

| Use | Recommended | Why | Needs code change? |
| --- | --- | --- | --- |
| Outline | `openai/gpt-6-luna` (fallback: keep `gpt-5-mini`) | Structured JSON, ~4× cheaper, newest generation | No (FAST env) — but applies to every FAST call incl. Pinterest |
| Article | Benchmark first: `openai/gpt-6-luna` vs `openai/gpt-5.6-terra` vs `anthropic/claude-sonnet-5`; `deepseek/deepseek-v4.1-flash` as low-cost control | Long-form quality and DE/FR/ES idiom are exactly what cannot be predicted from the catalog | **Yes** to use a different model than the outline: split `TEXT_ROLE` (e.g. article on `SMART`) and re-size the token budget for reasoning |
| WordPress images | Keep `openai/gpt-image-2.5-flare` for internal images; evaluate `openai/gpt-image-2.5-sunburst` for the featured image; send an explicit `quality` | Same measured cost; featured image is the most visible | Yes for per-image-type model or explicit quality |
| Pinterest images | Keep `openai/gpt-image-2.5-flare` until the pending human review of the TASK-041 `comparison.html`; Sunburst is the only alternative at the same measured cost | Only benchmarked option set | No (env) |
| Vision | `openai/gpt-6-luna` | Image input, structured outputs, ~12× cheaper input / 20× cheaper output than `gpt-5` | No (VISION env) |

Prerequisites to fix before or with any model change (each a separate approved task):

1. Strip metadata for OpenRouter images (TASK-FIX-033 gap) and detect the real format before upload.
2. Record `model_used` on `wordpress_generations` and `image_model` on `wordpress_article_images`.
3. Verify that `reasoning.effort = "minimal"` is accepted by GPT-6 models before moving FAST to them.
4. A paid, explicitly authorized text benchmark: 2 keywords × 4 languages × 3-4 models, blind human review, cost/latency/`finish_reason` recorded — same pattern as `scripts/pinterest-ai-benchmark.ts`.
5. Method B: stop inserting 2:3 Pinterest creatives into the article body — use the existing raw source image, or copy the chosen image into `wordpress-images` so pin deletions can't break the article — decision needed.
6. Update `.env.example` to match the real configuration.
