# UI_UX.md

# UI / UX Overview

OmniFlow es una plataforma de generación de contenido mediante IA. Pinterest es el primer módulo implementado. La interfaz debe soportar múltiples generadores de contenido con el mismo flujo de trabajo.

La interfaz debe priorizar:

* Simplicidad
* Velocidad
* Claridad
* Flujo de trabajo repetitivo
* Mínimos clics para generar contenido

El usuario principal es un creador que genera múltiples piezas de contenido cada día.

---

# Design Principles

## Primary Goal

Permitir generar contenido optimizado en menos de 60 segundos. El primer módulo validado es Pinterest.

---

## UI Priorities

1. Simplicidad
2. Rapidez
3. Legibilidad
4. Mobile Friendly
5. Acciones visibles

---

## Avoid

* Wizards complejos
* Modales innecesarios
* Navegación profunda
* Más de 2 niveles de navegación

---

# Layout Structure

## Sidebar

Organizado por plataforma (TASK-026):

```txt
Workspace
  Dashboard
  Projects

Pinterest
  Research
  Generate
  Boards
  History

WordPress
  Generate
  Categories (TASK-032)
  History

Platforms (disabled — coming soon)
  Facebook
  LinkedIn
  Medium

Account
  Guide
  Credits
  Settings
```

The sidebar ends with a small footer showing the running app version (`v0.1.0`, Geist Mono, `text-xs`, muted). The value comes from `package.json` `version`, exposed as `NEXT_PUBLIC_APP_VERSION` in `next.config.ts` and inlined at build time. Because the mobile navigation sheet reuses `SidebarContent`, the version also shows at the bottom of the mobile menu. To change the displayed version, bump `version` in `package.json`.

The desktop sidebar (240 px) shows from 1024 px (`lg`). Below that, the top bar shows an "Open menu" button and the brand, and the same navigation opens in a left sheet that closes when a link is chosen. Visual rules: `docs/DESIGN.md` (Sidebar, Top navigation).

---

## Top Bar

Mostrar:

```txt
Project Selector

Credits Remaining

User Menu
```

---

## Scroll Containment

The dashboard shell (`app/(dashboard)/layout.tsx`) is a fixed `h-dvh` frame — it never scrolls itself. Only the main content pane (`<main className="flex-1 overflow-y-auto">`) scrolls; the sidebar and top bar stay put regardless of how long the page content is.

A nested `overflow-hidden` alone isn't enough to guarantee this: per the CSS overflow-propagation rule, the browser viewport's scrollability is governed by `<body>`'s own `overflow` value, not a descendant div's. A wheel event starting outside `<main>` (e.g. over the sidebar or top bar) would otherwise bubble up and scroll the whole document, taking the sidebar with it. `components/layout/scroll-lock.tsx` (`<ScrollLock />`, mounted in the dashboard layout) sets `overflow: hidden` on `html`/`body` for as long as the dashboard is mounted, and restores the previous value on unmount — so routes outside `(dashboard)` (e.g. `/login`) keep normal document scroll.

---

# Pages

## Login Page

Route:

```txt
/login
```

Elements:

* Logo
* Email
* Password
* Login Button
* Register Link

---

## Register Page

Route:

```txt
/register
```

Elements:

* Email
* Password
* Confirm Password
* Create Account Button

---

## Dashboard

Route:

```txt
/dashboard
```

Purpose:

Resumen rápido del uso, reflejando ambas plataformas (Pinterest + WordPress), no solo Pinterest.

Primary Action:

* "Generate Content ▾" — único botón sólido de la pantalla, con menú desplegable: "Pinterest Pins" (→ `/pinterest`) y "WordPress Article" (→ `/wordpress/blog-post`)

Quick Actions (3 cards):

* New Project (→ `/projects/new`, transversal a ambas plataformas)
* Pinterest History (→ `/history`)
* WordPress History (→ `/wordpress/history`)

Stats (5 cards):

* Generations (Pinterest)
* Pins Created
* Articles Generated (WordPress, cuenta `wordpress_articles` scopeada al usuario vía RLS)
* Projects — clicable, enlaza a `/projects`
* Credits

Recent Activity:

* Combina generaciones Pinterest y WordPress, ordenadas juntas por fecha descendente (top 5)
* Cada fila muestra un icono de plataforma (Pinterest vs WordPress) junto al status dot, y enlaza a `/pinterest/[id]` o `/wordpress/[id]` según su tipo

### Command Center (TASK-FIX-038, Phase 1.1 — UI Consolidation)

