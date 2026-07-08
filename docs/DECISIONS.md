# DECISIONS.md

# Architecture Decision Log

Este documento registra las decisiones importantes tomadas durante el desarrollo de OmniFlow.

No eliminar decisiones antiguas.

Añadir nuevas entradas cronológicamente.

---

## 2026-06-23

### Decision

Pinterest First MVP

### Context

El fundador obtiene la mayor parte de su tráfico desde Pinterest.

### Decision Taken

El MVP se enfocará en generación de contenido Pinterest como primer módulo de la plataforma.

### Consequences

Incluido:

* Pinterest Content Generation
* CSV Export
* Credits System
* History

No incluido en MVP:

* Pinterest API

Nota: WordPress y SEO Articles fueron excluidos del MVP pero ahora forman parte del roadmap oficial (TASK-028). Ver decisión 2026-06-26 — Platform Vision Evolution.

---

## 2026-06-23

### Decision

CSV Export Instead Of Pinterest API

### Context

La aprobación de Pinterest API puede tardar semanas y bloquear el lanzamiento.

### Decision Taken

Exportar archivos CSV compatibles con Pinterest Bulk Upload.

### Consequences

Ventajas:

* Sin aprobación externa
* Lanzamiento más rápido
* Menor complejidad

Desventajas:

* Publicación manual por parte del usuario

---

## 2026-06-23

### Decision

OpenRouter As AI Gateway

### Context

Necesidad de cambiar fácilmente entre proveedores IA.

### Decision Taken

Todo el tráfico IA pasa por OpenRouter.

### Consequences

Ventajas:

* Flexibilidad
* Menor dependencia de proveedor
* Optimización de costes

Modelos iniciales:

* Gemini 2.5 Flash

Modelos futuros:

* Claude
* GPT
* DeepSeek

---

## 2026-06-23

### Decision

Gemini 2.5 Flash As Default Model

### Context

Claude ofrece buena calidad pero tiene un coste superior.

### Decision Taken

Gemini Flash será el modelo principal para generación y análisis de imágenes.

### Consequences

Ventajas:

* Coste reducido
* Velocidad alta
* Calidad suficiente para Pinterest

---

## 2026-06-23

### Decision

OpenRouter As Unified AI Gateway (Text & Vision)

### Context

Reducir complejidad y proveedores externos. OpenRouter centraliza acceso a modelos de texto y vision.

### Decision Taken

OpenRouter gestionara text generation y vision analysis. Image generation queda excluida (ver decision 2026-06-24 — OpenAI Direct API).

### Consequences

Arquitectura mas simple para texto y vision. Menos integraciones. Menor mantenimiento.

---

## 2026-06-23

### Decision

Supabase As Backend Platform

### Context

Necesidad de desarrollar rápido con bajo coste.

### Decision Taken

Usar Supabase para:

* PostgreSQL
* Auth
* Storage

### Consequences

Menor complejidad operativa.

---

## 2026-06-23

### Decision

Monolithic Architecture

### Context

El MVP no necesita microservicios.

### Decision Taken

Construir un monolito modular.

### Consequences

Objetivo:

Hasta 10.000 usuarios sin migración.

---

## 2026-06-23

### Decision

Projects Organization

### Context

Los usuarios gestionarán múltiples webs y nichos.

### Decision Taken

Toda generación pertenece a un proyecto.

### Consequences

Mejor organización y escalabilidad.

---

## 2026-06-23

### Decision

Supported Languages

### Context

El fundador opera sitios en múltiples idiomas.

### Decision Taken

Idiomas soportados en MVP:

* English
* Deutsch
* Español
* Français

### Consequences

Toda generación debe respetar el idioma seleccionado.

---

## 2026-06-23

### Decision

Batch Generation

### Context

Los usuarios normalmente crean múltiples pines por keyword.

### Decision Taken

Permitir:

* 1 Pin
* 5 Pins
* 10 Pins
* 20 Pins
* 30 Pins

### Consequences

El flujo principal se optimiza para:

```txt id="0h08kn"
1 Keyword
↓
10 Pins
```

