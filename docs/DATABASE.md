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

└── api_rate_limits

```
  └── wordpress_generations (TASK-028, independent from generations/pins)

        └── wordpress_articles (category_id references wordpress_categories, nullable)

              └── wordpress_article_images

  └── wordpress_categories (TASK-032, scoped to project like boards)
```

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
| description | text nullable         | Brand Profile — used as AI context for all generations in this project. No length limit at the DB layer; app-layer cap is 10,000 chars (migration 001 predates this column, cap enforced in `lib/validations/project.ts` only, migration 017 changed nothing at the DB level) |
| niche       | text nullable         | Free text, UI-only suggestion list (`components/projects/project-form.tsx`), never DB-constrained. Storage only — no prompt/AI logic reads this yet (TASK-033; see DECISIONS.md for why this stays a flat convention, not per-niche prompt branching) |
| default_language | text nullable   | One of `en`/`de`/`es`/`fr` (validated at the Zod layer against `SUPPORTED_LANGUAGES`, not a DB enum/CHECK — same convention as `generations.language`). Pre-fills, never forces, the Language field on the Pinterest and WordPress generation forms (migration 017) |
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
| visual_format  | text                     | `photo` / `text-overlay` (TASK-034). NOT NULL DEFAULT `photo`. Validated in application layer, not a DB enum/CHECK |
| overlay_text   | text nullable            | On-image hook text (5-8 words), set only when `visual_format = text-overlay` (TASK-034) |
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

# wordpress_generations

One row per WordPress article generation request (TASK-028, Option 1: keyword → SEO article). Independent history from Pinterest's `generations`/`pins` — deliberately not reused, per the 2026-07-15 decision to duplicate the generator-specific layer rather than force a shared abstraction after a single example.

## Columns

| Column      | Type                   | Description                                    |
| ----------- | ---------------------- | ----------------------------------------------- |
| id          | uuid PK                |                                                  |
| project_id  | uuid FK → projects.id  | ON DELETE CASCADE                               |
| user_id     | uuid FK → profiles.id  | ON DELETE CASCADE                               |
| keyword     | text                   |                                                  |
| language    | text                   |                                                  |
| source_type | text                   | `keyword` / `url` / `pins`. `keyword` (Option 1) and `pins` (Option 4) are implemented; `url` is reserved for Option 3 |
| research_notes | text nullable       | Optional user-supplied SEO research, migration 013                |
| source_pin_ids | uuid[] nullable     | Pinterest pin IDs this generation was built from (Option 4 only, migration 014). No FK on array elements — ownership of the referenced pins is validated at insert time in the API route, not enforced by the DB |
| status      | text                   | `pending` / `processing` / `completed` / `failed` |
| created_at  | timestamptz            |                                                  |

No `updated_at` — the row transitions status once (processing → completed/failed) via a single UPDATE from the API route, same pattern as `research_results`.

## RLS

```sql
user_id = auth.uid()
```

## Indexes

```sql
(user_id)
(project_id)
(created_at desc)
```

---

# wordpress_articles

The generated article for a `wordpress_generations` row. One-to-one in practice (Option 1 generates exactly one article per generation), modeled as a child table for future options that may retry/version.

## Columns

| Column                 | Type                              | Description                              |
| ---------------------- | ---------------------------------- | ----------------------------------------- |
| id                     | uuid PK                            |                                            |
| generation_id          | uuid FK → wordpress_generations.id | ON DELETE CASCADE                         |
| title                  | text                                | On-page H1, max 100 chars — deterministically truncated at a word boundary (`truncateAtWordBoundary`) before the outline schema validates it, never rejected for length |
| meta_title             | text nullable                       | `<title>`/SERP-facing title, max 70 chars, same truncation. Nullable — rows from before migration 015 have none; readers fall back to `title` truncated to 70 (`getMetaTitle()` in `lib/wordpress/export.ts`) |
| slug                   | text                                | URL-friendly slug, max 100 chars, same truncation (trailing hyphen stripped after cut) |
| meta_description       | text                                | 150-160 chars, same truncation             |
| content                | text                                | Full article body in Markdown — the source of truth. `{{IMAGE_N}}` markers are already resolved to `![alt](url)` before this row is written |
| word_count             | integer                            | Computed from the final content           |
| featured_image_prompt  | text nullable                      | AI-generated scene description for the featured image |
| featured_image_url     | text nullable                      | Public Supabase Storage URL, null if generation failed |
| status                 | text                                | `pending` / `processing` / `completed` / `failed` |
| category_id            | uuid FK → wordpress_categories.id, nullable | ON DELETE SET NULL — deleting a category never deletes its articles (migration 016, TASK-032). Null = "Uncategorized" |
| created_at             | timestamptz                        |                                            |

