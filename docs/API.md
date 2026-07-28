# API.md

# API Conventions

All API routes live under:

```txt
/api/
```

Response format:

## Success

```json
{
  "data": {},
  "error": null
}
```

## Error

```json
{
  "data": null,
  "error": {
    "message": "Human readable error",
    "code": "error_code"
  }
}
```

---

# Authentication

Protected endpoints must:

1. Verify authenticated user.
2. Verify ownership of requested resource.
3. Verify available credits.
4. Execute business logic.
5. Register credit transaction.
6. Return typed response.

Authentication uses:

```txt
Supabase Auth Session
```

Never expose service_role keys to the client.

---

# Rate Limiting

Applied to AI-cost-incurring endpoints via `lib/rate-limit.ts` (`checkRateLimit()`), backed by the `api_rate_limits` table (fixed window counter, see DATABASE.md). Returns `429` with code `rate_limited` when exceeded.

| Endpoint                             | Limit      |
| ------------------------------------- | ---------- |
| POST /api/pinterest/generate          | 60 / hour  |
| POST /api/pinterest/generate-images   | 20 / hour  |
| POST /api/research                    | 60 / hour  |
| POST /api/analyze                     | 60 / hour  |
| POST /api/wordpress/generate          | 20 / hour  |
| POST /api/wordpress/sites/test        | 30 / hour  |
| POST /api/wordpress/[id]/publish      | 15 / hour  |

