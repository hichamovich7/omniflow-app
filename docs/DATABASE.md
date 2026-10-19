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

# Migration Status

Checked read-only on 2026-10-11 (PostgREST schema + Storage bucket list, no write):

* `supabase/migrations/001` → `044` — numbered without gap or duplicate.
* Every table, column and storage bucket they create is present in the live database (`generated-images`, `wordpress-images`, `reference-images`), including the migrations once marked "apply manually" (029, 032-044).
* Grants, RLS policies, triggers and SQL functions (e.g. 003, 010, 023, 031) are not visible through this check — they are assumed applied with their migration.
* **Migration 045** (`045_add_social_content_generations.sql`, TASK-063) — written 2026-10-12, **not applied yet**: to apply by hand in the Supabase SQL Editor. Before it, Medium summaries are generated but not saved (warning), and `/medium` shows a "not available yet" notice.
* **Migration 046** (`046_add_social_connections_and_publications.sql`, TASK-068) — written 2026-10-15, **not applied yet** (needs 045 first): to apply by hand in the Supabase SQL Editor. Before it, Facebook posts are generated but not saved (warning), `/facebook` shows "not available yet" notices, and no Page can be connected.
* **Next free migration: 047**.
* Migrations are applied by hand in the Supabase SQL Editor (the agent has no DDL access); new ones must be recorded here once applied.

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
  └── wordpress_sites → wordpress_media_assets (TASK-FIX-060, migration 043 — WordPress attachment per site + source image)

  └── content_streams (TASK-FIX-039 Phase 2a, scoped to project)
        │
        │  wordpress_category_id references wordpress_categories, nullable
        │
        ├── content_stream_boards (join table) → boards
        └── content_stream_publishing_activity (TASK-FIX-043, one row per stream + local day; status published/expected — TASK-FIX-053)
```

```
profiles
  └── social_content_generations (TASK-063, migration 045; project_id required; optional sources →
        wordpress_generations / wordpress_sites / generations, ON DELETE SET NULL;
        content_stream_id → content_streams, migration 046)
  │     └── social_publications (TASK-068, migration 046; UNIQUE content + Page; SET NULL on delete)
  └── social_connections (TASK-068, migration 046; one Facebook Page per project; encrypted token,
        not readable by the session role)
```

```
profiles
  └── tasks (TASK-FIX-042; project_id / content_stream_id / board_id all optional, ON DELETE SET NULL)
        └── task_occurrences (only for tasks.source = 'recurring', written lazily)
