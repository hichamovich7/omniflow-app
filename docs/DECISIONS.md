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

---

## 2026-07-15

### Decision

Abandon de TASK-027 (Multi-Generator Architecture) comme tâche séparée avant WordPress

### Context

La roadmap prévoyait TASK-027 comme étape d'abstraction générique — extraire une architecture de générateur commune — avant d'attaquer TASK-028 (WordPress Generator). Au moment d'attaquer WordPress, un seul cas concret de générateur existe (Pinterest), avec un format de sortie (pins courts + image) assez différent de WordPress (article SEO long + featured image). Concevoir une abstraction générique sur la base d'un seul exemple revient à deviner l'architecture commune sans donnée réelle pour la valider.

### Decision Taken

TASK-027 n'est pas traitée comme tâche séparée. On passe directement à TASK-028, en réutilisant pragmatiquement l'infrastructure déjà en place et déjà générique (Brand Profile — TASK-022, Content Analyzer — TASK-024, Navigation — TASK-026, Editorial Workflow — TASK-020), et en acceptant de la duplication raisonnable sur la partie générateur elle-même (aujourd'hui spécifique à Pinterest) plutôt que de forcer une abstraction avant d'avoir un deuxième cas concret pour la valider. TASK-028 n'attend donc plus TASK-027.

### Consequences

* docs/TASKS.md : TASK-027 passe au statut DEFERRED (pas annulée) — à reconsidérer une fois WordPress construit, quand les vrais patterns communs entre Pinterest et WordPress seront visibles dans le code plutôt que devinés à l'avance
* docs/TASKS.md : TASK-028 perd sa dépendance sur TASK-027 et peut démarrer immédiatement
* Le code du générateur Pinterest (prompts, structure de sortie) sert de modèle à dupliquer/adapter pour WordPress, pas de base à généraliser immédiatement
* Une éventuelle abstraction future (si TASK-027 est reprise) sera informée par deux implémentations réelles au lieu d'une hypothèse

---

## 2026-07-15

### Decision

Ajout de la librairie `marked` pour la conversion Markdown → HTML (TASK-028)

### Context

TASK-028 (WordPress Generator, Option 1) stocke le contenu généré en Markdown (source de vérité) et doit l'exporter en HTML copiable, sans passer par la Rest API WordPress. Aucune librairie de conversion Markdown→HTML n'existe dans le projet (vérifié dans `package.json`). Le stack visuel autorisé (RULES.md Rule #30 : Tailwind, Shadcn, Lucide, Sonner) ne couvre pas ce besoin — ce n'est pas une librairie visuelle mais un utilitaire de transformation de contenu, appelé uniquement côté serveur/`lib/`.

### Decision Taken

Ajout de `marked` (dépendance de production, zéro dépendance transitive, empreinte minime, API synchrone à un seul appel `marked.parse()`). Alternatives écartées : `markdown-it` (empreinte comparable mais API à plugins plus lourde que nécessaire ici), `remark`/`unified` (écosystème multi-packages, largement surdimensionné pour un simple Markdown→HTML). Utilisé exclusivement dans `lib/wordpress/export.ts` (`exportToHtml()`), jamais appelé depuis un composant.

### Consequences

* `package.json` : ajout de `marked` aux `dependencies`
* Conçu pour être réutilisé par tout futur générateur de contenu long (pas seulement WordPress), au même titre que `seo-guidelines.ts`

---

## 2026-07-15

### Decision

Restructuration éditoriale de l'article WordPress vers une architecture AEO à 10 blocs (TASK-028)

### Context

La structure initiale de TASK-028 Option 1 (H1, intro, sections H2 génériques, target 800-1200 mots) a été validée qualitativement lors d'un premier test (voir corrections du même jour sur la répétition du titre, la fuite d'alt texts dans le corps, et les sections trop courtes), mais jugée incomplète pour l'optimisation AEO (Answer Engine Optimization) moderne : pas de bloc pensé pour être cité tel quel par un featured snippet ou une IA (Quick Answer), pas de résumé scannable (Key Takeaways), pas de FAQ structurée exploitable en schema.org, et une longueur cible trop courte pour développer 8-10 sections avec une vraie valeur éditoriale.

### Decision Taken

L'article suit désormais une structure fixe à 10 blocs : H1 → Introduction (3-4 paragraphes) → Quick Answer (40-60 mots, citable tel quel) → Key Takeaways (4-6 puces) → Main Content (8-10 sections H2, 150-200+ mots chacune) → Comparison Table (conditionnelle, décidée à l'étape outline via `includeComparisonTable` + `comparisonTableReason`, jamais forcée) → Common Mistakes (3-5 items) → FAQ (4-6 questions, retournée uniquement en JSON structuré `{question, answer}[]`, jamais en texte libre dans le Markdown) → Conclusion → Soft CTA (ton adapté au Brand Profile, pas une phrase fixe). Cible de longueur globale relevée à 1800-2500 mots.

L'outline (étape 1) ne fait que planifier chaque bloc (angle, thèmes, décision comparison table, questions FAQ) ; l'article (étape 2) rédige le contenu complet et retourne en plus les champs structurés `quickAnswer`, `keyTakeaways[]`, `comparisonTable` (nullable), `commonMistakes[]` et `faq[]` en parallèle du Markdown `content` — ces champs dupliquent volontairement ce qui est écrit dans `content` (sauf FAQ, absente du Markdown) pour rendre la donnée exploitable plus tard (schema.org FAQPage, meta snippets) sans dépendre d'un parsing du Markdown.