Jerarquía final de `/dashboard`: `DashboardHeader` → trial usage banner → Command Center (KPIs → Today's Priorities + Active Projects → Weekly Progress) → Quick Actions → Recent Activity. La vieja franja "Metrics" (Generations, Pins Created, Articles Generated, Projects, Credits) ya no existe como bloque separado — sus valores reales se reubicaron dentro del Command Center y del header, sin perder ninguna consulta Supabase.

* `DashboardHeader`: saludo, fecha de hoy, resumen del día (mockeado), y ahora también un badge de **Credits** — el único lugar del dashboard donde se muestra.
* KPI cards (grid de 7): `Monthly Revenue`, `Tasks Completed`, `Digital Products` son mock (etiqueta discreta "Preview" en la card, `source: 'mock'`) — objetivos sin tabla Supabase todavía. `Pins Created`, `Articles Generated`, `Projects` (clicable → `/projects`), y `Generations` son reales (`source: 'real'`), leídos de las mismas queries que antes alimentaban la franja Metrics. La KPI mock "Content Published" de la Fase 1 se eliminó — duplicaba conceptualmente lo que ahora muestran con precisión Pins Created/Articles Generated.
* "Today's Priorities": lista de hasta 3 prioridades, ahora interactiva localmente (Client Component) — click en el círculo alterna un estado visual "completed" (tachado + check), y un botón discreto "+ Add priority" (visible solo si hay menos de 3) permite añadir una prioridad local. Ninguna de las dos acciones llega a Supabase; un texto pequeño ("Preview only — changes aren't saved yet.") lo deja explícito.
* "Active Projects": grid de 3 project cards (CrochetSal, Home Decor DE, POD) con cabecera propia + enlace "View all projects" (→ `/projects`). Cada card muestra badge de estado (On Track/At Risk/Paused), % de progreso con barra, KPI principal, y "Next action" (ahora con contraste corregido: prefijo `text-muted-foreground` + valor en `text-foreground`, con ajuste de línea para no cortar texto largo). Una card solo es clicable cuando su nombre coincide (case-insensitive) con un proyecto real del usuario — si no hay coincidencia, se muestra sin enlace, nunca un enlace falso.
* "Weekly Progress": 4 métricas con objetivo y barra de progreso compacta cada una — Articles Published 3/4, Pins Created 21/49, Products Launched 0/1, Revenue 240 €/1 000 €. Sigue siendo 100% mock.
* Quick Actions (5 cards, cada acción una sola vez en la página): New Project, Generate Pinterest Pins, Generate WordPress Article, Pinterest History, WordPress History — los dos "Generate" ya no viven también como botones en el header.
* Todos los valores mock siguen centralizados en `lib/dashboard/command-center-mock.ts`; la fusión mock/real vive en `lib/dashboard/build-command-center.ts`.

---

## Projects

Route:

```txt
/projects
```

Purpose:

Gestionar proyectos.

Actions:

* Create Project
* Rename Project
* Delete Project

Table:

| Column         |
| -------------- |
| Name           |
| Pins Generated |
| Created Date   |

Each Project card is a link to its detail page. The "..." menu (Edit/Delete) stays on the card and does not trigger this navigation.

---

## Project Detail

Route:

```txt
/projects/[id]
```

Purpose:

Overview of a single Project: name, niche, default language, Brand Profile (truncated, expandable), WordPress connection status, a Content Streams section (see below), quick stats (Pinterest generations, WordPress articles), and shortcut links to that Project's Pinterest History, WordPress History, and Categories (all pre-filtered to this Project). "Edit Project" links to the existing `/projects/[id]/edit` form.

### Content Streams (TASK-FIX-039 Phase 2a.1)

A card section between "WordPress Connection" and the usage-stats grid — no new tab, no new global navigation entry, since Content Streams belong to one Project.

* Compact cards, one per content stream: name, a status badge (Active/Warming/Paused/Archived), the linked WordPress category (or "None"), the linked Pinterest board (or "None"), and the three raw targets (Pins / day, Articles / week, Buffer days) — no computed coverage/"missing pins" number is shown yet, since that still depends on real `pins.publish_date` data not wired up until Phase 2d.
* Empty state: "No content streams yet" with an "Add content stream" button.
* "Add content stream" / a card's pencil icon open the same compact `Dialog`: Name (required), WordPress Category select ("No WordPress category" + this Project's real categories, by id), Pinterest Board select ("No Pinterest board" + this Project's real boards, by id), Status select, and three number inputs for the targets (empty = unset, negative/decimal rejected before submit).
* **Board rule**: while the "1 account = 1 board" experiment holds, a board already linked to another non-archived stream shows as a disabled option, labeled "(in use by \<stream name\>)" — archiving that other stream frees the board again. This is enforced server-side too, not just as a disabled option.
* A card's Archive icon opens a light confirmation dialog (`Dialog`, not a full-page navigation) before calling the archive action — never a physical delete.
* All of it is `sonner` toast-driven (success, warning for a partial create where the stream saved but the board link failed, error), keyboard-focusable, and dark-mode/responsive via the same tokens as the rest of the page.

---

## WordPress Connection (New / Edit Project form)

An optional "WordPress Connection" section inside the same form used by `/projects/new` and `/projects/[id]/edit` (`components/projects/project-form.tsx`), TASK-035 — not a separate route.

**Not connected** (or replacing an existing connection):

* Site URL (text input)
* WP Username (text input)
* Application Password (password input) — a note explains it's generated in WordPress under Users → Profile → Application Passwords, is encrypted before storage, and is never shown again after saving
* "Test Connection" button — disabled until all three fields are filled; must succeed (`POST /api/wordpress/sites/test`) before the connection can be saved with the project
* "Cancel" — only shown when a connection already exists, discards the in-progress edit and reverts to the connected view

**Connected**: a "Connected to {site_url}" badge, plus:

* "Change connection" — reopens the fields above, pre-cleared, to replace the credentials (always re-tested, full replace only — no partial update)
* "Disconnect" — opens a confirmation dialog warning that this Project's scheduled or published articles will revert to Draft **in OmniFlow only**; nothing changes on the WordPress site itself

---

# Research

Route:

```txt
/research
```

Purpose:

Research a topic from a keyword, website, or blog before generating pins, using Firecrawl. Step 1 of the product pipeline (Research → Analyze → Generate → ...).

Note: Pinterest URL is not offered as a Source — Firecrawl does not support scraping pinterest.com ("we do not support this site", confirmed via live testing), every submission failed. Historical research results with source type "Pinterest URL" may still exist and are displayed correctly (read-only), but the option is not selectable for new research.

---

## Research Form

Fields:

* Project (select)
* Source (select: Keyword, Website URL, Blog URL)
* Input (single text field, label/placeholder changes with Source — keyword text for Keyword, URL for the others)

Action:

* Research button — calls Firecrawl, shows a preview panel below the form (title + content, scrollable)

---

## Research Preview

Shown after a successful Research call:

* Title (page title for scraped sources, the keyword itself for Keyword source)
* Source URL (scraped sources only)
* Content preview (scrollable box)
* "Analyze" button (outline style) — calls the Content Analyzer, replaces itself with a structured result panel (Theme, Category, Audience, Tone, Keywords, Summary) once done
* "Continue to Generate" button — navigates to the Pinterest Generator with a suggested keyword (and, for URL sources, the source URL) pre-filled; if an analysis was run, its id is carried forward too

Analysis is opt-in and visible, not automatic: the user sees exactly what will be injected into AI generation before continuing (TASK-024). Skipping "Analyze" and clicking "Continue to Generate" directly still works — generation proceeds without analysis context, same as before TASK-024.

---

## Research History

List of past research results for the selected project, below the form:

* Source-type badge (neutral/outline — never colored by status)
* Input, title, relative date
* Failed rows: separate red "Failed" badge, the stored error message shown inline below the row, and a Retry action (hover-reveal) that re-populates the form with the same Project/Source/Input — except for historical Pinterest-source rows, which have no Retry (retrying is guaranteed to fail)
* Delete action (hover-reveal)

Empty states:

* No projects yet → prompt to create a project first (research belongs to a project)
* Has projects, no research yet → simple empty message

---

# Pinterest Generator

Route:

```txt
/pinterest
```

Main feature of the application. Can be reached directly, or via "Continue to Generate" from the Research page (pre-fills Keyword, Project, and — for URL sources — a hidden Website/Pinterest URL carried through for provenance on the generation record; no visible field for it).

If a content analysis was carried over from Research, a small indicator ("Using content analysis from Research") is shown above the form — unlike the hidden URL passthrough, this one changes AI output, so it stays visible (TASK-024).

---

## Input Section

The form is grouped into five compact sections that follow the real workflow, top to bottom (2026-09-21 — order and grouping only; no field, default, validation or payload changed):

1. **Project context** — Project, Language (a read-only "Effective language" in AI Integrated) and Pins. Help: "Choose the project this content belongs to. The language is inherited from the project."
2. **Board** — optional. Help: "Choose the Pinterest board for these Pins, or leave it blank to decide later."
3. **Keyword** — the main search phrase. Help: "Use the main search phrase your Pins should target."
4. **Generation mode** — AI Integrated / Photo Only / Legacy Composite. In Legacy Composite the pre-existing Reference Image and "Text in Images" controls appear here, unchanged.
5. **AI Integrated settings** — only when AI Integrated is selected. Help: "Choose how the final Pinterest visual and its text should be created." The Headline / Subtitle / CTA importance selects offer High, Medium, Low and **None**, with the help line "None = do not generate this text element." Choosing None empties and locks that element's exact text and mode (a note replaces them); the server also rejects the contradiction and a request with all three elements disabled. When all three importances are None an inline red alert (role="alert") shows "Headline, subtitle and CTA cannot all be set to None. Select at least one text element, or use Photo Only for an image without text."; it disappears as soon as one element is re-enabled, submission is blocked client-side (no request is sent) and the chosen values are kept. Ends with the discreet reference "coming soon" note.

Each section has a visible heading and at most one help sentence; on mobile every field stacks full-width. No Link, URL or destination field exists in this form. The field descriptions below are unchanged.

Fields:

### Keyword

Type:

```txt
Text Input
```

Required:

```txt
Yes
```

Example:

```txt
badezimmer inspiration schrank
```

---

### Language

Type:

```txt
Select
```

Options:

```txt
English
Deutsch
Español
Français
```

Required:

```txt
Yes
```

---

### Board

Type:

```txt
Text Input (combobox — suggests existing boards for the selected project, or type a new name)
```

Required:

```txt
No
```

When left blank, the AI suggests a board per pin (auto-linked as before). When filled, every generated pin is assigned to that one board.

---

### Board Section

Type:

```txt
Text Input (placed immediately after Board)
```

Required:

```txt
No
```

Label:

```txt
Board section (optional)
```

Placeholder:

```txt
e.g. Appetizers — leave blank if this board has no section
```

Help text:

```txt
Optional Pinterest section inside the selected board.
```

Empty by default. Requires Board to be filled — entering a section without a Board shows: `Select a board before entering a board section.` Exported as `Board/Section` in the CSV's existing "Pinterest board" column (never a separate column); a Board with no Section exports as before.

Displayed (read-only) in the Pin table's board badge as `Board / Section`, and as a filter (All / each section / No section) above the pin grid on a Board's detail page (`/boards/[id]`) — client-side only, filtering pins already loaded for that board.

---

### Number Of Pins

Type:

```txt
Select
```

Options:

```txt
1
5
10
20
30
```

Default:

```txt
10
```

---

### Generation mode (TASK-041 Phase 2)

Type:

```txt
Three toggle cards (aria-pressed): AI Integrated (Recommended, default) / Photo Only / Legacy Composite (Legacy badge)
```

* **AI Integrated** — the server-configured image model creates photo, typography and CTA together. No model or provider control is ever shown. Progressive-disclosure panel: Creative format (Hero Pin / Pattern Guide / Editorial Story / AI chooses), Pinterest strategy (AI recommends / Balanced angles / Manual, with an Angle select only for Manual), Headline (Generate with AI / Use exact text), Subtitle and CTA (Generate with AI / Use exact text / None), Maximum text lines (2-6) and per-field importance (High / Medium / Low). Exact-text fields are required and capped at 120 characters.
* **Photo Only** — clean photograph, no text or graphic layer, no extra settings.
* **Legacy Composite** — the pre-existing SVG/Sharp headline + CTA workflow, unchanged, including the "Text in Images" selector below.
* Reference Image: the TASK-013 upload (style analysis only) is shown in Legacy Composite only. In AI Integrated a discreet note at the end of the AI Integrated settings says "Reference images for AI Integrated are coming soon. A reference is not yet sent to the image model."; Photo Only shows nothing. Real reference support is planned in TASK-042.
* In AI Integrated the Language field becomes a read-only "Effective language" showing the language inherited from the selected Project; the server derives it again and does not trust the client value.
* Pin cards and the detail dialog identify the resulting mode. AI Integrated and Photo Only show a visual-review reminder, not legacy template/position/Quality Gate placeholders. Batch Review only calculates layout-template diagnostics for Legacy Composite Pins; mixed batches disclose this scope.

### Text in Images

Type:

```txt
Select (Auto / Always / Never)
```

Shown only in Legacy Composite mode (and only for text-overlay-capable Niches).

Required:

```txt
No — default Auto
```

Visible only when the selected Project's Niche has a text-overlay-capable visual convention (`lib/ai/niche-visual-conventions.ts`, TASK-034 — currently Personal Finance / Budgeting). Hidden entirely for any other Niche, including no Niche set. Auto lets the AI decide per pin whether to add a headline; Always forces a headline on every pin; Never disables the headline. The deterministic bottom "Save" CTA remains present in all three modes, so the selector descriptions state this explicitly instead of promising a completely text-free image.

Pinterest image previews in the generation grid, Pin detail dialog, Boards cards, and image versions dialog preserve the complete 2:3 image with `object-contain`. No max-height constraint is allowed to collapse the preview frame and crop the top headline or bottom CTA.

Phase 1 garantit la géométrie et la lisibilité interne des bandeaux, mais ne choisit pas encore leur emplacement selon le contenu réel de la photo. Phase 2 ajoute uniquement un contraste local et des safe areas géométriques simples ; elle ne prétend pas détecter les visages, objets ou sujets.

Phase 2 sélectionne désormais automatiquement le headline entre une zone haute et une zone basse sûre, cette dernière restant au-dessus du CTA fixe. Le texte passe automatiquement en clair ou sombre selon le fond effectif local. Un support semi-transparent limité à la zone du texte n'apparaît que si les deux positions échouent sans lui. Les marges sûres sont proportionnelles, donc identiques visuellement pour les sorties 1024×1536 et 1000×1500. Aucun contrôle utilisateur ni nouveau CTA n'est ajouté.

Phase 3 ajoute quatre familles visuelles premium sans exposer de nouveaux réglages : `editorial` privilégie une hiérarchie forte et cadrée, `minimal` la respiration et la discrétion, `split` une composition asymétrique qui préserve davantage la photo, et `magazine` une carte éditoriale avec keyline. Chaque famille possède un Headline expressif et un CTA compact cohérents, utilise la couleur de texte adaptative de Phase 2 et conserve Inter pour une sortie déterministe et multilingue. Le choix reste automatique via le mécanisme existant ; aucun sélecteur Template ni panneau avancé n'est ajouté à l'interface dans cette phase.

Phase 4 améliore la diversité visible sans ajouter de contrôle au formulaire : un lot de 5 vise les cinq angles une fois, et un lot de 10 deux variantes distinctes par angle. Le Headline reçoit automatiquement une famille cohérente avec son angle, tandis que le CTA reste inchangé. Les titres quasi identiques et les promesses non sourcées sont bloqués avant création, avec le message d'échec de génération existant et la possibilité de réessayer.

Phase 5 rend ce choix réellement contextuel sans exposer un réglage supplémentaire : sur chaque image `text-overlay`, le Headline utilise le template et la zone qui offrent le meilleur compromis mesuré entre compatibilité d'angle, taille de texte, densité, contraste et calme local. Le lot pénalise les répétitions visuelles, mais uniquement parmi les alternatives proches du meilleur niveau de lisibilité. Les safe areas, le contraste minimum et le fallback neutre restent prioritaires ; le CTA conserve son comportement existant.

Phase 6 ajoute un contrôle invisible avant export : un Headline valide passe directement, une faiblesse non bloquante reste exportable avec un statut interne `WARN`, et un problème récupérable déclenche une recomposition locale sur la même photo. Aucun réglage ni appel IA supplémentaire n'apparaît dans l'interface. Un overflow ou l'absence persistante de composition sûre bloque l'image au lieu d'exporter un Pin visuellement défectueux.

---

### Website URL

Type:

```txt
URL Input
```

Required:

```txt
No
```

---

### Pinterest URL

Type:

```txt
URL Input
```

Required:

```txt
No
```

---

### Reference Image

Type:

```txt
File Upload
```

Formats:

```txt
PNG
JPG
WEBP
```

Required:

```txt
No
```

---

### Generate Button

Primary Action

Text:

```txt
Generate Pins
```

---

# Loading State

While generating:

Display:

```txt
Generating Pins...
```

Show:

* Spinner
* Progress Message

Disable Form

---

# Results Page

Displayed after generation.

---

## Generation Summary

Show:

```txt
Keyword

Language

Pins Generated

Credits Used

Model Used
```

---

## Pin Grid

Grid of cards, one per generated pin (responsive: 1/2/3 columns). Used on the Results page (`pin-table.tsx`) and on the Board Detail page (`board-pin-card.tsx`) — same visual pattern in both places.

Each card displays, read-only:

* Image (or "AI Generated" placeholder while no image exists yet)
* Title, truncated to 2 lines (`line-clamp-2`)
* Description, truncated to 3 lines (`line-clamp-3`)
* Board badge — shows the linked board's **current** name, joined live via `pins.board_id` (TASK-FIX-032), not the frozen `pins.board` text captured at generation time. Renamed boards update the badge without regenerating; a deleted board (`board_id` set to `null`, see `DELETE /api/boards/[id]`) shows "No board assigned" instead of the stale name. CSV export is unaffected — it still reads `pins.board`, the original AI-generated text, unchanged.
* Publish date (if scheduled)

Results page only, hover-revealed:

* Selection checkbox (top-left)
* Regenerate image button
* View image versions button (only shown when more than 1 version exists)

Fields are not editable inline — no character counters, no per-field inputs. Clicking the card anywhere outside the checkbox/image/action buttons opens the **Pin Detail Dialog** below (`cursor-pointer` + hover state signal this). Clicks on the checkbox, the image, or an image action button are stopped from bubbling up, so they trigger their own action instead of opening the dialog.

---

## Pin Detail Dialog

`components/pinterest/pin-detail-dialog.tsx` — shared between the Results page and the Board Detail page. Opened by clicking a pin card; read-only, does not duplicate card actions (Regenerate, selection).

Shows the full, untruncated pin content:

* Full-size image
* Full title
* Full description
* Keywords, as tags
* Image Prompt — monospace block, scrollable independently of the dialog, labeled "Internal use, not exported" so it's unambiguous this field never appears in CSV export. A Copy button copies it to the clipboard.

The dialog itself scrolls (`max-h-[90vh] overflow-y-auto`) if its content is taller than the viewport.

---

## CSV Export

Button:

```txt
Export CSV
```

Downloads Pinterest-compatible CSV.

---

# WordPress Home (TASK-FIX-034)

Route:

```txt
/wordpress
```

Landing hub for the WordPress module — a 2×2 grid of generator cards, same visual language as the sidebar's disabled "Platforms" entries (Facebook/LinkedIn/Medium): grayed icon and text, a small "Soon" tag, `cursor-not-allowed`, no route. Only one card is active today:

* **1-Click Blog Post** (active) — links to `/wordpress/blog-post` (Options 1 and 3 below).
* **Bulk Article Generation** (disabled — future phase)
* **Super Page** (disabled — future phase)
* **Rewriter Tool** (disabled — future phase)

The sidebar's "WordPress → Generate" link still points at `/wordpress` — it now lands on this hub instead of the form directly, then the user picks a card. `?pinIds=` (Option 4, see below) is handled at this same `/wordpress` route, ahead of the hub, exactly as before — a Pinterest selection never sees the grid.

---

# WordPress Generator — 1-Click Blog Post (TASK-028, Options 1 and 3)

Route:

```txt
/wordpress/blog-post
```

Reorganized (TASK-FIX-040) into 6 stacked blocks, in this order — project context first, then the article's brief, then progressively more advanced/optional settings, ending with a read-only recap right above the submit button. No field from before this reorg was removed, and no default value or validation rule changed — this section only reorders what was already there and adds two purely-informational, read-only elements (WordPress connection status, matching Content Stream). Selected-pins mode (Option 4) is a separate entry point (reached via "Generate WordPress Article" from a Pinterest generation's selection toolbar, `?pinIds=` query param on `/wordpress`, not `/wordpress/blog-post`), not part of any block below.

