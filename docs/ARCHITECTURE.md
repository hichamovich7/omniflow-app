# ARCHITECTURE.md

# Architecture Overview

OmniFlow v1.0 es una aplicación SaaS Pinterest-First construida como un monolito modular con Next.js y Supabase.

El objetivo del MVP es generar contenido Pinterest optimizado mediante IA, generar prompts para imágenes Pinterest y exportar archivos CSV compatibles con Pinterest Bulk Upload.

La arquitectura está diseñada para minimizar costes, reducir complejidad y permitir futuras extensiones sin necesidad de reestructuración importante.

---

# Technology Stack

| Layer            | Technology              |
| ---------------- | ----------------------- |
| Frontend         | Next.js 15 (App Router) |
| Backend          | Next.js Route Handlers  |
| Database         | Supabase PostgreSQL     |
| Storage          | Supabase Storage        |
| Authentication   | Supabase Auth           |
| Text & Vision AI | OpenRouter              |
| Image Generation | OpenRouter                |
| AI Gateway       | OpenRouter
| Payments         | Stripe                  |
| Async Jobs       | Inngest                 |
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



En MVP inicial:

```txt
Generate Image Prompt
↓
User generates image manually
```

En futuras versiones:

```txt
Generate Image Prompt

↓
Generated Image
↓
Supabase Storage
↓
CSV Auto Population
```

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
/pinterest/generate
  route.ts

/pinterest/export-csv
  route.ts

/credits/check
  route.ts

/webhooks/stripe
  route.ts
```

/lib

/ai

```
generateContent.ts
analyzeImage.ts
generateImagePrompt.ts
```

/openrouter

```
client.ts
```

/pinterest

```
generatePins.ts
csvExport.ts
```

/supabase

```
client.ts
server.ts
```

/stripe

```
checkout.ts
```

credits.ts

/jobs

generatePins.ts

/components

/ui

/layout

/pinterest

```
PinForm.tsx
PinResult.tsx
PinPreview.tsx
PinTable.tsx
```

/history

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
