# ARCHITECTURE.md

# Architecture Overview

OmniFlow v1.0 es una aplicación SaaS Pinterest-First construida como un monolito modular con Next.js y Supabase.

El objetivo del MVP es generar contenido Pinterest optimizado mediante IA, generar prompts para imágenes Pinterest y exportar archivos CSV compatibles con Pinterest Bulk Upload.

La arquitectura está diseñada para minimizar costes, reducir complejidad y permitir futuras extensiones sin necesidad de reestructuración importante.

---

# Technology Stack

| Layer            | Technology              |
| ---------------- | ----------------------- |
| Frontend         | Next.js 16 (App Router) |
| Backend          | Next.js Route Handlers  |
| Database         | Supabase PostgreSQL     |
| Storage          | Supabase Storage        |
| Authentication   | Supabase Auth           |
| Text & Vision AI | OpenRouter              |
| Image Generation | OpenAI (gpt-image-1)    |
| AI Gateway       | OpenRouter              |
| Payments         | Stripe                  |
| Async Jobs       | Inngest (deferred, MVP is synchronous) |
| Hosting          | Vercel                  |

---

# AI Architecture

## OpenRouter Responsibilities

OpenRouter será el único gateway para modelos de texto y visión.

Responsabilidades:

* Pinterest title generation
* Pinterest description generation
* Pinterest keyword generation
* Pinterest board suggestion
* Image analysis
* Image prompt generation
* Structured JSON outputs
* Generación de imágenes

Modelo por defecto:

```txt
google/gemini-2.5-flash
```

Modelos alternativos futuros:

```txt
anthropic/claude-sonnet
openai/gpt
deepseek-chat
```

---



Flujo actual (implementado):

```txt
Generate Image Prompt
↓
OpenAI gpt-image-1
↓
Generated Image
↓
Supabase Storage (generated-images bucket)
↓
Public URL attached to Pin
↓
CSV Auto Population (Media URL column)
```

