# TESTING.md

# Testing Strategy

Objetivo:

Garantizar que cada funcionalidad funciona correctamente antes de considerarse completada.

Ninguna tarea puede marcarse como completada sin ejecutar las pruebas correspondientes.

---

# Testing Philosophy

Prioridades:

1. Funcionalidad
2. Seguridad
3. Integridad de datos
4. UX
5. Rendimiento

---

# Definition Of Done

Una tarea se considera terminada únicamente cuando:

* Código implementado
* Sin errores TypeScript
* Sin errores ESLint
* Pruebas ejecutadas
* Resultado validado manualmente
* TASKS.md actualizado

---

# Global Smoke Tests

Ejecutar antes de cada deploy.

---

## Authentication

### Login

Verificar:

```txt id="8mvnx6"
Usuario puede iniciar sesión
```

---

### Logout

Verificar:

```txt id="5lqdf6"
Usuario puede cerrar sesión
```

---

### Protected Routes

Verificar:

```txt id="hyq9v9"
Usuario no autenticado es redirigido
```

---

# Database Tests

---

## RLS Validation

Verificar:

```txt id="kkwyax"
Usuario A no puede acceder a datos de Usuario B
```

---

## Ownership Validation

Verificar:

```txt id="rl6ub9"
No se pueden consultar recursos ajenos
```

---

## Foreign Keys

Verificar:

```txt id="yc0gzs"
No existen registros huérfanos
```

---

# Projects Module

---

## Create Project

Verificar:

```txt id="b8n1ot"
Proyecto creado correctamente
```

---

## Update Project

Verificar:

```txt id="jshb0r"
Proyecto actualizado correctamente
```

---

## Delete Project

Verificar:

```txt id="ujdfje"
Proyecto eliminado correctamente
```

---

## Project Ownership

Verificar:

```txt id="qrlgbi"
No se pueden modificar proyectos ajenos
```

---

# Content Analyzer

---

## Analyze Button

Verificar:

```txt id="ca01an"
Botón "Analyze" visible tras un Research exitoso
Botón deshabilitado/spinner mientras se analiza
Panel estructurado (Theme, Category, Audience, Tone, Keywords, Summary) se muestra al finalizar
```

---

## Idempotency

Verificar:

```txt id="ca02id"
Re-analizar el mismo research result devuelve el análisis existente sin re-llamar a la IA
```

---

## Ownership & Status Guard

Verificar:

```txt id="ca03ow"
researchResultId de otro usuario es rechazado (400), no filtrado
research_results con status "failed" no puede analizarse
```

---

## Generation Wiring

Verificar:

```txt id="ca04ge"
"Continue to Generate" tras Analyze añade analysisId a la URL de /pinterest
Indicador "Using content analysis from Research" visible en el formulario de Pinterest cuando aplica
Pins generados reflejan el theme/audience/tone del análisis
```

---

## Backward Compatibility

Verificar:

```txt id="ca05bc"
Generación directa por keyword (sin Research/Analyze) sigue funcionando sin cambios
analysisId ausente no rompe la generación
```

---

# Pinterest Generator

---

## Required Fields

Verificar:

```txt id="7ubf8w"
Keyword obligatoria
Language obligatorio
Pins Requested obligatorio
```

---

## Generation Request

Verificar:

```txt id="cxqjvt"
Generación iniciada correctamente
```

---

## OpenRouter Response

Verificar:

```txt id="bvw7z4"
Respuesta JSON válida
```

---

## Pins Quantity

Verificar:

```txt id="x7gq8i"
1 Pin
5 Pins
10 Pins
20 Pins
30 Pins
```

Generados correctamente.

---

## Language Validation

Verificar:

```txt id="l7j3m2"
English
Deutsch
Español
Français
```

Contenido generado en idioma correcto.

---

## Character Limits

Verificar:

```txt id="rfjv7g"
Title <= 100
Description <= 500
```

---

## Keywords

Verificar:

```txt id="1ydk5m"
10-15 keywords relevantes
```

---

## Board Suggestion

Verificar:

```txt id="hfqudx"
Board generado correctamente
```

---

# Image Analysis

---

## Upload

Verificar:

```txt id="4u3m1z"
PNG
JPG
WEBP
```

Aceptados correctamente.

---

## Analysis

Verificar:

```txt id="xhj4l8"
Image Analysis generado
Image Prompt generado
```

---

## Invalid File

Verificar:

```txt id="y6rj7v"
Archivo inválido rechazado
```

---

# CSV Export

---

## Download

Verificar:

```txt id="4y7ec7"
CSV descargado correctamente
```

---

## Column Order

Verificar:

```txt id="yj2b5t"
Title
Media URL
Pinterest board
Description
Link
Publish date
Keywords or tags
```

---

## Encoding

Verificar:

```txt id="o7rlg5"
UTF-8 BOM
```

---

## Pinterest Compatibility

Verificar:

```txt id="z0qf3q"
CSV importable en Pinterest
```

---

# Credits System

---

## Sufficient Credits

Verificar:

```txt id="1n2h7u"
Generación permitida
```

---

## Insufficient Credits

Verificar:

```txt id="p5d8zj"
Generación bloqueada
```

---

## Credit Consumption

Verificar:

```txt id="t1j6n4"
Balance actualizado correctamente
```

---

## Transaction Log

Verificar:

```txt id="r7h4xa"
Movimiento registrado
```

---

# Stripe

---

## Checkout

Verificar:

```txt id="r9j2vx"
Checkout creado correctamente
```

---

## Successful Payment

Verificar:

```txt id="1w5qbg"
Créditos añadidos
```

---

## Failed Payment

Verificar:

```txt id="w0h7yb"
No se añaden créditos
```

---

# Storage

---

## Reference Images

Verificar:

```txt id="d3k8tx"
Imagen almacenada correctamente
```

---

## CSV Exports

Verificar:

```txt id="o6x1zp"
Archivo exportado correctamente
```

---

# Performance Tests

---

## Pinterest Generation

Objetivo:

```txt id="x8y7uq"
< 30 segundos
```

para 10 pines.

---

## Dashboard

Objetivo:

```txt id="l9g4mr"
< 2 segundos
```

para carga inicial.

---

# Pre-Release Checklist

Antes de producción:

```txt id="s4f6dx"
Auth Working
RLS Verified
Projects Working
Generation Working
CSV Export Working
History Working
Credits Working
Stripe Working
Storage Working
No TypeScript Errors
No ESLint Errors
```

---

# Rules For AI Agents

Antes de marcar una tarea como completada:

1. Implementar funcionalidad.
2. Ejecutar pruebas relevantes.
3. Verificar criterios de éxito.
4. Actualizar TASKS.md.

Si alguna prueba falla:

```txt id="6j8zvt"
La tarea NO está completada.
```
