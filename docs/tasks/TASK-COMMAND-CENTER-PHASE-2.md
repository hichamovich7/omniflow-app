# TASK-COMMAND-CENTER-PHASE-2

Tracked in docs/TASKS.md as **TASK-FIX-039**. Follows
`docs/tasks/TASK-COMMAND-CENTER-MVP.md` (Phase 1 / Phase 1.1 / Phase 1.1
Hotfix), which this phase is designed to eventually replace the mock data of.

**Implementation status (2026-09-16): Phase 2a and Phase 2a.1 are
implemented.** `content_streams` + `content_stream_boards` exist as real,
migrated, RLS-hardened tables with types and query functions (§14/§14a/§14b),
and a small management UI for them now lives inside each project's own page
— create, edit, and archive, with API routes that re-verify ownership
server-side (§14c). Everything else in this document (§5.3/§5.4
`tasks`/`task_occurrences`, §9 recurrence, §10 Next Best Action, Phases
2b–2e in §12) remains **discovery/design only**: no migration, no component,
no API route, no UI for any of it yet.


**Update (2026-09-25, TASK-FIX-042):** `tasks` (migration 033) and
`task_occurrences` (migration 034) now exist, with `/api/tasks` routes, and
the dashboard reads real coverage / missing-pins numbers and shows a
read-only recommendation feed. This covers Phase 2b, the minimal part of 2c
(the Sunday `weekly_review` routine only — no generic "Make recurring" yet),
Phase 2d, and a read-only Phase 2e. See §15.
---

## 0. Method note — Graphify was unavailable

The brief asks for Graphify to be used first, with classical code search only
to complete/verify it. **Graphify is not actually set up in this
environment**: `.claude/hooks/graphify-reminder.js` and
`.opencode/plugins/graphify.js` exist (harness-level hook scripts), but the
knowledge graph they reference, `graphify-out/graph.json`, does not exist in
this repository, no `graphify` CLI is installed (`npx graphify` fails to
resolve), and no `graphify-out/GRAPH_REPORT.md` exists to read. This is
signaled rather than worked around, per the instruction not to invent
availability.

**Fallback used instead:** direct inspection of `supabase/migrations/*.sql`
(all 29, read in full or targeted), `types/database.ts`, `types/wordpress.ts`,
`lib/queries/*.ts`, the actual page components (`projects/[id]/page.tsx`,
`boards/page.tsx`, `history/page.tsx`), and the existing `docs/DATABASE.md`
(cross-checked against the migrations — they matched everywhere checked).
Every fact below is sourced from a specific file, not assumed.

---

## 1. Existing architecture — confirmed, not assumed

### 1.1 Projects

* Table: **`projects`** (migration 001). Real identifier: `projects.id`
  (`uuid`, `gen_random_uuid()`). Owned by `user_id → profiles.id`.
* Columns confirmed in `types/database.ts` + migration 017:
  `id, user_id, name, description, niche, default_language, is_default, created_at, updated_at`.
* `description` doubles as the **Brand Profile** (free-text AI context — see
  PROJECT.md). `niche` is a free-text label that, for a handful of known
  niches, also drives Pinterest image-generation conventions (TASK-034) — it
  is **not** a foreign key to anything, just a string.
* **How a project reaches WordPress**: `wordpress_sites.project_id`
  (`UNIQUE`, migration 019) — **exactly one** WordPress connection per
  project, fetched via `getWordPressSiteByProjectId()`
  (`lib/queries/wordpress-sites.ts`).
* **How a project reaches WordPress categories**:
  `wordpress_categories.project_id` (migration 016, one-to-many, `UNIQUE(project_id, name)`),
  fetched via `listWordPressCategories()` (`lib/queries/wordpress-categories.ts`).
* **How Pinterest boards reach a project**: `boards.project_id` (migration
  007, one-to-many, `UNIQUE(project_id, name)`). `docs/DATABASE.md` states
  this outright: *"a project represents one niche/blog, matching how a real
  Pinterest account organizes boards"* — i.e. **the project itself is
  currently the closest thing to a "Pinterest account"**. There is no
  separate account/profile entity today (see 1.3).
* **Data used by `/projects`** (`app/(dashboard)/projects/page.tsx`, and the
  detail page `app/(dashboard)/projects/[id]/page.tsx`): project row itself,
  `wordpress_sites` (connection status), a `head:true` count of `generations`
  scoped to `project_id`, and a two-step count of `wordpress_articles` via
  `wordpress_generations.project_id → id IN (...)`. **No boards query exists
  on the project detail page today** — boards are only ever listed from
  `/boards` with a project filter, never surfaced from a project's own page.

### 1.2 WordPress

* Connections/sites: **`wordpress_sites`** (migration 019) — `id, project_id (UNIQUE), user_id, site_url, wp_username, encrypted_application_password, created_at`. One row per project, ever.
* Categories: **`wordpress_categories`** (migration 016) — `id, project_id, user_id, name, slug, created_at`, plus `wp_category_id` (migration 019, nullable integer mapping to the real WP term id). Relation to `project_id`: direct FK, one-to-many.
* Generated content: **`wordpress_generations`** (migration 012, the request) → **`wordpress_articles`** (migration 012, the result, one-to-one via `generation_id`) → **`wordpress_article_images`** (internal images). `wordpress_articles.category_id` (migration 016) links to `wordpress_categories`, nullable, `ON DELETE SET NULL`.
* Publication dates: `wordpress_articles.published_at` (migration 019, set only on an immediate publish) and `wordpress_articles.scheduled_at` (migration 020, the target WP datetime for a scheduled post). `publish_status` (`draft | scheduled | published | failed`) tells you which one is meaningful. **These are real, since publishing genuinely calls the WordPress REST API** (`lib/wordpress/`), unlike Pinterest (below).

### 1.3 Pinterest

* **There is no Pinterest account/profile table.** Confirmed twice: (a) no
  migration ever creates one (grepped every `CREATE TABLE` across all 29
  migrations), and (b) `docs/DATABASE.md`'s own "Future Tables (Not MVP)"
  section explicitly lists **`pinterest_accounts`** with **"Do NOT create
  yet."** — see §1.3a, this is now a **resolved decision**, not an open one.
