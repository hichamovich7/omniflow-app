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
```

└── credit_transactions

└── subscriptions

---

# profiles

Extends Supabase auth.users.

## Columns

| Column          | Type        | Description              |
| --------------- | ----------- | ------------------------ |
| id              | uuid PK     | References auth.users.id |
| email           | text        | User email               |
| credits_balance | integer     | Available credits        |
| plan            | text        | free / starter / pro     |
| created_at      | timestamptz | Creation date            |
| updated_at      | timestamptz | Last update              |

## Purpose

Stores application-specific user data.

Examples:

* Credit balance
* Subscription plan
* Future Stripe metadata

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
| language            | text                  | en / de / es / fr                         |
| pins_requested      | integer               | 1, 5, 10, 20, 30                          |
| website_url         | text nullable         |                                           |
| pinterest_url       | text nullable         |                                           |
| reference_image_url | text nullable         | Supabase Storage URL                      |
| model_used          | text                  | OpenRouter model                          |
| credits_used        | integer               | Credits consumed                          |
| status              | text                  | pending / processing / completed / failed |
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
| board          | text                     | Suggested board            |
| image_prompt   | text                     | Prompt for FAL / Ideogram  |
| image_analysis | text nullable            | Vision analysis            |
| media_url      | text nullable            | Future generated image URL |
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
```

---

# credit_transactions

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

Reserved for future versions.

Purpose:

Store generated Pinterest images.

Examples:

```txt
generated-images/user-id/pin-001.png
```

---

## exports

Purpose:

Generated CSV files.

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
