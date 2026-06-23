# TASKS.md

# OmniFlow Development Tasks

---

# ⚡ ACTIVE TASK

## [TASK-001] Project Foundation Setup

### Status: COMPLETED

### Objective

Crear la base técnica completa del proyecto OmniFlow.

### Scope

Configurar:

* Next.js 15
* TypeScript
* Tailwind CSS
* Shadcn UI
* Supabase
* Supabase Auth
* ESLint
* Prettier

### Files Allowed

```txt id="3rrz4d"
app/*
components/*
lib/*
types/*
```

### Success Criteria

Debe ser posible:

* Registrarse ✅
* Iniciar sesión ✅
* Cerrar sesión ✅
* Acceder a rutas protegidas ✅
* Conectarse correctamente a Supabase ✅

### Do Not Touch

```txt id="pl4yvw"
Pinterest Generator
Credits
Billing
History
CSV Export
OpenRouter
Stripe
Inngest
```

---

# ⏳ NEXT TASKS

## [TASK-002] Database Schema & RLS

### Status: COMPLETED

### Goal

Crear las tablas core definidas en DATABASE.md.

### Tables Created

```txt id="m4v5oi"
profiles ✅
projects ✅
generations ✅
pins ✅
```

### Deferred

```txt
credit_transactions → TASK-011
subscriptions → TASK-012
```

### Success Criteria

* Migraciones creadas ✅
* Foreign Keys configuradas ✅
* RLS activado ✅
* Policies funcionando ✅
* Triggers created (updated_at, handle_new_user) ✅

---

## [TASK-003] Dashboard Layout

### Status: COMPLETED

### Goal

Construir estructura visual principal.

### Components

```txt id="0d3dfj"
AppShell ✅
Sidebar ✅
Topbar ✅
PageHeader ✅
```

### Pages

```txt id="0udn1x"
/dashboard ✅
/projects ✅ (placeholder)
/pinterest ✅ (placeholder)
/history ✅ (placeholder)
/credits ✅ (placeholder)
/settings ✅ (placeholder)
```

### Success Criteria

Navegación funcional. ✅

---

## [TASK-004] Projects Module

### Goal

Crear CRUD completo de proyectos.

### Features

```txt id="0s4fvl"
Create Project
Update Project
Delete Project
List Projects
```

### Success Criteria

Usuario puede organizar su trabajo por proyectos.

---

## [TASK-005] Pinterest Generator UI

### Goal

Crear formulario principal de generación.

### Fields

```txt id="6wz1nm"
Keyword
Language
Pins Requested
Website URL
Pinterest URL
Reference Image
```

### Success Criteria

Formulario funcional.

Sin integración IA todavía.

---

## [TASK-006] OpenRouter Integration

### Goal

Crear capa centralizada de IA.

### Features

```txt id="oqw6ie"
Generate Titles
Generate Descriptions
Generate Keywords
Generate Boards
Generate Image Prompts
Analyze Reference Images
```

### Success Criteria

Respuesta JSON validada mediante Zod.

---

## [TASK-007] Pinterest Generation Job

### Goal

Crear flujo completo de generación.

### Flow

```txt id="f9s2jr"
API Route
↓
Credits Validation
↓
Inngest
↓
OpenRouter
↓
Database
```

### Success Criteria

Generación asíncrona funcional.

---

## [TASK-008] Results Screen

### Goal

Visualizar resultados generados.

### Features

```txt id="l39t5t"
Generation Summary
Pins Table
Card View
Copy Buttons
Character Counters
```

### Success Criteria

Todos los resultados son editables.

---

## [TASK-009] CSV Export

### Goal

Exportar CSV compatible con Pinterest Bulk Upload.

### Columns

```txt id="3bnq9v"
Title
Media URL
Pinterest board
Description
Link
Publish date
Keywords or tags
```

### Success Criteria

CSV descargable e importable en Pinterest.

---

## [TASK-010] History Module

### Goal

Guardar y visualizar generaciones anteriores.

### Features

```txt id="a8s1dd"
History List
Filters
Generation Details
Re-export CSV
```

### Success Criteria

Usuario puede recuperar generaciones antiguas.

---

## [TASK-011] Credits System

### Goal

Implementar lógica de créditos.

### Features

```txt id="h7i0gn"
Balance
Consumption
Transactions
```

### Success Criteria

No permitir generación sin créditos.

---

## [TASK-012] Billing & Stripe

### Goal

Permitir compra de créditos.

### Features

```txt id="c5ptc3"
Stripe Checkout
Webhook Processing
Credit Refill
```

### Success Criteria

Compra real funcionando.

---

## [TASK-013] Image Analysis

### Goal

Analizar imágenes de referencia.

### Input

```txt id="wtlxzj"
PNG
JPG
WEBP
```

### Output

```txt id="7ujs98"
Image Analysis
Image Prompt
```

### Success Criteria

Generación consistente de prompts Pinterest.

---

## [TASK-014] AI Image Generation

### Goal

Generar imágenes Pinterest automáticamente mediante OpenRouter.

### Features

```txt id="h8g7c3"
Generate Image
Store In Supabase Storage
Create Public URL
Attach To Pin
```

### Success Criteria

Pin generado con imagen lista para exportar.

---

## [TASK-015] Schedule Management

### Goal

Permitir configurar fechas de publicación.

### Features

```txt id="onq7cn"
Date Picker
Time Picker
Timezone Support
```

### Success Criteria

Publish Date exportada correctamente al CSV.

---

# 🚀 MVP RELEASE CHECKLIST

Antes de lanzar:

```txt id="rzc1dq"
Auth Working
Projects Working
Pinterest Generation Working
CSV Export Working
History Working
Credits Working
Stripe Working
```

---

# ✅ COMPLETED TASKS

## [TASK-003] Dashboard Layout — 2026-06-24

* AppShell: Sidebar + Topbar + content area
* Sidebar with navigation (Dashboard, Projects, Pinterest active; History, Credits, Settings disabled)
* Topbar with user email from Supabase server client + Sign Out
* PageHeader reusable component
* Dashboard page with static summary cards (Total Generations, Total Pins, Available Credits)
* Placeholder pages for /projects, /pinterest, /history, /credits, /settings

---

## [TASK-002] Database Schema & RLS — 2026-06-24

* Core tables: profiles, projects, generations, pins
* Foreign Keys with ON DELETE CASCADE
* RLS policies on all tables
* Triggers: auto-create profile on signup, auto-update updated_at
* Indexes on all query-critical columns
* TypeScript types for all tables
* credit_transactions and subscriptions deferred

---

## [TASK-001] Project Foundation Setup — 2026-06-23

* Next.js 15 + TypeScript + Tailwind CSS + Shadcn UI
* Supabase Auth (login, register, logout)
* Protected routes with middleware
* Dashboard placeholder
* ESLint + Prettier configured

---

# 🚫 OUT OF MVP

No implementar todavía:

```txt id="j5phf9"
Pinterest OAuth
Pinterest API
WordPress Publishing
SEO Articles
Teams
Analytics Dashboard
Mobile App
Multi-tenant Organizations
```
