# PROJECT.md

# OmniFlow

## Product Overview

OmniFlow es una plataforma de generación de contenido mediante IA.

El sistema permite investigar, generar, revisar y exportar contenido optimizado para múltiples plataformas a partir de una palabra clave, una URL o una imagen de referencia.

Pinterest es el primer módulo implementado. WordPress será el siguiente gran módulo. Posteriormente podrán añadirse nuevos generadores (Facebook, LinkedIn, Medium).

El pipeline de cada módulo sigue el mismo flujo:

```txt
Research → Analyze → Generate → Review → Images → Schedule → Export
```

Durante el MVP, la plataforma genera contenido Pinterest y exporta archivos CSV compatibles con Pinterest Bulk Upload. No publica directamente en ninguna plataforma.

---

# Problem Statement

Los creadores de contenido y propietarios de blogs invierten una gran cantidad de tiempo en:

* Buscar ideas de contenido para cada plataforma.
* Crear múltiples variantes de títulos y descripciones.
* Redactar contenido optimizado para SEO.
* Investigar palabras clave relacionadas.
* Diseñar prompts para generar imágenes.
* Preparar archivos para publicación masiva.

La mayoría de herramientas existentes cubren solo una parte del proceso y solo una plataforma.

OmniFlow centraliza todo el flujo en una única plataforma, reutilizando la misma arquitectura para cada generador de contenido.

---

# Product Goal

Permitir que un usuario genere contenido listo para publicar en menos de cinco minutos.

El MVP se centra en Pinterest. La arquitectura permite extender el mismo flujo a WordPress y otras plataformas.

---

# Target Users

* Bloggers
* Affiliate Marketers
* Niche Site Owners
* Content Creators
* SEO Specialists
* Content Agencies

---

# MVP Scope

## Input Methods

### Keyword Input (Implemented)

Ejemplo:

* badezimmer inspiration schrank
* small bathroom ideas
* recettes healthy faciles

### Website URL Input (Planned)

URL de una pagina o articulo para generar contenido Pinterest relacionado. El campo existe en el formulario y la base de datos pero no se utiliza en la generacion actual.

### Pinterest URL Input (Planned)

URL de un pin existente para utilizarlo como inspiracion. El campo existe en la base de datos pero no se utiliza en la generacion actual.

### Reference Image Input (Deferred — TASK-013)

Imagen subida por el usuario para analizar estilo visual y generar nuevos prompts de imagen.

---

# Supported Languages

El usuario podrá seleccionar el idioma de generación.

Idiomas soportados en el MVP:

* English
* Deutsch
* Español
* Français

Todos los elementos generados deberán respetar el idioma seleccionado.

---

# Pinterest Content Generation

Para cada pin generado, el sistema producirá:

### Title

* Optimizado para Pinterest
* Máximo 100 caracteres

### Description

* Optimizada para Pinterest
* Máximo 500 caracteres

### Keywords

* Entre 10 y 15 keywords relevantes
* Separadas por comas
* Sin hashtags

### Suggested Board

* Nombre sugerido para el tablero

### Image Prompt

* Prompt optimizado para generar una imagen Pinterest vertical

### Image Analysis

* Disponible cuando el usuario proporciona una imagen de referencia

---

# Batch Generation

El usuario podrá generar múltiples variantes de pines en una sola ejecución.

Opciones MVP:

* 1 Pin
* 5 Pins
* 10 Pins
* 20 Pins
* 30 Pins

Caso principal de uso:

* 10 Pines por keyword

Cada pin generado debe ser único y evitar duplicación de títulos, descripciones o keywords.

---

# CSV Export

El sistema permitirá exportar el resultado en formato CSV compatible con Pinterest Bulk Upload.

Columnas soportadas:

* Title
* Media URL
* Pinterest board
* Description
* Link
* Publish date
* Keywords or tags

---

# Scheduling Support

El usuario puede configurar fechas de publicación para todos los pines de una generación.

Modos de programación:

* Spread by Days — distribuye pines por días según frecuencia
* Spread by Hours — distribuye pines a lo largo del día por intervalos

Frecuencias disponibles (modo días):

* Daily
* Every 2 Days
* Every 3 Days
* Weekly
* Every Weekday (Mon-Fri)

Intervalos disponibles (modo horas):

* 30 minutes
* 1 hour
* 2 hours
* 4 hours

La fecha se incluye en el CSV en formato ISO 8601 (YYYY-MM-DDTHH:mm:ss).

---

# AI Image Generation

El sistema genera imágenes Pinterest automáticamente.

Flujo:

* El usuario genera contenido (títulos, descripciones, prompts)
* Tras la generación, puede generar imágenes con un clic
* Las imágenes se almacenan en Supabase Storage (bucket: generated-images)
* Las URLs públicas se adjuntan a cada pin
* Las URLs se incluyen automáticamente en la columna Media URL del CSV

Proveedor:

* OpenAI gpt-image-1
* Formato: 1024x1536 (vertical Pinterest)
* Concurrencia limitada: máximo 3 simultáneas, máximo 10 por lote

---

# History

El sistema almacenará el historial de generaciones realizadas.

Cada generación conservará:

