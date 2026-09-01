# DECISIONS.md

# Architecture Decision Log

Este documento registra las decisiones importantes tomadas durante el desarrollo de OmniFlow.

No eliminar decisiones antiguas.

Añadir nuevas entradas cronológicamente.

---

## 2026-09-01

### Decision

TASK Pinterest : framework Impression → Curiosité → Promesse → Clic (ICPC) dans title/description (pinterest-pins-v5 → v6)

### Context

Constat sur les générations Pinterest existantes : des pins avec de bonnes impressions mais un clic sortant faible, parce que le title et la description répondaient déjà entièrement à leur propre promesse dans le texte (le numéro, la technique ou la réponse exacte étaient donnés avant même le clic) — rien ne restait à découvrir sur l'épingle elle-même, donc aucune raison de cliquer vers l'article. La règle title précédente ("must be compelling and include the main keyword naturally") ne structurait aucun angle rédactionnel ; la règle description précédente demandait un CTA générique sans contrainte anti-spoiler.

### Decision Taken

`lib/prompts/pinterest-pins.ts` passe de `pinterest-pins-v5` à `pinterest-pins-v6` :
1. La règle title est remplacée par une instruction à 5 angles avec exemples concrets (Curiosity, Problem→Solution, Listicle, Discovery, Article Promise), en gardant le mot-clé principal inclus naturellement et la limite 100 caractères.
2. Nouvelle règle de variation : l'angle de title doit varier à travers les pins d'une même génération (chaque angle utilisé au plus deux fois avant répétition), sur le même principe que la variation déjà en place pour l'image_prompt (setting/objets/palette/angle caméra).
3. La règle description est remplacée par l'instruction ICPC complète : donner assez d'information pour susciter l'intérêt sans jamais révéler la technique/le chiffre/la réponse exacte de l'article, se terminer sur une boucle ouverte que seul le clic résout, CTA orienté découverte ("see how", "find out which") plutôt que réénoncé du contenu. Limite 500 caractères conservée.
4. Garde-fou explicite ajouté en fin de Rules : vérification anti-fuite avant de finaliser la sortie — si title + description révèlent ensemble la réponse complète, réécrire la description pour retirer le détail qui spoile, sans perdre en accroche.

Périmètre volontairement limité : aucune modification des règles niche (`framingMode`/`styleGuidance`, lignes ~77-96), du texte-overlay (~100-109), de la variation d'image_prompt (~129 avant patch), ni du champ `keywords` (spec du champ, règle no-duplicates, contrainte de langue, schéma JSON de sortie). Le référencement interne Pinterest (keywords) n'est pas affecté par ce changement — c'est un champ indépendant du title/description dans le prompt, non dérivé de leur contenu.

### Consequences

* `PROMPT_ID` passe à `pinterest-pins-v6` — traçabilité pour un futur A/B test ou rollback vers v5 si le taux de clic sortant ne s'améliore pas
* Les titles doivent maintenant piocher parmi 5 angles nommés plutôt qu'une formule libre — attendu : plus de diversité stylistique visible à travers un batch de pins généré en une fois
* Les descriptions ne doivent plus "spoiler" leur propre title — risque à surveiller : un modèle qui respecte mal la consigne anti-fuite pourrait produire des descriptions vagues au point de perdre en pertinence SEO ; le garde-fou de vérification en fin de prompt vise à limiter ce risque mais reste une instruction déclarative, pas un contrôle programmatique côté serveur
* Keywords, board, image_prompt, niche conventions et texte-overlay : comportement inchangé, aucune régression attendue sur le référencement Pinterest interne
* Checkpoint git avant ce changement : tag `20260901` sur `8dceaf7` (poussé sur origin)

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

Ce correctif n'est pas considéré clos — un traitement complémentaire est prévu séparément. `lib/ai/services/external-link.ts` n'a pas été touché par Option 4 (voir entrée suivante) : `generateArticleFromPins()` n'appelle pas `addExternalLink()` du tout, précisément pour ne pas mélanger ce correctif en cours avec la nouvelle fonctionnalité.

---

## 2026-07-17

### Decision

TASK-028 : nouvelle Option "Pins Pinterest sélectionnés → article unifié" nommée Option 4, pas Option 3

### Context

La demande initiale faisait référence à cette fonctionnalité comme "Option 3", mais TASKS.md réservait déjà ce nom à une idée distincte et non implémentée : "Blog URL → Rewritten/Optimized Article" (réutilisation possible de Research `source_type: 'blog'` et du Content Analyzer). La fonctionnalité "pins sélectionnés" ne correspond à aucune des Options 2/3 déjà documentées. Par la règle d'or d'AGENT.md ("quand documentation et code sont en désaccord, la documentation fait foi") et la règle "ne pas inventer de fonctionnalité produit sans clarification", ce conflit a été soumis à l'utilisateur avant implémentation plutôt que résolu silencieusement.

### Decision Taken

Créée en tant qu'**Option 4** dans TASKS.md, laissant Option 2 (Image → Article) et Option 3 (Blog URL → Article réécrit) intactes et toujours PLANNED. Le code (route API, composants) utilise également ce nom : `/api/wordpress/generate-from-pins`, pas de références à "Option 3" dans les commentaires ou l'UI.

### Consequences

