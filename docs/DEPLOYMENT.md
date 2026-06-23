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
| Async Jobs     | Inngest          |

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

Required:

```txt id="q0s4mr"
reference-images

generated-images

exports
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
