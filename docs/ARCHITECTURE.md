# ARCHITECTURE.md

# Architecture Overview

OmniFlow es una plataforma de generación de contenido mediante IA construida como un monolito modular con Next.js y Supabase.

Pinterest es el primer módulo implementado. WordPress será el siguiente. La arquitectura está diseñada para soportar múltiples generadores de contenido sin duplicar código.

El MVP actual cubre generación de contenido Pinterest, generación de imágenes, programación y exportación CSV.

---

# Product Vision

OmniFlow es un espacio de trabajo inteligente de contenido.

No es un generador de pines. Es una plataforma donde cada módulo sigue el mismo pipeline:

```txt
Research → Analyze → Generate → Review → Images → Schedule → Export
```

Pinterest implementa este flujo primero. WordPress lo reutilizará después. Los siguientes generadores seguirán exactamente el mismo patrón.

---

# High-Level Architecture

El pipeline completo del producto:

```txt
Project (Brand Profile)
↓
Research                  (Planned — TASK-023)
↓
Content Analyzer          (Planned — TASK-024)
↓
Generator                 (Implemented — Pinterest)
↓
Editorial Review          (Planned — TASK-020)
↓
Image Generation          (Implemented)
↓
Scheduling                (Implemented)
↓
Export                     (Implemented)
↓
History                   (Implemented)
```

No todas las fases están implementadas. Cada una se desarrollará siguiendo el roadmap definido en TASKS.md.

---

# Module Architecture

```txt
OmniFlow
│
├── Core Platform
│   ├── Brand Profile
│   ├── Content Analyzer
│   ├── Editorial Workflow
│   ├── Image Generation
│   ├── Scheduling
│   ├── Export
│   └── History
│
├── Pinterest              (Implemented)
│
├── WordPress              (Planned — TASK-028)
│
├── Facebook               (Future)
│
├── LinkedIn               (Future)
│
└── Medium                 (Future)
```

Todos los módulos reutilizarán la misma arquitectura base: Brand Profile, Content Analyzer, Editorial Workflow, Navigation, Scheduling y Export.

---

# Technology Stack

| Layer            | Technology              |
| ---------------- | ----------------------- |
| Frontend         | Next.js 16 (App Router) |
| Backend          | Next.js Route Handlers  |
| Database         | Supabase PostgreSQL     |
| Storage          | Supabase Storage        |
| Authentication   | Supabase Auth           |
| AI Engine        | lib/ai (provider-agnostic) |
| Text & Vision AI | OpenRouter (via AI Engine) |
| Image Generation | OpenAI gpt-image-1 (via AI Engine) |
| Payments         | Stripe                  |
| Async Jobs       | Inngest (deferred, MVP is synchronous) |
| Hosting          | Vercel                  |

---

# AI Architecture

## AI Engine

El código de negocio nunca llama a un proveedor de IA directamente (ni OpenRouter, ni OpenAI, ni ningún futuro proveedor). Toda IA pasa por el AI Engine (`lib/ai/`), que centraliza configuración, selecciona provider/modelo, y expone una interfaz única al resto del proyecto:

```txt
generateText()
analyzeImage()
generateImage()
```

Ninguna otra parte del proyecto debe importar un SDK de proveedor. Flujo obligatorio:

```txt
UI
↓
API Route
↓
Business Logic
↓
AI Engine (lib/ai/engine.ts)
↓
Service (role resolution)
↓
Provider Adapter
```

### AI Roles

El AI Engine expone cuatro roles. Un rol representa una capacidad de negocio, nunca un proveedor concreto:

