# DATABASE.md

# Database Overview

Database Engine:

* PostgreSQL (Supabase)

Principles:

* UUID primary keys
* Row Level Security (RLS) enabled on all tables
* Every user only accesses their own data
* created_at and updated_at on all business tables
* All user-owned records must contain user_id
* No hard deletes for financial or credit data

---

# Entity Relationship Diagram

auth.users

└── profiles

└── projects

```
  └── generations

        └── pins
              │
              └── pin_images

  └── boards (pins.board_id references this, nullable)
```

└── credit_transactions

└── subscriptions

---

# profiles

Extends Supabase auth.users.

## Columns

| Column          | Type          | Description                   |
| --------------- | ------------- | ----------------------------- |
| id              | uuid PK       | References auth.users.id      |
| email           | text          | User email                    |
| name            | text nullable | Display name                  |
| role            | text          | user / admin / superadmin     |
| credits_balance | integer       | Available credits             |
| plan            | text          | free / starter / pro          |
| created_at      | timestamptz   | Creation date                 |
| updated_at      | timestamptz   | Last update                   |

## Purpose

Stores application-specific user data.

Examples:

* Credit balance
* Subscription plan
* User role
* Future Stripe metadata

## Roles

| Role       | Description                                                  |
| ---------- | ------------------------------------------------------------ |
| user       | Default. Standard user with credit-based access.             |
| admin      | Administrative access.                                       |
| superadmin | Unlimited credits, full access, exempt from Stripe/plan restrictions. |

## RLS

User can only access their own profile.

---

# projects

Logical container for generations.

## Columns

| Column      | Type                  | Description          |
| ----------- | --------------------- | -------------------- |
| id          | uuid PK               |                      |
| user_id     | uuid FK → profiles.id | Owner                |
| name        | text                  | Project name         |
| description | text nullable         | Optional description |
| is_default  | boolean               | Default false        |
| created_at  | timestamptz           |                      |
| updated_at  | timestamptz           |                      |

## Examples

* Bathroom Blog DE
* Healthy Recipes EN
* Travel France
* Home Decor ES

## RLS

```sql
user_id = auth.uid()
```

## Indexes

```sql
(user_id)
(created_at DESC)
```

---

# generations

Represents one Pinterest generation request.

## Columns

| Column              | Type                  | Description                               |
| ------------------- | --------------------- | ----------------------------------------- |
| id                  | uuid PK               |                                           |
| project_id          | uuid FK → projects.id |                                           |
| user_id             | uuid FK → profiles.id |                                           |
| keyword             | text                  | Main keyword                              |
| language            | text                  | Validated in application layer             |
| pins_requested      | integer               | CHECK > 0. Validated in application layer  |
| website_url         | text nullable         | Set when carried over from a Research result (TASK-023); provenance only, not used in the AI prompt |
| pinterest_url       | text nullable         | Set when carried over from a Research result (TASK-023); provenance only, not used in the AI prompt |
| reference_image_url | text nullable         | Supabase Storage URL. Not yet populated — deferred to TASK-013 (Image Analysis) |
| model_used          | text                  | Validated in application layer            |
| credits_used        | integer               | Credits consumed                          |
| status              | text                  | pending / processing / completed / failed |
| image_status        | text                  | none / processing / completed / partial / failed |
| error_message       | text nullable         | Human-readable reason when status = failed |
| created_at          | timestamptz           |                                           |
| updated_at          | timestamptz           |                                           |

## Purpose

Stores generation requests and execution metadata.

## RLS

```sql
user_id = auth.uid()
```

## Indexes

```sql
(user_id)
(project_id)
(status)
(created_at DESC)
```

---

# pins

Stores generated Pinterest pins.

## Columns

| Column         | Type                     | Description                |
| -------------- | ------------------------ | -------------------------- |
| id             | uuid PK                  |                            |
| generation_id  | uuid FK → generations.id |                            |
| language       | text                     | en / de / es / fr          |
| title          | text                     | Max 100 chars              |
| description    | text                     | Max 500 chars              |
| keywords       | text                     | Comma separated keywords   |
| board          | text                     | Suggested board (AI free text, denormalized) |
| board_id       | uuid nullable FK → boards.id | Real board entity, auto-linked at generation time (TASK-025). ON DELETE SET NULL |
| image_prompt   | text                     | Prompt for image generation |
| image_analysis | text nullable            | Vision analysis            |
| media_url      | text nullable            | Generated image URL (Supabase Storage) |
| link_url       | text nullable            | Website destination        |
| publish_date   | timestamptz nullable     | Schedule date              |
| created_at     | timestamptz              |                            |
| updated_at     | timestamptz              |                            |

## Purpose

