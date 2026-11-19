# DEPLOYMENT.md

# Deployment Strategy

OmniFlow v1.0 está diseñado para desplegarse utilizando servicios gestionados de bajo coste y mínima complejidad operativa.

Objetivos:

* Coste mínimo
* Despliegue rápido
* Escalabilidad suficiente para MVP
* Sin infraestructura propia

---

# Production Stack

| Service        | Provider         |
| -------------- | ---------------- |
| Frontend       | Vercel           |
| Backend        | Vercel           |
| Database       | Supabase         |
| Authentication | Supabase Auth    |
| Storage        | Supabase Storage |
| AI Provider    | OpenRouter       |
| Payments       | Stripe           |
| Image Gen      | OpenAI           |
| Async Jobs     | Inngest (deferred) |

---

# Environments

## Local

Purpose:

Desarrollo local.

Environment:

```txt id="x2e48u"
.env.local
```

---

## Production

Purpose:

Aplicación pública.

Environment:

```txt id="4n58d4"
Vercel Environment Variables
```

---

# Required Environment Variables

## Application

```env id="y2sq96"
NEXT_PUBLIC_APP_URL=
NODE_ENV=
```

---

## Supabase

```env id="cktv9t"
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## OpenRouter

```env id="4m5g90"
OPENROUTER_API_KEY=
```

---

## Stripe

```env id="f4b8r7"
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

---

## Inngest