| Role   | Responsabilidad                                              | Provider actual | Modelo actual           |
| ------ | -------------------------------------------------------------- | ---------------- | ------------------------ |
| FAST   | Generación de contenido (mayoría de las llamadas IA). Produce el Pinterest Package. | openrouter | google/gemini-2.5-flash |
| SMART  | Reservado para funcionalidades futuras: SEO Articles, AI Agents, Content Research, razonamiento complejo. Sin uso en el MVP Pinterest. | openrouter | google/gemini-2.5-flash |
| VISION | Análisis de una imagen de referencia cuando el usuario la proporciona. No se usa para generar imágenes. Implementado en el engine, sin ninguna ruta que lo invoque todavía (ver TASK-013, deferred). | openrouter | google/gemini-2.5-flash |
| IMAGE  | Generación de imágenes Pinterest. Nunca recibe un keyword directamente, solo el prompt ya construido por el Prompt Engine. | openai | gpt-image-1 |

Cada rol se configura de forma independiente vía variables de entorno (`AI_<ROLE>_PROVIDER`, `AI_<ROLE>_MODEL`), con valores por defecto en `lib/ai/config.ts`. Cambiar de proveedor o modelo es un cambio de configuración, no de código.

### Provider Abstraction

```txt
lib/ai/
  types.ts            AIRole, AIProvider, AIRoleConfig, ChatMessage
  config.ts            getRoleConfig(role) — resuelve provider/modelo por rol
  engine.ts             facade: generateText, analyzeImage, generateImage
  providers/
    openrouter.ts       chatCompletion(), visionCompletion()
    openai.ts           generateImage()
  services/
    text.ts             generateText({role, messages, maxTokens, temperature})
    vision.ts           analyzeImage({imageUrl, instructions, maxTokens})
    image.ts             generateImage({prompt, size})
  prompt-engine/
    engine.ts           buildImagePrompt(pinterestPackage, version)
    presets.ts           directivas de calidad, constraints negativos, variation directive
    templates/
      photography-styles.ts   estilo fotográfico inferido por categoría/nicho
```

Providers no usados hoy (FAL, Highfield, Anthropic, Gemini, Ollama) pueden añadirse implementando un nuevo archivo en `providers/` y registrándolo en el `switch` del service correspondiente — sin tocar rutas ni componentes.

### Pinterest Package

El Pinterest Package es la salida estructurada del rol FAST para cada pin: `title`, `description`, `keywords`, `board`, `image_prompt`. Es el mismo shape que ya devuelve `lib/prompts/pinterest-pins.ts` — no introduce columnas ni campos nuevos. El Prompt Engine transforma el Pinterest Package en un prompt optimizado para el rol IMAGE; nunca conoce al proveedor final.

### Prompt Engine

Responsable únicamente de construir el prompt de imagen a partir del Pinterest Package. Independiente de providers. Diseñado para incorporar en el futuro, sin romper su interfaz actual:

* Brand Profile / Project Memory
* Camera, Lighting, Composition
* Negative Prompt
* SEO Intent
* Platform Rules
* Style Presets

El prompt de texto que produce el Pinterest Package (system/user prompt del rol FAST) sigue viviendo en `lib/prompts/pinterest-pins.ts` — es contenido de negocio Pinterest, no plumbing de proveedor.

---

## Image Generation Flow (Implemented)

```txt
Pinterest Package (FAST)
↓
Prompt Engine (lib/ai/prompt-engine)
↓
AI Engine → IMAGE role → OpenAI gpt-image-1
↓
Generated Image
↓
Supabase Storage (generated-images bucket)
↓
Public URL attached to Pin
↓
CSV Auto Population (Media URL column)
```

El generador de imagen nunca recibe el keyword directamente, solo el prompt ya construido por el Prompt Engine.

---

# Brand Profile (Planned — TASK-022)

El Brand Profile será el contexto permanente del proyecto utilizado por toda la IA.

Representa la identidad editorial de la marca: tono, audiencia, estilo visual, valores y temas principales.

Será reutilizado por:

* Pinterest content generation
* Pinterest image generation
* WordPress content generation
* Facebook, LinkedIn, Medium (futuro)

Evolución prevista:

```txt
Project Description (actual)
↓
Brand Profile (TASK-022)
↓
Project Memory / Knowledge Base (futuro)
```

---

# Research Layer (Planned — TASK-023)

OmniFlow evolucionará hacia una plataforma capaz de investigar contenido antes de generarlo.

