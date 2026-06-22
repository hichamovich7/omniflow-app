# PROJECT.md

# OmniFlow

## Product Overview

OmniFlow es una plataforma impulsada por IA diseñada para acelerar la creación de contenido para Pinterest.

El sistema permite generar múltiples variantes de pines optimizados para SEO en Pinterest a partir de una palabra clave, una URL o una imagen de referencia.

El objetivo principal es reducir el tiempo necesario para investigar, redactar y preparar contenido Pinterest listo para publicar.

Durante el MVP, OmniFlow no publicará directamente en Pinterest. En su lugar, generará un archivo CSV compatible con Pinterest Bulk Upload para permitir la programación y publicación masiva de contenido.

---

# Problem Statement

Los creadores de contenido y propietarios de blogs invierten una gran cantidad de tiempo en:

* Buscar ideas de contenido para Pinterest.
* Crear múltiples variantes de títulos.
* Redactar descripciones optimizadas.
* Investigar palabras clave relacionadas.
* Diseñar prompts para generar imágenes.
* Preparar archivos CSV para programación masiva.

La mayoría de herramientas existentes cubren solo una parte del proceso.

OmniFlow centraliza este flujo en una única plataforma.

---

# Product Goal

Permitir que un usuario genere contenido Pinterest listo para publicar en menos de cinco minutos.

---

# Target Users

* Bloggers
* Affiliate Marketers
* Niche Site Owners
* Pinterest Creators
* SEO Specialists
* Content Agencies

---

# MVP Scope

## Input Methods

El usuario podrá iniciar una generación utilizando una de las siguientes opciones:

### Keyword Input

Ejemplo:

* badezimmer inspiration schrank
* small bathroom ideas
* recettes healthy faciles

### Pinterest URL Input

URL de un pin existente para utilizarlo como inspiración.

### Website URL Input

URL de una página o artículo para generar contenido Pinterest relacionado.

### Reference Image Input

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

El usuario podrá definir una fecha y hora de publicación.

La fecha seleccionada será incluida en el CSV exportado para permitir la programación de contenido dentro de Pinterest.

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

# Credits System

OmniFlow utilizará un sistema de créditos.

Cada generación consumirá créditos según la cantidad de contenido generado.

Si el usuario no dispone de créditos suficientes, la generación será bloqueada.

La lógica exacta de consumo será definida en una fase posterior.

---

# AI Providers

La plataforma utilizará OpenRouter como capa de acceso a modelos de IA.

Esto permitirá utilizar distintos proveedores según coste, calidad y disponibilidad.

Ejemplos:

* OpenAI
* Anthropic
* Google
* DeepSeek
* Mistral

La selección del modelo deberá ser configurable desde el backend.

---

# Storage

Las imágenes y archivos generados deberán ser compatibles con Supabase Storage.

Aunque el MVP inicial permite exportar CSV sin alojar imágenes automáticamente, la arquitectura deberá prepararse para soportar almacenamiento de imágenes en futuras versiones.

---

# Out Of Scope (MVP)

Las siguientes funcionalidades no forman parte del MVP:

* Publicación directa en Pinterest
* Pinterest OAuth
* Pinterest API
* WordPress Publishing
* SEO Article Generation
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
3. Generar múltiples variantes de pines.
4. Obtener títulos, descripciones, keywords y prompts de imagen.
5. Exportar un CSV compatible con Pinterest.
6. Reutilizar el flujo para producir contenido Pinterest de forma repetitiva.