---

## 2026-06-23

### Decision

Supabase Auth Required

### Context

El sistema necesita créditos, historial y proyectos.

### Decision Taken

Mantener autenticación desde la v1.0.

### Consequences

Necesario para:

* Credits
* History
* Projects
* Stripe

---

## 2026-06-24

### Decision

User Role System

### Context

Necesidad de diferenciar niveles de acceso. El fundador necesita acceso ilimitado sin restricciones de créditos ni planes de Stripe.

### Decision Taken

Añadir columna role a profiles con tres niveles:

* user — usuario estándar con créditos limitados
* admin — acceso administrativo
* superadmin — créditos ilimitados, acceso completo, exento de restricciones de Stripe y planes

### Consequences

* Toda validación de créditos debe verificar role antes de bloquear
* Toda restricción de plan debe verificar role antes de aplicar
* superadmin nunca es bloqueado por falta de créditos
* superadmin nunca es restringido por plan o suscripción Stripe
* La asignación de roles se gestiona directamente en base de datos, no desde la UI

---

## 2026-06-24

### Decision

Defer History Performance Optimizations

### Context

After implementing the History Module (TASK-010), several potential improvements were identified: pagination, bulk delete, date range filter, and keyword search optimization (GIN index).

### Decision Taken

Defer all four improvements to the backlog until data volume justifies them. The current implementation works well for the MVP scale (single user, hundreds of generations).

### Consequences

* History loads all generations without pagination — acceptable for MVP
* Keyword search uses ilike without GIN index — acceptable for small datasets
* Bulk delete not available — users delete one at a time
* Date range filter not available — users filter by project/language/status
* Revisit when generation count exceeds 1000 per user or when multiple users are onboarded

---

## 2026-06-24

### Decision

Prompt Architecture & Partial Completion

### Context

Prompts were hardcoded in the API route. Needed a versioned, extractable structure. Additionally, OpenRouter sometimes returns fewer pins than requested — this was not handled gracefully.

### Decision Taken

1. Extract prompts to lib/prompts/ with explicit IDs (e.g. pinterest-pins-v1) for traceability.
2. Accept partial results: if OpenRouter returns at least 1 valid pin, mark generation as completed. Log a warning when pinsGenerated < pinsRequested.

### Consequences

* Prompts are versioned and isolated — future A/B testing and iteration are straightforward
* Partial completions no longer fail the generation — better UX for the user
* Warning logs enable monitoring partial results without blocking the user
* PROMPT_ID can be stored in generations table in the future for full traceability

---

## 2026-06-24

### Decision

OpenAI Direct API for Image Generation

### Context

OpenRouter does not expose a /v1/images/generations endpoint. Calling it returns 404. OpenRouter is a chat completions proxy and does not support the OpenAI Images API format. Image generation requires a direct provider call.

### Decision Taken

Use OpenAI API directly (api.openai.com/v1/images/generations) for image generation with gpt-image-1. This is an exception to Rule #10/11 (OpenRouter as only AI gateway). OpenRouter remains the exclusive gateway for text and vision. Image generation uses OpenAI directly because no viable alternative exists through OpenRouter.

### Consequences

* Text generation: OpenRouter (unchanged)
* Image generation: OpenAI direct (exception)
* New env vars: OPENAI_API_KEY, OPENAI_IMAGE_MODEL
* lib/openai/image-client.ts handles image generation
* lib/openrouter/client.ts continues handling text generation
* If OpenRouter adds image support in the future, migration is straightforward

---

## 2026-06-25

### Decision

Documentation Consolidation & Roadmap Reorder

### Context

After completing TASK-016 (Design System), an audit revealed multiple inconsistencies between documentation and code: TASK-014 referenced OpenRouter for images (uses OpenAI), ARCHITECTURE.md listed React Query (not installed), generation flow documented Inngest and credits validation (not implemented), API.md listed endpoints that don't exist, DATABASE.md had outdated descriptions, RULES.md Rule #11 contradicted DECISIONS.md.

### Decision Taken

