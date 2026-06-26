# TECHNICAL_DEBT.md

# OmniFlow Technical Debt

Este documento registra las mejoras técnicas de infraestructura que no aportan valor inmediato al usuario.

Estas mejoras no forman parte del roadmap del producto.

Se implementarán cuando el proyecto lo justifique.

---

# Logging

## Estado actual

El proyecto utiliza `console.error()` y `console.warn()` en:

* API routes (generate, generate-images, schedule, generations)
* Lib clients (openrouter/client.ts, openai/image-client.ts)
* Client components (generate-images-button.tsx)

12 llamadas en total.

## Motivo

* MVP con un único desarrollador.
* Sin plataforma de monitorización.
* Suficiente para depuración local.

## Mejora futura

* Logger centralizado con niveles (debug, info, warn, error).
* Logging estructurado (JSON).
* Supresión condicional por entorno (development / production).
* Posible integración con:

```txt
Better Stack
Sentry
Axiom
OpenTelemetry
```

## Prioridad

Baja hasta que existan usuarios en producción.

---

# Next.js Middleware Migration

## Estado actual

El proyecto utiliza el file convention `middleware.ts` para proteger rutas autenticadas.

Next.js 16 marca esta convención como deprecated y recomienda migrar a `proxy`.

## Impacto actual

Warning en el build:

```txt
The "middleware" file convention is deprecated. Please use "proxy" instead.
```

No produce errores funcionales.

## Mejora futura

* Migrar `middleware.ts` a `proxy` siguiendo la documentación oficial de Next.js.
* Evaluar si la nueva API proxy cubre los mismos casos de uso (redirección de rutas no autenticadas).

## Prioridad

Media. Debería abordarse antes de Next.js 17 para evitar breaking changes.

---

# Accessibility Tooling

## Estado actual

La accesibilidad se revisa manualmente.

TASK-019 añadió `aria-label` a botones icon-only y triggers de dropdown.

## Mejora futura

Evaluar la incorporación de:

```txt
eslint-plugin-jsx-a11y
```

como devDependency para detectar problemas de accesibilidad automáticamente durante el desarrollo.

## Prioridad

Baja. El stack actual (Shadcn UI + @base-ui/react) gestiona correctamente focus trapping, keyboard navigation y ARIA roles en componentes base.

---

# Internal Refactoring

Pequeñas mejoras que actualmente no justifican una TASK.

## statusBadgeVariant()

La función `statusBadgeVariant()` existe localmente en `app/(dashboard)/pinterest/[id]/page.tsx`.

Mapea estados de generación a variantes de Badge (success, warning, destructive, secondary).

Es diferente de `statusToVariant()` (que mapea a variantes de StatusDot).

Extraer a utility compartida únicamente cuando exista reutilización real en otros módulos.

Principio aplicado: YAGNI.

## Console statements en Client Components

`components/pinterest/generate-images-button.tsx` contiene un `console.error()`.

Eliminar cuando se implemente el logger centralizado.

---

# Principios

* No crear TASK para mejoras que no aporten valor al usuario.
* Documentar aquí cualquier deuda técnica detectada durante el desarrollo.
* Implementar únicamente cuando el proyecto lo justifique.
* Priorizar siempre funcionalidades del producto sobre refactorizaciones internas.