* Une future implémentation de l'Option 3 (Blog URL) n'entrera pas en conflit de nommage avec cette fonctionnalité
* `source_type` sur `wordpress_generations` reste `'pins'` (déjà réservé par la contrainte CHECK de la migration 012, qui anticipait cette valeur sans l'implémenter) — aucun changement de schéma nécessaire au-delà de `source_pin_ids`

---

## 2026-07-17

### Decision

TASK-028 (Option 4) : image mise en avant toujours régénérée, images internes toujours réutilisées telles quelles

### Context

Pour un article de synthèse basé sur plusieurs pins, deux approches étaient possibles pour l'image mise en avant (featured image) : réutiliser l'image d'un des pins sélectionnés, ou en générer une nouvelle. Réutiliser l'image d'un pin poserait un problème éditorial : cette image a été conçue pour représenter *un seul* pin (un angle spécifique), pas le thème unifié de l'article de synthèse — elle serait donc thématiquement incohérente avec un article qui couvre plusieurs pins à la fois. À l'inverse, régénérer les images internes (2-3 images déjà existantes et déjà payées en crédits IA lors de la génération Pinterest) serait un gaspillage direct de crédits pour un résultat visuellement redondant.

### Decision Taken

Séparation stricte : la featured image est **toujours** générée via `generateImage()` (rôle IMAGE) à partir d'un prompt décrivant le thème unifié de l'article (jamais un pin en particulier) ; les images internes (jusqu'à 3) sont **toujours** les images actives déjà générées des pins sélectionnés (`pin_images.is_active = true`), copiées par URL Supabase Storage existante — sans nouvel appel `generateImage()`, sans re-upload.

### Consequences

* Coût IA par génération Option 4 : un seul appel `generateImage()` (featured) au lieu de 3-4 (Option 1) — économie de crédits directe, cohérente avec le fait que les images internes existent déjà
* Si un pin sélectionné n'a pas d'image active (jamais générée, ou toutes les versions supprimées), il ne fournit simplement pas d'image interne — le nombre d'images internes de l'article peut donc être inférieur à 3, y compris 0 ; `buildWordpressPinsOutlineSchema` accepte cette plage 0-3 (contrairement à l'Option 1, qui exige toujours 2-3)

---

## 2026-07-18

### Decision

TASK-028 : titre H1 séparé du meta title SEO, troncature déterministe à une limite de mot plutôt que retry sur dépassement de longueur

### Context

`wordpressOutlineSchema.title` imposait `max(70)`, rejeté par Zod dès que le modèle dépassait cette limite — observé en reproduisant le flux "10 pins Küchen" (Option 4) : le modèle a produit un titre allemand de 80 caractères ("Moderne Küchenplanung und Innenarchitektur: zeitlose Materialien & clevere Zonen"), l'outline entier a été rejeté, et l'échec est remonté au frontend comme "AI returned an invalid outline format. Try again." — un message générique qui masque une cause parfaitement déterministe. Le prompt demandait déjà "max 70 characters" ; le modèle ne le respecte pas de façon fiable, un problème de comptage de caractères LLM connu pour être plus marqué sur les langues aux mots composés longs (allemand) mais pas spécifique à l'allemand — n'importe quelle langue peut produire un dépassement ponctuel. Un simple correctif de la limite Zod (ex: passer à 90) aurait seulement déplacé le seuil de rejet, pas supprimé le mode de défaillance ; un retry sur le modèle aurait ajouté de la latence/coût sans garantie de succès (rien n'empêche un deuxième dépassement).

### Decision Taken

Deux changements structurels combinés :
1. **Séparation title (H1) / metaTitle (SEO)** — `title` (affiché en H1 sur la page) passe à `max(100)`, généreux et rarement atteint ; `metaTitle` (nouveau champ, `<title>`/SERP, stocké dans `wordpress_articles.meta_title`, nullable, migration 015) reste à la limite stricte SEO de 70, avec repli sur `title` tronqué si le modèle omet le champ.
2. **Troncature déterministe avant validation** — `truncateAtWordBoundary()` (`lib/utils/text-truncate.ts`, coupe à la dernière limite de mot complet, jamais en plein mot, sans "...") est appliquée à `title`, `metaTitle`, `slug` et `metaDescription` sur la sortie brute du modèle, avant que `wordpressOutlineSchema` ne la valide. Les `max()` Zod deviennent un garde-fou inatteignable plutôt qu'un vrai mode d'échec : `safeParse` ne peut plus jamais rejeter pour dépassement de longueur, uniquement pour de vraies erreurs de structure (champs manquants, mauvais types). Le prompt garde son instruction de longueur (utile pour réduire la fréquence des dépassements et donc les coupes visibles) mais précise désormais que le système corrige automatiquement un dépassement, pour que le modèle écrive naturellement plutôt que de sacrifier la qualité rédactionnelle pour tenir un compte de caractères qu'il maîtrise mal.

### Consequences

* Le message "AI returned an invalid outline format. Try again." ne peut plus être déclenché par un dépassement de longueur, dans aucune langue — seulement par une vraie erreur de structure JSON/schéma
* Les articles générés avant la migration 015 n'ont pas de `meta_title` en base ; `getMetaTitle()` (`lib/wordpress/export.ts`) calcule un repli à l'affichage/export (`title` tronqué à 70) plutôt que de nécessiter un backfill
* `slug` gagne une limite explicite (`max(100)`, alignée sur `title`) qu'il n'avait jamais eue — sans dépendance à un espace pour couper proprement, la troncature retire un trait d'union final résiduel après la coupe pour rester conforme à la regex du slug
* S'applique identiquement à l'Option 1 (`generateWordPressArticle`) et l'Option 4 (`generateArticleFromPins`) — un seul point de troncature partagé (`applyOutlineTextLimits()` dans `lib/wordpress/generate-article.ts`), pas de logique dupliquée entre les deux pipelines

---

## 2026-07-18

### Decision

TASK-028 : timeout OpenRouter paramétrable par appel (au lieu d'un timeout fixe partagé), timeout généreux dédié à l'étape de rédaction complète de l'article

### Context

En reproduisant le flux "10 pins Küchen" (Option 4) après le correctif de longueur de titre ci-dessus, l'outline passait désormais la validation Zod (16.5s, confirmé par un log de timing ajouté pour l'occasion), mais la génération échouait toujours — cette fois avec `AbortError: This operation was aborted`, exactement 60023ms après la fin de l'outline. `chatCompletionOnce()` (`lib/ai/providers/openrouter.ts`) appliquait un timeout fetch unique et partagé (`plugins ? 90000 : 60000`) à *tous* les appels texte, qu'il s'agisse d'un outline léger (3000 tokens max, ~15-20s en pratique) ou de la rédaction complète de l'article (8000 tokens max, structure 10-blocs, cible 1800-2500 mots, ~60-90s en pratique). Le seuil de 60s convient au premier mais coupe systématiquement le second avant qu'il ait fini d'écrire. Sans rapport avec le correctif de longueur de titre — un problème de timeout distinct et préexistant, qui touche potentiellement aussi l'Option 1 (même prompt article, même timeout partagé).

### Decision Taken

`timeoutMs` devient un paramètre optionnel traversant `generateText()` → `chatCompletion()` → `chatCompletionOnce()`, avec le comportement par défaut (60s / 90s si plugins de recherche web) inchangé quand il n'est pas fourni — les appels légers (outline WordPress, génération Pinterest FAST, `addExternalLink()`) gardent leur échec rapide en cas de vrai problème, pas de dégradation de leur détection de panne. Seul l'appel de rédaction complète de l'article (`buildWordPressArticlePrompt`, utilisé identiquement par Option 1 et Option 4) passe désormais `timeoutMs: ARTICLE_GENERATION_TIMEOUT_MS` (120000ms), une constante dédiée dans `lib/wordpress/generate-article.ts` avec commentaire expliquant la mesure (~60-90s réels) qui justifie la marge.

En préparation du déploiement Vercel (pas encore effectif, aucun effet en dev local) : `export const maxDuration = 180` ajouté sur les deux routes API WordPress, documenté dans DEPLOYMENT.md comme nécessitant le plan Vercel Pro (le plan Hobby plafonne à 60s, quelle que soit la valeur de `maxDuration`).

### Consequences

* Le pipeline Option 4 "10 pins Küchen" testé de bout en bout à nouveau après ce correctif — voir résultat du test dans la conversation
* Ce n'est qu'un sursis, pas une solution durable : `addExternalLink()` (recherche web, actuellement désactivé pour Option 4, en attente de réactivation) ajoutera un appel AI de plus sur ce même pipeline synchrone, et chaque futur ajout rapprochera la durée totale du plafond de 180s. Empiler des timeouts de plus en plus généreux n'est pas extensible indéfiniment — un passage à un traitement asynchrone (Inngest, déjà réservé dans `.env.local` mais non connecté à ce pipeline) sera nécessaire à terme. Noté comme dette technique, pas comme correctif immédiat — voir TECHNICAL_DEBT.md

---

## 2026-07-19

### Decision

TASK-028 : réactivation d'`addExternalLink()` sur Option 4 (`generateArticleFromPins`)

### Context

Complète l'entrée du 2026-07-15 ci-dessus. Ce correctif (vérification HTTP réelle avant insertion du lien, cf. "Correctif 2026-07-17" dans cette même entrée) avait volontairement été laissé hors de l'Option 4 — `generateArticleFromPins()` n'appelait pas `addExternalLink()`, avec un commentaire explicite dans le code renvoyant au correctif en cours, précisément pour ne pas mélanger un correctif encore récent avec la nouvelle fonctionnalité Option 4. Le commentaire n'a jamais été retiré une fois le correctif stabilisé, laissant Option 4 sans lien externe alors que plus rien ne s'y opposait.

### Decision Taken

`addExternalLink()` est désormais appelée dans `generateArticleFromPins()` au même point du pipeline que dans l'Option 1 : après validation de l'article, avant la résolution des marqueurs `{{IMAGE_N}}`. Le commentaire obsolète de la docstring de la fonction est retiré. `docs/TASKS.md` mis à jour en conséquence.

### Consequences

* Option 4 gagne le même lien externe best-effort que l'Option 1, avec le même comportement en cas d'échec (article retourné inchangé, aucun blocage du pipeline)
* Ajoute un appel AI supplémentaire (recherche web) au pipeline synchrone d'Option 4 — le risque anticipé dans l'entrée du 2026-07-18 ("chaque futur ajout rapprochera la durée totale du plafond de 180s") se matérialise concrètement ici. Voir TECHNICAL_DEBT.md pour la réévaluation de priorité qui en découle, à confirmer par les temps réels du prochain test bout-en-bout d'Option 4

---

## 2026-07-26

### Decision

TASK-032 : Catégories WordPress — assignation toujours manuelle, aucune suggestion IA

### Context

Les deux flux de génération WordPress (Option 1 keyword, Option 4 pins) manquaient d'un moyen d'organiser les articles par sujet. Contrairement aux boards Pinterest (`findOrCreateBoardIds` auto-lie des noms suggérés par l'IA), l'utilisateur a explicitement demandé qu'aucune IA n'intervienne dans l'assignation de catégorie, sur aucun des deux flux — un choix de curation délibéré, pas une automatisation.

### Decision Taken

`wordpress_categories` est une table scopée par `project_id` (même pattern RLS que `boards` : colonne `user_id` dénormalisée, policy `user_id = auth.uid()`). `wordpress_articles.category_id` est nullable avec `ON DELETE SET NULL` — supprimer une catégorie ne supprime jamais les articles qui l'utilisaient, ils retombent sur "Uncategorized". Le sélecteur de catégorie (`components/wordpress/category-select.tsx`) est un simple champ de formulaire manuel, au même niveau que Project/Language — aucun appel OpenRouter, aucune suggestion, aucun préremplissage automatique. La création/renommage/suppression de catégorie se fait via un petit Dialog accessible depuis le sélecteur lui-même (pas de page dédiée), cohérent avec le principe de changements minimaux du projet.

### Consequences

* Deux nouvelles routes API (`/api/wordpress/categories`, `/api/wordpress/categories/[id]`) suivant le pattern de vérification d'ownership inline établi par TASK-018 (`select('id, user_id') → 404 → 403`), sans introduire de helper partagé — cohérent avec le choix déjà fait pour `boards`/`projects`
* Le flux pins (`pins-source-article-form.tsx`) n'a pas de champ Project explicite — le project est résolu côté serveur depuis la génération source des pins pour scoper la liste de catégories, sans ajouter de champ superflu au formulaire
* Aucun changement à `buildWordPressFromPinsPrompt` ni aux schémas d'outline — la catégorie ne touche jamais le pipeline IA

---

## 2026-07-26 (2)

### Decision

Cadrage conditionnel des `image_prompt` Pinterest selon le type de mot-clé (espace/pièce vs objet/détail)

### Context

Les mots-clés de type "inspiration [pièce]" (ex: "Küchen Inspiration modern") produisaient systématiquement des images en gros plan/nature morte sur un détail (plan de travail, évier, objets) plutôt qu'une vue d'ensemble de la pièce — alors que le mot-clé et le contexte (Pinterest, inspiration déco) appellent clairement un plan large. Cause identifiée dans `lib/prompts/pinterest-pins.ts` : l'instruction `image_prompt` demandait "the main subject front and center" + "3-5 supporting objects or details" sans jamais distinguer si le sujet est une pièce entière ou un objet, et la liste d'angles de caméra autorisés incluait `close-up` sans condition.

### Decision Taken

`lib/prompts/pinterest-pins.ts` classifie désormais le `keyword` avant construction du prompt via une règle déterministe (`classifyPinComposition`, pas d'appel IA supplémentaire) : présence d'un nom de pièce **ET** d'un mot d'intention design ("inspiration"/"ideen"/"design"/"style"/...) dans les 4 langues supportées (en/de/es/fr) → mode `space`. Sinon → mode `object` (comportement inchangé, `close-up` reste disponible).

En mode `space` : instruction stricte ajoutée à l'`image_prompt` (montrer la pièce entière comme environnement cohérent — murs, sol, mobilier/agencement, plafond en contexte ; l'élément mentionné dans le titre/description doit apparaître comme détail visible dans la pièce, jamais comme sujet unique d'un gros plan) et la liste d'angles de caméra autorisés retire `close-up` (`overhead, eye-level, 45-degree, wide shot`). La règle de variation d'angle entre pins est conservée mais restreinte à cet ensemble.

`PROMPT_ID` passe de `pinterest-pins-v2` à `pinterest-pins-v3`.

### Consequences

* Aucune image existante régénérée — le changement ne s'applique qu'aux nouvelles générations
* Classification par substring matching (pas de NLP) : limitation connue sur les mots composés allemands (ex: un mot-clé contenant "Küchenschrank" matcherait "küche" alors qu'il s'agit d'un objet, pas de la pièce) — acceptée comme compromis simplicité/robustesse, à surveiller en usage réel
* Voir note ci-dessous sur la portée de cette convention (home decor uniquement)

---

## 2026-07-27

### Decision

Alignement des `image_prompt` Pinterest sur le framework officiel FLUX.2 (Subject + Action + Style + Context)

### Context

`lib/prompts/pinterest-pins.ts` interdisait explicitement tout "style keyword" ou "quality modifier" dans l'`image_prompt`, et pour les mots-clés classifiés `space` (décision 2026-07-26 (2) ci-dessus), la formulation "the main subject front and center" laissait le modèle libre de choisir quel élément ouvre la phrase — en pratique souvent un objet/détail du titre du pin plutôt que la pièce entière. Le guide de prompting officiel Black Forest Labs pour FLUX.2 documente un framework en quatre composants (Subject + Action + Style + Context) où le composant Style (registre photographique, niveau de réalisme, qualité) fait partie intégrante d'un prompt bien formé, et où le Subject doit être établi sans ambiguïté avant les détails secondaires. Les deux écarts identifiés ne sont donc pas des préférences esthétiques mais des désalignements avec le framework de prompting du modèle réellement utilisé.

### Decision Taken

Deux changements dans `lib/prompts/pinterest-pins.ts` :
1. **Réintroduction du composant Style** — l'interdiction ("do not include style keywords... quality modifiers") est remplacée par une instruction d'ajouter 2-4 mots-clés de style concrets en clause finale du prompt (jamais en ouverture, pour ne pas diluer le sujet principal) : un registre photographique (ex. "architectural photography", "editorial interior photography"), un niveau de réalisme (ex. "photorealistic"), un modificateur de qualité (ex. "highly detailed"). La règle existante contre les mots vagues ("beautiful", "stunning", ...) s'étend explicitement à ces mots-clés de style. Les instructions caméra/lighting restent interdites dans l'`image_prompt` (angle géré séparément via `cameraAngles`).
2. **Sujet principal forcé en première position (mode `space` uniquement)** — la clause d'ouverture du prompt doit désormais toujours nommer la pièce entière comme sujet grammatical (ex. "A modern kitchen featuring..." / "An open-plan kitchen and dining area with..."), jamais un objet/zone spécifique. Les éléments du titre/description du pin (matériau, îlot, séparateur, etc.) deviennent des détails énumérés *après* cette clause d'ouverture, jamais le sujet grammatical de la première clause.

`PROMPT_ID` passe de `pinterest-pins-v3` à `pinterest-pins-v4`. Le mode `object` (pas de contrainte de sujet imposée) n'est pas affecté par le changement n°2 — seule sa liste de mots-clés de style suit le changement n°1, comme le mode `space`.

### Consequences

* Aucune image existante régénérée — le changement ne s'applique qu'aux nouvelles générations
* `docs/ARCHITECTURE.md` mis à jour (référence `pinterest-pins-v2` obsolète corrigée en `pinterest-pins-v4` au passage)
* Le mode `object` gagne aussi les mots-clés de style (changement n°1, commun aux deux modes) sans hériter de la contrainte de sujet du mode `space` (changement n°2, spécifique à `space`)
* La classification `classifyPinComposition` (home decor uniquement, voir décision 2026-07-26 (3)) et sa portée ne changent pas

---

## 2026-07-26 (3)

### Decision

Note de portée : la classification "espace/pièce entière vs objet/détail" est une convention home decor, pas une règle universelle

### Context

Suite à la décision précédente : le pattern déterministe (nom de pièce + mot d'intention design) ne fonctionne que parce que la niche actuelle du produit est le home decor, où "vue d'ensemble vs gros plan" est effectivement le bon axe de décision de cadrage.

### Decision Taken

Ne pas dupliquer cette règle conditionnelle mot-clé par mot-clé pour de futures niches. Chaque niche a sa propre convention de cadrage légitime — gros plan désiré pour recipes/tatoo (le `close-up` y est le cadrage correct, pas une erreur à corriger), portrait pour outfit, plan large pour real estate/architecture, etc. Reproduire la logique `classifyPinComposition` pour chaque nouvelle niche accumulerait des règles mot-clé par mot-clé spécifiques à chaque domaine, dans un fichier de prompt déjà générique.

La bonne extension le moment venu : enrichir le Brand Profile (déjà injecté dans le `system` prompt via `ctx.brandProfile`) avec une convention visuelle par niche, pour que le cadrage attendu soit déclaré une fois par Brand Profile/niche plutôt que redérivé du texte du mot-clé à chaque génération.

### Consequences

* `classifyPinComposition` reste scopé au home decor — ne pas l'étendre avec des listes de mots-clés pour d'autres domaines
* Toute nouvelle niche avec des besoins de cadrage différents doit passer par une extension du Brand Profile, pas par une nouvelle branche de classification déterministe dans ce fichier

---

## 2026-07-27 (2)

### Decision

TASK-034 — Convention visuelle par niche (`lib/ai/niche-visual-conventions.ts`) + routing de modèle image selon `visualFormat` par pin

### Context

La décision 2026-07-26 (3) anticipait déjà ce point d'extension : "enrichir le Brand Profile avec une convention visuelle par niche, pour que le cadrage attendu soit déclaré une fois par Brand Profile/niche plutôt que redérivé du texte du mot-clé à chaque génération." `projects.niche` existe depuis TASK-033 (2026-07-26), rendant cette extension possible sans nouvelle table.

Un deuxième besoin, indépendant mais lié, motive ce même chantier : certaines niches (ex. Personal Finance / Budgeting) bénéficient d'un format "text overlay" — un court texte accrocheur rendu directement sur l'image — mais gpt-image-1 (OpenAI, provider IMAGE par défaut) n'est pas fiable pour du texte lisible sur image. Une discussion préalable a comparé FLUX.2 (déjà la référence de prompting pour `image_prompt`, voir décision 2026-07-27 ci-dessus) à des modèles orientés texte-sur-image (Ideogram, Google "Nano Banana"/Gemini image) : FLUX.2 reste le choix pour la photographie de scène, mais un modèle distinct est nécessaire spécifiquement pour le rendu de texte.

### Decision Taken

**Convention par niche** — `lib/ai/niche-visual-conventions.ts` expose `getNicheVisualConvention(niche)`, une table statique `{ framingMode: 'space' | 'object', allowTextOverlay: boolean, styleGuidance: string }` indexée sur les libellés exacts de `NICHE_SUGGESTIONS` (`components/projects/project-form.tsx`). Quatre entrées pour cette itération : `Home Organization & Decor` (migration du mode `space` — voir ci-dessous), `Personal Finance / Budgeting` (`object`, `allowTextOverlay: true`, flat-lay/bureau stylisé), `Food & Recipes` (`object`, styling culinaire), `Travel` (`space`, plans larges golden hour). Toute niche sans entrée retombe sur `DEFAULT_NICHE_CONVENTION` (`object`, `allowTextOverlay: false`) — comportement conservateur par défaut, pas une erreur.

**Migration de `classifyPinComposition`** — `lib/prompts/pinterest-pins.ts` priorise désormais la convention du niche quand elle existe. `classifyPinComposition` (heuristique mot-clé, décision 2026-07-26 (2)) est conservée mais dégradée en **fallback uniquement** : elle ne s'applique que lorsque `getNicheVisualConvention` ne trouve pas d'entrée (niche vide ou non reconnu) — y compris pour les projets Home Decor créés avant TASK-033 qui n'ont pas encore renseigné `niche`. Sans ce fallback, tous les projets Home Decor existants sans `niche` renseigné auraient silencieusement perdu le cadrage plein-pièce dès la prochaine génération ; option validée explicitement avec l'utilisateur avant implémentation plutôt que la migration stricte initialement décrite. `allowTextOverlay` n'a pas d'équivalent heuristique : sans convention de niche, il est toujours `false`.

**Contrôle utilisateur `textOverlayMode`** — nouveau champ optionnel (`auto` par défaut) sur `POST /api/pinterest/generate` (`lib/validations/pinterest.ts`). `auto` : l'IA décide `visualFormat` par pin (liste/astuce/checklist → `text-overlay`, concept/scène → `photo`) dans le même appel JSON que le reste du Pinterest Package — pas d'étape outline séparée, contrairement à WordPress, puisque Pinterest reste une génération en un seul appel. `always`/`never` forcent uniformément. Défense en profondeur côté serveur : si `getNicheVisualConvention(project.niche)?.allowTextOverlay` est `false`, `textOverlayMode` est clampé à `never` avant construction du prompt, quelle que soit la valeur envoyée par le client — le formulaire (`components/pinterest/pin-form.tsx`) masque déjà le sélecteur dans ce cas, mais le serveur ne fait pas confiance à l'UI seule (Rule #6).

**Persistance et routing image** — migration 018 ajoute `pins.visual_format` (`text NOT NULL DEFAULT 'photo'`, validé côté Zod, pas de CHECK DB — même convention que `generations.status`) et `pins.overlay_text` (nullable). `lib/ai/services/image.ts` route selon `visualFormat` : `text-overlay` force le provider `openrouter` avec le modèle `AI_IMAGE_MODEL_TEXT` (nouvelle variable d'env, défaut `google/gemini-3.1-flash-image`), en réutilisant la clé `OPENROUTER_IMAGE_API_KEY` déjà existante dans `lib/ai/providers/openrouter.ts` — aucune nouvelle clé. `photo` garde le comportement `AI_IMAGE_PROVIDER`/`AI_IMAGE_MODEL` inchangé (Rule #10/#11 respectées : le choix reste entièrement dans `lib/ai/`, jamais dans une route ou un composant). `lib/ai/prompt-engine/engine.ts` (`buildImagePrompt`) ajoute une instruction explicite de rendu du texte et substitue `NEGATIVE_CONSTRAINTS` par `NEGATIVE_CONSTRAINTS_TEXT_OVERLAY` (nouveau preset) pour ce cas — l'interdiction générale de tout texte contredirait sinon directement la demande.

`PROMPT_ID` passe de `pinterest-pins-v4` à `pinterest-pins-v5`.

### Consequences

* Aucune image existante régénérée, aucun pin existant réécrit — `visual_format` par défaut `photo` pour toutes les lignes déjà en base (migration 018 backfill implicite via `DEFAULT`)
* Beauty & Personal Care, Pets, Parenting & Baby, et Health & Wellness (medical) sont volontairement exclus de cette itération — aucune entrée dans `niche-visual-conventions.ts`, retombent sur le défaut conservateur (`object`, pas de texte). Périmètre limité à Home Decor (migration), Personal Finance, Food & Recipes, Travel, comme demandé
* `classifyPinComposition` reste dans `lib/prompts/pinterest-pins.ts` (pas déplacé) — c'est un fallback de compatibilité, pas une convention de niche ; ne pas l'étendre à de nouvelles niches, toute nouvelle niche passe par `niche-visual-conventions.ts`
* Le mode `object` sans `styleGuidance` (niche non reconnue) n'ajoute aucune instruction de style additionnelle — comportement identique à avant TASK-034
* `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/UI_UX.md`, `.env.example`, `lib/guide/content.ts` mis à jour

---

## 2026-07-27 (3)

### Decision

Migration `middleware.ts` → `proxy.ts` (Next.js 16.2.x)

### Context

`middleware.ts` est déprécié depuis Next.js 16.2.x, renommé `proxy.ts` (export `middleware` → `proxy`) ; confirmé dans la documentation embarquée du package `next` installé (`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`, `.../file-conventions/proxy.md`). Le build affichait le warning de dépréciation, et `/dashboard`/`/projects` renvoyaient des 404 inattendus. L'hypothèse initiale ("middleware.ts n'est plus du tout exécuté sur 16.2.4+, pas juste déprécié en apparence") n'a pas pu être confirmée telle quelle dans la documentation officielle — celle-ci ne dit que "déprécié et renommé" — mais la migration reste la bonne action : le fichier est de toute façon obsolète sur la version installée (16.2.9), qu'il soit encore exécuté ou non.

### Decision Taken

Migration via le codemod officiel (`npx @next/codemod@latest middleware-to-proxy .`), pas de renommage manuel. Le lanceur du codemod (`jscodeshift` multi-process) restait bloqué indéfiniment sous ce shell — contournement : exécution directe de `jscodeshift --run-in-band` (mono-processus) avec le même transform déjà résolu par le wrapper. Résultat identique à celui attendu du codemod : `middleware.ts` supprimé, `proxy.ts` créé, fonction exportée renommée `middleware` → `proxy`, `config`/`matcher` inchangés.

`lib/supabase/middleware.ts` (`updateSession()`, la logique réelle de refresh de session/cookies Supabase que `proxy.ts` délègue) n'a nécessité aucun changement et n'a pas été touché par le codemod : elle n'utilise que les API `NextRequest`/`NextResponse.cookies` — identiques entre le runtime `edge` (middleware) et `nodejs` (proxy, seul runtime supporté). Aucun `runtime: 'edge'` n'était configuré dans le projet, donc le changement de runtime imposé par `proxy` n'a aucun impact fonctionnel ici.

### Consequences

* Vérifié par `next build` (warning de dépréciation disparu, footer `ƒ Proxy (Middleware)` au lieu de l'ancien `ƒ Middleware`) et par `next start` + `curl` non authentifié sur `/dashboard` et `/projects` : `307` → `/login` dans les deux cas (au lieu d'un 404 ou d'un passage sans garde), confirmant que la logique d'auth-gating de `proxy.ts` s'exécute réellement — pas seulement que le 404 a disparu
* Cycle complet connexion → accès dashboard/projects → déconnexion → reconnexion non testé par l'agent (nécessite des identifiants réels) — laissé à l'utilisateur, comme demandé explicitement
* Aucun changement de logique métier, seulement le nom de fichier/fonction et le runtime sous-jacent (imposé par Next.js, non choisi)
* `docs/CHANGELOG.md` mis à jour

---

## 2026-07-28

### Decision

TASK-035 : Publication WordPress directe via REST API — Application Passwords + chiffrement AES natif, namespace `/api/wordpress/...` à plat, statut par défaut Draft

### Context

Le produit avait déjà un générateur d'articles WordPress (TASK-028) et des catégories locales (TASK-032), mais aucune publication réelle — seulement export Markdown/HTML. `docs/API.md` listait `POST /api/wordpress/publish` sous "Future Endpoints (Not MVP)" et `docs/DATABASE.md` listait `wordpress_sites` sous "Future Tables (Not MVP)". Le propriétaire du produit a explicitement spécifié cette fonctionnalité avec toutes les décisions déjà tranchées, ouvrant TASK-035 comme tâche active (RULES.md Rule #25) plutôt que de rester dans le backlog.

### Decision Taken

**Application Passwords plutôt qu'OAuth** : natif à WordPress depuis la 5.6, aucun flux d'enregistrement d'application/redirection nécessaire — adapté à un modèle une-connexion-par-projet, contrairement à OAuth qui suppose un provider tiers enregistré.

**AES-256-GCM via le module `crypto` natif de Node plutôt qu'une librairie** : zéro nouvelle dépendance (aucune librairie HTTP externe n'existe déjà dans le projet non plus — `fetch` natif utilisé partout, y compris pour ce nouveau client REST). GCM fournit une authentification intégrée (auth tag) : toute altération du ciphertext est détectée au déchiffrement plutôt que de produire silencieusement un mot de passe corrompu.

**Statut de publication par défaut = Draft** : une connexion mal configurée ou un mapping de catégorie erroné ne doit jamais publier silencieusement en direct — l'utilisateur doit choisir explicitement "Publish Now" ou "Schedule".

**Pas de helper d'ownership partagé** : cohérence avec le précédent établi par TASK-018/TASK-032 — chaque route refait la vérification `user_id === auth.uid()` inline (`select('id, user_id') → 404 → 403`), copiée-collée, pas de fonction partagée introduite.

**Namespace `/api/wordpress/...` à plat plutôt que `/api/projects/[id]/...`** : aucun précédent de route imbriquée sous `/api/projects/[id]/` n'existe dans le projet — `wordpress_categories`, le précédent le plus proche d'une ressource scopée par projet, vit déjà à `/api/wordpress/categories`, jamais sous `/api/projects/[id]/categories`. Imbriquer n'aurait apporté aucune réutilisation de code puisque chaque route refait sa propre vérification d'ownership indépendamment de la forme de l'URL.

**RLS `wordpress_sites` : `user_id` dénormalisé, pas de sous-requête** : contrairement à `wordpress_articles` (migration 012, aucune colonne `project_id`/`user_id` directe, sous-requête `IN (SELECT ... WHERE user_id = auth.uid())` obligatoire), `wordpress_sites` est créée par une route qui a déjà la ligne `project` parente en main pour la vérification d'ownership — dénormaliser ne coûte rien et garde la policy RLS une simple égalité indexée, comme `wordpress_categories` (migration 016).

**Reset de `wp_post_id` à la déconnexion** : sans ce reset, un `wp_post_id` obsolète pourrait entrer en collision avec un post sans rapport si l'utilisateur reconnecte un site WordPress *différent* au même projet. `DELETE /api/wordpress/sites/[id]` remet `publish_status='draft', wp_post_id=null, published_at=null` pour les articles `scheduled`/`published` du projet avant de supprimer la connexion.

**Risque résiduel accepté — double publication concurrente** : le statut `publish_status` a 4 valeurs fixes (`draft|scheduled|published|failed`, imposées par la spec), sans état "en cours". Deux clics quasi simultanés (ou deux onglets) pourraient tous deux lire `wp_post_id = null` et créer deux posts WordPress distincts. Seule mitigation : désactivation du bouton côté client pendant la requête (`loading`), qui couvre le double-clic dans un même onglet mais pas une vraie course entre deux onglets. Pas de verrou serveur ajouté — ajouter un 5ème statut "en cours" non documenté par la spec aurait été une extension de périmètre non demandée.

**Limite connue — `fetchCategories` non paginé** : plafonné à `per_page=100` (maximum WordPress), pas de pagination au-delà. Acceptable pour cette itération.

**Endpoint réel** : `POST /api/wordpress/[id]/publish` (`[id]` = `wordpress_generations.id`, comme `DELETE /api/wordpress/[id]` déjà existant) plutôt que le chemin `POST /api/wordpress/publish` initialement esquissé dans `docs/API.md` sous "Future Endpoints" — corrigé dans cette même mise à jour de la documentation.

### Consequences

* Nouvelle table `wordpress_sites` (migration 019), colonnes `wp_post_id`/`publish_status`/`published_at`/`publish_error` sur `wordpress_articles`, `wp_category_id` sur `wordpress_categories`
* `lib/wordpress/crypto.ts`, `lib/wordpress/rest-client.ts` — aucun précédent de chiffrement dans le projet avant cette tâche, premier module de ce type
* Nouvelle variable d'environnement serveur-only `WORDPRESS_ENCRYPTION_KEY` (32 bytes hex) — sa rotation invalide toutes les connexions WordPress stockées (déconnexion/reconnexion nécessaire par les utilisateurs concernés)
* `docs/DATABASE.md`, `docs/API.md`, `docs/CHANGELOG.md`, `docs/TASKS.md`, `lib/guide/content.ts`, `.env.example` mis à jour
* Non testé avec un vrai site WordPress par l'agent — laissé explicitement à l'utilisateur, comme pour la décision du 2026-07-27 (3) ci-dessus

---

## 2026-08-02 (4)

### Decision

TASK-013 (Image Analysis) sort du statut DEFERRED — implémenté.

### Context

TASK-013 était en attente depuis le MVP initial : le rôle VISION et `analyzeImage()` (`lib/ai/services/vision.ts`) existaient déjà dans l'AI Engine (symétriques à FAST/SMART/IMAGE), documentés comme "implémenté mais jamais appelé" (voir décision du 2026-07-08 sur l'AI Engine Architecture Refactor). Un état des lieux préalable (même session) a confirmé : aucun appelant nulle part dans le code, aucun schéma de sortie, aucun prompt d'instructions, aucun composant d'upload, et que `generations.reference_image_url` / `pins.image_analysis` existaient déjà en base depuis la migration 001 sans jamais avoir été peuplés.

Le risque produit principal d'une "analyse d'image de référence" est le copyright : si le modèle de vision décrit la composition/disposition d'une image existante (ex. "a white sofa on the left, a round rug in the center, a floor lamp in the corner") et que cette description est réinjectée telle quelle dans le prompt de génération d'image, le résultat peut être une reproduction quasi identique d'une photo protégée — bien au-delà d'une simple "inspiration de style".

### Decision Taken

Garde-fou structurel plutôt que consigne de prompt seule : le schéma Zod de sortie (`imageStyleAnalysisSchema`, `lib/validations/vision.ts`) n'autorise que 4 champs, tous des attributs abstraits — `colorPalette` (2-4 couleurs nommées), `materials` (2-4 matériaux/textures), `mood` (une phrase courte), `lightingStyle` (une phrase courte). Aucun champ libre `description`/`scene`/`layout` n'existe dans le schéma : même si le modèle de vision ignorait les instructions et décrivait la composition dans un tel champ, il n'y a nulle part où cette description pourrait atterrir — une réponse qui en contient une est structurellement invalidée par `.safeParse()` avant de pouvoir atteindre le prompt Pinterest. Le prompt d'instructions (`lib/ai/prompts/vision-style-analysis.ts`) renforce la même intention en langage naturel ("Do NOT describe the composition... Do NOT describe this as a scene to recreate"), mais c'est le schéma, pas le prompt, qui est la garantie réelle.

Réutilisation d'infrastructure plutôt que nouveau mécanisme : `buildImageAnalysisContext()` (`lib/vision/context.ts`) reproduit exactement le shape de `buildAnalysisContext()` (TASK-024, Content Analyzer) — une fonction pure `data → string`, `''` si `null`. `referenceStyleGuidance` (nouveau champ optionnel de `PromptContext`, `lib/prompts/pinterest-pins.ts`) est concaténé juste à côté de `styleGuidanceInstruction` (la convention niche existante, TASK-034) — additif, jamais un remplacement ; les deux peuvent coexister pour une même génération.

Best-effort, jamais bloquant : si `analyzeImage()` échoue ou si la réponse ne valide pas contre le schéma, l'erreur est loguée et la génération continue sans `referenceStyleGuidance` — l'image de référence est une amélioration de style optionnelle, pas une entrée requise. Un incident du provider VISION ne doit jamais faire échouer toute une génération de pins.

### Finding empirique

`google/gemini-2.5-flash` (le modèle VISION par défaut) consomme une partie du budget de tokens en raisonnement interne avant d'émettre le JSON visible — `maxTokens: 400` (valeur initialement choisie par analogie avec d'autres appels courts) retournait systématiquement une réponse vide ("OpenRouter returned empty vision response"), y compris à 600 et 800. Testé et confirmé fiable à partir de 1000 sur plusieurs images réelles ; fixé à `1200` en production pour une marge de sécurité.

### Consequences

* Nouveaux fichiers : `lib/validations/vision.ts`, `lib/ai/prompts/vision-style-analysis.ts`, `lib/vision/context.ts`, `components/pinterest/reference-image-upload.tsx`, `app/api/pinterest/reference-image/route.ts`
* Migration 021 (`reference-images` bucket, public, mêmes policies larges que `generated-images`/`wordpress-images` — pas de scoping RLS par `auth.uid()`, cohérent avec les buckets existants) — non appliquée par l'agent (pas d'accès DDL, voir décisions précédentes sur cette contrainte), à appliquer manuellement par l'utilisateur
* `generations.reference_image_url` et `pins.image_analysis` — colonnes déjà existantes depuis la migration 001, enfin peuplées
* Aucune nouvelle route de suppression pour une image de référence uploadée puis retirée du formulaire avant génération — le bouton "supprimer" du composant d'upload ne fait que réinitialiser l'état local, le fichier reste en Storage. Accepté comme dette mineure (un seul petit fichier orphelin par abandon de formulaire) plutôt que de construire une route DELETE dédiée pour ce cas ; à reconsidérer si le volume devient un problème réel
* `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/CHANGELOG.md`, `docs/TASKS.md` mis à jour

---

## 2026-08-12

### Decision

TASK-028 Option 3 est reformulée avant implémentation : "Blog URL → Rewritten/Optimized Article" devient "External Source → Original SEO Article" — la source externe (lien scrapé ou texte collé) sert uniquement de contexte de recherche (sujets/angles/points couverts), jamais de texte à réécrire, optimiser ou paraphraser de près.

### Context

`docs/TASKS.md` documentait depuis la création de TASK-028 (migration 012) une Option 3 explicitement pensée comme une réécriture : *"existing blog post URL to rewrite or SEO-optimize"*. Un état des lieux préalable (même session) a confirmé que rien n'était implémenté (le CHECK constraint `source_type IN ('keyword', 'url', 'pins')` réserve `'url'` depuis la migration 012 mais zéro code ne l'utilise) — le cadrage était donc encore librement modifiable avant la première ligne de code.

Réécrire un article à partir d'une source existante pose le même risque produit que l'analyse d'image de référence (TASK-013, décision du 2026-08-02 (4)) : plus la sortie de l'IA reste proche de la source (structure, enchaînement des idées, phrasing), plus le résultat final risque d'être une reproduction non autorisée du contenu d'un tiers. Pour du texte, ce risque a un second visage spécifique au SEO : Google pénalise le contenu proche-dupliqué ("near-duplicate content") — un article structurellement calqué sur sa source, même reformulé phrase à phrase, peut être déclassé ou considéré comme du contenu dupliqué à faible valeur ajoutée, ce qui va à l'encontre de l'objectif même du générateur WordPress (produire du contenu SEO qui se classe).

### Decision Taken

La source externe n'est plus jamais transmise telle quelle à l'IA de rédaction. Un prompt dédié (`lib/ai/prompts/source-context-summary.ts`) extrait d'abord un résumé structuré — `theme`, `topics`, `angles`, `keyPoints`, chaque champ une courte phrase, jamais une phrase entière recopiée de la source — avec instruction explicite : *"Extract only the topics, angles, and key points covered — NEVER reproduce sentences, structure, or phrasing from the source."* Ce résumé (jamais persisté, recalculé à chaque génération) alimente ensuite le pipeline outline → rédaction complète déjà utilisé par l'Option 1 (`wordpress-outline-prompt.ts`, `wordpress-article-prompt.ts`, structure à 10 blocs), exactement au même point d'injection que `researchNotes` (guidance libre, jamais un script rigide) — la source ne façonne donc jamais directement la structure ou le phrasing de l'article final, seulement les sujets qu'il couvre.

Même philosophie que TASK-013 (garde-fou structurel plutôt que consigne de prompt seule) : le schéma Zod du résumé (`sourceContextSummarySchema`) plafonne chaque item à 150 caractères et n'autorise que des tableaux de phrases courtes — aucun champ libre `excerpt`/`summary` long où une phrase entière de la source pourrait atterrir intacte. Une réponse qui contiendrait un passage trop long échoue structurellement à `.safeParse()` avant de pouvoir atteindre le prompt de rédaction.

Une confirmation utilisateur explicite est également requise côté UI avant de lancer la génération ("I confirm I'm using this content as research inspiration for an original article, not to reproduce it") — défense en profondeur, en plus du garde-fou de prompt/schéma, jamais un substitut à celui-ci.

### Consequences

* `docs/TASKS.md` Option 3 reformulée (ce changement) avant toute implémentation de TASK-028 Option 3
* Nouveaux fichiers à venir dans la même session : `lib/ai/prompts/source-context-summary.ts`, `lib/wordpress/generate-article-from-url.ts`, `app/api/wordpress/generate-from-url/route.ts`, migration `source_url` sur `wordpress_generations`
* Le Content Analyzer (TASK-024, `content-analysis-v1`) n'est pas réutilisé pour cette option — voir raison dans `docs/TASKS.md` ci-dessus — un prompt séparé est créé plutôt que d'étendre son schéma existant, pour ne pas mélanger deux objectifs différents (alignement de voix vs extraction anti-reproduction) dans un seul schéma

---

## 2026-08-28

### Decision

En transformant les sections Pinterest et WordPress de la sidebar en groupes repliables (`components/layout/sidebar.tsx`), "Research" reste un item top-level, hors du groupe repliable Pinterest — il n'est pas imbriqué sous Generate/Boards/History.

### Context

Research est aujourd'hui fonctionnellement lié à Pinterest (c'est la première étape du flow Research → Analyze → Generate, TASK-023/TASK-024), donc l'imbriquer sous le groupe repliable Pinterest aurait été l'option la plus évidente. Mais Research est prévu pour rejoindre un futur module "SPY Tools" plus large (analyse concurrentielle, pas seulement un input pour la génération Pinterest) — ce module n'existe pas encore et n'est pas planifié en détail (pas d'entrée TASKS.md dédiée à ce stade), mais la structure de navigation ne doit pas présupposer qu'il restera un sous-item de Pinterest.

### Decision Taken

Research reste un lien plat, en dehors de tout groupe repliable, positionné entre la section Workspace et le groupe Pinterest. Si Research était imbriqué sous Pinterest maintenant, le sortir plus tard vers un module SPY Tools obligerait à casser l'emplacement que les utilisateurs ont appris (potentiellement en le faisant disparaître d'un groupe qu'ils ont l'habitude de replier), plutôt que de simplement lui donner sa propre section le moment venu.

### Consequences

* `components/layout/sidebar.tsx` : `researchItem` déclaré séparément de `collapsibleGroups`, rendu sans groupe/label au-dessus
* Aucun module "SPY Tools" créé ou planifié ici — seule la position de Research dans la sidebar anticipe son futur déplacement, rien d'autre n'est implémenté ou promis
* `docs/CHANGELOG.md`, `docs/TASKS.md` mis à jour

---

## 2026-08-28 (2)

### Decision

Un bandeau "Save the Pin!" (call-to-action incitant à enregistrer l'épingle) est ajouté à chaque image de pin générée, systématiquement, via une instruction dans le prompt image — pas via un calque graphique ajouté après génération.

### Context

Demande utilisateur, à partir d'un exemple visuel (ruban rose "Save the Pin! So you can make it later!"). Deux approches possibles :
1. Calque fixe (PNG/SVG) composé après génération via un traitement d'image (`sharp`) — rendu identique et fiable à chaque fois, mais nécessite un nouvel asset/design et une nouvelle étape technique (aucune compositing d'image n'existe aujourd'hui dans le pipeline).
2. Instruction dans le prompt image, comme le mécanisme existant `overlayText`/`visualFormat` (TASK-034) — rendu variable d'un pin à l'autre, mais zéro nouvelle infrastructure.

L'utilisateur a choisi l'option 2 (IA), appliquée à tous les pins toujours (pas une option par génération).

### Decision Taken

`lib/ai/prompt-engine/engine.ts` (`buildImagePrompt()`) ajoute désormais, pour **tout** pin (indépendamment de `visual_format`), une instruction demandant à l'IA de rendre le texte exact du message "save the pin" en petit bandeau près du bas de l'image, sans couvrir le sujet principal. Le message est localisé dans la langue du pin (`lib/ai/prompt-engine/save-pin-message.ts`, en/de/es/fr, repli sur l'anglais), cohérent avec le reste du contenu déjà localisé par pin.

Les deux presets `NEGATIVE_CONSTRAINTS`/`NEGATIVE_CONSTRAINTS_TEXT_OVERLAY` (`presets.ts`) interdisaient auparavant tout texte (mode photo) ou tout texte au-delà du seul hook demandé (mode text-overlay) — les deux ont dû être ajustés pour autoriser explicitement ce nouveau bandeau (un seul texte en mode photo, deux textes nommément en mode text-overlay), sinon l'instruction se serait retrouvée en contradiction directe avec la contrainte négative juste en dessous d'elle dans le même prompt. `IMAGE_PROMPT_ID` passé à `v3` pour refléter ce changement de comportement.

### Consequences

* Nouveau fichier `lib/ai/prompt-engine/save-pin-message.ts`
* `lib/ai/prompt-engine/engine.ts` : `PinterestPackage` gagne un champ `language: string` (déjà présent sur `Pin`, `types/database.ts` — aucun changement de schéma)
* Comme pour le hook de titre existant, le rendu du bandeau (position, lisibilité, style exact du ruban) dépend du modèle d'image et n'est pas garanti pixel-parfait à chaque génération — accepté comme compromis du choix "IA plutôt que calque fixe"
* Aucune nouvelle dépendance, aucune nouvelle étape de traitement d'image, aucun nouvel asset
* `lib/guide/content.ts`, `docs/CHANGELOG.md`, `docs/TASKS.md` mis à jour

---

## 2026-08-28 (3)

### Decision

Ajout d'un plafond d'utilisation total (lifetime) par compte — `profiles.total_generations_used`, appliqué en plus du rate limiting horaire existant (TASK-018) sur les endpoints de génération IA. Explicitement distinct et plus léger que le futur système Credits complet (TASK-011/012, toujours PLANNED, non construit ici).

### Context

Objectif : protéger contre l'accumulation de coûts sur des comptes de test/essai, pas remplacer la monétisation future. Le rate limiting horaire (TASK-018) borne le débit (X requêtes/heure) mais pas le total cumulé dans le temps — un compte peut rester sous la limite horaire indéfiniment et accumuler un coût réel non borné sur sa durée de vie. `credits_balance` existe déjà sur `profiles` mais n'est reliée à aucune logique de déduction/vérification (TASK-011 toujours PLANNED) — l'utiliser directement pour ce plafond aurait pré-empté cette future implémentation avec une sémantique différente (un plafond fixe et non-rechargeable n'est pas la même chose qu'un solde de crédits consommable et rechargeable).

`profiles` existe déjà (vérifié avant de créer une nouvelle table `trial_usage`) — colonne ajoutée directement dessus (migration 023) plutôt qu'une table séparée, plus simple pour un compteur global unique par compte.

#### Calcul de coût justifiant la valeur par défaut

Estimation approximative du pire cas par pin Pinterest généré (pas une donnée tarifaire officielle citée telle quelle — un ordre de grandeur pour dimensionner un plafond de sécurité, à re-vérifier si les tarifs providers changent) :

```txt
IMAGE (gpt-image-1, 1024×1536, palier qualité "high")  ≈ $0.17–0.19 / image
FAST  (texte du pin — titre, description, prompt image) ≈ $0.01–0.02 / pin (part amortie du batch)
VISION (analyse d'image de référence, optionnelle)       ≈ $0.01–0.02 / génération quand utilisée
Marge de régénération (TASK-021 — un pin peut être régénéré plusieurs fois, chaque régénération est un nouvel appel à generate-images, donc un nouveau coût image complet)
──────────────────────────────────────────────────────────
Pire cas retenu, arrondi                                 ≈ $0.40 / pin
```

`TRIAL_GENERATION_LIMIT` par défaut = 10 → exposition maximale ≈ $4.00 par compte avant blocage. Volontairement resserré en production pendant la phase de test initiale via la variable d'environnement (pas en dur dans le code) : `TRIAL_GENERATION_LIMIT=3` actuellement, soit ≈ $1.20 d'exposition maximale par compte — le temps de valider le mécanisme lui-même avant de l'ouvrir plus largement.

### Decision Taken

`lib/rate-limit.ts` (`checkRateLimit()`) reste le point d'entrée unique — un 6ème paramètre optionnel `{ enforceTrialLimit: true }` active la vérification supplémentaire, appelée seulement après que le check horaire existant a déjà été passé (une requête déjà rejetée par le rate limit horaire ne consomme jamais de budget trial). Compteur incrémenté atomiquement via `increment_trial_usage()` (migration 023), même pattern qu'`increment_rate_limit()` (UPDATE ... RETURNING, pas de lecture-puis-écriture).

Les deux mécanismes de bypass déjà en place pour le rate limiting horaire (TASK-029 : `ADMIN_EMAIL` en priorité, puis la table `rate_limit_bypass` via `is_rate_limit_bypassed()`) s'appliquent identiquement et en premier au plafond trial — aucun nouveau mécanisme de bypass créé, réutilisation intégrale de l'existant.

Appliqué uniquement aux 4 endpoints de génération IA réels correspondant à la demande : `pinterest/generate`, `pinterest/generate-images`, `wordpress/generate`, `wordpress/generate-from-pins`. Un 5ème endpoint demandé, `wordpress/[id]/translate`, n'existe pas dans le code actuel (vérifié — aucune route de traduction WordPress construite à ce jour) ; non inventé, signalé à l'utilisateur plutôt que deviné ou ignoré silencieusement.

Dépassement → `403` avec `code: 'trial_limit_reached'` (nouveau, distinct du `429 rate_limited` existant) — un plafond dur par compte n'est pas un "réessaie plus tard".

### Consequences

* Migration 023 : `profiles.total_generations_used` (integer, default 0) + fonction `increment_trial_usage(p_user_id uuid)`
* `lib/rate-limit.ts` : `RateLimitResult` gagne un champ `reason?: 'rate_limit' | 'trial_limit'` ; nouvel export `getTrialGenerationLimit()` (source unique pour la valeur configurée, utilisée à la fois par l'enforcement et par la bannière dashboard) et `rateLimitErrorResponse()` (réponse 403/429 partagée, élimine la duplication du bloc d'erreur répété identique dans les 4 routes)
* Dashboard (`app/(dashboard)/dashboard/page.tsx`) : bannière "X / Y free generations used" (ou message de blocage si atteint), masquée pour les comptes exemptés (mêmes deux signaux que l'enforcement — `ADMIN_EMAIL`/`rate_limit_bypass` — pour que l'UI ne mente jamais par rapport à ce qui est réellement appliqué côté serveur)
* `types/database.ts` : `Profile.total_generations_used`, `ProfileInsert` mis à jour en conséquence
* Aucun changement à `credits_balance`, `api_rate_limits`, ou au comportement du rate limiting horaire existant — strictement additif
* `docs/DATABASE.md`, `docs/API.md`, `docs/CHANGELOG.md`, `docs/TASKS.md`, `.env.example` mis à jour

---

# Idées futures

Idées non urgentes, non planifiées, à reconsidérer plus tard. Ne pas implémenter sans validation préalable.

## Platform Output Presets

Système de sélection Platform → Output Preset (dimensions, aspect ratio, safe area, prompt rules) pour adapter la génération d'image à chaque réseau social. Architecture proposée : `config/platform-presets.ts` centralisé, un preset contient plus qu'une taille (safe area, export format, prompt rules spécifiques).

**Statut** : idée non urgente, à reconsidérer une fois qu'un deuxième générateur social (au-delà de Pinterest) sera réellement construit — éviter de deviner les règles de composition de plateformes non encore développées (même logique que la décision TASK-027 du 2026-07-15).

## Corbeille 15 jours avec purge automatique (au lieu d'un DELETE définitif immédiat)

Pour la suppression d'articles WordPress (et potentiellement d'autres ressources comme les générations Pinterest), une corbeille temporaire — soft-delete avec un flag/timestamp, purge réelle après 15 jours — offrirait un filet de sécurité contre une suppression accidentelle, en plus de la confirmation stricte déjà en place (saisie du titre exact).

**Statut** : différée, pas implémentée. La purge automatique après 15 jours nécessite une tâche planifiée (cron) côté serveur — Vercel Cron existe mais requiert le plan Pro, pas encore souscrit/déployé à ce stade du projet. Construire une corbeille sans purge automatique reviendrait à accumuler indéfiniment des lignes "supprimées" (et leurs fichiers Storage) sans mécanisme de nettoyage, ce qui n'est pas mieux qu'un DELETE définitif immédiat mal assumé. À reconsidérer une fois qu'une vraie infrastructure de planification (Vercel Cron sur plan Pro, ou Inngest — déjà réservé dans `.env.local` mais non connecté, voir décision 2026-07-18 sur le pipeline WordPress) sera réellement disponible.