```env id="uk8fjv"
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

---

# Supabase Configuration

## Authentication

Enabled:

```txt id="9yk5yi"
Email / Password
```

Disabled:

```txt id="72zv1z"
Anonymous Auth
```

---

## Storage Buckets

Required (Supabase Storage, public):

```txt id="q0s4mr"
generated-images     Pinterest images + private `.source` recomposition photos
wordpress-images     WordPress article images
reference-images     user reference images
```

`exports` is reserved for future server-side CSV storage and is not used (CSV export is client-side).

## Cloudflare R2 (TASK-049, optional)

New public media go to R2 only when `MEDIA_STORAGE_PROVIDER=r2`; the default `supabase` keeps the buckets above. Server-side only — never `NEXT_PUBLIC_`.

```env
MEDIA_STORAGE_PROVIDER=supabase   # or r2
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_BUCKET=omniflow-media
R2_PUBLIC_URL=https://media.n8nflow.org
R2_REGION=auto
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
```

Production rollout (TASK-061): add the six `R2_*` variables on Vercel with the flag still `supabase`, redeploy; switch the flag to `r2` only after the real WordPress validation passes. Rollback: flag back to `supabase` + redeploy (R2 URLs already stored keep working, nothing is migrated). `.source` photos always stay in Supabase.

## Meta app for Facebook Pages (TASK-068, optional)

One-time setup by the OmniFlow operator. Without it, Facebook posts can still be generated and copied, but no Page can be connected (`/facebook` shows "not configured"). Meta's dashboard wording changes over time — the names below were checked against Meta's "Create an app" doc on 2026-10-15.

1. **Database**: apply migrations 045 then 046 in the Supabase SQL Editor.
2. **Create the app**: on https://developers.facebook.com/apps/creation/ (Meta developer account required) — app name + contact email → use case **"Manage everything on your Page"** → business portfolio: an unverified one or "skip for now" is enough while only the operator uses it → Go to dashboard. This use case adds `business_management`, `pages_show_list` and `public_profile` to the app automatically; OmniFlow still only requests its own scopes in the login dialog.
3. **Permissions** (Use cases → Customize): make sure `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `pages_manage_engagement` and `pages_read_user_content` are added. No profile or group permission.
4. **Redirect URI** (the use case's Facebook Login settings → Valid OAuth Redirect URIs): add exactly `https://<production domain>/api/social/connections/facebook/oauth/callback` and, for local tests, `http://localhost:3000/api/social/connections/facebook/oauth/callback`. The URI must match `NEXT_PUBLIC_APP_URL` (or the request origin when that variable is empty).
5. **App ID / App Secret**: App settings → Basic.
6. **Environment** (`.env.local` and Vercel, server-side only, never `NEXT_PUBLIC_`):

```env
META_APP_ID=
META_APP_SECRET=
META_GRAPH_API_VERSION=v25.0            # optional
SOCIAL_TOKEN_ENCRYPTION_KEY=            # openssl rand -hex 32 — never commit, rotating it disconnects every Page
```

7. **Who can connect**: while the app only has Standard Access, only Facebook accounts with a role on the app (App roles → Administrator / Developer / Tester) can log in and connect their Pages. Letting other users connect requires Advanced Access for the five permissions: App Review + Business Verification (a verified business portfolio).
8. **Legal URLs** (App settings → Basic, required before switching the app to Live / App Review): Privacy Policy URL `https://<production domain>/privacy`, Terms of Service URL `https://<production domain>/terms`, User data deletion → "Data deletion instructions URL" `https://<production domain>/data-deletion`. These pages are public (TASK-069); replace the `[…]` operator placeholders in `lib/legal/content.ts` first.
9. Redeploy, open `/facebook`, "Connect a Facebook Page", then follow TESTING.md "Facebook Pages (TASK-068)" for the real test.

## Facebook scheduling (TASK-100)

1. **Database**: apply migration **048** (`048_add_social_publication_scheduling.sql`, after 046 / 047) in the Supabase SQL Editor.
2. **Secret**: add `CRON_SECRET` on Vercel (Production, server-side only, ≥ 16 characters — `openssl rand -hex 32`). The scheduler sends it as `Authorization: Bearer …`; without it the route answers 503 and scheduled posts stay scheduled. Never print it in logs or in the crontab output.
3. **Trigger**: no Vercel cron — `vercel.json` must not declare `/api/cron/facebook-scheduled`. The operator's VPS (Contabo) calls `GET https://<production domain>/api/cron/facebook-scheduled` every 5 minutes with the header `Authorization: Bearer $CRON_SECRET` (secret read from a root-only file, never on the command line of a shared log). The crontab stays **disabled** until the manual test of TESTING.md "Facebook scheduling (TASK-100)" is approved.
4. Deploy, then enable the VPS crontab only for the approved manual test; follow TESTING.md "Facebook scheduling (TASK-100)".
5. Rollback: disable the VPS crontab (scheduled rows simply stay `scheduled`; cancel them in the UI). Migration rollback SQL is at the end of 048.
6. **Rights of the cron** (incident 2026-11-15): `service_role` needs `SELECT` and `UPDATE` on `public.social_publications`. Granted by hand in production on 2026-11-15; versioned since 2026-11-19 by migration **054** (`054_grant_service_role_social_publications.sql`, exactly these two rights). Check them with the query of "Several Facebook Pages per project (TASK-102)" below.

## Several Facebook Pages per project (TASK-102) — exact order

1. **Migration 054** (`054_grant_service_role_social_publications.sql`) — `GRANT SELECT, UPDATE ON public.social_publications TO service_role`. Independent of TASK-102 and of the deployment: in production it changes nothing (the rights were granted by hand on 2026-11-15; GRANT is idempotent); in a new environment it gives the cron its rights. Run the rights check below: both `true`.
2. **Pre-check 053** (read-only query below): the only UNIQUE constraint of `social_connections` is `social_connections_project_platform_key`. If the name differs, stop (053 would fail atomically on `DROP CONSTRAINT`, nothing changed).
3. **Migration 053** (`053_add_facebook_multiple_pages.sql`). From this moment until step 4, with the code currently deployed: **connecting or reconnecting a Facebook Page fails** (the old select route upserts `ON CONFLICT (project_id, platform)`, a key that no longer exists → Postgres "no unique or exclusion constraint matching the ON CONFLICT specification" → the route answers `500 save_failed`, nothing is written, the existing connection and its token are untouched). Nothing else changes: the old code reads one connection per project with `maybeSingle()`, which stays true because no second Page can be added before step 4; Publish now, Schedule, Reschedule, Cancel, the cron, Retry and Retry comment use the connection id / the row's Page and are unaffected; existing connections keep their id and token, existing publications keep their `connection_id`. Run the post-053 check.
4. **Deploy TASK-102 immediately after 053** (do not connect / reconnect a Page between 3 and 4).
5. With founder approval only: TESTING.md "Several Facebook Pages per project (TASK-102)" (real test checklist, step 0 = the rights check).

Reverse order (code before 053) is not recommended: connecting / reconnecting fails the same way (the new upsert key does not exist yet), the project page shows "Category suggestions are not available yet (migration 053 not applied)", detail pages still work (suggestion from the connections only).

Rollback: redeploy the previous code, then (only if no project has 2+ Pages) `ALTER TABLE social_connections DROP CONSTRAINT social_connections_project_platform_account_key; ALTER TABLE social_connections ADD CONSTRAINT social_connections_project_platform_key UNIQUE (project_id, platform); DROP TABLE facebook_page_category_mappings;` — with 2+ Pages in a project, disconnect the extra Pages first. 054 is never rolled back (the cron needs it).

```sql
-- Pre-check (read-only), BEFORE 053: must return exactly one row, the 046 key.
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.social_connections'::regclass AND contype = 'u';
-- expected: social_connections_project_platform_key | UNIQUE (project_id, platform)

-- Rights check (read-only), AFTER 054 (also usable before it in production, where the rights were granted by hand):
SELECT
  has_table_privilege('service_role', 'public.social_publications', 'SELECT') AS service_select,  -- expected true
  has_table_privilege('service_role', 'public.social_publications', 'UPDATE') AS service_update;  -- expected true
SELECT privilege_type FROM information_schema.role_table_grants
WHERE grantee = 'service_role' AND table_schema = 'public' AND table_name = 'social_publications'
ORDER BY privilege_type;  -- expected: at least SELECT and UPDATE (054 adds nothing else)

-- Check AFTER 053:
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.social_connections'::regclass AND contype = 'u';
-- expected: social_connections_project_platform_account_key | UNIQUE (project_id, platform, external_account_id)
SELECT to_regclass('public.facebook_page_category_mappings');  -- expected: facebook_page_category_mappings
```

---

## Database

Requirements:

```txt id="iux7yj"
RLS Enabled

Foreign Keys Enabled

Indexes Created
```

---

# Vercel Configuration

## Branch Strategy

Production:

```txt id="2xmdme"
main
```

Preview:

```txt id="l4ec1j"
feature/*
```

---

## Build Command

```bash id="1utzzc"
npm run build
```

---

## Install Command

```bash id="rkjr29"
npm install
```

---

## Output

Default Next.js output.

---

## Function Duration (WordPress routes)

`POST /api/wordpress/generate` and `POST /api/wordpress/generate-from-pins` (TASK-028) declare `export const maxDuration = 180` — the outline + full-article generation pipeline (two sequential AI calls, the article one alone allowed up to 120s) plus image generation can run past Vercel's default function timeout.

**Requires the Vercel Pro plan at minimum.** The Hobby plan hard-caps serverless function duration at 60s regardless of `maxDuration` — these routes will be killed mid-generation on Hobby. `maxDuration` has no effect in local dev (`next dev` has no such cap); this is purely a production/Vercel concern to have configured correctly before these routes are first deployed.

---

# Stripe Configuration

## Webhook Endpoint

```txt id="xndw10"
/api/webhooks/stripe
```

Events:

```txt id="jwcnxg"
checkout.session.completed

customer.subscription.created

customer.subscription.updated

customer.subscription.deleted

invoice.paid

invoice.payment_failed
```

---

# OpenRouter Configuration

Default Model:

```txt id="2xyd9x"
google/gemini-2.5-flash
```

Fallback Models:

```txt id="aovgll"
openai/gpt

anthropic/claude

deepseek-chat
```

---

# Inngest Configuration

Async jobs:

```txt id="tprw3d"
Pinterest Generation

Image Analysis

Future Image Generation
```

No long-running AI operations should execute directly inside UI requests.

---

# Security Requirements

Never expose:

```txt id="1vyy72"
OPENROUTER_API_KEY

STRIPE_SECRET_KEY

SUPABASE_SERVICE_ROLE_KEY
```

to the browser.

---

# Backup Strategy

Database:

```txt id="3e9k8m"
Supabase Managed Backups
```

Storage:

```txt id="k6j27s"
Supabase Storage
```

Exports:

```txt id="z2dvlr"
Can be regenerated from database
```

---

# Monitoring

MVP Monitoring:

```txt id="6rvb8l"
Vercel Logs

Supabase Logs

Stripe Dashboard

Inngest Dashboard
```

No external monitoring tools required during MVP.

---

# Release Checklist

Before production release:

```txt id="dt94tx"
Supabase Connected

RLS Verified

OpenRouter Connected

Stripe Connected

Inngest Connected

Environment Variables Configured

CSV Export Working

Credits System Working

Authentication Working
```

---

# Scaling Strategy

Current target:

```txt id="hjw8jb"
Up to 10,000 users
```

No migration to microservices planned before reaching significant scale.

Current architecture is considered sufficient for MVP and early growth.