Not applied to CRUD endpoints (projects, boards, schedule, pin-images) — these don't call an external AI/scraping provider. `wordpress/sites/test` and `wordpress/publish` are the exception among non-AI endpoints: both make real external HTTP requests to a third-party WordPress host OmniFlow doesn't control, with real side effects (a live post appearing/updating on the user's site), so they're rate-limited like the AI endpoints — `publish` deliberately below `wordpress/generate`'s 20/hour since a single publish can fan out into up to ~5 sequential WordPress requests (image uploads + post create/update).

---

# POST /api/pinterest/generate

Generate Pinterest content.

## Description

Creates one generation request and produces Pinterest content using AI.

## Request

```json
{
  "projectId": "uuid",
  "keyword": "badezimmer inspiration schrank",
  "language": "de",
  "pinsRequested": 10,
  "board": "Boho Bathroom Ideas",
  "websiteUrl": "https://example.com",
  "pinterestUrl": "",
  "analysisId": "uuid",
  "textOverlayMode": "auto"
}
```

`board` is optional. When provided, every generated pin is assigned to that board name (existing board matched case-insensitively, or created) instead of the AI's per-pin suggestion.

`websiteUrl`/`pinterestUrl` are optional (TASK-023). Normally carried over silently from a Research result via "Continue to Generate" — recorded on the generation for provenance only, not injected into the AI prompt.

`analysisId` is optional (TASK-024). When provided, it must reference a `content_analyses` row owned by the caller; its theme/audience/tone/category/summary are injected into the AI system prompt via `buildAnalysisContext()`, alongside Brand Profile. Carried over from a Research result's "Analyze" step, same query-param handoff as `websiteUrl`/`pinterestUrl`.

`textOverlayMode` is optional, defaults to `auto` (TASK-034). One of `auto` (the AI decides `photo` vs `text-overlay` per pin), `always` (every pin forced to `text-overlay`), `never` (every pin forced to `photo`). Only meaningful for projects whose `niche` allows text overlay (`lib/ai/niche-visual-conventions.ts`) — for any other niche the server ignores the submitted value and always uses `never`. Each generated pin stores the resolved `visual_format` (`photo` / `text-overlay`) and, when applicable, `overlay_text` — both consumed by `POST /api/pinterest/generate-images` to route the image call and build its prompt.

`generations.reference_image_url` exists in the database schema but has no corresponding request field yet — deferred to TASK-013 (Image Analysis).

## Response

```json
{
  "data": {
    "generationId": "uuid",
    "status": "processing"
  },
  "error": null
}
```

## Credits

Consumes credits.

Amount depends on:

* Number of pins
* Selected model

## Possible Errors

```txt
unauthorized
forbidden
rate_limited
invalid_json
insufficient_credits
invalid_language
invalid_analysis
generation_failed
```

---

# GET /api/pinterest/generations

Status: NOT IMPLEMENTED. History uses server-side Supabase queries directly, not an API route.

---

# GET /api/pinterest/generations/[id]

Status: NOT IMPLEMENTED. Replaced by GET /api/generations/[id] (see below).

---

# POST /api/pinterest/generate-images

Generate images for all pins in a generation.

## Description

Batch generates Pinterest-optimized images. Processes up to 10 pins per batch with max 3 concurrent requests. Supports image versioning — each call creates a new version without overwriting existing images. Pins with `visual_format = photo` use OpenAI (gpt-image-1, or `AI_IMAGE_PROVIDER`/`AI_IMAGE_MODEL`); pins with `visual_format = text-overlay` always route through OpenRouter to `AI_IMAGE_MODEL_TEXT` instead, with `overlay_text` rendered explicitly in the prompt (TASK-034).

## Request

```json
{
  "generationId": "uuid",
  "pinIds": ["uuid", "uuid"]
}
```

`pinIds` is optional. When provided, generates images only for the specified pins (supports regeneration of pins that already have images). When omitted, generates images for all pins without images.
```

## Response

```json
{
  "data": {
    "generationId": "uuid",
    "imagesGenerated": 10,
    "imagesFailed": 0,
    "status": "completed"
  },
  "error": null
}
```

## Possible Errors

```txt
unauthorized
forbidden
rate_limited
invalid_json
not_found
generation_not_completed
image_generation_failed
```

---

# POST /api/wordpress/generate

Generate a WordPress SEO article (TASK-028, Option 1: keyword → article).

## Description

Creates one `wordpress_generations` row and synchronously produces a full article: an outline is planned first (title, slug, meta description, H2 sections, featured + 2-3 internal image prompts), then the full Markdown body is written from that outline, then all images are generated and their `{{IMAGE_N}}` markers resolved into the Markdown before the `wordpress_articles` row is written. A single request can take up to ~60 seconds (2 text calls + up to 4 image calls, no async job queue — see RULES.md Rule #15, deferred).

Options 2 (reference image) and 3 (rewrite from a blog URL) are not implemented — only `source_type: "keyword"` is accepted.

## Request

```json
{
  "projectId": "uuid",
  "keyword": "small bathroom storage ideas",
  "language": "en"
}
```

## Response

```json
{
  "data": {
    "generationId": "uuid",
    "status": "completed"
  },
  "error": null
}
```

Fetch the full article via a server-side Supabase query (`lib/queries/wordpress.ts`, `getWordPressArticleByGenerationId()`) at `/wordpress/[generationId]` — there is no separate `GET /api/wordpress/generations/[id]` route, same pattern as Pinterest's results page.

## Credits

Not yet enforced — TASK-011 (Credits System) is still PLANNED, same as `/api/pinterest/generate`.

## Possible Errors

```txt
unauthorized
forbidden
rate_limited
invalid_json
invalid_request
invalid_project
generation_failed
server_error
```

If image generation partially fails, the article still completes — failed markers are stripped from the content rather than left as raw `{{IMAGE_N}}` text, and `wordpress_article_images.url` / `wordpress_articles.featured_image_url` are `null` for the images that failed.

---

# POST /api/wordpress/sites/test

Validate a WordPress Application Password before it is stored (TASK-035). No resource is created — this is a pure credential check via `GET /wp-json/wp/v2/users/me`.

## Description

Called from the "Test Connection" button in the Project form's WordPress Connection section, and re-run server-side (never trusted from the client alone) by `POST /api/wordpress/sites` and `PATCH /api/wordpress/sites/[id]` before any write.

## Request

```json
{
  "siteUrl": "https://example.com",
  "wpUsername": "admin",
  "applicationPassword": "xxxx xxxx xxxx xxxx xxxx xxxx"
}
```

## Response

```json
{
  "data": { "connected": true, "displayName": "admin" },
  "error": null
}
```

## Credits

Not applicable.

## Possible Errors

```txt
unauthorized
rate_limited
invalid_json
invalid_request
connection_failed
```

---

# POST /api/wordpress/sites

Create the WordPress connection for a Project (TASK-035). One connection per project — `project_id` is unique on `wordpress_sites`.

## Request

```json
{
  "projectId": "uuid",
  "siteUrl": "https://example.com",
  "wpUsername": "admin",
  "applicationPassword": "xxxx xxxx xxxx xxxx xxxx xxxx"
}
```

## Response

```json
{
  "data": {
    "site": {
      "id": "uuid",
      "project_id": "uuid",
      "user_id": "uuid",
      "site_url": "https://example.com",
      "wp_username": "admin",
      "created_at": "2026-07-28T00:00:00.000Z"
    }
  },
  "error": null
}
```

`encrypted_application_password` is never included in the response — the returned shape is always `WordPressSitePublic`.

## Credits

Not applicable.

## Possible Errors

```txt
unauthorized
invalid_json
invalid_request
invalid_project
forbidden
connection_failed
server_error
```

`invalid_request` (400) is also returned if the project already has a connection (unique constraint on `project_id`) — disconnect it first.

---

# PATCH /api/wordpress/sites/[id]

Replace an existing WordPress connection's credentials (TASK-035). Full replace only — all 3 fields (`siteUrl`, `wpUsername`, `applicationPassword`) are required on every call, no partial update, since WordPress auth validity is a property of the whole triple and it is always re-tested server-side before the write.

## Request

```json
{
  "siteUrl": "https://example.com",
  "wpUsername": "admin",
  "applicationPassword": "xxxx xxxx xxxx xxxx xxxx xxxx"
}
```

## Response

Same shape as `POST /api/wordpress/sites`.

## Possible Errors

```txt
unauthorized
invalid_id
invalid_json
invalid_request
not_found
forbidden
connection_failed
server_error
```

---

# DELETE /api/wordpress/sites/[id]

Disconnect a Project's WordPress site (TASK-035). Before deleting, resets any of the project's `wordpress_articles` rows with `publish_status in ('scheduled', 'published')` back to `draft` / `wp_post_id = null` — prevents a stale `wp_post_id` from colliding with an unrelated post if the user later connects a different WordPress site to the same project.

## Response

```json
{ "data": { "success": true }, "error": null }
```

## Possible Errors

```txt
unauthorized
invalid_id
not_found
forbidden
server_error
```

---

# GET /api/wordpress/sites/[id]/categories

Fetch the connected WordPress site's real categories, for the category-mapping UI at `/wordpress/categories` (TASK-035).

## Response

```json
{
  "data": {
    "categories": [
      { "id": 12, "name": "Home Decor", "slug": "home-decor" }
    ]
  },
  "error": null
}
```

Capped at 100 categories (`per_page=100`, WordPress's REST API maximum) — a known limitation for sites with more, see DECISIONS.md.

## Possible Errors

```txt
unauthorized
invalid_id
not_found
forbidden
connection_failed
```

---

# POST /api/wordpress/[id]/publish

Publish an article to its project's connected WordPress site via the REST API (TASK-035). `[id]` is the `wordpress_generations.id`, matching the existing `DELETE /api/wordpress/[id]`.

## Description

1. Uploads the featured image (if any) to the WP media library — a failure here is fatal, `featured_media` has no URL-fallback on the WP side.
2. Uploads internal/body images to the WP media library, rewriting their URLs in the post content on success — a failure on any individual internal image is non-fatal, the original (already public) Supabase Storage URL is kept in the content instead.
3. Resolves the article's mapped WordPress category (`wp_category_id`); an unmapped category is omitted from the payload (WordPress defaults to "Uncategorized"), non-fatal.
4. Computes `status`/`date` from `mode` and calls `POST /wp-json/wp/v2/posts` (or `POST /wp-json/wp/v2/posts/{id}` to update, if `wp_post_id` is already set — falling back to create on a 404).
5. Persists `wp_post_id` / `publish_status` / `published_at`, or `publish_status: 'failed'` + `publish_error` on failure — never a silent failure.

## Request

```json
{
  "mode": "draft",
  "scheduledDate": "2026-08-01",
  "scheduledTime": "09:00"
}
```

`scheduledDate`/`scheduledTime` are required (and validated to be in the future) only when `mode` is `"schedule"`. `mode: "schedule"` maps to WordPress `status: "future"` with `date` formatted as `YYYY-MM-DDTHH:MM:SS` (no timezone suffix — WordPress interprets this as site-local time and auto-publishes via WP-Cron with zero further action from OmniFlow).

## Response

```json
{
  "data": {
    "wpPostId": 42,
    "publishStatus": "scheduled",
    "publishedAt": null,
    "viewUrl": "https://example.com/?p=42"
  },
  "error": null
}
```

## Credits

Not applicable.

## Possible Errors

```txt
unauthorized
invalid_id
invalid_json
invalid_request
not_found
forbidden
rate_limited
no_connection
publish_failed
```

On `publish_failed`, the error message is surfaced verbatim to the user and also persisted to `wordpress_articles.publish_error`; a 401/403 from WordPress specifically yields "WordPress rejected the connection credentials — reconnect in Project settings" rather than a generic message.

---

# GET /api/pinterest/pin-images

List all image versions for a pin.

## Request

Query parameter: `?pinId={uuid}`

## Response

```json
{
  "data": {
    "versions": [
      {
        "id": "uuid",
        "pin_id": "uuid",
        "url": "https://...",
        "is_active": true,
        "version": 2,
        "created_at": "..."
      }
    ]
  },
  "error": null
}
```

## Possible Errors

```txt
unauthorized
invalid_request
not_found
forbidden
```

---

# PATCH /api/pinterest/pin-images/[id]

Set an image version as the active image for its pin.

Updates `pins.media_url` to the selected version's URL.

## Response

```json
{
  "data": {
    "pinId": "uuid",
    "activeImageId": "uuid",
    "url": "https://..."
  },
  "error": null
}
```

## Possible Errors

```txt
unauthorized
invalid_id
not_found
forbidden
```

---

# DELETE /api/pinterest/pin-images/[id]

Delete an image version. Cannot delete the only remaining version.

If the deleted version was active, the most recent remaining version is promoted.

Deletes the image file from Supabase Storage.

## Response

```json
{
  "data": {
    "deleted": true
  },
  "error": null
}
```

## Possible Errors

```txt
unauthorized
invalid_id
not_found
forbidden
invalid_request (cannot delete only version)
```

---

# PATCH /api/pinterest/schedule

Apply or clear schedule dates for pins in a generation.

## Description

Sets publish_date on all pins in a generation based on start date, time, and frequency. Supports "Spread by Days" and "Spread by Hours" modes.

## Request (Apply Schedule — Days Mode)

```json
{
  "generationId": "uuid",
  "action": "apply",
  "mode": "days",
  "startDate": "2026-07-01",
  "startTime": "09:00",
  "frequency": "daily"
}
```

## Request (Apply Schedule — Hours Mode)

```json
{
  "generationId": "uuid",
  "action": "apply",
  "mode": "hours",
  "startDate": "2026-07-01",
  "startTime": "09:00",
  "interval": "2h"
}
```

## Request (Clear Schedule)

```json
{
  "generationId": "uuid",
  "action": "clear"
}
```

## Response

```json
{
  "data": {
    "updatedPins": 10
  },
  "error": null
}
```

## Frequencies (Days Mode)

```txt
daily
every_2_days
every_3_days
weekly
weekday
```

## Intervals (Hours Mode)

```txt
30m
1h
2h
4h
```

## Possible Errors

```txt
unauthorized
forbidden
invalid_json
not_found
invalid_schedule
past_date
```

---

# POST /api/pinterest/export-csv

Status: NOT IMPLEMENTED. CSV export is client-side via ExportCsvButton component (lib/csv/pinterest.ts).

---

# POST /api/projects

Create project.

## Request

```json
{
  "name": "Bathroom Blog DE",
  "description": "German Pinterest project"
}
```

## Response

```json
{
  "data": {
    "projectId": "uuid"
  },
  "error": null
}
```

---

# GET /api/projects

Status: NOT IMPLEMENTED. Project listing uses server-side Supabase queries directly, not an API route.

---

# PATCH /api/projects/[id]

Update project.

## Request

```json
{
  "name": "Updated Project",
  "description": "Optional description",
  "is_default": true
}
```

All fields are optional. When is_default is true, the previous default project is unmarked.

## Possible Errors

```txt
unauthorized
invalid_id
not_found
forbidden
invalid_json
invalid_request
```

---

# DELETE /api/projects/[id]

Delete project.

Only project owner can delete.

## Possible Errors

```txt
unauthorized
invalid_id
not_found
forbidden
```

---

# POST /api/boards

Create a board.

## Request

```json
{
  "projectId": "uuid",
  "name": "Boho Bathroom Ideas"
}
```

## Response

```json
{
  "data": {
    "boardId": "uuid"
  },
  "error": null
}
```

## Possible Errors

```txt
unauthorized
forbidden
invalid_json
invalid_request
invalid_project
server_error (duplicate name within the same project)
```

---

# GET /api/boards

Status: NOT IMPLEMENTED. Board listing uses server-side Supabase queries directly, not an API route (same convention as Projects).

---

# PATCH /api/boards/[id]

Rename a board.

## Request

```json
{
  "name": "Updated Board Name"
}
```

## Possible Errors

```txt
unauthorized
invalid_id
not_found
forbidden
invalid_json
invalid_request
```

---

# DELETE /api/boards/[id]

Delete a board.

Pins previously assigned to this board are not deleted — `pins.board_id` is set to null (ON DELETE SET NULL). The free-text `pins.board` value is untouched.

## Possible Errors

```txt
unauthorized
invalid_id
not_found
forbidden
```

---

# POST /api/research

Research a topic from a keyword, website, or blog using Firecrawl.

## Request

```json
{
  "projectId": "uuid",
  "sourceType": "website",
  "input": "https://example.com/blog/bathroom-storage"
}
```

`sourceType` is one of `keyword`, `website`, `blog`. `input` must be a valid URL when `sourceType` is `website` or `blog`; any non-empty string (max 500 chars) when `keyword`.

`pinterest` is intentionally not accepted here — Firecrawl does not support scraping pinterest.com (confirmed via live testing: 403, "we do not support this site"), every submission failed. The `research_results.source_type` CHECK constraint still allows `pinterest` at the database level so historical rows remain valid and readable; only new submissions are rejected (`invalid_request`).

## Response

```json
{
  "data": {
    "researchId": "uuid",
    "title": "Bathroom Storage Ideas | Example Blog",
    "content": "# Bathroom Storage Ideas\n\n...",
    "sourceUrl": "https://example.com/blog/bathroom-storage"
  },
  "error": null
}
```

For `sourceType: "keyword"`, `content` is an aggregation of the top 3 web search result snippets (title, description, URL), not full page content.

## Possible Errors

```txt
unauthorized
forbidden
rate_limited
invalid_json
invalid_request
invalid_project
research_failed
```

---

# DELETE /api/research/[id]

Delete a research result. No PATCH — results are immutable once created.

## Response

```json
{
  "data": {
    "success": true
  },
  "error": null
}
```

## Possible Errors

```txt
unauthorized
invalid_id
not_found
forbidden
```

---

# GET /api/research

Status: NOT IMPLEMENTED. Research history uses server-side Supabase queries directly, not an API route (same convention as Projects/Boards).

---

# POST /api/analyze

Analyze a research result into a structured summary (theme, keywords, audience, tone, category, summary) — TASK-024.

## Request

```json
{
  "researchResultId": "uuid"
}
```

## Response

```json
{
  "data": {
    "analysisId": "uuid",
    "theme": "Small bathroom storage",
    "keywords": "bathroom storage, small bathroom ideas, ...",
    "audience": "Homeowners with small bathrooms looking for space-saving solutions",
    "tone": "Practical, inspirational",
    "category": "Home Organization",
    "summary": "Covers space-saving storage solutions for small bathrooms..."
  },
  "error": null
}
```

Idempotent: if a `content_analyses` row already exists for `researchResultId`, it's returned as-is without calling the AI again. The referenced research result must belong to the caller and have `status: "completed"`.

## Possible Errors

```txt
unauthorized
forbidden
rate_limited
invalid_json
invalid_request
invalid_research_result
analysis_failed
```

---

# GET /api/credits

Status: DEFERRED to TASK-011.

---

# GET /api/credit-transactions

Status: DEFERRED to TASK-011.

---

# POST /api/stripe/create-checkout

Status: DEFERRED to TASK-012.

---

# POST /api/webhooks/stripe

Status: DEFERRED to TASK-012.

---

# GET /api/generations/[id]

Returns one generation with all generated pins.

## Response

```json
{
  "data": {
    "generation": {
      "id": "uuid",
      "keyword": "bathroom storage",
      "language": "en",
      "pinsRequested": 10,
      "status": "completed",
      "imageStatus": "completed"
    },
    "pins": []
  },
  "error": null
}
```

## Possible Errors

```txt
unauthorized
invalid_id
not_found
forbidden
```

---

# DELETE /api/generations/[id]

Delete a generation and all associated pins (CASCADE).

## Response

```json
{
  "data": {
    "deleted": true
  },
  "error": null
}
```

## Possible Errors

```txt
unauthorized
invalid_id
not_found
forbidden
```

---

# Error Codes

## Authentication

```txt
unauthorized
forbidden
```

## Credits

```txt
insufficient_credits
```

## Validation

```txt
invalid_request
invalid_language
invalid_project
invalid_json
invalid_id
```

## Rate Limiting

```txt
rate_limited
```

## Generation

```txt
generation_failed
provider_error
```

## Storage

```txt
upload_failed
csv_generation_failed
```

---

# Future Endpoints (Not MVP)

Do not implement yet.

```txt
POST /api/pinterest/publish

POST /api/images/generate

POST /api/team/invite
```

WordPress publishing (previously listed here as `POST /api/wordpress/publish`) was implemented as `POST /api/wordpress/[id]/publish` under TASK-035 — see that section above and DECISIONS.md for the path-naming rationale.
