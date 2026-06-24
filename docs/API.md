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

Returns generation history.

## Query Parameters

```txt
page
limit
projectId
```

## Response

```json
{
  "data": [
    {
      "id": "uuid",
      "keyword": "bathroom storage",
      "language": "en",
      "pinsRequested": 10,
      "status": "completed"
    }
  ],
  "error": null
}
```

---

# GET /api/pinterest/generations/[id]

Returns one generation with all generated pins.

## Response

```json
{
  "data": {
    "generation": {},
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

# POST /api/pinterest/generate-images

Generate images for all pins in a generation.

## Description

Batch generates Pinterest-optimized images using OpenAI (gpt-image-1). Processes up to 10 pins per batch with max 3 concurrent requests.

## Request

```json
{
  "generationId": "uuid"
}
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

Creates Pinterest-compatible CSV.

## Request

```json
{
  "generationId": "uuid"
}
```

## Response

```json
{
  "data": {
    "downloadUrl": "csv-file-url"
  },
  "error": null
}
```

## Possible Errors

```txt
not_found
csv_generation_failed
```

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

Returns all user projects.

## Response

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Bathroom Blog DE"
    }
  ],
  "error": null
}
```

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

Returns current balance.

## Response

```json
{
  "data": {
    "creditsBalance": 150
  },
  "error": null
}
```

---

# GET /api/credit-transactions

Returns credit history.

## Response

```json
{
  "data": [
    {
      "credits": -10,
      "type": "generation",
      "description": "Generated 10 Pinterest Pins"
    }
  ],
  "error": null
}
```

---

# POST /api/stripe/create-checkout

Creates Stripe checkout session.

## Request

```json
{
  "plan": "starter"
}
```

## Response

```json
{
  "data": {
    "checkoutUrl": "stripe-url"
  },
  "error": null
}
```

---

# POST /api/webhooks/stripe

Stripe webhook endpoint.

## Purpose

Handles:

* Subscription created
* Subscription renewed
* Subscription canceled
* Payment succeeded
* Payment failed

Updates:

* profiles
* subscriptions
* credit_transactions

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