Pause feature development to synchronize all documentation with the actual codebase. Reorder roadmap to prioritize: Security → Visual Refinement → Multi-Generator Architecture → WordPress → Credits → Stripe.

### Consequences

* All documentation now reflects actual implementation
* Non-implemented endpoints explicitly marked as deferred
* Roadmap reflects strategic priority (security before monetization)
* Credits and Stripe moved to later phases to focus on platform scalability first
* WordPress Generator introduced as first expansion target after multi-generator architecture

---

## 2026-06-26

### Decision

Platform Vision Evolution

### Context

OmniFlow was originally designed as a Pinterest-only tool. After completing the Pinterest module (content generation, image generation, scheduling, export, history), the product vision evolved. Pinterest validated the architecture. The same pipeline (Research → Analyze → Generate → Review → Images → Schedule → Export) can be reused for other content platforms.

### Decision Taken

Redefine OmniFlow as a multi-platform AI content generation platform. Pinterest remains the first implemented module. WordPress becomes the next planned module (TASK-028). Future generators (Facebook, LinkedIn, Medium) will follow the same architecture. WordPress and SEO Articles are no longer out of scope — they are part of the official roadmap.

### Consequences

* PROJECT.md updated to reflect platform vision
* ARCHITECTURE.md restructured around the multi-module pipeline
* TASKS.md roadmap organized in 4 phases: Pinterest Professional Workflow, Intelligent Content Research, Platform Architecture, WordPress
* WordPress and SEO Articles removed from out-of-scope lists
* All documentation aligned to the same product vision
* No code changes — this is a strategic direction decision

---

## 2026-07-08

### Decision

AI Engine Abstraction Layer

### Context

Business code called AI providers directly: `lib/openrouter/client.ts` from the Pinterest generation route, `lib/openai/image-client.ts` from the image generation route. Only 2 routes touched AI at all, making this the cheapest point to introduce a provider-agnostic abstraction before TASK-022 (Brand Profile), TASK-023 (Research), future SMART/VISION usage, and TASK-028 (WordPress) each add more AI call sites.

### Decision Taken

Introduce `lib/ai/` as the only AI gateway. Business code calls exactly three functions — `generateText()`, `analyzeImage()`, `generateImage()` — exposed by `lib/ai/engine.ts`. Internally, four roles (FAST, SMART, VISION, IMAGE) represent business capabilities, never a specific provider; each role resolves its own provider/model via `lib/ai/config.ts` (env vars `AI_<ROLE>_PROVIDER` / `AI_<ROLE>_MODEL`, with fallback to the previous `OPENROUTER_TEXT_MODEL` / `OPENAI_IMAGE_MODEL` vars for zero-downtime migration). Provider adapters (`lib/ai/providers/openrouter.ts`, `lib/ai/providers/openai.ts`) are the only files allowed to call an external AI SDK/API directly. Image-prompt construction moved into a dedicated `lib/ai/prompt-engine/` (byte-identical prompt text, just relocated), designed to later accept Brand Profile, Camera/Lighting/Composition, Negative Prompt, SEO Intent and Style Presets without changing its public interface.

This is a pure refactor — no schema change, no new endpoint, no behavior change. It wraps, and does not reverse, the prior decisions "OpenRouter As AI Gateway" and "OpenAI Direct API for Image Generation" (2026-06-23 / 2026-06-24): OpenRouter and OpenAI remain the underlying providers, just accessed through `lib/ai` instead of directly.

### Consequences

* RULES.md Rule #10/#11 updated: the mandatory AI gateway is now `/lib/ai`, expressed as roles rather than a named provider
* Adding a new provider (FAL, Highfield, Anthropic, Gemini, Ollama) means adding one file under `lib/ai/providers/` and one case in the relevant service's switch — zero changes to routes or components
* `VISION` role is fully implemented (symmetric with FAST/IMAGE) but not wired into any route yet — ready for TASK-013 without further engine changes
* `lib/openrouter/` and `lib/openai/` removed; `lib/prompts/pinterest-pins.ts` (Pinterest Package text prompt) untouched — it is business content, not provider plumbing