Stores every generated Pinterest pin.

One generation may contain:

* 1 Pin
* 5 Pins
* 10 Pins
* 20 Pins
* 30 Pins

## RLS

Inherited through generation ownership.

## Indexes

```sql
(generation_id)
(language)
(created_at DESC)
(board_id)
```

---

# boards

Real Pinterest board entities (TASK-025). `pins.board` remains a free-text field (AI-suggested name, used for CSV/display); `pins.board_id` links to the real entity when one is matched or created.

## Columns

| Column     | Type                    | Description        |
| ---------- | ----------------------- | ------------------- |
| id         | uuid PK                 |                     |
| project_id | uuid FK → projects.id   | ON DELETE CASCADE   |
| user_id    | uuid FK → profiles.id   | ON DELETE CASCADE   |
| name       | text                    | Board name          |
| created_at | timestamptz             |                     |
| updated_at | timestamptz             |                     |

## Purpose

Organizes pins into persistent, manageable Pinterest boards, scoped per project (a project represents one niche/blog, matching how a real Pinterest account organizes boards).

At generation time, each pin's AI-suggested `board` name is matched case-insensitively against existing boards for the project; unmatched names create a new board automatically (see `lib/queries/boards.ts` `findOrCreateBoardIds()`). No pre-existing pins are backfilled — only pins generated after this table's migration get `board_id` set.

## RLS

```sql
user_id = auth.uid()
```

## Indexes

```sql
(project_id, name) UNIQUE
(project_id)
```

---

# research_results

Stores Firecrawl-acquired research content (TASK-023) — keyword web search, or scraped website/blog/Pinterest URLs. Write-once records, scoped per project. Preview-only: content here is not yet fed into the AI generation prompt (that normalization step is TASK-024, Content Analyzer). A "Continue to Generate" action on the Research page carries a suggested keyword (and, for URL sources, the source URL) into the Pinterest Generator form.

## Columns

| Column        | Type                    | Description                                       |
| ------------- | ----------------------- | -------------------------------------------------- |
| id            | uuid PK                 |                                                     |
| project_id    | uuid FK → projects.id   | ON DELETE CASCADE                                  |
| user_id       | uuid FK → profiles.id   | ON DELETE CASCADE                                  |
| source_type   | text                    | `keyword` \| `website` \| `blog` \| `pinterest` (CHECK constraint allows `pinterest` for historical rows only — the app no longer submits it, see TASK-FIX-003) |
| input         | text                    | The keyword or URL submitted                       |
| title         | text nullable           | Page title (scrape) or the keyword itself (search) |
| content       | text                    | Markdown content or aggregated search snippets, capped at ~12,000 chars |
| source_url    | text nullable           | Resolved URL for scrape sources; null for keyword search |
| status        | text                    | `completed` \| `failed`                            |
| error_message | text nullable           | Set when `status = 'failed'`                       |
| created_at    | timestamptz             |                                                     |

## Purpose

Lets a user research a topic from multiple sources before generating pins. Uses `lib/research/engine.ts` (`runResearch()`) — a provider-agnostic entry point currently backed by Firecrawl (`lib/research/providers/firecrawl.ts`), matching the same provider-swappable philosophy as the AI Engine (`lib/ai/`).

## RLS

```sql
user_id = auth.uid()
```

## Indexes

```sql
(project_id)
```

No `updated_at`/trigger — results are immutable once created, like `pins`.

---

# content_analyses

Stores the structured analysis of a `research_results` row (TASK-024) — theme, keywords, audience, tone, category, and a short summary. One analysis per research result (unique FK). Produced by `lib/analyzer/engine.ts` (`analyzeContent()`, SMART AI role) via `POST /api/analyze`, and consumed by generators as prompt context (`lib/analyzer/context.ts` `buildAnalysisContext()`) — currently wired into `POST /api/pinterest/generate` via an optional `analysisId`.

## Columns

| Column              | Type                          | Description                                  |
| ------------------- | ----------------------------- | --------------------------------------------- |
| id                  | uuid PK                       |                                               |
| research_result_id  | uuid FK → research_results.id | UNIQUE, ON DELETE CASCADE                    |
| project_id          | uuid FK → projects.id         | ON DELETE CASCADE                            |
| user_id             | uuid FK → profiles.id         | ON DELETE CASCADE                            |
| theme               | text                          | Core topic/theme in a short phrase           |
| keywords            | text                          | Comma-separated, like `pins.keywords`        |
| audience            | text                          | Target audience                              |
| tone                | text                          | Tone/voice of the content                    |
| category            | text                          | Best-fitting content category                |
| summary             | text                          | 2-3 sentence structured summary              |
| created_at          | timestamptz                   |                                               |