```

---

# profiles

Extends Supabase auth.users.

## Columns

| Column                 | Type          | Description                   |
| ---------------------- | ------------- | ----------------------------- |
| id                     | uuid PK       | References auth.users.id      |
| email                  | text          | User email                    |
| name                   | text nullable | Display name                  |
| role                   | text          | user / admin / superadmin     |
| credits_balance        | integer       | Available credits             |
| plan                   | text          | free / starter / pro          |
| total_generations_used | integer       | Lifetime count of AI-cost-incurring generation calls (migration 023, default 0) — backs the lightweight trial usage cap, distinct from `credits_balance`/the future Credits System. See `api_rate_limits` below and `docs/DECISIONS.md` |
| created_at             | timestamptz   | Creation date                 |
| updated_at             | timestamptz   | Last update                   |

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
| niche       | text nullable         | Free text, UI-only suggestion list (`components/projects/project-form.tsx`), never DB-constrained, never an enum — any value is accepted. Resolved in code (no schema change) to a niche profile by label or alias, case/accent-insensitive (`lib/niche/resolve.ts`; unknown → generic profile) and to a visual convention (`getNicheVisualConvention`); read by the WordPress (keyword, Pins, URL) and Pinterest prompts (Niche Profiles Phase 1, DECISIONS.md 2026-09-28). Per-project customizations: `niche_settings` below (Phase 2) |
| default_language | text nullable   | One of `en`/`de`/`es`/`fr` (validated at the Zod layer against `SUPPORTED_LANGUAGES`, not a DB enum/CHECK — same convention as `generations.language`). Pre-fills, never forces, the Language field on the Pinterest and WordPress generation forms (migration 017) |
| is_default  | boolean               | Default false        |
| niche_settings | jsonb nullable     | Per-project niche settings (migration 041, TASK-045). **User customizations only**, versioned: `{ "version": 1, "fields": { tone?, audience?, keywords?, pinterestAngles?, visualStyle?, cta?: { "custom": string[], "disabled": string[] }, subNiches?: { "disabled": slug[] } } }` — validated with Zod (`lib/niche/settings.ts`). `NULL` = OmniFlow's recommended values from the niche profiles (every row before 041, and after "Reset to defaults"); recommended values are never stored, so profile updates never overwrite a custom value. Invalid / unknown version → read as `NULL`. Written only by `PUT /api/projects/[id]/niche-settings`; generations read it best-effort (`readProjectNicheSettings`, separate select) so everything works before 041 is applied — only saving then fails with `migration_required`. Sub-niches are Content Streams (no sub-niche table). No index, RLS unchanged (existing `projects` policies) |
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
| reference_image_url | text nullable         | Supabase Storage URL (`reference-images` bucket), set when the user attaches a reference image (TASK-013) |
| model_used          | text                  | Validated in application layer            |
| credits_used        | integer               | Credits consumed                          |
| status              | text                  | pending / processing / completed / failed |
| image_status        | text                  | none / processing / completed / partial / failed |
| error_message       | text nullable         | Human-readable reason when status = failed |
| source_wordpress_generation_id | uuid nullable FK → wordpress_generations.id | Source article when the generation was made from a WordPress article on `/pinterest/create?source=wordpress` (migration 040, TASK-044 phase 2). ON DELETE SET NULL. Traceability only — an internal id, never a destination URL (`pins.link_url` stays empty in that flow; links are added manually in the CSV). Written best-effort after completion, so generating still works before 040 is applied. `NULL` for keyword generations and every row before 040. Partial index where not null |
| source_type | text nullable | What the generation was made from (migration 044, TASK-051): `omniflow_article` (an article of the WordPress generator — `source_wordpress_generation_id` points at it) or `external_wordpress_post` (a post that already existed on a connected site). `NULL` for keyword generations and every row before 044. CHECK on the two values |
| source_wordpress_site_id | uuid nullable FK → wordpress_sites.id | Connection of the existing post (migration 044). ON DELETE SET NULL |
| source_wordpress_post_id | bigint nullable | WordPress post id on that site (migration 044), > 0, only with `source_type = 'external_wordpress_post'`. Ids only: the post permalink is never stored here (since TASK-071 its verified value becomes the Pins' default `pins.link_url`). All three written best-effort after completion — generating works before 044 is applied |
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
(source_wordpress_generation_id) WHERE NOT NULL  -- migration 040
(source_wordpress_site_id, source_wordpress_post_id) WHERE source_wordpress_post_id IS NOT NULL  -- migration 044
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
| board_section  | text nullable            | Optional free-text Pinterest section inside `board` (migration 032). Set only when the user manually typed a `board` at generation time — never AI-suggested, never derived from `board_id`. No DB CHECK — max length and forbidden characters (`/`, `\`, line breaks — `/` is Pinterest's own Board/Section separator) validated at the Zod layer (`lib/validations/pinterest.ts`). Exported as `Board/Section` in the CSV's existing `Pinterest board` column (`lib/csv/pinterest.ts`), never a separate column |
| image_prompt   | text                     | Prompt for image generation |
| image_analysis | text nullable            | JSON-stringified `ImageStyleAnalysis` plus private Pinterest metadata keys for the structured angle (`_pinterestStrategy`) and latest accepted Quality Gate result (`_pinterestCreativeDiagnostics`: status/warnings/template/position) and — for `visual_format = ai-integrated` only — the resolved AI Integrated contract (`_pinterestAiIntegrated`: effective `language`, validated `settings`, final `text` headline/subtitle/cta; TASK-041 Phase 2). Same text column; no schema migration |
| media_url      | text nullable            | Generated image URL (Supabase Storage) |
| link_url       | text nullable            | Website destination (TASK-071): the clean URL typed before generation or in the history, or the verified permalink of the existing WordPress post the Pins come from. Never UTM — those are added to the CSV only (TASK-070). Null = no link |
| publish_date   | timestamptz nullable     | Schedule date — the real UTC instant since TASK-048 (typed wall time + IANA zone converted once by `PATCH /api/pinterest/schedule`). Rows scheduled before TASK-048 hold the typed wall time stored as if it were UTC (13:00 → `13:00Z`); they are never rewritten automatically. No schema change |
| visual_format  | text                     | `photo` / `text-overlay` (Legacy Composite, TASK-034) plus `ai-integrated` / `photo-only` (TASK-041 Phase 2 — no migration: the column is unconstrained `text`). NOT NULL DEFAULT `photo`. Validated in application layer (`PinVisualFormat`), not a DB enum/CHECK. Existing rows are never rewritten |
| overlay_text   | text nullable            | On-image hook text (5-8 words), set only when `visual_format = text-overlay` (TASK-034). Always null for `ai-integrated` / `photo-only` |
| title_banner_template | text nullable      | Static SVG shape (`lib/pinterest/banner-templates/`) for the top title-hook banner: `clean-band` / `ribbon` / `pill` / `torn-paper` / `corner-tag` (TASK-FIX-024). Set only when `visual_format = text-overlay`. Validated in application layer, not a DB enum/CHECK |
| cta_banner_template   | text nullable      | Same shape enum as above, for the bottom "save this pin" CTA banner — set on every legacy pin (`photo` / `text-overlay`) (TASK-FIX-024); null for `ai-integrated` / `photo-only`, which never use the SVG/Sharp renderer |
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

At generation time, each pin's AI-suggested `board` name is matched case-insensitively against existing boards for the project; unmatched names create a new board automatically (see `lib/queries/boards.ts` `findOrCreateBoardIds()`). Exception (TASK-044 phase 2): a generation made from a WordPress article only matches existing boards (`{ create: false }`) — an unmatched name stays free text on the pin with `board_id = null`, no board is created. No pre-existing pins are backfilled — only pins generated after this table's migration get `board_id` set.

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

# content_streams

Topic-pillar grouping under a project (TASK-FIX-039 Phase 2a, discovery in `docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md`). A content stream links a project to an optional WordPress category and to one or more Pinterest boards (via `content_stream_boards`), and carries its own publication targets. No `pinterest_accounts` table exists or is planned for the current experiment — a board plays that role directly (see the "1 account = 1 subniche = 1 board" decision in the task doc, §1.3a).

## Columns

| Column                     | Type                              | Description |
| -------------------------- | ---------------------------------- | ------------ |
| id                         | uuid PK                            | |
| project_id                 | uuid FK → projects.id              | NOT NULL, ON DELETE CASCADE |
| user_id                    | uuid FK → profiles.id              | NOT NULL, ON DELETE CASCADE |
| name                       | text                                | NOT NULL |
| wordpress_category_id      | uuid FK → wordpress_categories.id  | nullable, ON DELETE SET NULL |
| target_pins_per_day        | integer                            | nullable, CHECK >= 0 |
| target_articles_per_week   | integer                            | nullable, CHECK >= 0 |
| target_buffer_days         | integer                            | nullable, CHECK >= 0 |
| status                     | text                                | NOT NULL DEFAULT 'active', CHECK IN ('active','planned','warming','paused','archived') — `planned` added by migration 036 (TASK-FIX-043) |
| created_at                 | timestamptz                        | |
| updated_at                 | timestamptz                        | |

## Purpose

Groups a project's Pinterest/WordPress activity into named pillars (e.g. "Crochet Cats", "Crochet Sweaters") without duplicating `projects`, `wordpress_categories`, or `boards` — it only stores foreign keys to them. `target_pins_per_day` and `target_buffer_days` together define the required planning buffer (`required_buffer = target_pins_per_day × target_buffer_days`), used to compute a "missing pins" figure from real `pins.publish_date` data. Written by the project page (Phase 2a.1) and read by the Command Center dashboard (TASK-FIX-042), which computes planned coverage, missing pins and recommendations from it plus real `pins.publish_date` values.

## RLS

**Hardened 2026-09-16** in the local copy of migration 030 (see
`docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md` §14a for the full rationale).
`USING` still protects existing-row visibility exactly like every other
table in this schema; `WITH CHECK` is stricter than `user_id = auth.uid()`
alone, and is meant to be the actual security boundary — not the TypeScript
layer:

**Live database note (2026-09-16, §14b):** 030 had already been applied to
the linked Supabase project **manually**, before this `WITH CHECK` existed —
the live policy currently has `with_check = null` (the original, weaker
`USING`-only version). `supabase_migrations.schema_migrations` doesn't exist
on this project, confirming no migration (030 or otherwise) has ever gone
through the tracked mechanism; every migration so far was pasted into the
SQL Editor by hand. The block below is now shipped as a separate corrective
migration, `031_harden_content_streams_rls.sql` (`DROP POLICY IF EXISTS` +
`CREATE POLICY`, same name, same `USING`), rather than a further edit to
030 — treat 030 as immutable from here on, exactly as if it had shipped
through the tracked mechanism, because it effectively has.

```sql
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  AND (
    wordpress_category_id IS NULL
    OR EXISTS (
      SELECT 1 FROM wordpress_categories wc
      WHERE wc.id = wordpress_category_id
        AND wc.user_id = auth.uid()
        AND wc.project_id = content_streams.project_id
    )
  )
)
```

This guarantees, **at the database level**, that `project_id` resolves to a
project owned by the caller, and that `wordpress_category_id` (when set)
resolves to a category owned by the caller **and** belonging to that same
project — a category from a different project of the same user is rejected
too. `isOwnedProject`/`isCategoryInProject` in `lib/queries/content-streams.ts`
still run before every write, but only as defense-in-depth and for clearer
error messages — a direct Supabase/PostgREST call bypassing that file
entirely is still bound by the `WITH CHECK` above.

## Indexes

```sql
(project_id, name) UNIQUE
(user_id)
(project_id)
(wordpress_category_id)
(status)
```

---

# content_stream_boards

Many-to-many join between `content_streams` and `boards` (TASK-FIX-039 Phase 2a). A stream can technically span several boards; a board can technically belong to several streams — the schema stays flexible N:N on purpose. For the current "1 account = 1 subniche = 1 board" experiment, the future UI will enforce "one board per *active* stream" at the application layer only; this is not a database constraint (a cross-table condition on `content_streams.status` cannot be expressed as a clean partial index/CHECK on this table).

## Columns

| Column             | Type                          | Description |
| ------------------ | ------------------------------ | ------------ |
| content_stream_id  | uuid FK → content_streams.id  | NOT NULL, ON DELETE CASCADE, part of PK |
| board_id           | uuid FK → boards.id            | NOT NULL, ON DELETE CASCADE, part of PK |
| user_id            | uuid FK → profiles.id          | NOT NULL, ON DELETE CASCADE |
| created_at         | timestamptz                    | |

## RLS

**Hardened 2026-09-16** in the local copy of migration 030 (same pass as
`content_streams` above — see `docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md`
§14a). **Live database note (§14b):** same situation as `content_streams` —
the live policy currently has `with_check = null`; the block below ships as
part of the same corrective `031_harden_content_streams_rls.sql`, not a
further edit to 030:

```sql
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM content_streams cs WHERE cs.id = content_stream_id AND cs.user_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM boards b
    JOIN content_streams cs ON cs.project_id = b.project_id
    WHERE b.id = board_id AND cs.id = content_stream_id AND b.user_id = auth.uid()
  )
)
```

This guarantees, **at the database level**, that a link can only be created
between a content stream the caller owns and a board that the caller owns
**and** that belongs to that stream's own project — never verifiable from
`user_id` alone, since a board and a stream can each independently belong to
the same user under different projects. It also transitively forces
`content_stream_boards.user_id`, the stream's `user_id`, and the board's
`user_id` to the same value, so a link row with an inconsistent `user_id`
(only reachable via a direct client call, never via
`lib/queries/content-streams.ts`) is rejected too.
`isBoardInProject`/`isOwnedProject` in `lib/queries/content-streams.ts`
still run first, as defense-in-depth and for clearer error messages — the
`WITH CHECK` above is what actually enforces this, independent of that
file.

## Indexes

```sql
(content_stream_id, board_id) PRIMARY KEY
(board_id)
(user_id)
```

---

## Status values

* `active` — running; measured against its targets, can be recommended.
* `planned` (migration `036_add_content_stream_planned_status.sql`, TASK-FIX-043) — prepared for a future start, not started yet. Never counted as an active project, never measured for coverage, never recommended or used as Today's focus; listed in its own "Planned" section on the dashboard. Can move to `warming` or `active` at any time (no transition rule is enforced). Unrelated to a Pin's planned `publish_date`.
* `warming` — started, ramping up; low-urgency buffer review only.
* `paused` — no coverage expected.
* `archived` — hidden from the dashboard; frees its board.

Migration 036 only drops and re-adds the `content_streams_status_check` constraint (the name Postgres gave 030's inline CHECK) with the five values; no row changes.

---

# content_stream_publishing_activity

Pins published **outside OmniFlow** (by hand or with another tool) for one content stream on one local day (TASK-FIX-043, migration `035_add_stream_publishing_activity.sql`). OmniFlow never talks to Pinterest, so this is a user-entered count, always read back as manual/external data.

## Columns

| Column            | Type                          | Description |
| ----------------- | ----------------------------- | ----------- |
| id                | uuid PK                       | |
| user_id           | uuid FK → profiles.id         | NOT NULL, ON DELETE CASCADE — always the session user |
| content_stream_id | uuid FK → content_streams.id  | NOT NULL, ON DELETE CASCADE |
| activity_date     | date                          | NOT NULL — local calendar day (past, today or future) |
| published_count   | integer                       | NOT NULL, CHECK >= 0 (Zod also caps it at 1000) |
| note              | text                          | nullable, CHECK length <= 500 |
| source            | text                          | NOT NULL DEFAULT 'manual', CHECK IN ('manual','external') |
| status            | text                          | NOT NULL DEFAULT 'published', CHECK IN ('published','expected') — migration 038 (TASK-FIX-053). `published` = confirmed live outside OmniFlow; `expected` = planned in another tool, not confirmed. The API only allows `published` for today or earlier |
| created_at        | timestamptz                   | |
| updated_at        | timestamptz                   | trigger `update_updated_at_column()` |

`UNIQUE (user_id, content_stream_id, activity_date)` — one row per stream and day; saving again updates it (upsert on that key), never a duplicate.

## Purpose

Lets the dashboard "Publishing coverage" grid count Pins published — or expected — elsewhere: `effective = Pins planned in OmniFlow for the day + confirmed count (today only) + expected count (today or later)`. It never touches `pins` — no `publish_date` change, no pin row — so the Created / Planned counters and any real Pinterest statistic stay untouched. Confirmed (`published`) and expected rows are always counted apart: an `expected` row improves the coverage forecast of its own day but is never counted or shown as published. In the buffer maths, each entry only fills its own day's gap to `target_pins_per_day`, never more.

Migration `038_add_publishing_activity_status.sql` (TASK-FIX-053) only adds the `status` column; every existing row became `published` (035 only accepted today or earlier). The rule "a future day can only be `expected`" depends on the user's local calendar, which Postgres does not know, so it is enforced in `lib/queries/stream-publishing-activity.ts` (`resolveActivityStatus`), not by a CHECK. RLS, grants and the unique key are unchanged.

## RLS

```sql
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM content_streams cs WHERE cs.id = content_stream_id AND cs.user_id = auth.uid())
)
```

Same hardened shape as 031 / 033: a direct PostgREST call cannot attach activity to another user's stream. `assertStreamOwnedBy` in `lib/queries/stream-publishing-activity.ts` runs first as defense-in-depth.

## Indexes

```sql
(user_id, content_stream_id, activity_date) UNIQUE
(content_stream_id)
(user_id, activity_date)
```

---

# tasks

Personal work items for the Command Center (TASK-FIX-042 — Command Center Phase 2b, migration `033_add_tasks.sql`; design in `docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md` §5.3). Backs Today's Priorities (manual tasks and accepted dashboard recommendations) and the Sunday analytics review routine. No `pinterest_accounts` table: an "account" task points at `board_id` (§1.3a).

## Columns

| Column            | Type                               | Description |
| ----------------- | ---------------------------------- | ----------- |
| id                | uuid PK                            | |
| user_id           | uuid FK → profiles.id              | NOT NULL, ON DELETE CASCADE |
| project_id        | uuid FK → projects.id              | nullable, ON DELETE **SET NULL** — a task outlives its project (§11 §2) |
| content_stream_id | uuid FK → content_streams.id       | nullable, ON DELETE SET NULL |
| board_id          | uuid FK → boards.id                | nullable, ON DELETE SET NULL — also stands in for "Pinterest account" |
| title             | text                               | NOT NULL (max 200, Zod) |
| description       | text                               | nullable |
| source            | text                               | NOT NULL, CHECK IN ('manual','automatic','recurring') |
| type              | text                               | NOT NULL, Zod-validated only (no CHECK, expected to grow): content_creation, pinterest_publishing, wordpress_article, account_warming, keyword_research, account_analysis, digital_product, niche_research, maintenance, custom, weekly_review |
| due_date          | date                               | nullable |
| scheduled_at      | timestamptz                        | nullable (not used by any UI yet) |
| estimated_minutes | integer                            | nullable, CHECK >= 0 |
| priority          | text                               | NOT NULL DEFAULT 'medium', Zod-validated (low/medium/high) |
| status            | text                               | NOT NULL DEFAULT 'pending', Zod-validated: suggested, pending, scheduled, completed, skipped, postponed, cancelled (`cancelled` = soft delete) |
| recurrence_rule   | text                               | nullable, only for `source = 'recurring'` (weekly review: `FREQ=WEEKLY;BYDAY=SU`) |
| pinned_to_today   | boolean                            | NOT NULL DEFAULT false |
| created_by_user   | boolean                            | NOT NULL DEFAULT true |
| completed_at      | timestamptz                        | nullable |
| skipped_at        | timestamptz                        | nullable |
| created_at        | timestamptz                        | |
| updated_at        | timestamptz                        | trigger `set_tasks_updated_at` |

No `accepted_at` (§11 §3 — "accepted" = `status != 'suggested'`), no `related_*_id` content link (§11 §4).

## Constraints

* `tasks_suggested_not_pinned`: `CHECK (NOT (pinned_to_today AND status = 'suggested'))` — an unaccepted suggestion can never be pinned.
* `tasks_one_weekly_review_routine`: partial UNIQUE `(user_id) WHERE type = 'weekly_review' AND source = 'recurring' AND status <> 'cancelled'` — one live Sunday routine per user.
* The **max 3 open pinned priorities** rule is application-layer (`lib/queries/tasks.ts`, 409 `priorities_full`), never an automatic eviction.

## RLS

Same hardened shape as `content_streams` (migration 031): `USING (user_id = auth.uid())`, and `WITH CHECK` additionally requires every non-null `project_id` / `content_stream_id` / `board_id` to reference a row owned by the caller. `lib/queries/tasks.ts` re-checks the same ownership first (defense-in-depth, clearer errors).

## Indexes

```sql
(user_id)
(project_id)
(content_stream_id)
(board_id)
(status)
(due_date)
(user_id) WHERE pinned_to_today
(user_id) UNIQUE WHERE type = 'weekly_review' AND source = 'recurring' AND status <> 'cancelled'
```

---

# task_occurrences

One row per recurring task per day, written **lazily** — only when the user acts on that day's instance (migration `034_add_task_occurrences.sql`, design §5.4/§9). No cron/Inngest. Used today by the Sunday analytics review: completing a Sunday writes that Sunday's row; the routine (`tasks` row) itself is never completed.

## Columns

| Column          | Type                    | Description |
| --------------- | ----------------------- | ----------- |
| id              | uuid PK                 | |
| task_id         | uuid FK → tasks.id      | NOT NULL, ON DELETE CASCADE |
| user_id         | uuid FK → profiles.id   | NOT NULL, ON DELETE CASCADE |
| occurrence_date | date                    | NOT NULL — local calendar day of the instance |
| status          | text                    | NOT NULL DEFAULT 'pending', Zod-validated: pending, scheduled, completed, skipped |
| scheduled_at    | timestamptz             | nullable |
| pinned_to_today | boolean                 | NOT NULL DEFAULT false |
| completed_at    | timestamptz             | nullable |
| skipped_at      | timestamptz             | nullable |
| created_at      | timestamptz             | |

## Constraints

`UNIQUE (task_id, occurrence_date)`.

## RLS

`USING (user_id = auth.uid())`; `WITH CHECK` also requires the parent `tasks` row to belong to the caller.

## Indexes

```sql
(task_id, occurrence_date) UNIQUE
(user_id)
(occurrence_date)
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
| image_model  | text, nullable    | Exact AI model that generated this image (e.g. `black-forest-labs/flux.2-pro`), resolved via `resolveImageModel()` at call time — not inferred after the fact. Null on rows created before migration 024 |
| created_at   | timestamptz       |                                |

