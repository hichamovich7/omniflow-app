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

# WordPress Generation — Synchronous Pipeline Approaching Timeout Ceiling

## Estado actual

`generateWordPressArticle()` / `generateArticleFromPins()` (`lib/wordpress/generate-article.ts`) ejecutan de forma síncrona, dentro de una única request HTTP: outline (AI) → full article (AI, hasta 120s) → featured image (AI) → hasta 3 internal images (AI, Option 1). Las rutas API (`/api/wordpress/generate`, `/api/wordpress/generate-from-pins`) ahora declaran `maxDuration = 180` (Vercel) para dar margen — ver DECISIONS.md 2026-07-18.

## Motivo por el que es deuda, no bug

180s es suficiente hoy, pero el pipeline solo va a crecer: `addExternalLink()` (búsqueda web) añade otra llamada AI con su propio timeout; cualquier paso futuro (más research, más imágenes, un segundo pase de calidad) se apila sobre el mismo request síncrono. Cada vez que un timeout se queda corto, la solución fácil es subirlo — pero eso no escala indefinidamente, y en algún punto la duración total choca con límites de plataforma (Vercel Pro tope real) o con la experiencia de usuario (una request de 2-3 minutos sin feedback intermedio).

Inngest ya está reservado en `.env.local` (`docs/DEPLOYMENT.md` § Inngest Configuration) pero no está conectado a este pipeline.

## Mejora futura

Mover la generación WordPress a un job asíncrono (Inngest): la request HTTP solo encola el trabajo y devuelve inmediatamente (`status: 'processing'`, ya es el modelo actual de `wordpress_generations.status`), un worker ejecuta el pipeline sin límite de duración de función serverless, y el frontend hace polling o se suscribe a la actualización de estado. Esto también abriría la puerta a mostrar progreso por etapa (outline listo → artículo listo → imágenes) en vez de un spinner único.

## Prioridad

Baja, pendiente de confirmación por medición real. El disparador que esta sección anticipaba ya no es hipotético: `addExternalLink()` fue conectada a Option 4 el 2026-07-19 (ver DECISIONS.md), añadiendo una llamada AI más al mismo request síncrono. Eso por sí solo no justifica subir la prioridad — falta el dato que importa: el tiempo total real del pipeline completo (outline + artículo + enlace externo + imagen) en el próximo test end-to-end de Option 4. Si ese total queda lejos de 180s, la prioridad se mantiene Baja; si se acerca al límite (o un timeout llega a dispararse), subir a Media y registrar el resultado aquí.

---

# Principios

* No crear TASK para mejoras que no aporten valor al usuario.
* Documentar aquí cualquier deuda técnica detectada durante el desarrollo.
* Implementar únicamente cuando el proyecto lo justifique.
* Priorizar siempre funcionalidades del producto sobre refactorizaciones internas.
