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