* Keyword
* Idioma
* Número de pines
* Fecha de generación
* Resultado generado

---

# User Roles

OmniFlow utiliza un sistema de roles.

| Role       | Credits    | Access     | Stripe Restrictions |
| ---------- | ---------- | ---------- | ------------------- |
| user       | Limited    | Standard   | Subject to plan     |
| admin      | Limited    | Extended   | Subject to plan     |
| superadmin | Unlimited  | Full       | Exempt              |

Los usuarios con role superadmin tienen créditos ilimitados, acceso completo a todas las funcionalidades y están exentos de restricciones de Stripe y planes.

---

# Credits System

OmniFlow utilizará un sistema de créditos.

Cada generación consumirá créditos según la cantidad de contenido generado.

Si el usuario no dispone de créditos suficientes, la generación será bloqueada.

Excepción: los usuarios con role superadmin no están sujetos a esta restricción.

La lógica exacta de consumo será definida en una fase posterior.

---

# Brand Profile

Cada proyecto tiene un campo Description (opcional, hasta 500 caracteres) que cumple doble función:

* Identificar el proyecto en la interfaz (projects, selector del generador)
* Actuar como Brand Profile: contexto de marca (tono, audiencia, estilo) que la IA respeta al generar contenido

Todo contenido generado para un proyecto — títulos, descripciones, keywords, board y prompts de imagen — utiliza este contexto. No requiere ningún campo adicional; es el mismo campo Description reutilizado como contexto de IA (ver docs/ARCHITECTURE.md, TASK-022).

---

# AI Providers

OmniFlow nunca depende directamente de un proveedor de IA. El código de negocio solo conoce el AI Engine (`lib/ai/`), que expone cuatro roles — FAST, SMART, VISION, IMAGE — cada uno configurable de forma independiente (proveedor + modelo) vía variables de entorno. Ver docs/ARCHITECTURE.md para el detalle.

Proveedores actuales:

* OpenRouter — texto (FAST, SMART) y visión (VISION)
* OpenAI — generación de imágenes (IMAGE), gpt-image-1

Proveedores futuros que la arquitectura permite añadir sin tocar código de negocio:

* Anthropic
* Google Gemini
* DeepSeek
* Mistral
* FAL, Highfield (imagen)

Cambiar de proveedor o modelo es un cambio de configuración, no de código.

---

# Storage

Supabase Storage se utiliza para almacenar imagenes generadas.

Bucket activo:

* generated-images — imagenes Pinterest generadas por OpenAI gpt-image-1 (public read, authenticated write)

Buckets reservados:

* reference-images — imagenes de referencia subidas por el usuario (TASK-013)
* exports — CSV generados server-side (actualmente el export es client-side)

---

# Frontend Standards

OmniFlow dispone de un sistema oficial de diseño y arquitectura Frontend compuesto por tres documentos:

* DESIGN_SYSTEM.md — define la identidad visual: colores, tipografía, espaciado, radios, sombras, iconografía y reglas de diseño para cada tipo de componente.
* UI_PRINCIPLES.md — define los principios de experiencia de usuario: jerarquía visual, flujos de trabajo, progressive disclosure, empty states, loading states y reglas de interacción.
* COMPONENT_STANDARDS.md — define las normas de implementación de componentes React: responsabilidad única, composición, Server/Client Components, naming, organización, props, variantes y separación de lógica.

Toda nueva funcionalidad Frontend deberá respetar estos tres documentos.

Cualquier componente nuevo o modificado debe verificarse contra estos estándares antes de considerarse completo.

---

# User Documentation

OmniFlow incluye una Guía in-app (`/guide`) dirigida al usuario final — distinta de `docs/*`, que es documentación para desarrolladores/Claude.

Contenido en `lib/guide/content.ts`, organizado por funcionalidad (Projects, Research, Analyze, Generate, Editorial Review, AI Images, Boards, Scheduling, Export, History).

Regla: toda funcionalidad visible para el usuario debe reflejarse en la Guía al momento de implementarse — no queda como tarea separada.

---

# Platform Roadmap

El roadmap de OmniFlow sigue un modelo de expansión modular:

```txt
Pinterest (Implemented)
↓
WordPress (Planned — TASK-028)
↓
Facebook, LinkedIn, Medium (Future)
```

WordPress y la generación de artículos SEO forman parte del roadmap oficial. Ver TASKS.md para detalle.

---

# Out Of Scope (MVP)

Las siguientes funcionalidades no forman parte del MVP:

* Publicación directa en Pinterest
* Pinterest OAuth
* Pinterest API
* Multi-user Teams
* Analytics Dashboard
* Social Media Scheduling
* Video Generation
* Mobile Application

---

# Success Criteria

El MVP se considerará exitoso cuando un usuario pueda:

1. Introducir una keyword, URL o imagen.
2. Seleccionar un idioma.
3. Generar múltiples variantes de contenido optimizado.
4. Obtener títulos, descripciones, keywords y prompts de imagen.
5. Exportar un CSV compatible con la plataforma destino.
6. Reutilizar el flujo para producir contenido de forma repetitiva.

El primer módulo validado será Pinterest.