Research soportará:

* Keyword Research
* Website Research
* Blog URL Research
* Pinterest URL Research

El motor de adquisición de contenido podrá utilizar proveedores como Firecrawl. La arquitectura no estará acoplada exclusivamente a un proveedor — debe permanecer abierta para futuros proveedores de investigación.

Futuras fuentes de entrada:

```txt
PDF, Markdown, RSS, YouTube
Product URL, Shopify, Amazon
```

---

# Content Analyzer (Planned — TASK-024)

Cualquier entrada deberá pasar por un proceso común de análisis antes de llegar a los generadores.

Responsabilidades:

* Context Extraction
* Theme Detection
* Keywords
* Audience
* Tone
* Category
* Structured Summary

El Content Analyzer produce un análisis estructurado reutilizable por cualquier generador, independientemente de la plataforma destino.

---

# Editorial Workflow (Planned — TASK-020)

El flujo editorial previsto para revisar y refinar contenido generado:

```txt
Generate
↓
Review
↓
Select
↓
Image Generation
↓
Schedule
↓
Export
```

Este flujo será reutilizable por todos los generadores. Permitirá seleccionar pins específicos, generar imágenes selectivamente, y exportar únicamente el contenido revisado.

---

# Pinterest Module (Implemented)

## Current State

Pinterest es el primer módulo funcional. Cubre:

* Content generation (titles, descriptions, keywords, boards, image prompts)
* AI image generation (gpt-image-1)
* Scheduling (spread by days / spread by hours)
* CSV export (Pinterest Bulk Upload format)
* History with filters

## Pinterest Generation Flow

```txt
User Input (Keyword, Language, Pins, Project)
↓
API Route (POST /api/pinterest/generate)
↓
Zod Validation
↓
AI Engine → FAST role (google/gemini-2.5-flash via OpenRouter)
↓
Generate Pinterest Package (Titles, Descriptions, Keywords, Boards, Image Prompts)
↓
Store Result (generations + pins tables)
↓
Return Response
```

Note: Credits validation is planned (TASK-011) but not yet implemented. Generation is synchronous (Inngest deferred).

## Pinterest Roadmap

El módulo Pinterest evolucionará para implementar el pipeline completo:

```txt
Research             (Planned — TASK-023)
↓
Generate             (Implemented)
↓
Editorial Review     (Planned — TASK-020)
↓
Image Generation     (Implemented)
↓
Image Versioning     (Planned — TASK-021)
↓
Boards Management    (Planned — TASK-025)
↓
Scheduling           (Implemented)
↓
Export                (Implemented)
↓
History              (Implemented)
```

---

# Multi-Generator Strategy

Pinterest es el módulo de validación. Toda la arquitectura se probará primero en Pinterest antes de extenderla a otros generadores.

Cuando la arquitectura esté madura, WordPress (TASK-028) reutilizará:

* Editorial Workflow (TASK-020)
* Brand Profile (TASK-022)
* Content Analyzer (TASK-024)
* Navigation (TASK-026)
* Scheduling
* Export

Los siguientes generadores (Facebook, LinkedIn, Medium) seguirán exactamente el mismo patrón. La creación de un nuevo generador requerirá únicamente configuración específica de plataforma, validación y prompts — sin duplicar infraestructura.

---

# Navigation (Planned — TASK-026)

La navegación evolucionará hacia una estructura organizada por plataforma:

```txt
Dashboard
Projects
Pinterest
  Research
  Generate
  Boards
  History
WordPress
Facebook
LinkedIn
Medium
Settings
```

La estructura actual agrupa por funcionalidad (Generators / Library / Account). TASK-026 la reorganizará por plataforma para soportar el crecimiento modular.

---

# CSV Export Flow

```txt
Generated Pins
↓
CSV Builder
↓
Platform Format (Pinterest Bulk Upload)
↓
UTF-8 BOM
↓
Download CSV
```

Supported Columns:

* Title
* Media URL
* Pinterest board
* Description
* Link
* Publish date
* Keywords or tags