* Boards: **`boards`** (migration 007) — `id, project_id, user_id, name, created_at, updated_at`. `docs/DATABASE.md`: *"Real Pinterest board entities... `pins.board` remains a free-text field... `pins.board_id` links to the real entity when one is matched or created."* **A board is an OmniFlow-internal organizational entity — it is never synced with, or verified against, a real Pinterest board via any API.** There is no Pinterest OAuth anywhere in this codebase (confirmed against RULES.md Rule #25 / PROJECT.md "Out of Scope").
* Board → project: direct FK (`boards.project_id`), one-to-many, `UNIQUE(project_id, name)`.
* Board → profile/account: **does not exist as a separate entity** — a board only ever points at a project. Per §1.3a, the founder has decided the board itself now stands in for the account/subniche concept during the current experiment, rather than adding a new table.
* Generated pins: **`pins`** (migration 001, `+board_id` migration 007, `+visual_format`/banner columns migrations 018/025) — `id, generation_id, language, title, description, keywords, board (text), board_id (nullable FK), image_prompt, image_analysis, media_url, link_url, publish_date, visual_format, overlay_text, title_banner_template, cta_banner_template, created_at, updated_at`. `generation_id → generations.id → project_id`.
* Planned pins: **`pins.publish_date`** (`timestamptz`, nullable) — set by the "Auto-Schedule" feature (`app/api/pinterest/schedule/route.ts`, `lib/validations/schedule.ts`) purely to populate the CSV export's "Publish date" column (PROJECT.md, "CSV Export"). **This is never sent to Pinterest** — there is no Pinterest API call anywhere that publishes or schedules anything. It is an OmniFlow-internal *planning* date the user picks before exporting a CSV for Pinterest's own Bulk Upload tool. Per the founder's own framing, this is referred to as **planning**, not "scheduling" or "publishing," from here on in this document.
* Given that, here is exactly what can and cannot be answered from Supabase (terminology aligned to §1.3a/"Planning Pinterest"):

  | Question | Available in Supabase? | How |
  | --- | --- | --- |
  | Planned pins (count) | **Yes** | `count(*) from pins where board_id = ? and publish_date is not null` (or scoped by project/content stream via the boards a stream is linked to) |
  | Next planned date | **Yes** | `min(publish_date) where publish_date >= now()` |
  | Last planned date | **Yes** | `max(publish_date)` |
  | Planned coverage (days) | **Yes** (approximation) | `count(distinct date_trunc('day', publish_date))`, or `(max(publish_date) - min(publish_date))` in days — describes **OmniFlow's own planning intent**, not confirmed Pinterest publication |
  | Missing pins | **Yes** (derived) | `required_buffer = target_pins_per_day × target_buffer_days`; `missing_pins = max(0, required_buffer − planned_pins)` — resolved 2026-09-16 (§11 §1), only meaningful once a content stream's targets are set (§5.1) |
  | Board activity (real engagement, real publish confirmation, follower/impression data) | **No** | Would require the real Pinterest API + OAuth, neither of which exists or is in scope (RULES.md Rule #25) |

  **This distinction must stay visible in any future UI**: "42 pins planned, next on March 3" is an honest OmniFlow-internal planning statistic; it must never be phrased as "42 pins live on Pinterest" or "42 pins scheduled on Pinterest," since OmniFlow cannot know or control that.

### 1.3a Founder decision — Pinterest account strategy (2026-09-16)

**Decision: no `pinterest_accounts` table.** The strategy currently being
tested is **1 Pinterest account = 1 subniche = 1 main board**. For the
duration of this experiment, the existing `boards` table serves as the
operational entity representing the account/subniche inside the Command
Center — `board_id` is the technical field used everywhere an "account"
concept is needed. This may be revisited later if several boards ever need
to belong to the same account, at which point a real `pinterest_accounts`
table (or a board→account grouping) would become necessary — not before.

Consequences applied throughout this document (§4, §5, §6, §8, §10):

* `boards` stays exactly as it is — not extended, not wrapped, not duplicated into a new table.
* `pinterest_accounts` is **not** proposed anywhere in this design anymore.
* `pinterest_account_id` is removed from every proposed model (`content_streams`, `tasks`) — replaced by the already-existing `board_id`.
* Account warming and Pinterest account analysis tasks are associated directly with `board_id`.
* Publication/planning goals are associated with the pair (`content_stream_id`, `board_id`), not a separate account entity.
* In the UI, the user-facing label may still say "Pinterest account" (e.g. "Warm Crochet Sweater account") — but the technical field behind that label stays `board_id` for the duration of this experiment. This is a presentation-layer choice only; no new column or table backs the word "account."

### 1.4 Dashboard builders (existing precedent)

The only "dashboard builder" pattern that exists today is the one built for
the Command Center itself: `lib/dashboard/build-command-center.ts`
(`buildCommandCenterKpis()`, `resolveActiveProjects()`) and
`lib/dashboard/command-center-mock.ts`. Both are **pure functions merging
mock data with real Supabase-derived numbers**, called from
`app/(dashboard)/dashboard/page.tsx` and consumed by presentational
components in `components/dashboard/`. Phase 2's real implementation should
extend this exact pattern (new `lib/dashboard/build-*.ts` pure functions),
not invent a new one.

---

## 2. Reusable data

* `projects` (id, name, niche, description) — the anchor for everything.
* `wordpress_categories` (id, project_id, name) — reusable as-is for Content
  Streams' optional WordPress category link.
* `boards` (id, project_id, name) — reusable as-is for Content Streams'
  Pinterest board link(s).
* `wordpress_sites` — tells whether a project *can* publish, relevant to any
  "publish this article" task/recommendation.
* `generations` / `pins` / `wordpress_generations` / `wordpress_articles` —
  the actual output history; counts and dates from these tables are what
  "coverage" and "Next Best Action" calculations should read, never
  duplicate.
* `pins.publish_date` — the only scheduling signal that exists; reusable
  exactly as documented in §1.3.
* The existing filter patterns already used by `/history`, `/boards`, and
  `/wordpress/history` (`project_id`, `board_id` via `pins`, `category_id`,
  `language`, `status`) are the same filters any new Content
  Stream/coverage view would need — no new query shape has to be invented.
* `lib/dashboard/build-command-center.ts` / `command-center-mock.ts` — the
  merge pattern to extend, not replace.

## 3. Missing data

* No Pinterest account/profile table — **resolved as a deliberate non-goal**
  for the current experiment (§1.3a): `boards` plays that role via
  `board_id`, under the 1-account = 1-subniche = 1-board strategy.
* No goals/targets table anywhere — `target_pins_per_day`,
  `target_buffer_days`, `target_articles_per_week`, weekly revenue, etc. exist
  nowhere in Supabase today; the Command Center's Monthly Revenue / Tasks
  Completed / Digital Products KPIs are, and remain, 100% mock
  (`lib/dashboard/command-center-mock.ts`).
* No manual task/to-do table of any kind.
* No recurrence/routine concept of any kind.
* No "content stream"/topic-pillar concept between a project and its
  categories/boards — the closest analogue today is `projects.niche`, a
  single free-text label per project, not a multi-pillar structure.
* No cron/scheduled-job runtime — RULES.md Rule #15: *"Inngest esta previsto
  pero no implementado."* Anything recurring must be computed lazily on
  read, not pre-materialized by a background job (see §9).
* No way to know whether a Pinterest pin was actually published (§1.3).

## 4. Duplication risks

* **Content Streams must reference `wordpress_categories`/`boards` by id,
  never copy their name.** The brief's own constraint ("sans dupliquer
  Projects, Categories ou Boards") is the guardrail; the proposed model in
  §5 only stores foreign keys, never a second `name` column for the same
  concept.
* **Content Streams must not become a second "mini-project."** `project_id`
  stays required and single-valued — a stream lives strictly under one
  project, it is a subdivision, never a peer of `projects`.
* **Do not repeat the Phase 1.1 name-matching stopgap.** The Command
  Center's `resolveActiveProjects()` matches a *mocked* project name against
  a real `projects.name` string — a deliberate, temporary hack for a
  prototype with no real Active-Project data source yet (see
  `docs/tasks/TASK-COMMAND-CENTER-MVP.md`). The brief for this phase
  explicitly forbids using project names as permanent identifiers, and
  rightly so: once real Content Streams/Tasks exist, `CommandCenterSection`
  must be rewired to join on real `project_id`/`content_stream_id` values,
  and the name-matching function should be deleted, not extended.
* **No `pinterest_accounts` table, and no duplicate of `boards`.** Per the
  founder's decision (§1.3a), `boards` is not wrapped, copied, or extended
  into a new table to represent an "account" — `board_id` is reused as-is.
  No UI should imply a connected Pinterest account/OAuth exists (RULES.md
  Rule #25) — a "Pinterest account" label in the UI is presentation only and
  always resolves to a real `board_id` underneath.
* **A `wordpress_article` task is a plan, not a duplicate of
  `wordpress_generations`.** Completing such a task should eventually be
  able to *point at* the resulting generation/article, not re-store its
  title/content. **Resolved 2026-09-16 (§11 §4): no link column is added
  now.** No polymorphic `related_*_id` relation is introduced prematurely —
  a task only links to `project_id` / `content_stream_id` / `board_id` for
  the current phases; a real content link will be designed later if a
  concrete need appears.

---

## 5. Proposed model

**Update (2026-09-16): §5.1 `content_streams` and §5.2
`content_stream_boards` are now implemented** — see §14 for the exact
migration, types, and query functions. §5.3 `tasks` and §5.4
`task_occurrences` remain **proposals only** — not created, not migrated,
not referenced by any component.

### 5.1 `content_streams`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `project_id` | `uuid` NOT NULL FK → `projects.id` ON DELETE CASCADE | required, single — a stream cannot exist without exactly one project |
| `user_id` | `uuid` NOT NULL FK → `profiles.id` ON DELETE CASCADE | denormalized for RLS, same convention as `wordpress_sites`/`wordpress_categories` |
| `name` | `text` NOT NULL | e.g. "Crochet Cats" — unique per project |
| `wordpress_category_id` | `uuid` NULL FK → `wordpress_categories.id` ON DELETE SET NULL | optional, references an existing category, never duplicates its name |
| `target_pins_per_day` | `integer` NULL | **resolved 2026-09-16 (§11 §1)** — replaces `target_pins_per_week`; combined with `target_buffer_days` below: `required_buffer = target_pins_per_day × target_buffer_days` |
| `target_articles_per_week` | `integer` NULL | |
| `target_buffer_days` | `integer` NULL | "buffer cible en jours" — used with `target_pins_per_day` to compute `missing_pins` (§1.3) |
| `status` | `text` NOT NULL DEFAULT `'active'`, `CHECK (status IN ('active','warming','paused','archived'))` | small, closed, stable set — CHECK is safe here (same reasoning as `wordpress_generations.source_type`) |
| `created_at` / `updated_at` | `timestamptz` | standard |

`pinterest_account_id` removed per the founder's decision (§1.3a) — no
`pinterest_accounts` table exists or is proposed. An "account" is
represented by the board(s) linked below, via `content_stream_boards`.

Indexes: `UNIQUE (project_id, name)`, `(project_id)`.

### Relation to boards, and current examples

A content stream is linked to exactly one `project_id`, an optional
`wordpress_category_id`, and one or more `boards` through
`content_stream_boards` (§5.2). **For the strategy currently being tested
(1 account = 1 subniche = 1 main board), the UI will primarily create and
show a single board per content stream** — the schema does not hard-limit
this to one, since the founder may want several boards under one account
later, but nothing in this phase's UI plan assumes more than one:

| Content stream | Board |
| --- | --- |
| Crochet Cats | Cat Crochet Pattern |
| Crochet Sweaters | Crochet Sweater Pattern Free |
| Bathroom | Badezimmer Ideen |
| Kitchen | Küchen Inspiration |

### 5.2 `content_stream_boards` (many-to-many: a stream can span several boards)

| Column | Type | Notes |
| --- | --- | --- |
| `content_stream_id` | `uuid` NOT NULL FK → `content_streams.id` ON DELETE CASCADE | |
| `board_id` | `uuid` NOT NULL FK → `boards.id` ON DELETE CASCADE | |
| `user_id` | `uuid` NOT NULL FK → `profiles.id` ON DELETE CASCADE | denormalized for RLS |
| `created_at` | `timestamptz` | |

`PRIMARY KEY (content_stream_id, board_id)` — no surrogate id needed.

### 5.3 `tasks`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `user_id` | `uuid` NOT NULL FK → `profiles.id` ON DELETE CASCADE | ownership, independent of who authored the content |
| `project_id` | `uuid` NULL FK → `projects.id` ON DELETE **SET NULL** | nullable per the brief; **SET NULL rather than CASCADE** — a task is a personal record, it should outlive the project it was about. **Resolved 2026-09-16 (§11 §2).** Recommendation for active content streams (documented only, not implemented): archive the stream *before* deleting its project, so `content_streams.status = 'archived'` — not a dangling row — is what a deleted project leaves behind |
| `content_stream_id` | `uuid` NULL FK → `content_streams.id` ON DELETE SET NULL | |
| `board_id` | `uuid` NULL FK → `boards.id` ON DELETE SET NULL | **also stands in for "Pinterest account" per §1.3a** — account warming (`account_warming`) and account analysis (`account_analysis`) tasks attach directly to this column, not to a separate account id |
| `title` | `text` NOT NULL | |
| `description` | `text` NULL | |
| `source` | `text` NOT NULL, `CHECK (source IN ('manual','automatic','recurring'))` | small, closed, stable — CHECK is safe |
| `type` | `text` NOT NULL | Zod-validated only, no CHECK — **11 initial values, resolved 2026-09-16 (§11 §7):** `content_creation`, `pinterest_publishing`, `wordpress_article`, `account_warming`, `keyword_research`, `account_analysis`, `digital_product`, `niche_research`, `maintenance`, `custom`, `weekly_review` — explicitly expected to grow (same reasoning as `WordPressArticleType`) |
| `due_date` | `date` NULL | the day it's due |
| `scheduled_at` | `timestamptz` NULL | the specific slot the user picked, distinct from `due_date` |
| `estimated_minutes` | `integer` NULL | |
| `priority` | `text` NOT NULL DEFAULT `'medium'` | Zod-validated (`low`\|`medium`\|`high`), no CHECK — likely to become a weighted/numeric value later |
| `status` | `text` NOT NULL DEFAULT `'pending'` | Zod-validated (`suggested`\|`pending`\|`scheduled`\|`completed`\|`skipped`\|`postponed`\|`cancelled`), no CHECK — **resolved 2026-09-16 (§11 §5)**, see the mapping against the founder's requested minimum list right after this table |
| `recurrence_rule` | `text` NULL | only meaningful when `source = 'recurring'`; a simple RRULE-like/cron-like string, not a new column type |
| `pinned_to_today` | `boolean` NOT NULL DEFAULT `false` | |
| `created_by_user` | `boolean` NOT NULL DEFAULT `true` | `false` marks a still-unaccepted `automatic` suggestion — provenance, not current state |
| `completed_at` | `timestamptz` NULL | |
| `skipped_at` | `timestamptz` NULL | |
| `created_at` / `updated_at` | `timestamptz` | standard |

`CHECK (NOT (pinned_to_today AND status = 'suggested'))` — the one DB-level
guardrail worth having: an unaccepted suggestion can never be pinned to
today (mirrors the brief's rule "une recommandation automatique doit être
acceptée avant de devenir une tâche confirmée"). This CHECK is also what
replaces `accepted_at` (§11 §3): "accepted" is read directly off
`status != 'suggested'`, no separate timestamp needed.

### `status` — mapping against the founder's requested minimum list

The founder's minimum list (`inbox, accepted, scheduled, in_progress,
completed, skipped, cancelled`) is functionally covered by the existing,
already-coherent 7-value nomenclature above, with two flagged differences:

| Founder's term | This doc's term | Note |
| --- | --- | --- |
| `inbox` | `suggested` (for `source='automatic'`) or `pending` (for `source='manual'`, which never passes through `suggested`) | naming only, same concept |
| `accepted` | `pending` | the transition `suggested → pending` **is** the acceptance signal (see the CHECK note above) — no separate `accepted` status needed |
| `scheduled` | `scheduled` | identical |
| `in_progress` | **not present** | flagged difference: no action in §8 (Accept/Edit/Schedule/Postpone/Skip/Complete/Make recurring/Pin to Today) starts or reads an "in progress" state; adding an unused status now would be guessing ahead of a real "start task" interaction. Deferred, not rejected — add it the day a concrete flow needs to distinguish "not started" from "started" |
| `completed` | `completed` | identical |
| `skipped` | `skipped` | identical |
| `cancelled` | `cancelled` | identical — see below for what it's for |
| **not requested** | `postponed` | flagged difference: kept because the brief explicitly requires a **Postpone** action (§8) whose effect must be visible in `status`, distinct from `pending`/`scheduled` |

**Resolved 2026-09-16 (§11 §5):** task deletion uses the existing soft
`cancelled` status. There is no hard `DELETE` path for a user-facing
"delete task" action by default — consistent with the rest of the app's
non-destructive pattern (§6).

Indexes: `(user_id)`, `(project_id)`, `(content_stream_id)`, `(status)`,
`(due_date)`, partial `(user_id) WHERE pinned_to_today` (fast "how many
pinned today" check).

### Example instance — a recurring "account warming" routine

```
title:              Warm Crochet Sweater account
type:                account_warming
source:              recurring
project_id:          → CrochetSal
content_stream_id:   → Crochet Sweaters
board_id:            → Crochet Sweater Pattern Free
recurrence_rule:     daily
estimated_minutes:   15
```

The user reads "Warm Crochet Sweater **account**" in the interface; the row
itself never stores an account id — `board_id` is the only technical link,
per §1.3a. This is the pattern every `account_warming`/`account_analysis`
task follows.

### 5.4 `task_occurrences` (only for `source = 'recurring'` tasks)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `task_id` | `uuid` NOT NULL FK → `tasks.id` ON DELETE CASCADE | the routine/template row |
| `user_id` | `uuid` NOT NULL FK → `profiles.id` ON DELETE CASCADE | denormalized for RLS |
| `occurrence_date` | `date` NOT NULL | which calendar day this instance is for |
| `status` | `text` NOT NULL DEFAULT `'pending'` | Zod-validated (`pending`\|`scheduled`\|`completed`\|`skipped`) |
| `scheduled_at` | `timestamptz` NULL | per-occurrence override |
| `pinned_to_today` | `boolean` NOT NULL DEFAULT `false` | |
| `completed_at` | `timestamptz` NULL | |
| `skipped_at` | `timestamptz` NULL | |
| `created_at` | `timestamptz` | |

`UNIQUE (task_id, occurrence_date)` — one row per routine per day, created
lazily (§9), never pre-generated in bulk.

### Why flat columns, not a `settings jsonb`

Same reasoning already on record for this project (`docs/DECISIONS.md`,
2026-09-13, Structure block): each of these tables has a manageable,
currently-known column count (~10–18), matching every one of the 29
migrations to date, none of which introduces JSONB. Consolidating into JSONB
now, before real usage patterns are known, would be guessing a structure
ahead of need — the same argument already used to defer TASK-027 and to keep
WordPress's Phase 1–4 settings flat. Revisit only if a genuinely
open-ended/nested shape appears later (e.g. per-day recurrence exceptions
more complex than a single `recurrence_rule` string).

---

## 6. Relations & constraints summary

```
projects (existing)
  └── content_streams (NEW, project_id required)
        ├── wordpress_category_id → wordpress_categories (existing, optional)
        └── content_stream_boards (NEW, join table) → boards (existing)
              (a board also plays the "Pinterest account" role — §1.3a, no pinterest_accounts table)

profiles (existing)
  └── tasks (NEW, project_id / content_stream_id / board_id all optional)
        └── task_occurrences (NEW, only when tasks.source = 'recurring')
```

* Every new table carries `user_id` and a `user_id = auth.uid()` RLS policy
  (see §7) — no new table breaks the "every user-owned record has user_id"
  principle in `docs/DATABASE.md`.
* No new table uses a hard delete as its primary lifecycle — `status`
  transitions (`cancelled`, `archived`, `skipped`) are preferred, consistent
  with the app's existing non-destructive pattern (soft "No board assigned"
  fallback on delete, category `ON DELETE SET NULL` rather than cascading
  article deletion, etc.). **Resolved 2026-09-16 (§11 §5):** a user-facing
  "Delete task" sets `status = 'cancelled'`; no hard `DELETE` by default.

## 7. RLS proposal

Every new table follows the exact "Standard RLS Policy" already documented
in `docs/DATABASE.md` §"Standard RLS Policy", using the **denormalized
`user_id`** style (`wordpress_sites`/`wordpress_categories`/`boards`), not
the subquery style (`wordpress_articles`) — every route that would create
one of these rows already has the parent project/task in hand, so
denormalizing costs nothing and keeps every policy a single indexed equality
check:

```sql
alter table content_streams enable row level security;
create policy "Users access own content streams"
  on content_streams for all using (user_id = auth.uid());

alter table content_stream_boards enable row level security;
create policy "Users access own content stream boards"
  on content_stream_boards for all using (user_id = auth.uid());

alter table tasks enable row level security;
create policy "Users access own tasks"
  on tasks for all using (user_id = auth.uid());

alter table task_occurrences enable row level security;
create policy "Users access own task occurrences"
  on task_occurrences for all using (user_id = auth.uid());
```

Ownership of a *referenced* row (`project_id`, `content_stream_id`,
`board_id`, `wordpress_category_id`) must still be verified server-side at
write time — the same pattern as every existing route (RULES.md Rule #6):
never trust a client-sent id, always check
`project.user_id === session user` before attaching it to a new task/stream.

## 8. States & transitions

### `tasks.status`

`suggested → pending → scheduled → completed`
`suggested → pending → skipped`
`pending/scheduled → postponed → pending` (due_date pushed forward)
`* → cancelled` (user-deleted without a hard DELETE — resolved, §11 §5)

### Action → transition mapping

| Action | Effect | Rule enforced |
| --- | --- | --- |
| **Accept** | `suggested → pending` | Only valid for `source = 'automatic'`; a `manual` task is already `pending` on creation and never passes through `suggested`. This transition alone is what "accepted" means (§11 §3 — no `accepted_at` column) — "une recommandation automatique doit être acceptée avant de devenir une tâche confirmée" |
| **Edit** | mutates `title`/`description`/`due_date`/etc. in place, any non-terminal status | User-initiated only. No system process may call this on a `manual` task — "une tâche manuelle ne doit jamais être modifiée ou supprimée automatiquement" |
| **Schedule** | sets `scheduled_at`, status → `scheduled` | Requires status to already be `pending` (i.e. accepted, if it was automatic) |
| **Postpone** | mutates `due_date` forward, status → `postponed` (then `pending` once past due_date arrives, or immediately, tbd — open detail, not a blocking decision) | Never silent — always a direct user action, never system-triggered |
| **Skip** | sets `skipped_at`, status → `skipped` | On a **recurring** task, this mutates the **`task_occurrences`** row only — the parent `tasks` row (the routine) is untouched, satisfying "Skip sur une routine ignore seulement l'occurrence concernée" |
| **Complete** | sets `completed_at`, status → `completed` | Same occurrence-only scoping for recurring tasks — "terminer une occurrence ne termine pas toute la routine" |
| **Make recurring** | creates a **new** `tasks` row with `source = 'recurring'` and a `recurrence_rule`, seeded from the original task's fields | Never mutates the original row's `source` retroactively — consistent with "ne jamais remplacer silencieusement" |
| **Pin to Today** | sets `pinned_to_today = true` (on `tasks` for manual/automatic, on `task_occurrences` for a recurring instance) | Blocked at the DB level from `status = 'suggested'` (§5.3 CHECK). The **max-3 rule and "never silently replace" are enforced in the application layer**, not the DB: before pinning a 4th item, the service must reject or ask the user to unpin one first — no automatic eviction of an existing pinned item |

## 9. Minimal recurrence handling

No cron/Inngest job is assumed (§3). `task_occurrences` rows are created
**lazily**: when a view needs "today's instance of routine X," the app
evaluates `tasks.recurrence_rule` against today's date; if a matching
`task_occurrences` row for `(task_id, today)` does not exist, it is treated
as an implicit `pending` occurrence for display purposes only — a real row
is written to `task_occurrences` the first time the user actually interacts
with it (Skip / Complete / Pin / Schedule that specific day). This keeps the
model correct with zero background infrastructure, and remains compatible
with a future pre-materializing job once Inngest exists without requiring a
data migration to adopt one later. **Resolved 2026-09-16 (§11 §6, deferred):**
Phases 2a and 2b carry no Inngest dependency at all; whether a background job
ever starts pre-materializing `task_occurrences` is explicitly deferred to
the design of **Phase 2c** itself (where `task_occurrences` is first
migrated), not decided now and not blocking anything before it.

## 10. Next Best Action — conceptual algorithm (not implemented)

A pure function, following the existing `lib/dashboard/build-*.ts`
convention — reads `tasks`, `task_occurrences`, and `content_streams`
(joined with their real coverage numbers per §1.3), returns a ranked list.
**It only ranks candidates — it never pins or schedules anything itself.**

```
score(candidate) =
    W_due      * urgency(due_date, now)            // closer/overdue due_date → higher
  + W_buffer   * bufferDeficit(content_stream)      // (target_buffer_days - actual_days_covered), floored at 0
  + W_weekly   * weeklyGoalGap(content_stream)       // (target_per_week - actual_this_week) / target_per_week
  + W_overdue  * overdueBonus(due_date, now)         // flat bonus once due_date has passed
  + W_warming  * warmingBonus(task.type, stream.status)  // account_warming tasks (keyed by board_id, §1.3a) score higher while their content stream's status = 'warming'
  + W_priority * priorityWeight(task.priority)       // low/medium/high → numeric weight
  - W_effort   * effortPenalty(estimated_minutes)    // very long tasks penalized slightly, to surface "quick wins" first
  + W_free     * scheduledPenaltyInverse(scheduled_at)  // tasks with no scheduled_at yet rank slightly higher (they need a decision; already-scheduled ones don't)

candidates = tasks/occurrences where status in ('pending','suggested') and pinned_to_today = false
recommendation = top N candidates by score(), N small (e.g. 3–5), surfaced as suggestions

# never automatic:
# - "suggested" automatic tasks still require Accept before they count as anything but a suggestion
# - the highest-scored candidates are *offered* as "Pin to Today?" — the user (or an explicit
#   confirmation click) performs the actual pin; the algorithm never writes pinned_to_today itself
```

`W_*` weights are tunable constants, not user-facing initially. Every input
listed in the brief (échéance, buffer restant, objectif hebdomadaire, retard,
statut warming, priorité utilisateur, durée estimée, disponibilité
planifiée) has a corresponding term above; none require data that doesn't
exist per §1–§3.

---

## 11. Decisions requiring founder validation before implementation

### Resolved (2026-09-16)

* ~~`pinterest_accounts` table: create a placeholder now, or leave
  `pinterest_account_id` unused?~~ **Resolved — no `pinterest_accounts`
  table, ever, for this experiment.** `boards`/`board_id` plays that role
  instead (§1.3a). `pinterest_account_id` has been removed from every
  proposed table.

### Resolved (2026-09-16, second round — all eight remaining decisions closed)

1. **Unit for the pin frequency target.** ~~`target_pins_per_week`~~ →
   **`target_pins_per_day` + `target_buffer_days`** (§5.1). Conceptual
   calculation: `required_buffer = target_pins_per_day × target_buffer_days`;
   `missing_pins = max(0, required_buffer − planned_pins)`. Pins are planned
   via `pins.publish_date` only (§1.3) — never presented as confirmation of
   actual Pinterest publication.
2. **`tasks.project_id` on project deletion.** Confirmed: `ON DELETE SET
   NULL` — a task survives its project's deletion and keeps its history,
   deliberately breaking from the cascade pattern used by content-bearing
   tables, because a task is a personal record, not project content.
   Documented (not implemented) recommendation: archive active content
   streams *before* deleting a project, so nothing is silently orphaned
   without a clear status.
3. **`tasks.accepted_at`.** Confirmed: **not added** in the first version
   of `tasks` (Phase 2b). "Accepted" is inferred purely from
   `status != 'suggested'` (see the CHECK note in §5.3) — manual tasks in
   Phase 2b never pass through `suggested` at all, so they don't need this
   distinction. Revisit only in **Phase 2e**, when `automatic` suggestions
   and the Next Best Action feed are actually implemented, if a real need
   for a separate acceptance timestamp appears then.
4. **Task ↔ generated-content link.** Confirmed: **no**
   `related_article_id` / `related_generation_id` now. A task links only to
   `project_id` / `content_stream_id` / `board_id` for now; no polymorphic
   relation is introduced prematurely. Designed later only if a concrete
   need appears.
5. **Task deletion.** Confirmed: soft status only — `status = 'cancelled'`,
   no hard `DELETE` by default, preserving history. Minimum status set
   confirmed present (§5.3's `status` mapping table): `inbox`→`suggested`/
   `pending`, `accepted`→`pending`, `scheduled`, `in_progress` (deferred,
   not added — no action currently produces it), `completed`, `skipped`,
   `cancelled`, plus doc-specific `postponed` (kept for the required
   Postpone action, §8).
6. **Pre-materializing occurrences.** Confirmed: **deferred**, not decided
   now. Phases 2a/2b have zero Inngest dependency (RULES.md Rule #15); the
   lazy/on-demand model (§9) is what ships first, and whether a background
   job later pre-creates `task_occurrences` rows is a **Phase 2c** design
   question, to be settled when that migration is actually written.
7. **Weekly review type.** Confirmed: dedicated value added —
   `weekly_review` is now the 11th entry in `tasks.type` (§5.3), used by the
   Sunday routine (analyser comptes/boards, examiner les résultats, vérifier
   les buffers, préparer la semaine suivante).
8. **Board shared by more than one content stream.** Schema stays
   many-to-many (`content_stream_boards`, §5.2) for flexibility — confirmed,
   no schema change needed. **Application-layer rule for the current
   experiment** (not a DB constraint, not implemented now): the UI only
   allows a board to be linked to **one *active* content stream at a time**;
   a content stream may still hold several boards technically, but the UI
   only manages one per stream today (§5.1). If a board is ever genuinely
   shared later: (a) pins are never auto-split between the sharing streams,
   (b) planned coverage for that board is shown as **ambiguous** rather than
   attributed to either stream, (c) Next Best Action (§10) suspends
   automatic recommendations keyed on that board until resolved, and (d) an
   explicit pin → content-stream attribution mechanism is designed *before*
   turning shared-board scoring back on. None of this is built now — it's
   the documented fallback plan if the 1-board-per-account assumption ever
   breaks.

No decisions remain open. Implementation may proceed, starting at
**Phase 2a**, whenever the founder authorizes it.

---

## 12. Implementation phasing (small steps)

Order set by the founder (2026-09-16), confirmed compatible with everything
in §5–§10:

1. **Phase 2a** ✅ **Implemented (2026-09-16)** — Migration:
   `content_streams` + `content_stream_boards` only. RLS. No UI, no API
   route, no component change. See §14 for the full record.
1a. **Phase 2a.1** ✅ **Implemented (2026-09-16)** — Small management UI for
   `content_streams`, inside each project's own page (`/projects/[id]`):
   create/edit/archive, a WordPress category picker and a Pinterest board
   picker (both by real id, both scoped to the open project), the "one
   board per active stream" rule enforced both client-side (disabled
   option) and server-side (409 on write). `app/api/content-streams/*`
   routes added. Still no `tasks` table, no automatic recommendation, no
   Next Best Action, no Pinterest/WordPress logic change. See §14c for the
   full record. This absorbs the "content-stream CRUD UI" line that Phase
   2d (below) originally described — Phase 2d is now only about reading
   real planned-pins/coverage numbers, not about building the CRUD UI,
   which already exists as of this phase.
2. **Phase 2b** — Persistent manual tasks. Migration: `tasks` (without
   `accepted_at` — resolved §11 §3 — and without `task_occurrences`;
   `content_stream_id`/`board_id` present but not yet required by any UI).
   Minimal API routes (`create`, `list` by user, `update status`, using the
   finalized 11-value `type` list and the `status` mapping from §5.3).
   Rewire `components/dashboard/today-priorities.tsx` from local `useState`
   mock to real Supabase-backed `manual` tasks only — this is the smallest
   slice that turns one of the Phase 1.1 Hotfix's explicit "not saved yet"
   caveats into something real, with the least new surface area. Zero
   Inngest dependency (§11 §6).
3. **Phase 2c** — Routines + occurrences. Migration: `task_occurrences`.
   Lazy occurrence computation (§9) ships first; whether a future
   pre-materializing job is added is decided **during this phase**, not
   before (§11 §6, deferred). "Make recurring" action. This is where
   `account_warming`/`account_analysis` routines keyed on `board_id` (§1.3a)
   become real, including the "Warm Crochet Sweater account" example in
   §5.3, and `weekly_review` (§11 §7) becomes a real recurring task.
4. **Phase 2d** — Planned coverage. The content-stream CRUD UI already
   exists (Phase 2a.1) — this phase is now only about wiring
   `content_stream_id`/`board_id` into real reads: start showing real
   planned-pins / next-planned-date / last-planned-date / planned-coverage /
   missing-pins numbers (§1.3a "Planning Pinterest") instead of
   `MOCK_WEEKLY_PROGRESS`/parts of `MOCK_ACTIVE_PROJECTS`.
5. **Phase 2e** — Automatic recommendations. `automatic` source tasks + the
   Next Best Action scoring function (§10) as a read-only suggestion feed.
   Accept/Skip wiring.

No further phase is planned for a `pinterest_accounts` table — per §1.3a,
that door is closed for the duration of this experiment, not deferred to a
later phase.

Each phase above is independently small enough to validate before the next
begins, matching this project's stated "small, predictable, incremental"
philosophy (AGENT.md).

## 13. Exact files that would be touched later (none touched now)

**New (Phase 2a/2b/2c/2d/2e):**
* `supabase/migrations/030_add_content_streams.sql`
* `supabase/migrations/031_add_tasks.sql`
* `supabase/migrations/032_add_task_occurrences.sql`
* `types/content-streams.ts`
* `types/tasks.ts`
* `lib/queries/content-streams.ts`
* `lib/queries/tasks.ts`
* `lib/validations/content-streams.ts`
* `lib/validations/tasks.ts`
* `lib/dashboard/build-next-best-action.ts` (Phase 2e)
* `app/api/content-streams/route.ts` (+ `[id]/route.ts`)
* `app/api/tasks/route.ts` (+ `[id]/route.ts`, `[id]/accept`, `[id]/skip`, `[id]/complete`, `[id]/pin`)
* `components/dashboard/today-priorities.tsx` — rewritten from local mock state to real data (Phase 2b)
* `components/dashboard/command-center-section.tsx` / `project-progress-card.tsx` — rewired to real `content_streams`/`tasks` data, name-matching removed (Phase 2d)
* Possibly `app/(dashboard)/content-streams/` and/or `app/(dashboard)/tasks/` pages (exact routes not decided — out of scope for this discovery doc)

**Existing files that would need edits:**
* `lib/dashboard/build-command-center.ts` — extended or partially replaced as real data sources come online
* `lib/dashboard/command-center-mock.ts` — shrinks as each mock is replaced
* `types/dashboard.ts` — `ProjectProgress`/`WeeklyProgressStats` shapes evolve once backed by real data
* `docs/DATABASE.md` — new table sections, ER diagram update
* `docs/API.md` — new endpoint documentation
* `docs/UI_UX.md` — Command Center subsection updated as mocks are replaced
* `docs/TASKS.md`, `docs/CHANGELOG.md` — per phase, as already practiced

**Update (2026-09-16):** `supabase/migrations/030_add_content_streams.sql`,
`types/content-streams.ts`, `lib/validations/content-streams.ts`, and
`lib/queries/content-streams.ts` are now created — see §14. Every other file
above (`tasks`-related files, components, `docs/API.md`) remains untouched;
this was, and for those files still is, a discovery task only.

**Update (2026-09-16, Phase 2a.1):** `app/api/content-streams/route.ts` (+
`[id]/route.ts`, `[id]/archive/route.ts`) are now created too — see §14c for
the exact routes (they differ from the speculative `[id]/route.ts`-only
shape above: archiving got its own `[id]/archive` action route instead of
being folded into a generic `PATCH`, matching the `archiveContentStream()`
function's own separation). A management UI now exists under
`components/projects/` (`content-streams-section.tsx`,
`content-stream-card.tsx`, `content-stream-form-dialog.tsx`,
`archive-content-stream-dialog.tsx`) and is wired into
`app/(dashboard)/projects/[id]/page.tsx` — not the speculative
`app/(dashboard)/content-streams/` standalone page guessed above; the
brief's own explicit instruction was to integrate into the existing project
page rather than add new global navigation. `docs/UI_UX.md` is updated
(§14c); `docs/API.md` is intentionally **not** updated, matching this
phase's explicit documentation scope (§14c). Also note: the migration
numbered `031` in this speculative list assumed it would be `tasks` — the
real `031` (already shipped, see §14b) is an RLS hardening fix for
`content_streams`/`content_stream_boards`, unrelated to `tasks`. A future
`tasks` migration will need to start at `032` or later.

## 14. Phase 2a implementation record (2026-09-16)

**Scope actually implemented:** `content_streams` + `content_stream_boards`
only, exactly as scoped — no `tasks`, no `task_occurrences`, no
`pinterest_accounts`, no API route, no UI, no recommendation engine, no
Pinterest/WordPress logic change, no OAuth, no credential storage.

**Method note:** Graphify was checked again for this implementation step and
remains unavailable in this environment (same finding as §0) — classical
inspection of `supabase/migrations/*.sql`, `types/database.ts`,
`lib/queries/boards.ts`, `lib/queries/wordpress-categories.ts`,
`lib/validations/board.ts`, and `app/api/boards/route.ts` was used instead,
to match this phase's tables/RLS/query/validation style exactly to existing,
working precedent rather than inventing a new one.

### Files created

* `supabase/migrations/030_add_content_streams.sql` — both tables, indexes,
  RLS, grants, `updated_at` trigger on `content_streams`.
* `types/content-streams.ts` — `ContentStream`, `ContentStreamInsert`,
  `ContentStreamStatus`, `ContentStreamBoard`, `ContentStreamBoardInsert`.
* `lib/validations/content-streams.ts` — Zod schemas for create/update/link,
  including the non-negative-integer check for the three target columns.
* `lib/queries/content-streams.ts` — `listContentStreams`,
  `getContentStreamBoards`, `createContentStream`, `updateContentStream`,
  `archiveContentStream`, `linkBoardToContentStream`,
  `unlinkBoardFromContentStream`, plus the pure ownership helpers
  `isOwnedProject`/`isCategoryInProject`/`isBoardInProject`.
* `tests/renderer/content-streams.spec.ts` — 20 offline tests (Zod +
  ownership-helper contracts).

### Schema decisions made while implementing

* **Numeric CHECK constraints** (`target_pins_per_day`,
  `target_articles_per_week`, `target_buffer_days` each `>= 0` or `NULL`):
  no prior migration in this repository had a numeric `CHECK`, so this is
  the first one — added because the brief explicitly required rejecting
  negative values, and a DB-level guard is the correct place for a simple,
  permanent numeric invariant (the same reasoning already used for
  `wordpress_generations.source_type`'s CHECK, just applied to a range
  instead of an enum).
* **"One board per active stream" stayed an application-layer rule, not a
  DB constraint** — confirmed safe per the task's own fallback instruction:
  a partial unique index can't reference `content_streams.status` from
  `content_stream_boards`, and a trigger would be new machinery beyond what
  Phase 2a asked for. This matches the decision already recorded at §11 §8.
  The schema keeps a plain N:N relation; the rule is documented in
  `docs/DATABASE.md` for the future UI to enforce.
* **RLS policy shape**: one `FOR ALL` policy per table
  (`user_id = auth.uid()`), matching `boards`/`wordpress_categories`
  exactly, rather than four separate `SELECT`/`INSERT`/`UPDATE`/`DELETE`
  policies — Postgres reuses `USING` as the implicit `WITH CHECK` for a
  `FOR ALL` policy with none specified, so one policy already covers all
  four operations identically to the existing, working tables. Introducing
  four separate policies would have been a deviation from repository
  convention with no behavioral difference.
* **Cross-user/cross-project ownership** is enforced in
  `lib/queries/content-streams.ts` (no API route exists yet in this phase
  to do it) by re-fetching the referenced `project`/`wordpress_category`/
  `board` row and comparing `user_id` and `project_id` before every insert —
  the same shape check already used by `app/api/boards/route.ts`
  (`project.user_id !== user.id`), pulled into three small, independently
  unit-tested pure functions (`isOwnedProject`, `isCategoryInProject`,
  `isBoardInProject`).

### Tests executed and results

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | **Pass** — no errors |
| `npx eslint` (new/changed files) | **Pass** — no errors |
| `npx playwright test --project=renderer` (offline, 106 tests incl. 20 new) | **106/106 pass** |
| `npx playwright test` (full suite: renderer + browser) | **106 passed, 36 skipped** (skipped = pre-existing auth-gated browser tests, unrelated to this change and unaffected by it) |
| `npx next build` (production build) | **Pass** — no new route added, route list unchanged |

The 20 new offline tests cover: valid minimal/full input, rejection of a
negative value for each of the three target columns, rejection of a
non-integer target, rejection of an invalid `status`, acceptance of each of
the four allowed statuses, rejection of an empty name, rejection of a
malformed `projectId`, and every combination of the three ownership helpers
(own vs. other user's project/category/board, category/board from a
different project than requested, missing/null referenced row).

### Explicit limitation — what could NOT be executed

**No local Supabase/Postgres instance is available in this environment**
(`supabase` CLI and `docker` are both absent — confirmed by direct check,
not assumed). This means the following, requested in the brief, could
**not** be run against a real database and remain **statically reviewed
only** (the SQL was written to mirror `boards`/`wordpress_categories`,
migrations already proven correct in production, but the specific
assertions below were not executed here):

* RLS isolation (`user_id = auth.uid()` actually blocking another user's row).
* The `(project_id, name)` unique index actually rejecting a duplicate insert.
* The three numeric `CHECK` constraints and the `status` CHECK actually
  rejecting invalid values at the database level.
* `ON DELETE CASCADE` behavior on both FKs of `content_stream_boards`, and
  `ON DELETE SET NULL` on `content_streams.wordpress_category_id`.
* The composite primary key on `content_stream_boards` actually rejecting a
  duplicate `(content_stream_id, board_id)` row.

What *was* verified instead: the migration SQL was written line-for-line
against the exact pattern of migrations 007 (`boards`) and 016
(`wordpress_categories`), which carry the equivalent constraints
(`UNIQUE (project_id, name)`, `ON DELETE CASCADE`/`SET NULL`, single `FOR
ALL` RLS policy) and are already running correctly in production — this is
the same fallback already used and disclosed in §0 for the discovery phase,
applied here to migration-writing instead of architecture research. A
manual review pass re-read the finished SQL file end to end and confirms it
matches that pattern with no typos in column/table/constraint names.

### Confirmation

No UI, no `tasks`/`task_occurrences` table, no `pinterest_accounts` table,
no recommendation engine, and no Pinterest/WordPress business logic were
touched. No mock data in `lib/dashboard/command-center-mock.ts` was
modified, and the Command Center dashboard is not yet reconnected to this
table (that remains Phase 2d, §12). No seed data was inserted by the
migration. No commit, no push.

## 14a. Security hardening (2026-09-16) — RLS `WITH CHECK` added before first apply

**Migration 030 was edited directly, not superseded by a 031, at the time
this section was written.** The assumption below — that 030 "had not been
applied to any shared/deployed environment" — was correct given every
signal available at the time (no Supabase CLI or Docker in this
environment, no shared apply performed by this agent). **It turned out to
be wrong about the live database's actual state: see §14b, which
supersedes this paragraph and explains why the correction had to become a
new migration, 031, instead of a further edit to 030.**

### 1. Cause of the risk

The original policies (`FOR ALL USING (user_id = auth.uid())`, no
`WITH CHECK`) only protected **row visibility and self-ownership of the row
being written** — they never verified that a *referenced* row
(`project_id`, `wordpress_category_id`, `board_id`, `content_stream_id`)
actually belongs to the same caller, or to the same project. Since Postgres
defaults an INSERT/UPDATE's `WITH CHECK` to the same expression as `USING`
when none is given, a request setting `user_id = auth.uid()` (trivially true
for the caller) but `project_id` = **someone else's** project would have
been silently accepted by the database. The only thing standing between a
direct Supabase client call and that outcome was the TypeScript ownership
checks in `lib/queries/content-streams.ts` (`isOwnedProject` /
`isCategoryInProject` / `isBoardInProject`) — application code, not a
database guarantee, and therefore bypassable by any client holding a valid
`authenticated` session token (e.g. a raw `fetch` to the PostgREST endpoint,
or the Supabase JS client used directly without going through
`lib/queries/`).

### 2. Policies before / after

**`content_streams` — before:**

```sql
CREATE POLICY "Users access own content streams"
  ON content_streams FOR ALL
  USING (user_id = auth.uid());
```

**`content_streams` — after:**

```sql
CREATE POLICY "Users access own content streams"
  ON content_streams FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
    AND (
      wordpress_category_id IS NULL
      OR EXISTS (
        SELECT 1 FROM wordpress_categories wc
        WHERE wc.id = wordpress_category_id
          AND wc.user_id = auth.uid()
          AND wc.project_id = content_streams.project_id
      )
    )
  );
```

**`content_stream_boards` — before:**

```sql
CREATE POLICY "Users access own content stream boards"
  ON content_stream_boards FOR ALL
  USING (user_id = auth.uid());
```

**`content_stream_boards` — after:**

```sql
CREATE POLICY "Users access own content stream boards"
  ON content_stream_boards FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM content_streams cs
      WHERE cs.id = content_stream_id AND cs.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM boards b
      JOIN content_streams cs ON cs.project_id = b.project_id
      WHERE b.id = board_id AND cs.id = content_stream_id AND b.user_id = auth.uid()
    )
  );
```

`USING` is unchanged on both tables — existing-row visibility for
SELECT/UPDATE/DELETE stays exactly `user_id = auth.uid()`, matching every
other table in this schema. Only `WITH CHECK` (INSERT, and the new-row check
on UPDATE) is stricter.

### 3. Guarantees added at the database level

* A `content_streams` row can only be inserted/updated if its `project_id`
  resolves to a `projects` row owned by the same `auth.uid()`.
* If `wordpress_category_id` is set, it must resolve to a
  `wordpress_categories` row owned by the same `auth.uid()` **and** whose
  own `project_id` equals the content stream's `project_id` — a category
  from a different project of the *same* user is rejected too, not just a
  different user's category.
* A `content_stream_boards` row can only be inserted/updated if its
  `content_stream_id` resolves to a `content_streams` row owned by the same
  `auth.uid()`.
* Its `board_id` must resolve to a `boards` row owned by the same
  `auth.uid()` **and** whose `project_id` equals the target content
  stream's `project_id`.
* Transitively, `content_stream_boards.user_id`, the linked stream's
  `user_id`, and the linked board's `user_id` are all forced to the same
  `auth.uid()` value — an inconsistent link `user_id` is unreachable, not
  merely checked.
* None of this depends on `lib/queries/content-streams.ts` being called at
  all — a raw PostgREST/Supabase-JS call from any client holding a valid
  session is bound by the same `WITH CHECK`.

**No `SECURITY DEFINER` function was introduced.** Direct `EXISTS` clauses
against `projects`, `wordpress_categories`, `boards`, and `content_streams`
are sufficient and were used instead, per the brief's own preference. This
is safe from recursion: `projects`, `wordpress_categories`, and `boards`
RLS policies never reference `content_streams`/`content_stream_boards`, so
evaluating those tables' own `user_id = auth.uid()` policies inside these
`EXISTS` subqueries only re-applies the same predicate already written
explicitly — it does not loop back. No function, `SECURITY DEFINER` or
otherwise, was needed to avoid recursion or to encapsulate anything; a
function would have added indirection and its own `search_path`/exposure
surface to reason about for no behavioral benefit over inline `EXISTS`.

### 4. Tests executed

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Pass |
| `npx eslint` (changed files) | Pass |
| `npx playwright test --project=renderer` | **112/112 pass** (106 previous + 6 new scenario tests) |
| `npx playwright test` (full suite) | 112 passed, 36 skipped (pre-existing, auth-gated, unrelated) |
| `npx next build` | Pass, no new route |
| Manual SQL review (balanced parentheses, alias/column-ambiguity check, cross-checked against migrations 007/016/001 syntax) | Pass — no tool-based SQL parser available or added (no new dependency) |

The 6 new tests in `tests/renderer/content-streams.spec.ts` (describe block
`RLS-mirrored scenarios`) map directly onto scenarios 1–5 and 7 from the
brief, reusing the same `isOwnedProject`/`isCategoryInProject`/
`isBoardInProject` pure functions already covering this ground from Phase
2a's original test pass — these prove the **application-layer** defense
rejects each case; they do not and cannot prove the **database** enforces
it (see next section).

### 5. Tests that need a real PostgreSQL instance

**Confirmed again: no `supabase` CLI and no `docker` binary exist in this
environment** — re-checked before this hardening pass, same finding as
§14. Nothing below was executed against a real database; all of it is new
database-level behavior that the TypeScript test suite structurally cannot
observe (RLS runs inside Postgres, not in application code).

**Exact SQL checklist to run against a real Supabase test project, after
`030_add_content_streams.sql` is applied there** (create two test users A
and B first, e.g. via Supabase Auth, and one project + one board + one
WordPress category per user; run each block as that user's authenticated
role, e.g. via `set local role authenticated; set local "request.jwt.claims" = '{"sub":"<user-a-uuid>"}';` or the equivalent `supabase test db` / PostgREST session helper):

```sql
-- 1. user A + project owned by user B → must be rejected
insert into content_streams (project_id, user_id, name)
values ('<user-B-project-id>', '<user-A-id>', 'Should fail 1');
-- expect: new row violates row-level security policy

-- 2. user A + category owned by user B → must be rejected
insert into content_streams (project_id, user_id, name, wordpress_category_id)
values ('<user-A-project-id>', '<user-A-id>', 'Should fail 2', '<user-B-category-id>');
-- expect: new row violates row-level security policy

-- 3. category owned by user A but under a different project of A → must be rejected
insert into content_streams (project_id, user_id, name, wordpress_category_id)
values ('<user-A-project-1-id>', '<user-A-id>', 'Should fail 3', '<user-A-project-2-category-id>');
-- expect: new row violates row-level security policy

-- 4. user A + board owned by user B, linked to A's own stream → must be rejected
insert into content_stream_boards (content_stream_id, board_id, user_id)
values ('<user-A-stream-id>', '<user-B-board-id>', '<user-A-id>');
-- expect: new row violates row-level security policy

-- 5. board owned by user A but under a different project than the stream → must be rejected
insert into content_stream_boards (content_stream_id, board_id, user_id)
values ('<user-A-stream-in-project-1>', '<user-A-board-in-project-2>', '<user-A-id>');
-- expect: new row violates row-level security policy

-- 6. link row with an inconsistent user_id (impossible via lib/queries, only via direct SQL/client) → must be rejected
insert into content_stream_boards (content_stream_id, board_id, user_id)
values ('<user-A-stream-id>', '<user-A-board-id>', '<user-B-id>');
-- expect: new row violates row-level security policy (fails the top-level user_id = auth.uid() check for user A's session; also fails as user B's session on the EXISTS checks)

-- 7. fully valid combination → must succeed
insert into content_streams (project_id, user_id, name, wordpress_category_id)
values ('<user-A-project-id>', '<user-A-id>', 'Should succeed', '<user-A-same-project-category-id>')
returning id;
-- then, using the returned id:
insert into content_stream_boards (content_stream_id, board_id, user_id)
values ('<returned-id>', '<user-A-same-project-board-id>', '<user-A-id>');
-- expect: both inserts succeed

-- Also re-verify pre-existing guarantees still hold after this change:
-- 8. UPDATE re-pointing project_id to another user's project → must be rejected
update content_streams set project_id = '<user-B-project-id>' where id = '<returned-id>';
-- expect: new row violates row-level security policy

-- 9. duplicate name in the same project → must still be rejected by the unique index (unaffected by this change)
insert into content_streams (project_id, user_id, name)
values ('<user-A-project-id>', '<user-A-id>', 'Should succeed');
-- expect: duplicate key value violates unique constraint "content_streams_project_name_unique"
```

This checklist is the authoritative pending validation for Phase 2a's
security posture — until it is run and every "expect" above is confirmed,
the RLS guarantees in this section are **designed and reviewed, not proven
against a real database.**

### 6. TypeScript validations — confirmed still present, reframed as defense-in-depth

`isOwnedProject`, `isCategoryInProject`, and `isBoardInProject` in
`lib/queries/content-streams.ts` are **unchanged** — still called before
every insert/update in `createContentStream`, `updateContentStream`, and
`linkBoardToContentStream`, still throwing a typed
`ContentStreamOwnershipError`. Their role is now explicitly documented (in
that file's own doc comment and here) as **defense-in-depth and error-message
quality** — they let the app return a clear 4xx-shaped error before ever
reaching Postgres, and they still work standalone. They are **not** the
security boundary: `030_add_content_streams.sql`'s `WITH CHECK` clauses are,
per this hardening pass, and would independently reject the same cases even
if `lib/queries/content-streams.ts` were bypassed entirely.

### 7. Scope confirmation

No UI, no `tasks`/`task_occurrences` table, no Pinterest/WordPress
functional change, no new dependency, no `.claude/`/`.opencode/`/`AGENTS.md`
edit, no commit, no push. Only `supabase/migrations/030_add_content_streams.sql`
(edited in place), `tests/renderer/content-streams.spec.ts` (6 tests added),
and documentation (`docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md`,
`docs/DATABASE.md`, `docs/CHANGELOG.md`) were touched for this hardening
pass.

## 14b. Migration 031 — correcting the live database (2026-09-16)

**Discovery, reported by the founder, that supersedes §14a's assumption:**
`content_streams` and `content_stream_boards` already existed on the linked
Supabase project — `030_add_content_streams.sql` had, at some point, already
been applied there **manually, via the SQL Editor**, and specifically the
**pre-hardening version**: the live policies on both tables currently have
`with_check = null` (`USING`-only), not the hardened `WITH CHECK` clauses
that §14a added to the local copy of 030 before this was known.

**Confirmed root cause:** `supabase_migrations.schema_migrations` — the
table the Supabase CLI/tracked-migration mechanism uses to record which
migration files have been applied — **does not exist** on this project.
This means no migration, including 030 itself, has ever gone through the
tracked mechanism (`supabase db push` / `supabase migration up`); every
migration in this repository's history has so far only ever been run by
hand, one `.sql` file's contents pasted into the SQL Editor at a time. This
also explains why an earlier attempt to answer "is 030 registered as an
applied migration" from this agent's environment (§14's own tooling
limitations, and the follow-up push-preparation task) could get no further
than confirming the *table* exists via a PostgREST permission-denied probe
— that check cannot and did not reveal the *policy* text, which is where
the actual gap turned out to be.

**Why this becomes a new migration, 031, instead of a further edit to
030:** §14a's edit-030-in-place approach was correct only as long as 030
had never reached a live database. Now that it demonstrably has — with a
different (weaker) policy body than what's currently written in the local
file — 030 must be treated as already shipped and immutable from this
point forward, per this project's own migration-immutability convention.
The correction is `supabase/migrations/031_harden_content_streams_rls.sql`:
`DROP POLICY IF EXISTS` + `CREATE POLICY` (same names, same `USING`, adding
back the exact `WITH CHECK` text) for both tables — additive, does not
recreate either table, safe to run on the current live database (today's
`with_check = null` state) and equally safe on any future environment where
030 is applied fresh with the hardened text already in it (031 would just
drop and recreate an identical policy — a no-op in effect).

**Not done by this agent:** 031 was not executed against the live database
by this agent in the session that wrote it — no `supabase` CLI project
link, no `SUPABASE_ACCESS_TOKEN`, and no direct Postgres credential exist in
this environment (§14a/§14's own findings, unchanged). The exact SQL was
provided verbatim for a manual SQL Editor paste. **Update (2026-09-16,
confirmed by the founder): 031 has since been executed manually, and both
tables' live policies now carry the hardened `WITH CHECK` text.** The live
database and the local migration files are consistent as of this
confirmation — the ambiguity this section originally raised is resolved.

## 14c. Phase 2a.1 implementation record (2026-09-16) — Content Streams management UI

**Scope actually implemented:** a small CRUD UI for `content_streams`
inside each project's own page. No new migration, no `tasks` table, no
automatic recommendation, no Next Best Action, no Pinterest/WordPress
logic change, no seed data.

### Location chosen

`app/(dashboard)/projects/[id]/page.tsx` (the existing project detail
page) — a new "Content Streams" card section, placed between the existing
"WordPress Connection" section and the Pinterest/WordPress usage-stats
grid. No new global navigation entry, no new top-level route: the brief
explicitly asked to integrate into the existing project page rather than
build a standalone `/content-streams` section, and the project page's
existing pattern (stacked `rounded-2xl border bg-card` sections, no tabs)
already fit a new section cleanly without needing tabs.

### Files created

* `app/api/content-streams/route.ts` — `POST` (create, plus optional board
  link in the same request).
* `app/api/content-streams/[id]/route.ts` — `PATCH` (name/category/status/
  targets, plus an optional board change).
* `app/api/content-streams/[id]/archive/route.ts` — `POST` (archive only,
  calls `archiveContentStream()` directly, mirroring that function's own
  separation from `updateContentStream()`).
* `components/projects/content-streams-section.tsx` — list, empty state,
  wires the two dialogs below.
* `components/projects/content-stream-card.tsx` — compact card (name,
  status badge, category, board, the three targets, Edit/Archive buttons).
* `components/projects/content-stream-form-dialog.tsx` — Create/Edit
  dialog (reused for both — `editing` prop present or absent).
* `components/projects/archive-content-stream-dialog.tsx` — light
  confirmation, mirrors `components/projects/delete-project-dialog.tsx`'s
  exact shape but calls the archive route (soft status change) instead of
  a hard `DELETE`.
* `tests/renderer/content-streams.spec.ts` — extended, +12 offline tests
  (`findBoardOccupant`, `parseOptionalNonNegativeInt`).
* `tests/playwright/content-streams.spec.ts` — new, gated browser tests
  (see "Tests" below for what they cover and what they explicitly don't).

### Files modified

* `app/(dashboard)/projects/[id]/page.tsx` — fetches `content_streams`,
  the project's `wordpress_categories` (existing `listWordPressCategories()`),
  the project's `boards` (plain inline query, matching the existing
  `/boards` page's own convention of not wrapping every list read in a
  query-file function), and every board's current occupant
  (`listBoardOccupants()`, new — see below); renders
  `<ContentStreamsSection>`.
* `lib/queries/content-streams.ts` — added `listBoardOccupants()` (async,
  DB) and `findBoardOccupant()` (pure, unit-tested) — the single shared
  decision both the create/edit selector (client: disables an option) and
  the API routes (server: rejects the write with `409 board_taken`) call,
  so there is exactly one definition of "already in use," not two that
  could drift apart.
* `lib/utils/status.ts` — added `contentStreamStatusToBadgeVariant()`,
  alongside the file's existing per-domain status→badge mappings.

### Create / Edit / Archive flow

* **Create**: `POST /api/content-streams` validates the core fields with
  the existing, unchanged `createContentStreamSchema`, separately validates
  an optional `boardId` (UUID shape, then availability), and — only if the
  board is free — calls `createContentStream()`. If a board was requested,
  `linkBoardToContentStream()` runs *after* the stream is created. If that
  link call fails, the response still reports `201` (the stream is real)
  but with `boardLinked: false` and a `boardWarning` message; the client
  shows `toast.warning(...)` instead of a plain success toast — the
  partial state is never presented as a full success, per the brief.
* **Edit**: `PATCH /api/content-streams/[id]` re-fetches the stream and
  checks `existingStream.user_id === user.id` before touching anything
  (matching `app/api/boards/[id]/route.ts`'s exact pattern). A board
  change is detected via `Object.prototype.hasOwnProperty.call(body,
  'boardId')` (so "board field not touched" and "board explicitly cleared
  to null" are distinguishable), validated for availability *before* any
  write, then applied by unlinking whatever the stream currently points at
  and linking the new one — never creating a second link, since the old
  one is removed first. No duplicate stream is ever created; this is
  always the same row being updated.
* **Archive**: a light `Dialog` confirmation
  (`archive-content-stream-dialog.tsx`) calling `POST
  /api/content-streams/[id]/archive`, which calls `archiveContentStream()`
  (itself `updateContentStream(..., { status: 'archived' })`) — never a
  physical `DELETE`. Archiving a stream also implicitly frees its board
  for reuse elsewhere, since `findBoardOccupant()` never treats an
  `archived` stream as an occupant (§11 §8's own resolution, reused as-is
  here, not reinterpreted).

### Board rule — validated where

* **Client (UX only)**: the board `Select` disables any option whose
  `occupant.streamId` differs from the stream currently being edited (or
  from nothing, in create mode) — `content-stream-form-dialog.tsx`, driven
  by the `boards` prop the page computes once per render from
  `listBoardOccupants()` + `findBoardOccupant()`.
* **Server (the actual boundary)**: both `POST /api/content-streams` and
  `PATCH /api/content-streams/[id]` re-run the exact same
  `listBoardOccupants()` + `findBoardOccupant()` pair immediately before
  writing anything, and reject with `409 board_taken` and a message naming
  the occupying stream if the board is taken — regardless of what the
  disabled-option UI did or didn't prevent client-side. A direct API call
  bypassing the form entirely is bound by this the same way.
* **Schema**: unchanged — `content_stream_boards` stays N:N (§5.2/§11 §8).
  This phase only adds application-layer enforcement of the "one active
  stream per board" experiment rule on top of that flexible schema, exactly
  as §11 §8 called for; no unique index or trigger was added.

### Security controls

* Every route re-verifies the session (`supabase.auth.getUser()`) and
  either re-fetches the target row's `user_id` directly (edit/archive,
  matching `app/api/boards/[id]/route.ts`) or delegates to
  `createContentStream()`/`updateContentStream()`, which already call
  `isOwnedProject()`/`isCategoryInProject()`/`isBoardInProject()`
  internally (§14, unchanged in this phase). The client-sent `projectId`
  on create is never trusted as-is — `createContentStream()` re-fetches
  that exact project row and checks `project.user_id === user.id` before
  using it for anything.
* No `service_role` key is used anywhere in this phase — every route uses
  the same cookie-scoped `createClient()` (`lib/supabase/server.ts`) every
  other authenticated route in this codebase uses, so RLS (§14a's
  `WITH CHECK`, confirmed live per §14b) applies to every query these
  routes make, in addition to the application-level checks above — RLS
  remains the final boundary, not a fallback that's assumed unreachable.

### Tests executed

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Pass |
| `npx eslint` (all new/changed files) | Pass (two issues found and fixed during development: a `react-hooks/set-state-in-effect` warning, resolved by switching the form's prefill from an effect to a `key`-forced remount + lazy `useState` initializers; one unescaped apostrophe) |
| `npx playwright test --project=renderer` | **129/129 pass** (117 previous + 12 new: `findBoardOccupant` × 7, `parseOptionalNonNegativeInt` × 5) |
| `npx playwright test` (full suite) | 129 passed, 52 skipped (new gated browser cases + all pre-existing auth-gated cases, correctly skipped, not bypassed) |
| `npx next build` | Pass — `/api/content-streams`, `/api/content-streams/[id]`, `/api/content-streams/[id]/archive` appear as new routes; `/projects/[id]` unchanged in the route list |

`tests/playwright/content-streams.spec.ts` (gated, needs
`PLAYWRIGHT_STORAGE_STATE` and a real project) covers: the empty state and
its "Add content stream" button, opening/closing the Create dialog without
creating anything, an empty name being rejected before any request is
sent, negative and decimal target values being rejected before submit, and
a full create → edit (rename + status change) → archive round trip.

**Explicitly not covered by the browser suite, and why:** "category from
another project rejected," "board from another project rejected," and
"board already used by an active stream rejected" all need known
cross-project fixtures (a second project with its own category/board) that
this suite has no way to seed — seeding is explicitly forbidden by this
phase's own constraints. These three are covered instead as offline
pure-function tests already in `tests/renderer/content-streams.spec.ts`
(`isCategoryInProject`, `isBoardInProject`, `findBoardOccupant`), which
are the exact functions the API routes call to enforce them, plus a direct
reading of `app/api/content-streams/route.ts` and `[id]/route.ts` to
confirm those functions are actually wired in before every write. This is
a signaled limitation, not a silently dropped test.

### Remaining limitations

* No live authenticated browser session in this environment — the gated
  Playwright cases above were written and reviewed, not executed.
* No computed "missing pins"/coverage number is shown anywhere in this UI
  — per the brief's own instruction not to surface calculated metrics that
  aren't reliable yet; that remains Phase 2d.
* The board picker only ever manages a single board per stream in the UI
  (matching the current 1-account-per-board experiment), even though
  `content_stream_boards` stays N:N in the schema — consistent with §5.1's
  own framing, not a new decision.

## 14d. Cross-reference: TASK-FIX-040 (WordPress Generator reorg, 2026-09-16)

**Not a Phase 2 sub-phase.** This document's own §12 numbering already
reserves "Phase 2b" for a different, unimplemented feature (persistent
manual `tasks`, see §12 item 2) — so the separate, smaller UX/UI pass on
`/wordpress/blog-post` done the same day was tracked under its own task
number, **TASK-FIX-040**, not as "Phase 2b." It is cross-referenced here,
briefly, only because it reads (never writes) `content_streams` for
display purposes.

**What it did:** reorganized `/wordpress/blog-post` (the existing WordPress
article generator form, unrelated to this document's own scope otherwise)
into 6 stacked blocks — Project Context, Article Source, Article Settings,
Advanced Options (collapsed by default), Generation Summary, then submit.
No field removed, no default value, validation rule, Zod schema, API
payload, AI prompt, rate limit, generation, saving, or publishing changed.

**The only touchpoint with this document's scope:** Project Context shows,
read-only, any `content_streams` row in the selected project whose
`wordpress_category_id` matches the selected WordPress category — reusing
Phase 2a's schema exactly as-is (`lib/queries/content-streams.ts` is not
even imported; a lighter dedicated lookup lives in
`lib/wordpress/project-context.ts` instead, since the generator only ever
needs a read, never the Phase 2a.1 CRUD/ownership machinery). This creates
**no new relation**: the underlying link is the same
`content_streams.wordpress_category_id` column Phase 2a already has. No
article ever gets associated with a Content Stream by this change — the
display is informational only, and disappears (an empty section, no
placeholder) when zero streams match.

**Full writeup:** `docs/TASKS.md` ("[TASK-FIX-040] WordPress Generator
Reorg") and `docs/CHANGELOG.md` ("TASK-FIX-040: WordPress Generator
(`/wordpress/blog-post`) reorg"). `docs/UI_UX.md`'s "WordPress Generator —
1-Click Blog Post" section was rewritten to describe the new block order.

**Addendum (same day) — visual finish:** the reorg above initially kept
the pre-existing single `bg-card` wrapper around the whole form, which the
founder reported (from screenshots) made every section blend into the
form and into each other. Fixed, still the same task, by giving each of
the 5 blocks its own real card (`ArticleFormSectionCard`, new
`components/wordpress/article-form-section-card.tsx`) with a numbered
step, a violet `bg-primary/10` icon, a title, and a description — no
touchpoint with this document's scope beyond the same Content Stream
badges still being rendered read-only inside Project Context, unchanged
in substance. See `docs/CHANGELOG.md`'s "Visual finish (same task)"
subsection under the TASK-FIX-040 entry for the full list of style-only
changes (no field, state, handler, schema, or API touched).

## 15. TASK-FIX-042 — Operational Command Center (Phases 2b, 2c-minimal, 2d, 2e read-only) — 2026-09-25

Founder brief: turn `/dashboard` into an operational Command Center (what to
work on today, which board is covered and until when, where the buffer is
short, when the Sunday analytics review is due) while keeping every existing
metric and action, and using real data only.

### Decisions taken with the founder before coding (2026-09-25)

1. **`tasks` did not exist** (Phases 2b/2c were design-only), but the brief
   required a Sunday routine that "never disappears until completed" and
   compatibility with manual tasks. Founder chose **"Add tasks migration"**
   over a localStorage-only fallback → migrations **033 `tasks`** (§5.3
   exactly) and **034 `task_occurrences`** (§5.4 exactly).
2. **Mock KPIs vs "no mock data"**: founder chose **"real where possible"**.
   Every card and weekly metric is kept; Tasks Completed, weekly Articles
   Published and weekly Pins Created became real; Monthly Revenue, Digital
   Products, Products Launched and Revenue render "—" / "Not tracked yet".
   `lib/dashboard/command-center-mock.ts` was deleted.

### Decisions taken while implementing (flagged, reversible)

* **"Active Projects" removed.** It was 100 % mock (CrochetSal / Home Decor
  DE, name-matched — the stopgap §4 said to delete once real data existed).
  The new Content streams table shows the same information from real data.
  `components/dashboard/project-progress-card.tsx` and
  `command-center-section.tsx` were deleted with it.
* **Sixth stream status `Needs setup`**, beside the five requested (On
  track, Needs content, Create now, Warming, Paused): a stream with no board
  or no pins/day / buffer targets cannot be judged, and labelling it with
  one of the five would be a fabricated verdict.
* **Coverage definitions** (all in `lib/dashboard/build-content-coverage.ts`):
  *planned* = pins on the stream's boards with `publish_date` on or after
  **today's local midnight** (so a pin planned at 07:00 still counts for
  today at 10:00); *covered through* = last day of the unbroken run of days,
  starting today, that each have ≥ 1 planned pin; *last planned date* is
  shown separately. `missing_pins = max(0, pins/day × buffer days −
  planned)` (§11 §1). Health: `missing = 0` → On track; otherwise ≤ 1 day
  covered → Create now, else Needs content. So a stream covered until
  October 5 is never urgent while its buffer is met.
* **Shared board** (§11 §8 b/c implemented): a board linked to two
  non-archived streams is flagged, its pins are never split, and only a
  "Review stream" recommendation is produced.
* **Sunday overdue anchor**: overdue only for a Sunday on/after the day the
  routine was started ("Start review" creates it) — a routine the user never
  set up cannot be "missed". Only the most recent past Sunday is checked.
* **Recommendations → tasks**: "Add to priorities" opens an editable title
  and creates `source = 'automatic'`, `status = 'pending'` (the click is the
  acceptance, §8 Accept) with `pinned_to_today = true`. No `suggested` row is
  ever written; nothing is auto-pinned (§10).
* **Max 3 open priorities** enforced server-side (409 `priorities_full`);
  "Replace" explicitly unpins the chosen one (kept as a pending task).
* **Timezone**: day keys use the runtime's local calendar
  (`lib/dashboard/local-date.ts`), the same convention
  `lib/validations/schedule.ts` uses to *write* `publish_date` and
  `lib/csv/pinterest.ts` uses to *read* it. `toISOString().slice(0, 10)` is
  never used for a day. No timezone constant was introduced.
* **`/pinterest` has no prefill parameters**, so "Create Pins" links to
  `/pinterest` as-is (generation logic untouched); "Schedule Pins" links to
  the board's page.

### Files

New: `supabase/migrations/033_add_tasks.sql`, `034_add_task_occurrences.sql`,
`types/tasks.ts`, `lib/validations/tasks.ts`, `lib/queries/tasks.ts`,
`lib/queries/command-center.ts`, `lib/dashboard/local-date.ts`,
`build-content-coverage.ts`, `build-recommendations.ts`,
`build-sunday-review.ts`, `app/api/tasks/route.ts` (GET/POST),
`app/api/tasks/[id]/route.ts` (PATCH), `app/api/tasks/weekly-review/route.ts`
(POST), `components/dashboard/{today-workspace, content-streams-overview,
publishing-coverage, recommended-actions, add-to-priorities-button,
sunday-review-card, week-view, stream-health-badge}.tsx`,
`tests/renderer/dashboard-coverage.spec.ts`, `tests/renderer/tasks.spec.ts`,
`tests/playwright/dashboard.spec.ts`.

Modified: `app/(dashboard)/dashboard/page.tsx`, `lib/dashboard/build-command-center.ts`,
`types/dashboard.ts`, `components/dashboard/{dashboard-header, kpi-card,
today-priorities, weekly-progress}.tsx`, `components/shared/metric-card/metric-card.tsx`
(`ProgressMetric.progress` optional), `tests/renderer/dashboard-command-center.spec.ts`,
`lib/guide/content.ts`, docs.

Deleted: `lib/dashboard/command-center-mock.ts`,
`components/dashboard/project-progress-card.tsx`,
`components/dashboard/command-center-section.tsx`.

Not touched: Pinterest generation, AI providers, CSV export, generation
routes, renderer, `pins`/`boards`/`content_streams` schema. No
`pinterest_accounts` table.

### Validation

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Pass |
| `npx eslint` (every touched file) | Pass |
| New/updated offline specs (dashboard-command-center, dashboard-coverage, tasks) | 55/55 pass; coverage specs also pass under `TZ=UTC` and `TZ=Europe/Paris` |
| Full `npx playwright test` | 276 passed, 84 skipped (auth-gated browser tests, incl. the new `tests/playwright/dashboard.spec.ts` desktop + mobile), 2 failed — both pre-existing and unrelated: `pinterest-text-importance-none` (CRLF in the untouched `pin-form.tsx` vs a `\n` literal), `pinterest-auto-template-selection` diversity (flaky, passes on re-run) |
| `npx next build` | Pass — `/api/tasks`, `/api/tasks/[id]`, `/api/tasks/weekly-review` added |
| `git diff --check` | Clean |

### Remaining limitations

* **Migrations 033 and 034 are not applied to the live database** (no
  Supabase CLI/Docker here, same as §14). Until they are pasted into the SQL
  Editor, the dashboard still renders (task reads return empty, a server log
  line says so) but adding a priority or completing the Sunday review
  returns `server_error`.
* RLS `WITH CHECK`, the CHECK constraints and the partial unique index were
  reviewed statically only (same limitation as §14).
* The desktop/mobile browser spec skips without `PLAYWRIGHT_STORAGE_STATE`.
* Sunday checklist ticks are not persisted (no column for them; a
  deliberate minimum).
* No period filter in the header (the brief marked it optional).
