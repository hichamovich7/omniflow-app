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

El MVP se enfocará exclusivamente en generación de contenido Pinterest.

### Consequences

Incluido:

* Pinterest Content Generation
* CSV Export
* Credits System
* History

Excluido:

* WordPress Publishing
* SEO Articles
* Pinterest API

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

FAL As Image Provider

### Context

Necesidad futura de generación de imágenes Pinterest.

### Decision Taken

FAL será el proveedor estándar para imágenes.

### Consequences

Modelos previstos:

* Flux Pro
* Ideogram
* Recraft

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