---

# Image Analysis (Deferred — TASK-013)

Not wired into any route or UI yet. Planned flow (the AI Engine's VISION role already implements the provider call — see "AI Engine" above — it is simply not invoked by TASK-013's product feature yet):

Reference Image → Upload → AI Engine (VISION role) → Image Analysis (JSON) → FAST role → Pinterest Package → Prompt Engine → IMAGE role

---

# Storage Strategy

Supabase Storage será utilizado para:

- Uploaded Reference Images
- Generated Images
- CSV Exports

Todas las imágenes generadas deberán almacenarse en Supabase Storage y disponer de una URL pública reutilizable para exportaciones, historial y futuras automatizaciones.

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

/ai

```
types.ts                        — AIRole, AIProvider, AIRoleConfig, ChatMessage
config.ts                       — getRoleConfig(role): provider/model resolution
engine.ts                       — facade: generateText, analyzeImage, generateImage
providers/openrouter.ts         — chatCompletion(), visionCompletion()
providers/openai.ts             — generateImage()
services/text.ts                — FAST/SMART role resolution
services/vision.ts              — VISION role resolution
services/image.ts               — IMAGE role resolution
prompt-engine/engine.ts         — buildImagePrompt(pinterestPackage, version)
prompt-engine/presets.ts        — quality directives, negative constraints, variation directive
prompt-engine/templates/photography-styles.ts — style inference by category
```

/prompts

```
pinterest-pins.ts  — pinterest-pins-v2 prompt (Pinterest Package / FAST role)
image-generator.ts — IMAGE_CONFIG (batch size, concurrency, output size)
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
format-date.ts     — shared timeAgo() utility
status.ts          — shared statusToVariant() utility
```

/stripe (deferred)

```
checkout.ts
```

/components

/ui (Shadcn + Custom)

```
button, input, card, label, separator, table,
dropdown-menu, badge, sonner, textarea, dialog,
select, skeleton, sheet
page-container, status-dot
```

/layout

```
topbar.tsx
sidebar.tsx
page-header.tsx
mobile-nav.tsx
user-menu.tsx
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

/skeletons

```
dashboard-skeleton.tsx
table-skeleton.tsx
```

/types

database.ts
api.ts
pinterest.ts

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
* useState para estado local simple.
* fetch para mutaciones desde Client Components.
* Supabase RLS obligatorio.
* AI Engine (`lib/ai`) como única puerta de entrada a IA — texto, visión e imagen.

* Todas las respuestas IA deben devolver JSON estructurado.
* Ningún componente ni ruta puede llamar directamente a un SDK de proveedor (OpenRouter, OpenAI, o futuros).

Flujo obligatorio:

```txt
UI
↓
API Route
↓
Business Logic
↓
AI Engine
↓
Response
```

---

# Scalability Target

Arquitectura diseñada para soportar:

* 10.000 usuarios
* 100.000+ generaciones mensuales
* Múltiples proveedores IA
* Múltiples plataformas de contenido
* Múltiples idiomas

sin migrar a microservicios.

---

# Future Evolution

```txt
Pinterest Module (Implemented)
↓
Pinterest Professional Workflow (Fase 1)
↓
Intelligent Content Research (Fase 2)
↓
Platform Architecture (Fase 3)
↓
WordPress Module (Fase 4)
↓
Additional Generators (Future)
↓
Full AI Content Platform
```

Cada fase se construye sobre la anterior. Pinterest valida la arquitectura. WordPress la reutiliza. Los siguientes generadores la escalan.

---

# Technical Debt

Infrastructure improvements and internal refactoring are documented separately:

```txt
docs/TECHNICAL_DEBT.md
```

This keeps the architecture document focused on design decisions and the product roadmap focused on user-facing features.

---

# Out Of Scope (MVP)

No implementar en v1.0:

* Pinterest API
* Pinterest OAuth
* Publicación automática en Pinterest
* Teams
* Analytics Dashboard
* Mobile App
* Multi-tenant Organizations