Nota: Image generation usa OpenAI directamente (excepción a Rule #10/11). OpenRouter no soporta /v1/images/generations. Ver DECISIONS.md para detalle.

---

# Folder Structure

/app

/(auth)

```
/login
/register
```

/(dashboard)

```
/dashboard
/projects
/pinterest
/history
/credits
/settings
```

/api

```
/projects
  route.ts
/projects/[id]
  route.ts
/pinterest/generate
  route.ts
/pinterest/generate-images
  route.ts
/pinterest/schedule
  route.ts
/generations/[id]
  route.ts
/credits/check
  route.ts (deferred)
/webhooks/stripe
  route.ts (deferred)
```

/lib

/openrouter

```
client.ts          — text/vision AI gateway
image-client.ts    — (deprecated, replaced by OpenAI)
```

/openai

```
image-client.ts    — image generation via gpt-image-1
```

/prompts

```
pinterest-pins.ts  — pinterest-pins-v1 prompt
image-generator.ts — pinterest-image-v1 config
index.ts           — barrel export
```

/supabase

```
client.ts          — browser client
server.ts          — server client
middleware.ts      — auth middleware
```

/validations

```
project.ts
pinterest.ts
schedule.ts
```

/queries

```
generations.ts     — shared generation queries
```

/csv

```
pinterest.ts       — CSV builder + date formatter
```

/utils

```
promise-pool.ts    — concurrency-limited parallel processing
```

/stripe (deferred)

```
checkout.ts
```

/components

/ui (Shadcn)

```
button, input, card, label, separator, table,
dropdown-menu, badge, sonner, textarea, dialog,
select, skeleton
```

/layout

```
topbar.tsx
sidebar.tsx
page-header.tsx
```

/pinterest

```
pin-form.tsx
pin-table.tsx
generate-images-button.tsx
export-csv-button.tsx
schedule-dialog.tsx
```

/history

```
history-table.tsx
history-filters.tsx
history-actions.tsx
delete-generation-dialog.tsx
```

/projects

```
project-form.tsx
project-actions.tsx
delete-project-dialog.tsx
```

empty-state.tsx

/types

database.ts
api.ts
pinterest.ts

---

# Pinterest Generation Flow

User Input

* Keyword
* Language
* Number of Pins
* Optional Website URL
* Optional Pinterest URL
* Optional Reference Image

↓

API Route

↓

Credits Validation

↓

Inngest Job

↓

OpenRouter

↓

Generate

* Titles
* Descriptions
* Keywords
* Suggested Boards
* Image Prompts

↓

Store Result

↓

Return Response

---

# Image Analysis 

Reference Image

↓

Upload

↓

OpenRouter Vision Model

↓

Image Analysis

↓

Image Prompt Generation

↓

Store Result

↓

Return Response

---

# CSV Export Flow

Generated Pins

↓

CSV Builder

↓

Pinterest Format

↓

UTF-8 BOM

↓

Download CSV

Supported Columns:

* Title
* Media URL
* Pinterest board
* Description
* Link
* Publish date
* Keywords or tags

---

# Storage Strategy


Supabase Storage será utilizado para:

- Uploaded Reference Images
- Generated Images
- CSV Exports

Todas las imágenes generadas deberán almacenarse en Supabase Storage y disponer de una URL pública reutilizable para exportaciones, historial y futuras automatizaciones.

---

# API Route Rules

Todas las API Routes deben seguir este flujo:

1. Verificar usuario autenticado.
2. Verificar ownership del recurso.
3. Verificar créditos disponibles.
4. Ejecutar lógica.
5. Registrar consumo de créditos.
6. Registrar evento de auditoría.
7. Devolver respuesta tipada.

---

# Frontend Architecture

La arquitectura Frontend se organiza en cuatro niveles jerárquicos:

```txt
Design System
↓
UI Principles
↓
Component Standards
↓
Feature Components
```

## Design System (DESIGN_SYSTEM.md)

Define la identidad visual del producto: paleta de colores, tipografía, espaciado, radios, sombras, iconografía y las reglas de diseño para cada tipo de componente (botones, cards, tablas, badges, inputs, dialogs, etc.).

Todos los componentes deben utilizar los tokens definidos aquí. Nunca hardcodear valores visuales.

## UI Principles (UI_PRINCIPLES.md)

Define cómo el usuario experimenta el producto: jerarquía visual, flujos de trabajo AI, progressive disclosure, empty states, loading states, error messages y reglas de interacción.

Todo nuevo flujo o pantalla debe respetar estos principios antes de la implementación.

## Component Standards (COMPONENT_STANDARDS.md)

Define cómo se diseñan, implementan y mantienen los componentes React: responsabilidad única, composición, Server vs Client Components, file naming, folder organization, props, variantes, separación de lógica y accesibilidad.

Todo componente nuevo debe verificarse contra estos estándares.

## Feature Components

Son los componentes específicos de cada funcionalidad (Pinterest, Projects, History, etc.). Se construyen componiendo componentes base del Design System y respetando los UI Principles y Component Standards.

La relación entre niveles es estricta: cada nivel inferior debe cumplir con las reglas de todos los niveles superiores.

---

# Technical Rules

* Monolito modular.
* App Router únicamente.
* TypeScript estricto.
* No any.
* Server Components por defecto.
* Client Components solo cuando exista interactividad.
* React Query para estado remoto.
* useState para estado local simple.
* Supabase RLS obligatorio.
* OpenRouter como único gateway para texto y visión.

* Todas las respuestas IA deben devolver JSON estructurado.
* Ningún componente puede llamar directamente a OpenRouter .

Flujo obligatorio:

```txt
UI
↓
API Route
↓
Business Logic
↓
Provider
↓
Response
```

---

# Scalability Target

Arquitectura diseñada para soportar:

* 10.000 usuarios
* 100.000+ generaciones mensuales
* Múltiples proveedores IA
* Múltiples idiomas

sin migrar a microservicios.

---

# Out Of Scope (MVP)

No implementar en v1.0:

* Pinterest API
* Pinterest OAuth
* Publicación automática en Pinterest
* WordPress Publishing
* SEO Articles
* Team Workspaces
* Analytics Dashboard
* Mobile App
* Multi-tenant Organizations