## Purpose

Normalizes raw research content into a structured, generator-agnostic context object before it reaches AI generation — the "Analyze" step of the `Research → Analyze → Generate` pipeline. `POST /api/analyze` is idempotent: re-analyzing the same `research_result_id` returns the existing row instead of calling the AI again.

## RLS

```sql
user_id = auth.uid()
```

## Indexes

```sql
(project_id)
```

No `updated_at`/trigger — immutable once created, like `research_results`.

---

# pin_images

Stores image versions for each pin. Each pin can have multiple image versions; exactly one is marked as active.

## Columns

| Column       | Type              | Description                    |
| ------------ | ----------------- | ------------------------------ |
| id           | uuid PK           |                                |
| pin_id       | uuid FK → pins.id | ON DELETE CASCADE              |
| storage_path | text              | Supabase Storage path          |
| url          | text              | Public URL                     |
| is_active    | boolean           | Only one active per pin        |
| version      | integer           | Sequential version number      |
| created_at   | timestamptz       |                                |

## Purpose

Enables image versioning and regeneration. Users can generate multiple image versions per pin, compare them, and choose which version to use for export.

## Constraints

* Partial unique index: only one `is_active = true` per pin_id
* Unique index: `(pin_id, version)` prevents duplicate version numbers

## RLS

Inherited through pin ownership chain:

```sql
pin_id IN (
  SELECT p.id FROM pins p
  JOIN generations g ON p.generation_id = g.id
  WHERE g.user_id = auth.uid()
)
```

## Indexes

```sql
(pin_id)
(pin_id) WHERE is_active = true
(pin_id, version) UNIQUE
```

---

# Triggers

## update_updated_at_column()

Automatically sets updated_at to now() before every UPDATE.

Applied to: profiles, projects, generations, pins.

## handle_new_user()

Fires after INSERT on auth.users.

Creates a profiles record with default values (credits_balance = 0, plan = 'free').

---

# Deferred Tables

The following tables are documented but NOT created yet.

They will be created in their respective tasks.

---

# credit_transactions

Status: Deferred to TASK-011.

Credit audit log.

Never delete rows.

## Columns

| Column           | Type                  | Description                         |
| ---------------- | --------------------- | ----------------------------------- |
| id               | uuid PK               |                                     |
| user_id          | uuid FK → profiles.id |                                     |
| credits          | integer               | Positive or negative                |
| transaction_type | text                  | purchase, generation, refund, bonus |
| description      | text                  | Human readable reason               |
| created_at       | timestamptz           |                                     |

## Purpose

Tracks every credit movement.

Examples:

* Purchased Starter Plan
* Generated 10 Pins
* Manual Bonus
* Refund

## RLS

```sql
user_id = auth.uid()
```

## Indexes

```sql
(user_id)
(created_at DESC)
```

---

# subscriptions

Status: Deferred to TASK-012.

Stripe subscription information.

## Columns

| Column                 | Type                  | Description                |
| ---------------------- | --------------------- | -------------------------- |
| id                     | uuid PK               |                            |
| user_id                | uuid FK → profiles.id |                            |
| stripe_customer_id     | text                  |                            |
| stripe_subscription_id | text                  |                            |
| plan_name              | text                  |                            |
| status                 | text                  | active, canceled, past_due |
| current_period_end     | timestamptz           |                            |
| created_at             | timestamptz           |                            |
| updated_at             | timestamptz           |                            |

## Purpose

Stores Stripe billing data.

## RLS

```sql
user_id = auth.uid()
```

---

# Storage Buckets

## reference-images

Purpose:

User uploaded inspiration images.

Examples:

```txt
reference-images/user-id/image.jpg
```

---

## generated-images

Status: Active (created in TASK-014).

Purpose:

Store generated Pinterest images (OpenAI gpt-image-1).

Examples:

```txt
generated-images/user-id/pin-id/1.png
generated-images/user-id/pin-id/2.png
```

Path pattern: `{user_id}/{pin_id}/{version}.png`. Each version is stored separately to support image versioning.

---

## exports

Status: Not yet used. CSV export is currently client-side.

Purpose:

Reserved for future server-side CSV storage.

Examples:

```txt
exports/user-id/project-name/pinterest.csv
```

---

# Standard RLS Policy

Apply to every user-owned table.

```sql
alter table [table_name]
enable row level security;

create policy "Users access only their own records"
on [table_name]
for all
using (user_id = auth.uid());
```

---

# Future Tables (Not MVP)

Do NOT create yet.

* pinterest_accounts
* wordpress_sites
* organizations
* team_members
* ai_provider_logs
* prompt_templates
* scheduled_jobs
* generated_images

These belong to future versions of OmniFlow.