## Purpose

Content is stored as Markdown, not HTML — HTML is derived at export time via `exportToHtml()` (`lib/wordpress/export.ts`, using `marked`), never persisted.

## RLS

```sql
generation_id in (
  select id from wordpress_generations where user_id = auth.uid()
)
```

## Indexes

```sql
(generation_id)
```

---

# wordpress_article_images

Internal images referenced from the article body via `{{IMAGE_N}}` markers (2-3 per article). The featured image is NOT stored here — it lives on `wordpress_articles.featured_image_url`, a single column, not a list.

## Columns

| Column           | Type                          | Description                                  |
| ---------------- | ------------------------------ | ---------------------------------------------- |
| id               | uuid PK                        |                                                |
| article_id       | uuid FK → wordpress_articles.id | ON DELETE CASCADE                             |
| placement_marker | text                            | e.g. `IMAGE_1`, `IMAGE_2`, `IMAGE_3`          |
| prompt           | text                            | AI-generated scene description                |
| alt_text         | text                            | SEO/accessibility alt text                     |
| url              | text nullable                   | Public Supabase Storage URL, null if that image's generation failed |
| position         | integer                         | Order among the article's internal images      |
| created_at       | timestamptz                     |                                                |

## RLS

```sql
article_id in (
  select wa.id from wordpress_articles wa
  join wordpress_generations wg on wa.generation_id = wg.id
  where wg.user_id = auth.uid()
)
```

## Indexes

```sql
(article_id)
```

---

# wordpress_categories

Project-scoped categories for organizing WordPress articles (TASK-032). Assignment
is always manual — there is no AI suggestion anywhere in either generation flow,
unlike `boards`, whose `findOrCreateBoardIds` auto-links AI-suggested names.

## Columns

| Column     | Type                   | Description                       |
| ---------- | ---------------------- | ----------------------------------- |
| id         | uuid PK                |                                      |
| project_id | uuid FK → projects.id  | ON DELETE CASCADE                   |
| user_id    | uuid FK → profiles.id  | ON DELETE CASCADE                   |
| name       | text                   | Unique per project                  |
| slug       | text                   | Derived from `name`, not unique across projects |
| created_at | timestamptz            |                                      |

## RLS

```sql
user_id = auth.uid()
```

## Indexes

```sql
unique (project_id, name)
(project_id)
```

---

# api_rate_limits

Tracks per-user, per-endpoint request counts within a fixed time window (TASK-018). Backs application-level rate limiting on AI-cost-incurring endpoints — independent of RLS/ownership checks, which govern data access, not request volume.

## Columns

| Column       | Type                  | Description                                              |
| ------------ | --------------------- | ---------------------------------------------------------- |
| id           | uuid PK               |                                                            |
| user_id      | uuid FK → profiles.id | ON DELETE CASCADE                                          |
| endpoint     | text                  | Logical endpoint identifier (e.g. `pinterest/generate`)    |
| window_start | timestamptz           | Start of the fixed window this row counts                  |
| count        | integer               | Requests seen in this window, default 1                    |
| created_at   | timestamptz           |                                                            |

## Purpose

Fixed-window counter, incremented atomically per request via the `increment_rate_limit()` Postgres function (single `INSERT ... ON CONFLICT DO UPDATE`, avoids the read-then-write race of separate SELECT/UPDATE calls). `lib/rate-limit.ts` (`checkRateLimit()`) computes the current window boundary, calls the function via `supabase.rpc()`, and compares the returned count against the endpoint's limit.

## Functions

```sql
increment_rate_limit(p_user_id uuid, p_endpoint text, p_window_start timestamptz) RETURNS integer
```

Upserts the counter row for `(user_id, endpoint, window_start)` and returns the new count.

## RLS

```sql
user_id = auth.uid()
```

## Indexes

```sql
(user_id, endpoint, window_start) UNIQUE
```

No `updated_at` — rows are superseded by new window rows, not updated in place beyond the counter increment.

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

## wordpress-images

Status: Active (created in TASK-028, migration 012).

Purpose:

Store generated WordPress featured + internal images.

Examples:

```txt
wordpress-images/user-id/generation-id/FEATURED.png
wordpress-images/user-id/generation-id/IMAGE_1.png
```

Path pattern: `{user_id}/{generation_id}/{marker}.png`. Unlike `generated-images`, there is no versioning — one image per marker per generation.

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
