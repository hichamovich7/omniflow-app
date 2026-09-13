# TECHNICAL_DEBT.md

# OmniFlow Technical Debt

Este documento registra las mejoras técnicas de infraestructura que no aportan valor inmediato al usuario.

Estas mejoras no forman parte del roadmap del producto.

Se implementarán cuando el proyecto lo justifique.

---

# Pinterest Strategy + Renderer — limites après Phase 6

## État actuel

La dette locale identifiée après Phase 1 est résolue : le renderer mesure la luminosité, le contraste, la variance et l'edge density dans deux zones candidates, applique des safe areas proportionnelles et renforce localement le contraste uniquement si nécessaire. Templates v2 ajoute quatre familles rôle-aware, Phase 5 les sélectionne automatiquement et Phase 6 bloque l'export d'un Headline dont la géométrie, le contraste ou la safe area restent invalides après recomposition locale.

## Limite historique résolue en Phase 4

Le paragraphe suivant décrit l'état constaté avant le Strategy Engine et est conservé comme contexte historique.

Le choix du template reste produit par le mécanisme IA existant puis validé côté serveur ; il n'existe pas encore de Strategy Engine ni de scoring déterministe angle→template. La hiérarchie numérique d'un vrai Listicle n'est pas isolée tant que l'angle n'est pas une donnée fiable. Le moteur ne comprend toujours pas le contenu sémantique : aucune détection de visage, personne, meuble, vêtement ou objet. `visualComplexity` désigne seulement une heuristique locale de variance et d'arêtes. Toute protection sémantique du sujet reste une phase ultérieure distincte, à justifier par une validation produit et une analyse coût/latence.

## Priorité historique

Moyenne pour une future stratégie angle→template mesurable ; basse pour la vision sémantique tant que les tests réels ne montrent pas d'occlusion récurrente. Ne pas ajouter de Vision API préventivement.

---

## Limites actuelles

L'angle est conservé comme métadonnée technique dans le JSON texte `pins.image_analysis`, mais ne possède pas de colonne dédiée : il ne peut donc pas être filtré ou agrégé efficacement dans l'historique et les analytics CTR. Les anciens Pins sans cette métadonnée gardent leur template persisté et ne bénéficient pas d'une nouvelle sélection par angle lors d'une régénération.

Le contrôle de grounding connaît uniquement le mot-clé et le contexte d'analyse, pas le contenu complet d'une URL non analysée. Le moteur ne comprend toujours pas le contenu sémantique de l'image : `visualComplexity` reste une heuristique locale de variance et d'arêtes, sans détection de visage ou d'objet. La diversité est volontairement subordonnée au garde-fou de qualité ; un lot dont toutes les alternatives sont nettement moins lisibles peut donc répéter un bon layout.

Une migration d'angle ne sera justifiée que par un besoin produit d'analytics ou de filtres. La vision sémantique reste basse priorité tant que les tests réels ne montrent pas d'occlusion récurrente.

Le Quality Gate couvre le Headline des Pins `text-overlay` possédant un angle structuré. Le CTA conserve les garanties strictes du renderer Phase 2, et les anciens Pins sans angle suivent leur chemin historique. Les statuts du gate ne sont pas persistés : une observabilité agrégée nécessiterait un besoin produit explicite avant d'ajouter logs structurés ou schéma.

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
