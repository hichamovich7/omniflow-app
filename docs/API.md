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
  "analysisId": "uuid"
}
```

`board` is optional. When provided, every generated pin is assigned to that board name (existing board matched case-insensitively, or created) instead of the AI's per-pin suggestion.

`websiteUrl`/`pinterestUrl` are optional (TASK-023). Normally carried over silently from a Research result via "Continue to Generate" — recorded on the generation for provenance only, not injected into the AI prompt.

`analysisId` is optional (TASK-024). When provided, it must reference a `content_analyses` row owned by the caller; its theme/audience/tone/category/summary are injected into the AI system prompt via `buildAnalysisContext()`, alongside Brand Profile. Carried over from a Research result's "Analyze" step, same query-param handoff as `websiteUrl`/`pinterestUrl`.

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

Batch generates Pinterest-optimized images using OpenAI (gpt-image-1). Processes up to 10 pins per batch with max 3 concurrent requests. Supports image versioning — each call creates a new version without overwriting existing images.

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
not_found
generation_not_completed
image_generation_failed
```

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
not_found
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
not_found
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

---

# DELETE /api/projects/[id]

Delete project.

Only project owner can delete.

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

---

# DELETE /api/boards/[id]

Delete a board.

Pins previously assigned to this board are not deleted — `pins.board_id` is set to null (ON DELETE SET NULL). The free-text `pins.board` value is untouched.

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
not_found
unauthorized
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
not_found
unauthorized
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

POST /api/wordpress/publish

POST /api/team/invite
```