## Purpose

Enables image versioning and regeneration. Users can generate multiple image versions per pin, compare them, and choose which version to use for export. `image_model` (TASK-FIX-018) gives per-image traceability, since `AI_IMAGE_MODEL`/`AI_IMAGE_MODEL_TEXT` can change over time and `generations.model_used` only tracks the text model.

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
| source_type | text                   | `keyword` / `url` / `pins`. `keyword` (Option 1), `url` (Option 3), and `pins` (Option 4) are implemented |
| research_notes | text nullable       | Optional user-supplied SEO research, migration 013                |
| source_pin_ids | uuid[] nullable     | Pinterest pin IDs this generation was built from (Option 4 only, migration 014). No FK on array elements — ownership of the referenced pins is validated at insert time in the API route, not enforced by the DB |
| source_url  | text nullable          | Scraped source URL (Option 3 only, migration 022) — set only when the Option 3 input was a link; null when it was pasted text directly. Provenance only, mirrors `source_pin_ids`. The source content itself is never persisted — only a structured topics/angles/key-points summary is used, and only transiently (see `lib/wordpress/generate-article-from-url.ts`) |
| status      | text                   | `pending` / `processing` / `completed` / `failed` |
| created_at  | timestamptz            |                                                  |
| article_type | text nullable         | Core Settings (TASK-FIX-034, "1-Click Blog Post" / Option 1 only), migration 026. One of `how-to` / `listicle` / `product-review` / `news` / `comparison`, or null ("None" — Options 3/4 never set this). Not a DB enum/CHECK — validated at the Zod layer (`lib/validations/wordpress.ts` `ARTICLE_TYPES`), same convention as `visual_format`/`title_banner_template`. Nudges the outline's Main Content section structure only, not the fixed 10-block AEO skeleton |
| article_size | text nullable         | Core Settings, migration 026. One of `small` / `medium` / `large`, or null (default: unchanged pre-existing behavior — 8-10 Main Content sections, 1800-2500 words). See `ARTICLE_SIZE_CONFIG` in `lib/validations/wordpress.ts` for the exact section-count/word-count range per tier |
| tone_of_voice | text nullable        | Core Settings, migration 026. One of `friendly` / `professional` / `informational` / `transactional` / `inspirational` / `neutral` / `witty` / `casual`, or null. Sentence-level voice instruction applied to the article body, distinct from and layered on top of the Project's Brand Profile |
| point_of_view | text nullable        | Core Settings, migration 026. One of `first-singular` / `first-plural` / `second` / `third`, or null |
| target_country | text nullable       | Core Settings, migration 026. Free string constrained to a fixed list at the Zod layer (`TARGET_COUNTRIES`) — e.g. "United States", "Germany". Steers examples/references/units toward that market, or null (no localization instruction) |
| hook_brief      | text nullable       | Structure (TASK-FIX-035, "1-Click Blog Post" / Option 1 only), migration 027. Free text, max 500 chars, with 5 client-side presets (Question/Statistical or Fact/Quotation/Anecdotal or Story/Personal or Emotional — `components/wordpress/article-form.tsx`) that pre-fill and remain editable. Overrides the article prompt's generic introduction-angle instruction; null = unchanged default opening instruction |
| include_conclusion | boolean nullable | Structure, migration 027. 3-state toggle: `true` ("Oui" — force presence, already the default), `false` ("Non" — force absence, drops the "## Conclusion" block from the article's fixed structure), `null` ("Non défini" — default, unchanged) |
| include_tables  | boolean nullable    | Structure, migration 027. Overrides the outline's own topic-driven `includeComparisonTable` judgment at article-write time: `true` forces a table (constructed even if the outline didn't plan one), `false` forbids any Markdown table anywhere in the article (not just the dedicated section), `null` leaves the outline's judgment untouched |
| include_h3      | boolean nullable    | Structure, migration 027. `true` encourages H3 subheadings within Main Content sections, `false` explicitly bans any nested heading level, `null` = no instruction (model's natural behavior, unchanged) |
| include_lists   | boolean nullable    | Structure, migration 027. Governs Markdown bullet/numbered lists within Main Content/Introduction/Conclusion prose only — never the separate Key Takeaways/Common Mistakes sections, which keep their own fixed list format regardless. `true` encourages, `false` bans, `null` = no instruction |
| include_italics | boolean nullable    | Structure, migration 027. `true` encourages occasional Markdown italics, `false` explicitly bans italic syntax anywhere, `null` = no instruction |
| include_quotes  | boolean nullable    | Structure, migration 027. `true` encourages at least one Markdown blockquote, `false` explicitly bans blockquote syntax anywhere, `null` = no instruction |
| include_key_takeaways | boolean nullable | Structure, migration 027. `true`/`null` keep the pre-existing always-present Key Takeaways section (4-6 items, unchanged). `false` is a hard Zod-enforced guarantee of absence — `buildWordpressOutlineSchema()`'s `keyTakeawaysThemes` array is constrained to exactly 0 items, not just asked to be empty, so the outline step itself fails validation (and retries) if the model tries to sneak one in |
| include_faq     | boolean nullable    | Structure, migration 027. Same 3-state/schema-enforced pattern as `include_key_takeaways`, applied to `faqQuestions`/the structured `faq` field (the FAQ was already never printed in the visible Markdown body before this task — this toggle controls whether it's generated at all, e.g. for a FAQPage rich result) |
| include_bold    | boolean nullable    | Structure, migration 027. `true` encourages occasional Markdown bold, `false` explicitly bans bold syntax anywhere, `null` = no instruction. Enforced at the prompt level only (an explicit ban naming the literal `**`/`__` syntax), not by a deterministic post-processing strip — see DECISIONS.md |
| seo_keywords    | text nullable       | SEO Keywords (TASK-FIX-036, "1-Click Blog Post" / Option 1 only), migration 028. Comma-separated, same convention as `pins.keywords` (not a Postgres array — see DECISIONS.md 2026-09-13 (5)). Up to 15 user-added and/or AI-suggested keywords/phrases the article prompt instructs to naturally include at least once each; null/empty = no instruction, unchanged behavior |
| manual_external_urls | text nullable   | External Linking (TASK-FIX-037, "1-Click Blog Post" / Option 1), migration 029. Since TASK-FIX-048 also holds the single optional External URL of the pins method (`source_type = 'pins'`), no schema change. Comma-separated, same convention as `seo_keywords`/`pins.keywords`. User-supplied URLs the article prompt instructs to insert as Markdown links where contextually relevant — purely additive to the existing unconditional `addExternalLink()` web-search link (`lib/ai/services/external-link.ts`, unchanged), not a replacement for it. Null/empty = no instruction, unchanged behavior |
| quality_report  | jsonb nullable      | Quality Gate V1 report (TASK-FIX-046), migration 037. `{ status: "passed" \| "warning" \| "failed", qualityIssues: string[], warnings: string[], checks: { key, status, message }[] }`, computed by `runArticleQualityCheck()` (`lib/wordpress/quality-check.ts`) after every generation (keyword, pins, URL) and written best-effort by `saveQualityReport()` (`lib/wordpress/quality-report.ts`) in a separate update after `status = completed`. Shape validated in the app (Zod `articleQualityReportSchema`) on read; invalid or NULL (generations before 037) → no report. Informational only, never blocks export or publishing. No index, no RLS change |

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
| wp_post_id             | integer nullable                   | The remote WordPress post ID once published/scheduled/drafted via REST API (migration 019, TASK-035). Set on every successful `POST /api/wordpress/[id]/publish` call; subsequent calls update this same WP post instead of creating a duplicate. Since TASK-FIX-058 it is written **as soon as WordPress returns (or reconciliation finds) the post id** — before the FAQ re-send, Rank Math and the final status write — and never cleared by a failed or uncertain attempt, so a retry always updates the same post |
| publish_status          | text, default `'draft'`            | `draft` / `scheduled` / `published` / `failed`, plus since TASK-FIX-058 `publishing` (a publish holds the lock, see `publish_started_at`) and `uncertain` (WordPress did not confirm the outcome — check WordPress before retrying; `publish_error` holds the message) — not a DB enum/CHECK, validated at the Zod layer (`lib/validations/wordpress-publish.ts`), same convention as `generations.language`/`pins.visual_format`. Independent of the generation-time `status` column above (that one tracks AI generation, this one tracks WordPress publishing) |
| published_at           | timestamptz nullable                | Set only when `publish_status` transitions to `published` (immediate publish). Left null for `scheduled` — OmniFlow does not poll WordPress to learn when a scheduled post actually goes live (WP-Cron handles that independently) |
| scheduled_at            | timestamptz nullable                | The WP-side target datetime when `publish_status = 'scheduled'` (migration 020, TASK-FIX-007) — powers the "Scheduled for [date]" status badge. Cleared (set back to null) on any later non-schedule publish call, so a since-republished article never keeps claiming a stale scheduled date |
| publish_error           | text nullable                       | Set when `publish_status = 'failed'` or `'uncertain'`; the exact reason is always surfaced to the user, never a silent failure |
| publish_started_at      | timestamptz nullable                | Publish lock (migration 042, TASK-FIX-058). Set with `publish_status = 'publishing'` by one conditional UPDATE (`acquirePublishLock()`, `lib/wordpress/publish-lock.ts`) that only succeeds when no other publish is active or the active one is older than 90 s (route `maxDuration` 60 s + 30 s margin) — a concurrent publish gets `409 publish_in_progress`. Reset to NULL with the final status (success, failure, uncertain, unexpected error). A stale `publishing` row is shown as uncertain and can be taken over. Before 042 is applied the lock is skipped (logged), never blocking. No index, no default; RLS/grants unchanged |
| faq                     | jsonb nullable                      | Structured FAQ (migration 039, TASK-FIX-055): `[{ "question": string, "answer": string }]` (max 20, validated with Zod in `lib/wordpress/faq-data.ts`). Exactly the items `applyFaqSection()` rendered into `content` at generation time — same validated array, same step, and `content` is never edited afterwards, so they cannot diverge; `content` stays the source of truth for display and exports. `[]` = generated without a FAQ section (disabled, empty, or the model wrote its own); `NULL` = generated before 039 (or the best-effort write failed). Read through `parseStoredFaq()` / `resolveArticleFaq()` — never raw. Used only for the FAQPage JSON-LD on publish. No backfill: existing rows keep `NULL` and fall back to a read-only parse of their FAQ section |

## Purpose

Content is stored as Markdown, not HTML — HTML is derived at export time via `exportToHtml()` (`lib/wordpress/export.ts`, using `marked`), never persisted. `content` always starts with a `# {title}` H1 line (see the article-writing prompt) — deliberately kept as stored, in case of a future export destination with no separate title field. `exportToHtmlForWordPress()`/`exportToMarkdownForWordPress()` (TASK-FIX-008) strip that leading H1 via `stripLeadingH1()` before use — every consumer that already transmits the title through its own channel (WordPress's `title` post field, or Copy Markdown/HTML/Download since both are meant to be pasted into WordPress) would otherwise show it twice, stacked. OmniFlow's own reading view (`ArticleContent` on `/wordpress/[id]`) intentionally keeps calling the raw `exportToHtml()` — that page has no other element displaying the title, so content's own H1 is the only title shown there, not a duplicate.

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
| wp_category_id | integer nullable   | Maps this OmniFlow category to a real WordPress category term id, fetched via `GET /wp-json/wp/v2/categories` (migration 019, TASK-035). Null = unmapped; publishing an article with an unmapped category omits `categories` from the WP payload, WordPress defaults to "Uncategorized" |

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

# wordpress_sites

One WordPress REST API connection per Project (TASK-035). Credentials are a
WordPress Application Password (core-native since WP 5.6, no OAuth
registration/redirect flow needed) — validated via `testConnection()`
(`GET /wp-json/wp/v2/users/me`) before every insert/update, never trusted
from a prior client-side test alone.

## Columns

| Column                          | Type                   | Description                       |
| -------------------------------- | ---------------------- | ------------------------------------ |
| id                               | uuid PK                |                                      |
| project_id                       | uuid FK → projects.id, UNIQUE | ON DELETE CASCADE — one connection per project |
| user_id                          | uuid FK → profiles.id  | ON DELETE CASCADE. Denormalized (see RLS) |
| site_url                         | text                    | Normalized (trailing slash stripped) at write time |
| wp_username                      | text                    |                                      |
| encrypted_application_password   | text                    | AES-256-GCM via `lib/wordpress/crypto.ts` (`encryptSecret`/`decryptSecret`), key from `WORDPRESS_ENCRYPTION_KEY`. Never selected into an API response — `getWordPressSiteByProjectId()` explicitly excludes this column; only the two server-side routes that must call the WP REST API select it |
| created_at                       | timestamptz             |                                      |

## Purpose

`site_url`/`wp_username`/`encrypted_application_password` are always edited
together (full replace, no partial `PATCH`) — WordPress auth validity is a
property of the whole credential triple, and the triple is always re-tested
server-side before any write, so a partial update could silently persist a
URL/username change without re-validating the resulting combination.

Disconnecting (`DELETE /api/wordpress/sites/[id]`) resets any of the
project's `wordpress_articles` rows with `publish_status in ('scheduled',
'published')` back to `draft`/`wp_post_id = null` first — otherwise a stale
`wp_post_id` could collide with an unrelated post if the user later connects
a *different* WordPress site to the same project.

## RLS

```sql
user_id = auth.uid()
```

`user_id` is denormalized here (same choice as `wordpress_categories`)
rather than reached via a subquery (as `wordpress_articles` does), because
every route that creates/edits a `wordpress_sites` row already has the
parent `project` row in hand to perform the ownership check — denormalizing
costs nothing and keeps the RLS policy a plain indexed equality check.

## Indexes

```sql
unique (project_id)
```

No separate index needed — the UNIQUE constraint on `project_id` already
provides a single-column unique btree index for exact lookups.

---

# wordpress_media_assets

WordPress media reuse (TASK-FIX-060, migration `043_add_wordpress_media_assets.sql`). One row per (WordPress site, source image): the attachment an OmniFlow image was uploaded as, so a retry, a republish, another article or a rewritten version using the same image reuses it instead of sending `POST /wp/v2/media` again. Read and written only by the publish route through `createWordPressMediaAssetStore()` (`lib/queries/wordpress-media-assets.ts`) and `obtainReusableMedia()` (`lib/wordpress/media-reuse.ts`).

## Columns

| Column             | Type                                   | Description |
| ------------------ | -------------------------------------- | ----------- |
| id                 | uuid PK                                |             |
| user_id            | uuid FK → profiles.id                  | ON DELETE CASCADE. Denormalized for RLS (same as `wordpress_sites`) |
| wordpress_site_id  | uuid FK → wordpress_sites.id           | ON DELETE CASCADE — disconnecting a site drops its mappings (never its WordPress media) |
| wordpress_site_url | text NOT NULL                          | Normalized site URL the attachment was created on. A connection edited to another URL keeps its id: a row whose URL differs from the connected site is never reused (re-uploaded, row updated) |
| source_asset_key   | text NOT NULL                          | Storage-independent identity of the image (`lib/wordpress/media-source.ts`): `storage:<bucket>/<object path>` for Supabase Storage URLs (public / sign / render variants) and declared CDN origins; `url:<host><path>` (no query) for any other URL. Never the public URL, never the bare file name |
| source_hash        | text nullable                          | SHA-256 hex of the image bytes when known. Lets a copy of the same bytes under another path (rewritten versions copy their images) reuse the attachment. Not unique |
| wp_media_id        | bigint nullable, CHECK > 0             | WordPress attachment id. NULL only while an upload holds the row's claim |
| wp_media_url       | text nullable                          | `source_url` returned by WordPress |
| upload_started_at  | timestamptz nullable                   | Claim of the upload in progress, NULL once done. Older than 90 s (publish lock's stale delay) = killed request, may be taken over |
| created_at         | timestamptz                            |             |
| updated_at         | timestamptz                            | Set by the code on each claim / completion |

## Constraints

```sql
unique (wordpress_site_id, source_asset_key)
check (wp_media_id is null or wp_media_id > 0)
check (wp_media_id is not null or upload_started_at is not null)
```

## Purpose

Lookup before any upload: mapped and `GET /wp/v2/media/<id>` finds an image → reused (no `POST /wp/v2/media`); 404 / 410 / 400 or not an image → one new upload, row updated, old attachment never deleted; WordPress cannot answer (timeout / 5xx / auth) → the mapped attachment is reused unverified (never duplicated). Not mapped → the claim row is inserted **before** uploading; a concurrent publish hitting the unique key re-reads the row and waits (bounded by the time budget) for the attachment instead of uploading a copy. Before uploading, rows with the same `source_hash` on the same site are tried. The mapping is saved right after the upload, before the post is written. Without the table (043 not applied: `42P01` / `PGRST205`) or on any database error, images are uploaded exactly as before and `step=media_reuse result=unavailable_migration_043_not_applied` is logged once per publish. Nothing existing was backfilled or modified.

## RLS

```sql
using (user_id = auth.uid())
with check (user_id = auth.uid() and wordpress_site_id in (select id from wordpress_sites where user_id = auth.uid()))
```

Grants: `SELECT, INSERT, UPDATE, DELETE` to `authenticated` (DELETE only removes an unfinished claim row of the same publish).

## Indexes

```sql
unique (wordpress_site_id, source_asset_key)
(wordpress_site_id, source_hash) where source_hash is not null
```

---

# social_content_generations

Saved social content (TASK-063, migration 045). **Medium** summaries (`POST /api/social/medium-summary`) and **Facebook** Page posts (`POST /api/social/facebook-post`, TASK-068) are written, after their checks passed; `instagram`, `reels` and `tiktok` are already accepted by the `platform` CHECK so their future generators share the table and the history UI.

## Columns

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | `gen_random_uuid()` |
| user_id | uuid NOT NULL → profiles(id) ON DELETE CASCADE | owner |
| project_id | uuid NOT NULL → projects(id) ON DELETE CASCADE | project of the source (OmniFlow article's project, connected site's project, Pinterest generation's project) |
| platform | text NOT NULL | CHECK `medium` / `facebook` / `instagram` / `reels` / `tiktok` |
| status | text NOT NULL DEFAULT `completed` | CHECK `completed` / `failed` (only `completed` is written today) |
| source_type | text NOT NULL | CHECK `omniflow_article` / `external_wordpress_post` / `pinterest_generation` |
| source_wordpress_generation_id | uuid nullable → wordpress_generations(id) ON DELETE SET NULL | OmniFlow article (also kept for a Pinterest generation made from one) |
| source_wordpress_site_id | uuid nullable → wordpress_sites(id) ON DELETE SET NULL | connected site of the post (external post; published OmniFlow article) |
| source_wordpress_article_id | bigint nullable, > 0 | **WordPress post id** on that site; CHECK requires `source_wordpress_site_id` |
| source_pinterest_generation_id | uuid nullable → generations(id) ON DELETE SET NULL | Pinterest generation the summary was requested from |
| source_title | text nullable | title of the source article at generation time (shown in the history, kept if the source is deleted) |
| language | text nullable | `en` / `fr` / `es` / `de` |
| title | text NOT NULL | |
| subtitle | text nullable | |
| content_markdown | text NOT NULL | full Markdown (title, subtitle, image, summary, CTA) |
| content_html | text NOT NULL | same content as HTML |
| word_count | integer nullable, ≥ 0 | subtitle + summary |
| image_url | text nullable | CHECK `https://` — an image already in the source article, exact URL (never generated, never re-hosted) |
| image_alt | text nullable | |
| cta_url | text nullable | CHECK `http(s)://` — only the exact validated permalink of the published post; never built, never a Pinterest URL |
| call_to_action | text nullable | Facebook (046): call to action appended to the post — never a URL |
| first_comment_text | text nullable | Facebook (046): lead-in of the first comment; the permalink is added after it by code — never a URL |
| link_placement | text nullable | Facebook (046): CHECK `first_comment` / `main_post` / `none`; CHECK `social_content_link_needs_url` — anything but `none` needs `cta_url` |
| content_stream_id | uuid nullable → content_streams(id) ON DELETE SET NULL | Facebook (046): Content Stream of the article's category used as context |
| created_at / updated_at | timestamptz NOT NULL DEFAULT now() | `updated_at` trigger (`update_updated_at_column`) |

For Facebook, `content_markdown` holds the plain post text (no URL) and `content_html` a read-only HTML preview of it; `title` is the source article title. The published text is composed by code: post + call to action (+ permalink when `main_post`); the first comment is `first_comment_text` + permalink (`first_comment`).

No secret, token or credential of any external service is stored here (no Medium token; Facebook tokens live encrypted in `social_connections`).

## RLS

`Users access own social content generations` (FOR ALL): `USING (user_id = auth.uid())`; `WITH CHECK` additionally requires the project and every non-null source (`wordpress_generations`, `wordpress_sites`, `generations`) — and, since 046, the `content_stream_id` — to belong to the caller — same hardened shape as `tasks` (033). Migration 046 drops and re-creates this policy with the Content Stream check. `GRANT SELECT, INSERT, UPDATE, DELETE` to `authenticated`. Queries (`lib/queries/social-content.ts`) also filter on `user_id`.

## Indexes

`(user_id, platform, created_at DESC)` (history list), `project_id`, partial `source_wordpress_generation_id`, partial `source_pinterest_generation_id`.

## Deletion

Deleting a saved item (`DELETE /api/social/generations/[id]`) deletes only that row. Deleting a source article / site / Pinterest generation keeps the saved content (sources set to NULL; Regenerate is then disabled). Deleting the project deletes its saved content (CASCADE, like `generations`). A Facebook post already published stays on Facebook; its `social_publications` row is kept (content id set to NULL).

---

# social_connections

Connected social accounts (TASK-068, migration 046). MVP: one **Facebook Page** per project (never a personal profile or a group). Generic on purpose — Instagram / TikTok / others reuse it later with a new `platform` value.

## Columns

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid NOT NULL → profiles(id) ON DELETE CASCADE | owner |
| project_id | uuid NOT NULL → projects(id) ON DELETE CASCADE | UNIQUE with `platform` — one Page per project |
| platform | text NOT NULL | CHECK `facebook` |
| account_type | text NOT NULL | CHECK `facebook_page` |
| external_account_id | text NOT NULL | Facebook Page id (digits only, CHECK) |
| external_account_name | text NOT NULL | Page name at connection time |
| encrypted_access_token | text NOT NULL | **Page access token**, AES-256-GCM via `lib/social/meta/token-crypto.ts` (key `SOCIAL_TOKEN_ENCRYPTION_KEY`, separate from the WordPress key). Not readable by the `authenticated` role (column privileges) |
| token_expires_at | timestamptz nullable | NULL — a Page token read with a long-lived user token has no fixed expiry; expiry is detected from Meta errors |
| granted_scopes | text[] NOT NULL DEFAULT `{}` | permissions the person granted (without `pages_manage_engagement`, no first comment) |
| status | text NOT NULL DEFAULT `active` | CHECK `active` / `expired` / `revoked` / `error` |
| last_verified_at | timestamptz nullable | last successful connect / Verify |
| last_error_code | text nullable | Meta code only (e.g. `190/463`), never a message |
| created_at / updated_at | timestamptz | `updated_at` trigger |

## Security model

* `REVOKE ALL … FROM anon, authenticated`, then `GRANT SELECT (every column except encrypted_access_token)` and `GRANT DELETE` to `authenticated`: a session (or a direct PostgREST call from the browser) can list its own connections and disconnect them, but can never read, write or update the token. Column privileges only work without a table-wide grant — hence the REVOKE ALL (Supabase grants ALL on new public tables by default). App queries list columns explicitly (`SAFE_CONNECTION_COLUMNS`), never `select('*')`.
* Writes and the only token read use the service-role client (`lib/supabase/admin.ts`) in `lib/queries/social-connections.ts`, called only after the route checked ownership with the caller's session, and always filtered on the connection / project **and** `user_id`.
* RLS: `Users read own social connections` (SELECT) and `Users delete own social connections` (DELETE), both `user_id = auth.uid()`. No INSERT / UPDATE policy for `authenticated`.
* Rotating `SOCIAL_TOKEN_ENCRYPTION_KEY` invalidates every stored token: users reconnect their Page.

---

# social_publications

One row per (saved content, Facebook Page): the state of each publication step (TASK-068, migration 046). No secret is stored.

## Columns

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id / project_id | uuid NOT NULL, CASCADE | owner, project |
| social_content_generation_id | uuid nullable → social_content_generations(id) ON DELETE SET NULL | the published content |
| connection_id | uuid nullable → social_connections(id) ON DELETE SET NULL | Page connection used |
| platform | text NOT NULL | CHECK `facebook` |
| external_account_id / external_account_name | text NOT NULL | Page id / name at publication time |
| status | text NOT NULL DEFAULT `publishing` | CHECK `publishing` / `published` / `partial` (post on Facebook, comment not) / `failed` (Facebook refused, nothing posted) / `unknown` (timeout: may or may not be on Facebook) |
| post_message | text NOT NULL | exact text sent (matched on the Page to settle an `unknown` result) |
| post_image_url | text nullable | CHECK `https://` — article image sent with the photo post |
| external_post_id / external_post_url | text nullable | Facebook post id (saved before any comment) / public link (`https://`) |
| published_at | timestamptz nullable | |
| comment_requested | boolean NOT NULL DEFAULT false | link placement = first comment |
| comment_message | text nullable | exact comment text (lead-in + permalink) |
| comment_status | text NOT NULL DEFAULT `not_requested` | CHECK `not_requested` / `pending` / `published` / `failed` / `unknown`; anything but `not_requested` needs `comment_requested` |
| external_comment_id / comment_published_at | | |
| error_code / error_message / fbtrace_id | text nullable | Meta code, OmniFlow's plain-language message (never Meta's text), Meta trace id |
| attempt_count / comment_attempt_count | integer ≥ 0 | |
| locked_at | timestamptz nullable | set while a step runs; older than 90 s = killed request |
| created_at / updated_at | timestamptz | `updated_at` trigger |

## Constraints

`UNIQUE (social_content_generation_id, external_account_id)` — the same content can never be published twice on the same Page; retries reuse the row. Steps are claimed by conditional UPDATEs (`lib/queries/social-publications.ts`), so two clicks never run the same step.

## RLS

`Users access own social publications` (FOR ALL): `USING (user_id = auth.uid())`; `WITH CHECK` also requires the project, the content and the connection to belong to the caller. `GRANT SELECT, INSERT, UPDATE, DELETE` to `authenticated`. Queries also filter on `user_id`.

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

### Related: increment_trial_usage(p_user_id uuid) RETURNS integer

Not on this table — increments `profiles.total_generations_used` directly (migration 023), same atomic-UPDATE-RETURNING pattern. Not `SECURITY DEFINER`; runs under the caller's own RLS via the existing `profiles` "Users access own profile" policy (`id = auth.uid()`, migration 001). Called by `checkRateLimit()` only when a call site opts in (`enforceTrialLimit: true`), after the hourly window check above has already passed — see `docs/DECISIONS.md` for why this is a separate, lighter mechanism than the future Credits System.

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

Status: Active (created in TASK-013, migration 021).

Purpose:

User-uploaded reference images for style analysis (never composition/layout — see `imageStyleAnalysisSchema`, `lib/validations/vision.ts`).

Examples:

```txt
reference-images/user-id/uuid.jpg
```

Path pattern: `{user_id}/{uuid}.{ext}`. One file per upload, no versioning. Public bucket, broad `authenticated` INSERT/DELETE + public SELECT — same shape as `generated-images`/`wordpress-images`, no per-object RLS.

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

## Image formats of new objects (TASK-050)

No schema change. Since TASK-050, new objects in `generated-images`, `wordpress-images` and R2 are optimized before upload: Pins are `{version}.jpg` (1000×1500 JPEG), WordPress images `{MARKER}.webp` (≤ 1600 px WebP). `.source` photos keep the raw provider bytes and are always `{user_id}/{pin_id}/{version}.source.png`. Objects written before TASK-050 (`.png`) are never re-encoded, renamed or moved; their URLs stay valid.

---

## Cloudflare R2 — omniflow-media (external, TASK-049)

Status: Available behind `MEDIA_STORAGE_PROVIDER=r2` (default `supabase`). Not a Supabase bucket: no migration, no table, no column added.

Purpose:

Public storage of **new** Pinterest and WordPress images when the flag is `r2`, served from `https://media.n8nflow.org` (`R2_PUBLIC_URL`). Existing Supabase objects and URLs are never migrated.

Examples:

```txt
images/pinterest/user-id/generation-id/pin-id/1.png
images/wordpress/user-id/generation-id/FEATURED.png
```

Reserved prefixes (no pipeline yet): `images/facebook/`, `videos/reels/`, `videos/facebook/`, `videos/tiktok/` — all `{user_id}/{content_id}/…`.

Existing columns reused unchanged: `pin_images.storage_path` holds the R2 key (starts with `images/`) instead of a Supabase path, `pin_images.url` / `pins.media_url` / `wordpress_articles.featured_image_url` / `wordpress_article_images.url` hold the R2 public URL. Pinterest `.source` photos are private and stay in `generated-images` (`{user_id}/{pin_id}/{version}.source.{ext}`), never in R2. Access is server-side only (S3 keys never reach the browser).

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
* organizations
* team_members
* ai_provider_logs
* prompt_templates
* scheduled_jobs
* generated_images

These belong to future versions of OmniFlow.