Seuls les prompts (`lib/ai/prompts/seo-guidelines.ts`, `wordpress-outline-prompt.ts`, `wordpress-article-prompt.ts`) et le schéma Zod (`lib/validations/wordpress.ts`) ont été mis à jour. `lib/wordpress/generate-article.ts` reste inchangé à l'exception des deux constantes `OUTLINE_MAX_TOKENS`/`ARTICLE_MAX_TOKENS`, relevées pour éviter une troncature JSON avec la nouvelle cible de longueur — l'orchestration des images et le système de rôles IA (TEXT_ROLE) ne sont pas touchés.

### Consequences

* Les nouveaux champs structurés (`quickAnswer`, `keyTakeaways`, `comparisonTable`, `commonMistakes`, `faq`) sont validés par Zod et présents dans la réponse IA, mais **pas encore persistés séparément** en base ni rendus dans l'UI — seul `content` (qui n'inclut pas le FAQ) est stocké et affiché aujourd'hui, comme avant. Le câblage DB/UI de ces champs (schema.org FAQPage compris) reste à faire dans une tâche séparée
* `wordpress_generations`/`wordpress_articles`/`wordpress_article_images` (migration 012) ne changent pas — aucune migration nécessaire pour cette étape
* Génération plus longue (budget de tokens texte doublé) — impact attendu sur la latence totale d'une génération, à mesurer au prochain test

---

## 2026-07-15

### Decision

Première capacité de tool-calling dans l'AI Engine : recherche web OpenRouter pour un lien externe unique et vérifié (TASK-028)

### Context

L'article WordPress généré ne contenait jusqu'ici que des liens internes différés (pas encore possibles sans connexion au site WordPress cible) et aucun lien externe — un contenu SEO long sans aucune source externe citée est un signal de qualité faible. La contrainte non négociable : jamais d'URL inventée par le modèle. Cela exige une vérification réelle, donc un appel à un outil de recherche web plutôt qu'une génération de texte pure — la première fois que `lib/ai/` doit transporter un appel d'outil (tool-calling) et pas seulement un prompt texte/image.

### Decision Taken

Ajout d'un type `AITool` générique dans `lib/ai/types.ts` (`WebSearchTool { type: 'openrouter:web_search', parameters: { max_results } }`), transporté par `generateText()` (`lib/ai/services/text.ts`) exactement comme `role`/`messages`/`maxTokens` — le code métier ne parle jamais directement à OpenRouter (Rule #10 respectée). La traduction vers le format réel d'OpenRouter (`plugins: [{ id: "web", max_results }]`, plugin Exa côté gateway, $4/1000 résultats — donc indépendant du support natif de tool-calling du modèle sous-jacent) est confinée à `lib/ai/providers/openrouter.ts`, seul fichier qui connaît cette forme.

Nouveau fichier `lib/ai/services/external-link.ts` (`addExternalLink(articleContent, topic, language)`) : un unique appel `generateText({ role: 'FAST', tools: [...] })` demande au modèle de chercher une source réelle et de retourner l'article complet avec un lien Markdown inséré naturellement dans une phrase existante, ou `linkFound: false` si aucune source pertinente n'est trouvée. Toute défaillance (modèle FAST configuré incompatible avec le plugin web, erreur réseau, JSON invalide) est absorbée par un `try/catch` qui renvoie l'article inchangé — pas de test de compatibilité séparé en amont (un aller-retour dédié doublerait le coût/latence par article sans bénéfice mesurable) ; le call réel fait office de test, en échouant proprement. Le nom du modèle FAST n'est jamais hardcodé — lu via `getRoleConfig('FAST')` / `AI_FAST_MODEL` comme partout ailleurs.

Intégré dans `lib/wordpress/generate-article.ts` entre la rédaction de l'article et la génération des images, avant la résolution des marqueurs `{{IMAGE_N}}` — l'orchestration image et `TEXT_ROLE` ne sont pas touchés.

### Consequences

* `lib/ai/types.ts`, `lib/ai/services/text.ts`, `lib/ai/providers/openrouter.ts` : signature étendue avec un `tools?: AITool[]` optionnel, rétrocompatible — tout appelant existant qui n'en passe pas continue de fonctionner à l'identique
* Coût marginal : ~$0.004 par article (3 résultats de recherche à $4/1000) — négligeable face au coût des appels texte/image existants
* La source utilisée est loggée séparément (`console.info`) pour audit mais **pas persistée** en base — aucune colonne ajoutée à `wordpress_articles`, cohérent avec la décision précédente de ne pas étendre le schéma DB dans cette étape
* Timeout OpenRouter porté à 90s (au lieu de 60s) uniquement quand un plugin est actif — la recherche web ajoute une latence gateway avant même que la génération ne commence
* Les liens internes restent explicitement hors scope tant que la connexion WordPress (accès aux pages existantes du site cible) n'existe pas

**Correctif 2026-07-17** : un premier test a produit un lien externe en 404. Cause : la vérification annoncée dans le prompt ("verify the source is real... never invent") reposait entièrement sur la déclaration du modèle, sans aucun contrôle côté serveur — le modèle peut mal recopier une URL réelle ou citer une page qui a bougé depuis son entraînement, même avec la recherche web activée. `addExternalLink()` fait désormais un vrai contrôle HTTP (HEAD, puis GET en repli pour les serveurs qui rejettent HEAD, timeout 8s) avant d'accepter le lien ; si l'URL ne répond pas en 2xx, seul le lien Markdown `[texte](url)` est retiré (le texte d'ancrage est conservé), pas tout l'article. Le prompt a aussi été renforcé ("copy the URL exactly as returned... do not retype or reconstruct from memory").
