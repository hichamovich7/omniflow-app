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

The dashboard shell (`app/(dashboard)/layout.tsx`) is a fixed `h-screen` frame — it never scrolls itself. Only the main content pane (`<main className="flex-1 overflow-y-auto">`) scrolls; the sidebar and top bar stay put regardless of how long the page content is.

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

Read-only overview of a single Project: name, niche, default language, Brand Profile (truncated, expandable), WordPress connection status, quick stats (Pinterest generations, WordPress articles), and shortcut links to that Project's Pinterest History, WordPress History, and Categories (all pre-filtered to this Project). "Edit Project" links to the existing `/projects/[id]/edit` form.

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

### Text in Images

Type:

```txt
Select (Auto / Always / Never)
```

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

Same page structure as the Pinterest Generator form. A "Source" select at the top switches between two modes — no Pins/Board fields, no Research/Analyze passthrough in either mode (both start fresh, not from a Research result):

* **Keyword** (Option 1, default): Keyword (text, required), Research Notes (textarea, optional, free-text SEO guidance), Project (select), Language (select), Category (select), then a **Core Settings** block (see below).
* **External Source** (Option 3): a second "Input Type" select — **Link** (URL field) or **Paste text** (textarea, 12,000-character cap shown live under the field) — followed by a short explanatory line ("Used only as research context...") and a required confirmation checkbox ("I confirm I'm using this content as research inspiration for an original article, not to reproduce it") that gates the submit button. Research Notes is not shown in this mode — its role is filled by an AI-generated summary of the source instead. Project and Language selects are shared with Keyword mode. No Core Settings block in this mode (Option 1 only).

Submit button reads "Generate Article" and its loading label warns generation can take up to a minute (2-3 AI text calls + up to 4 image calls, synchronous) — an extra summary call for External Source mode.

Selected-pins mode (Option 4) is a separate entry point (reached via "Generate WordPress Article" from a Pinterest generation's selection toolbar, `?pinIds=` query param on `/wordpress`, not `/wordpress/blog-post`), not part of this Source toggle.

## Core Settings (TASK-FIX-034, Keyword mode only)

A collapsed-looking, always-visible block below Project/Language/Category, labeled "Core Settings" with a one-line "Optional" note. Five independent selects, every one defaulting to "None" — leaving all five untouched reproduces generation exactly as before this task, with zero change to output:

* **Article Type** — None, How-to guide, Listicle, Product review, News, Comparison. Nudges how the outline's Main Content H2 sections are shaped (e.g. sequential steps for How-to, a numbered list for Listicle, pros/cons + verdict for Product review, inverted-pyramid lead for News, criteria-based sections for Comparison) — the fixed 10-block AEO article skeleton itself (Intro, Quick Answer, Key Takeaways, Main Content, optional Comparison Table, Common Mistakes, FAQ, Conclusion, CTA) never changes.
* **Article Size** — None (default), Small (~1200-2400 words, 5-8 sections), Medium (~2400-3600 words, 9-12 sections), Large (~3600-5000 words, 13-16 sections). Controls both the outline's Main Content section count and the article's word-count target.
* **Tone of Voice** — None, Friendly, Professional, Informational, Transactional, Inspirational, Neutral, Witty, Casual. A sentence-level voice instruction for the article body, layered on top of (not a replacement for) the Project's Brand Profile.
* **Point of View** — None, First person singular, First person plural, Second person, Third person.
* **Target Country** — None, or a fixed list of common countries (United States, United Kingdom, Canada, Australia, Germany, Austria, Switzerland, France, Belgium, Spain, Mexico, Argentina, Ireland, New Zealand, Netherlands, Italy, Portugal, India). Steers examples, references, and units toward that market without forcing it into every section.

None of these fields are exposed as an AI-model choice (see `docs/DECISIONS.md` — model/provider selection stays role-based, Rule #11, not user-facing in this phase).

## Structure (TASK-FIX-035, Keyword mode only)

A second optional block below Core Settings, same visual treatment (bordered panel, "Optional" one-liner). Two kinds of controls:

* **Introductory Hook Brief** — a textarea (max 500 characters) with 5 preset buttons above it that pre-fill the field with a ready-made instruction, still fully editable afterward: **Question**, **Statistical or Fact**, **Quotation**, **Anecdotal or Story**, **Personal or Emotional**. Empty by default — no instruction is injected and the article's opening behaves exactly as before this task.
* **9 three-state toggles**, each a select with **Non défini** (default) / **Oui** / **Non**: **Conclusion**, **Tables**, **H3**, **Lists**, **Italics**, **Quotes**, **Key Takeaways**, **FAQ**, **Bold**. "Oui" forces the element's presence, "Non" forces its explicit absence (not merely "not requested" — the instruction bans the literal Markdown syntax, and for Key Takeaways/FAQ the underlying schema itself only accepts an empty array), "Non défini" reproduces the article's current default behavior for that element exactly.

Every field defaults to "None"/"Non défini" — leaving all of Structure untouched reproduces generation identically to before this task, same guarantee as Core Settings.

## SEO Keywords (TASK-FIX-036, Keyword mode only)

A third optional block below Structure, same visual treatment (bordered panel, "Optional" one-liner).

* **Keywords to include in the text** — a tag input: type a keyword or phrase and press Enter or click "+" to add it as a chip, click the "x" on a chip to remove it. No dedicated tag/chip input existed in the codebase before this task (`pins.keywords`/Research Notes are plain comma-separated text), so a minimal one was built for this block alone. Capped at 15 keywords (same order of magnitude as the existing Pinterest pin-keywords precedent — "10 to 15" — `lib/prompts/pinterest-pins.ts`), 60 characters each.
* **"Générer avec l'IA"** button next to the input — calls a FAST-role AI suggestion (`POST /api/wordpress/suggest-keywords`) using the Main Keyword (and Language/Target Country when Core Settings' Target Country is set), and adds the returned suggestions as new chips (existing chips and the 15-item cap are respected, duplicates skipped). Presented honestly as an AI brainstorm of semantically related terms — not a real NLP/SERP tool, no search volume, difficulty, or ranking data involved.
* Empty by default — no instruction is added to the article prompt and generation behaves exactly as before this task.
* When the list isn't empty, each keyword/phrase is instructed to appear naturally at least once somewhere in the article body — no keyword stuffing, no dedicated list of them anywhere in the text.

## External Linking (TASK-FIX-037, Keyword mode only)

A fourth optional block below SEO Keywords, same visual treatment (bordered panel, "Optional" one-liner). Manual URLs only in this first step — no automatic web search yet (see the roadmap note under FASE 4 in TASKS.md).

* **Manual URLs** — a plain text field, comma-separated (e.g. `https://example.com/a, https://example.com/b`), each entry validated as a well-formed URL. Not the SEO Keywords tag input — a simple text field is enough for a short, occasional list of specific sources.
* These are additive: they never replace or disable the existing automatic external-link behavior (a single web-search-verified source `addExternalLink()` already adds to every generated article, unconditionally, unrelated to this field) — this field only adds more, specific links the user wants included.
* Empty by default — no instruction is added to the article prompt and generation behaves exactly as before this task, including the existing automatic link.
* When the list isn't empty, each URL is instructed to be inserted as a Markdown link naturally, wherever contextually relevant — never forced into an unrelated sentence, never as a dedicated list of links.

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