## Visual system (TASK-FIX-040 visual finish + surface hierarchy pass)

Four visually distinct surface levels, all built from this app's existing semantic tokens (no hex, no new color):

1. **Page** — the layout's own `bg-background`.
2. **Workspace** — the 5 numbered blocks sit inside one `bg-muted/60 rounded-2xl` panel (`article-form.tsx`). `bg-muted` is already a very slightly violet-hued neutral in this app's tokens, reused as-is rather than inventing a new tint — it reads as a recessed panel, not another white card.
3. **Cards** — each block is its own real card (`rounded-2xl border border-border bg-card shadow-sm` — the same card convention already used elsewhere in the app, e.g. the project detail page). Every card's header uses the same shared layout (`components/wordpress/article-form-section-card.tsx`'s `SectionHeading`) on its own `bg-primary/5` fill: a discreet step number ("01"–"05"), a small Lucide icon inside a `bg-primary/15` violet-tinted square (the same treatment as the page's own hero icon — one accent color reused everywhere, never a different tint per section), a visible title, and a one-line description, separated from the card's content by a `border-t` divider. Project Context and Generation Summary additionally get a slightly stronger, violet-tinted border (`border-primary/30` + a light `ring-primary/15`) to read as "active context" / "recap" — still the one accent color, not a new palette. Advanced Options reuses the identical header/fill inside its `Collapsible` trigger (a real `<button>`, hover/focus-visible states, `aria-expanded`), with a chevron that rotates on open; its own sub-sections (Structure/SEO Keywords/External Linking) use `bg-muted/40` boxes so they read as distinct from the `bg-card` panel that appears once it's open.
4. **Fields & tiles** — every `Input`/`Textarea`/`SelectTrigger` in Project Context, Article Source, and Article Settings, plus each Generation Summary tile, gets a secondary fill via `FIELD_SURFACE_CLASS`/`SELECT_SURFACE_CLASS` (exported from `article-form-section-card.tsx`) passed through each field's own `className` prop — a per-usage override, not an edit to the shared `Input`/`Textarea`/`Select` components, so no other page in the app is affected.

## 1. Project Context

Always visible, first block. Groups everything about *where* the article will live:

* **Project** (select) — unchanged. Defaults to the user's default project, or the first one.
* **WordPress connection status** (read-only) — a small labeled row (`border-border/70 bg-muted/70`, tinted a bit stronger than a regular field so it reads as a distinct status strip against the card body): "WordPress" + a `Badge` reading "Connected" (success) or "Not connected" (secondary). When connected, the site URL is shown separately, in a smaller muted line, so it never dominates the card; when not connected, a "Connect WordPress" link to `/projects/[id]/edit` appears instead. A discrete warning, never a blocker — generation stays available either way, exactly as before this reorg (the generator never checked this before, and still doesn't gate on it).
* **Language** (select) — unchanged, resyncs to the project's `default_language` on project change.
* **Category** (`CategorySelect`, create/manage inline) — unchanged.
* **Content Stream(s) for this category** (read-only, shown only when at least one exists) — every `content_streams` row in the selected project whose `wordpress_category_id` matches the selected category, each as a small status-colored `Badge` (reusing `contentStreamStatusToBadgeVariant`). If several streams reference the same category, all of them are shown — never just one picked arbitrarily. Purely informational: this lookup never creates a new relation (the only underlying link is the pre-existing `content_streams.wordpress_category_id` column, Phase 2a) and has no effect on generation, saving, or publishing.

Both the WordPress site list and the Content Stream list are fetched once, server-side, for every project the user owns (`app/(dashboard)/wordpress/blog-post/page.tsx`) — switching Project client-side never triggers a new network request; the status/badges simply re-derive from the already-loaded props via two pure lookups (`lib/wordpress/project-context.ts`).

## 2. Article Source

The existing "Source" select (Keyword / External Source) and each mode's fields, unchanged:

* **Keyword** (Option 1, default): Keyword (text, required), Research Notes (textarea, optional, free-text SEO guidance).
* **External Source** (Option 3): "Input Type" select — **Link** (URL field) or **Paste text** (textarea, 12,000-character cap shown live under the field) — followed by a short explanatory line ("Used only as research context...") and a required confirmation checkbox ("I confirm I'm using this content as research inspiration for an original article, not to reproduce it") that gates the submit button. Research Notes is not shown in this mode.

## 3. Article Settings (Keyword mode only)

The 3 most-used Core Settings fields (TASK-FIX-034), always visible without expanding anything:

* **Article Type** — None, How-to guide, Listicle, Product review, News, Comparison.
* **Article Size** — None (default), Small (~1200-2400 words, 5-8 sections), Medium (~2400-3600 words, 9-12 sections), Large (~3600-5000 words, 13-16 sections).
* **Tone of Voice** — None, Friendly, Professional, Informational, Transactional, Inspirational, Neutral, Witty, Casual.

All default to "None" — leaving them untouched reproduces generation exactly as before TASK-FIX-034.

## 4. Advanced Options (Keyword mode only, collapsed by default)

A single disclosure panel (`Collapsible`, closed on every page load — no state persisted across visits) holding everything else that used to be always-visible:

* **Point of View** and **Target Country** — the other 2 Core Settings fields (TASK-FIX-034).
* **Structure** (TASK-FIX-035) — the Introductory Hook Brief (textarea + 5 presets: Question, Statistical or Fact, Quotation, Anecdotal or Story, Personal or Emotional) and the 9 three-state toggles (Non défini / Oui / Non): Conclusion, Tables, H3, Lists, Italics, Quotes, Key Takeaways, FAQ, Bold.
* **SEO Keywords** (TASK-FIX-036) — the tag input (up to 15 keywords, 60 characters each) and the "Générer avec l'IA" AI-suggestion button.
* **External Linking** (TASK-FIX-037) — the comma-separated Manual URLs field (up to 10 URLs).

None of these fields' defaults, validation, or effect on the AI prompt changed — only their default visibility did. Opening the panel never resends a request; the same client-side Zod validation and the same API payload apply whether it was opened or not.

None of the Core Settings/Structure fields are exposed as an AI-model choice (see `docs/DECISIONS.md` — model/provider selection stays role-based, Rule #11, not user-facing in this phase).

## 5. Generation Summary

A small read-only recap directly above the submit button, in the same accented card style as Project Context: the current Source (keyword text, or the URL/pasted-text length for External Source), Project name, Language, Category name (or "Uncategorized"), the chosen Article Settings (or "Default"), and — only when at least one is set — a one-line count of how many Advanced Options were customized. Each of the 5 values is its own small tile (`rounded-lg border` + the same secondary fill used by form fields), laid out 2-per-row on tablet/desktop and 1-per-row on mobile; a value that hasn't been set yet (empty keyword, no category, default Article Settings) is styled in a softer, neutral `text-muted-foreground` tone — never destructive/warning colors — so it reads as "not filled in yet," not as an error. Purely derived from state that already exists on the page; nothing here is sent to the API.

## 6. Submit

The error box (if any) uses a left accent bar (`border-l-4 border-l-destructive`) so it stays clearly visible without being alarming. The "Generate Article" button is full-width on mobile and right-aligned at its natural width on larger screens — never a sticky/fixed footer, just a wide, in-flow button.

Submit button reads "Generate Article" and its loading label warns generation can take up to a minute (2-3 AI text calls + up to 4 image calls, synchronous) — an extra summary call for External Source mode. Unchanged from before this reorg.

---

# WordPress Article (Results)

Route:

```txt
/wordpress/[id]
```

Displayed after generation. Header mirrors the Pinterest Results page (back link, keyword, language, word count, status badge). Body:

* Copy Markdown / Copy HTML / Download .md buttons (`components/wordpress/copy-export-buttons.tsx`)
* Featured image (if generated)
* Meta description
* Category editor (`components/wordpress/article-category-editor.tsx`) — a select reusing the same `CategorySelect` component as the generation forms (own lightweight "+ New Category" quick-create included), saves immediately on change via `PATCH /api/wordpress/[id]`. If the article was already sent to WordPress (`wp_post_id` set), a note explains the change only takes effect on the next publish/update — it never re-publishes automatically
* Publish control (`components/wordpress/publish-control.tsx`, shown only when the Project has a connected WordPress site) — a mode select (Save as Draft / Publish Now / Schedule, the last showing Date/Time fields) plus a submit button labeled after the selected mode. Below it: a send-status badge (`components/wordpress/wp-send-status-badge.tsx` — Not sent to WordPress / Sent as Draft / Published / Scheduled for [date] / Failed to send / Update failed), the last-published timestamp, a "View on WordPress" link when a `wp_post_id` exists, and the stored `publish_error` inline when the status is `failed`
* Rendered article (Markdown → HTML via `marked`, styled with Tailwind child-selector utilities — no typography plugin, see RULES.md Rule #30)

Clicking Save as Draft/Publish Now/Schedule when the article already has a `wp_post_id` (i.e. it was sent before) opens a confirmation dialog first — informational, not blocking: it names when the article was last sent/scheduled and clarifies this action will *update* the existing WordPress post, not create a duplicate. `POST /api/wordpress/[id]/publish` already handles the update-vs-create case correctly regardless; this dialog exists purely so the user isn't surprised.

No Editorial Workflow selection UI here — a single generated article has nothing to multi-select, unlike Pinterest's batch of pins.

---

# WordPress History

Route:

```txt
/wordpress/history
```

Purpose:

Review previous WordPress article generations — the WordPress equivalent of Pinterest's `History` page, independent history (`wordpress_generations`, not `generations`).

## Filters

* Search by keyword (text input)
* Project (select)
* Language (select)
* Status (select — the AI generation status: `completed`/`processing`/`failed`/`pending`, not the WordPress send status)
* Category (select, scoped to the selected Project — disabled with a "Select a Project first" hint until a Project is chosen; changing or clearing the Project filter always drops the Category filter, since a category id is only meaningful within its own project)

## WordPress History List

One row per generation (card list, not a table):

* Selection checkbox
* AI generation status badge (`completed`/`processing`/`failed`/`pending`)
* Category badge ("Uncategorized" if none assigned)
* Send-status badge (`WpSendStatusBadge`, compact — see "WordPress Article (Results)" above for its states)
* Title (the generated article's title, falling back to the raw keyword if generation failed before producing one), linking to `/wordpress/[id]`
* Project name · Language · word count (article only) · relative date

Actions:

* Delete (hover-reveal, per row) — opens the same confirmation dialog as the bulk action below
* Bulk delete — select rows, then a selection action bar exposes "Delete (N)"

## Pagination

Same pattern as Pinterest History (TASK-FIX-002): 20 articles per page, Previous/Next preserving current query params, changing a filter resets to page 1, an out-of-range page redirects to the last valid page, controls hidden when there is only one page.

Empty states:

* No filters, zero generations ever → "No articles yet", links to the WordPress Generator
* Filters applied, zero matches → "No matching results", link to clear filters

---

# WordPress Categories (TASK-032)

Route:

```txt
/wordpress/categories
```

Purpose:

Manage WordPress categories as real entities, scoped per project — same purpose as Boards for Pinterest, but for WordPress articles. Assignment is always manual on both generation flows (keyword and pins); there is no AI suggestion anywhere.

One section per project, each listing that project's categories with inline rename and two-step confirm delete, plus a "New Category" button. Deleting a category never deletes its articles — they fall back to "Uncategorized" (`category_id` is nullable, `ON DELETE SET NULL`).

The same category picker (`components/wordpress/category-select.tsx`) is also embedded directly in both generation forms, with its own lightweight "+ New Category" quick-create and a "Manage" shortcut — this page is the fuller standalone view, reachable from the sidebar.

Empty state: no projects yet → prompt to create a project first (a category must belong to a project).

---

# Boards

Route:

```txt
/boards
```

Purpose:

Manage Pinterest boards as real entities. Boards are created automatically when a generation's suggested board name doesn't match an existing one, or manually via "New Board".

---

## Filters

* Project (select, "All Projects" default)
* Search by name (text input)

---

## Pagination

Same pattern as History (TASK-FIX-031): 20 boards per page, Previous/Next preserving current query params, changing a filter resets to page 1, an out-of-range page redirects to the last valid page, controls hidden when there is only one page.

---

## Boards List

Card grid, one card per board:

* Name
* Project
* Pin count
* Actions (Edit, Delete)

Empty states:

* No projects yet → prompt to create a project first (a board must belong to a project)
* Has projects, no boards yet → prompt to create a board manually (boards are otherwise created automatically during generation)

---

## Board Detail

Route:

```txt
/boards/[id]
```

Shows:

* Board name, project, pin count
* Export CSV (this board's pins only)
* Edit / Delete actions
* Pin grid (image, title, description) — read-only, no selection or regeneration since pins here may span multiple generations

---

## New / Edit Board

Route:

```txt
/boards/new
/boards/[id]/edit
```

Fields:

* Project (select, create only — fixed after creation)
* Name

---

# History

Route:

```txt
/history
```

Purpose:

Review previous generations.

---

## Filters

* Project
* Board (scoped to the selected project; changing Project clears the Board filter)
* Language
* Date Range

---

## History Table

Columns:

| Column   |
| -------- |
| Keyword  |
| Language |
| Pins     |
| Credits  |
| Date     |
| Status   |

Actions:

* View
* Export CSV Again

---

# Guide

Route:

```txt
/guide
```

Purpose:

User-facing documentation explaining how each shipped feature works — distinct from `docs/*` (developer-facing). Content lives in `lib/guide/content.ts` (`guideSections`).

Layout:

* Anchor chip row at the top — one per section, jumps to that section's card
* One card per section: icon, title, one-line summary, bullet points
* Static content, no data fetching — Server Component

Must be updated whenever a user-facing feature ships (see CLAUDE.md Documentation Discipline).

---

# Credits

Route:

```txt
/credits
```

Purpose:

Monitor credit usage.

---

## Summary Card

Show:

```txt
Current Balance
```

---

## Transactions Table

Columns:

| Column      |
| ----------- |
| Date        |
| Type        |
| Credits     |
| Description |

---

# Billing

Route:

```txt
/settings/billing
```

Purpose:

Manage subscriptions.

Show:

* Current Plan
* Credits Remaining
* Upgrade Plan

Actions:

* Purchase Credits
* Manage Subscription

---

# Settings

Route:

```txt
/settings
```

Purpose:

Application preferences.

---

## General Settings

Fields:

* Default Language
* Default Pins Count

---

## AI Settings

Display only:

```txt
Current AI Provider

Current Model
```

User cannot change provider in MVP.

---

# Components

## Shared Components

### AppShell

Contains:

* Sidebar
* Topbar
* Content Area

---

### PageHeader

Contains:

* Title
* Description
* Actions

---

### DataTable

Reusable table component.

Used in:

* Projects
* History
* Credits

---

### EmptyState

Used when:

* No projects
* No generations
* No credits history

---

### LoadingState

Reusable loading component.

---

### ErrorState

Reusable error component.

---

# Notifications

Use toast notifications.

Success:

```txt
Generation completed.
```

Error:

```txt
Generation failed.
```

Warning:

```txt
Insufficient credits.
```

---

# Image Generation

Available on results page when generation status is "completed".

## Generate Images Button

States:

```txt
none — "Generate Images" enabled
processing — "Generating..." disabled with spinner
completed — "Images Generated" success state
partial — "Retry Failed" warning state
failed — "Retry" error state
```

## Image Thumbnails

PinTable displays image thumbnails when media_url exists.

Thumbnail size:

```txt
64x96px (vertical Pinterest ratio)
```

---

# Scheduling

Available on results page when generation status is "completed".

## Schedule Dialog

Triggered by "Schedule Pins" button.

### Mode Selector

```txt
Spread by Days
Spread by Hours
```

### Fields (Days Mode)

* Start Date (date picker, no past dates)
* Start Time (time picker)
* Frequency: Daily, Every 2 Days, Every 3 Days, Weekly, Every Weekday (Mon-Fri)

### Fields (Hours Mode)

* Start Date (date picker, no past dates)
* Start Time (time picker)
* Interval: 30 minutes, 1 hour, 2 hours, 4 hours

### Preview

Shows first 5 pins with calculated dates + "N more" count.

### Actions

* Apply Schedule — sets publish_date on all pins
* Clear Schedule — removes all publish_date values
* Cancel — closes dialog

### PinTable Integration

Publish Date column shown conditionally when any pin has a date.

### CSV Integration

publish_date exported in ISO 8601 format: YYYY-MM-DDTHH:mm:ss

---

# Responsive Rules

Desktop First.

Minimum supported width:

```txt
1024px
```

Mobile support:

* View Results
* View History

Generation workflow optimized for desktop.

---

# Future Screens

## Planned (in roadmap)

* WordPress Generator — Option 2 (TASK-028, Options 1, 3, and 4 implemented)
* Admin Dashboard — Users & Roles (TASK-030)

## Not MVP

Do not implement yet.

* Pinterest Publishing
* Pinterest OAuth
* Team Management
* Analytics Dashboard
* Mobile App
