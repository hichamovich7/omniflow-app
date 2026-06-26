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
  "websiteUrl": "https://example.com",
  "pinterestUrl": "",
  "referenceImageUrl": ""
}
```

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
