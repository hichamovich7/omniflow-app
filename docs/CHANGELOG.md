# CHANGELOG.md

# OmniFlow Changelog

Todos los cambios relevantes del proyecto deben registrarse aquí.

Formato:

```txt id="f9uxqy"
Fecha
Versión
Cambios
```

No registrar cambios menores de formato o comentarios.

---

# [Unreleased]

No planned changes.

---

# [1.23.0] - 2026-08-28

## TASK-FIX-013: Collapsible Pinterest/WordPress sidebar groups

### Added

* `components/ui/collapsible.tsx`: new reusable `Collapsible`/`CollapsibleTrigger`/`CollapsiblePanel` (wraps `@base-ui/react/collapsible`, same wrapper conventions as `dropdown-menu.tsx`) — no equivalent existed before, checked first per the task's instruction.
* `components/layout/sidebar.tsx`: the Pinterest and WordPress sidebar sections are now independently collapsible (not an accordion — opening one never closes the other). Pinterest contains Generate/Boards/History; WordPress contains Generate/History/Categories (reordered from Generate/Categories/History). Research is pulled out of the Pinterest group and rendered as a standalone top-level link — see `docs/DECISIONS.md` (2026-08-28) for why (anticipates a future "SPY Tools" module). Dashboard/Projects, the disabled Platforms items, and Account remain flat, ungrouped.
* Open/closed state persists to `localStorage` (`omniflow:sidebar-groups`, via `useSyncExternalStore`) and is restored on reload; whichever group contains the active route always renders open on load, independent of its stored/persisted state for the other group.

---

# [1.22.1] - 2026-08-28

## TASK-FIX-012: User avatar dropdown menu — Settings link, Credits display, Sign Out

### Changed

* `components/layout/user-menu.tsx`: the avatar's `DropdownMenu` already existed (TASK-003) and was reused as-is. Added a Credits row (email → Credits → Settings → Sign Out), sourced from the same `creditsBalance` prop the Topbar already had — now also passed down into `UserMenu` (`components/layout/topbar.tsx`). Inline comment marks the Credits value as display-only/non-functional until TASK-011 (Credits System) is implemented.
* "Settings" changed from a `disabled` dead item to `router.push('/settings')` (existing "Coming soon" placeholder page, not built out here).
* Sign Out unchanged — already a real `supabase.auth.signOut()` + redirect to `/login`.
* Playwright MCP not connected in this environment; user opted to verify manually rather than use a local Playwright substitute.

### Fixed

* `components/layout/user-menu.tsx`, `components/history/wordpress-usage-badge.tsx`: `DropdownMenuLabel` used without a parent `DropdownMenuGroup` threw `Base UI: MenuGroupContext is missing` at runtime — `Menu.GroupLabel` requires a `Menu.Group` ancestor. Fixed by wrapping each `DropdownMenuLabel` in a `DropdownMenuGroup`; the `wordpress-usage-badge.tsx` instance was an existing latent bug found by inspection, not a separate report.

---

# [1.22.0] - 2026-08-12

## TASK-028 Option 3: External Source → SEO Article (research context only)

### Added

* Reframed before implementation: `docs/TASKS.md` Option 3 changed from "Blog URL → Rewritten/Optimized Article" to "External Source → Original SEO Article" — the source (scraped URL or pasted text) is now explicitly research context only, never text to rewrite/paraphrase closely. See `docs/DECISIONS.md` 2026-08-12 (same anti-copyright/near-duplicate-content rationale as the TASK-013 Image Analysis guardrail).
* `lib/ai/prompts/source-context-summary.ts`: `buildSourceContextSummaryPrompt()` — extracts a structured `{ theme, topics, angles, keyPoints }` research index from raw source content, explicitly instructed to never reproduce the source's sentences, structure, or phrasing.
* `lib/validations/wordpress.ts`: `sourceContextSummarySchema` — structural anti-reproduction guardrail (same philosophy as `imageStyleAnalysisSchema`, TASK-013): every field is a short-phrase array capped at 150 chars each, no free-text excerpt/summary field a copied sentence could land in. Also `generateArticleFromUrlSchema` (mutually-exclusive `sourceUrl` / `pastedContent`, `MAX_PASTED_CONTENT_LENGTH = 12000`).
* `lib/wordpress/generate-article-from-url.ts`: `generateArticleFromUrl()` — scrapes a URL (reuses `scrapeUrl()`, `lib/research/providers/firecrawl.ts`, unchanged) or uses pasted text as-is, both capped at 12,000 chars; generates the source summary (FAST role); feeds it into the outline prompt as `researchNotes` — the exact same `buildWordPressOutlinePrompt`/`buildWordPressArticlePrompt` pipeline as Option 1, unchanged; generates featured + internal images fresh via `generateImage()`, never reusing source images; runs `addExternalLink()`. The source summary is never persisted, recomputed on every generation.
* `app/api/wordpress/generate-from-url/route.ts` (`POST`, 20/hour rate limit): inserts a `wordpress_generations` row (`source_type: "url"`) with a placeholder `keyword` before generation starts, replaced with the AI-derived keyword (scraped title, or the summary's theme for pasted text) on success — keeps the stored record consistent with what was actually targeted.
* Migration 022: `wordpress_generations.source_url` (text, nullable) — set only when the input was a link, null for pasted text. No new `source_type` enum value — `'url'` (already reserved by migration 012) covers both sub-cases.
* `components/ui/checkbox.tsx` — new reusable Checkbox (wraps `@base-ui/react/checkbox`, same pattern as the existing Select/Input wrappers).
* `components/wordpress/article-form.tsx`: new "Source" select (Keyword / External Source) with an "Input Type" sub-select (Link / Paste text) for External Source mode. A required confirmation checkbox ("I confirm I'm using this content as research inspiration for an original article, not to reproduce it") gates the submit button in that mode. Research Notes stays Keyword-mode only.
* `docs/DATABASE.md`, `docs/API.md`, `docs/UI_UX.md`, `docs/TASKS.md`, `lib/guide/content.ts` updated.

### Changed

* `lib/research/providers/firecrawl.ts`: `CONTENT_CHAR_CAP` exported (was module-private) — reused by the new generator for the pasted-text cap, single source of truth.
* `lib/wordpress/generate-article.ts`: `TEXT_ROLE`, `WORDPRESS_IMAGE_CONFIG`, `OUTLINE_MAX_TOKENS`, `ARTICLE_MAX_TOKENS`, `ARTICLE_GENERATION_TIMEOUT_MS`, and `applyOutlineTextLimits()` exported (were module-private) — reused as-is by Option 3 rather than duplicated, since both must stay tuned identically (same prompts, same schemas). The outline/article generation logic itself is duplicated into the new file, not shared — same "reasonable duplication over premature shared abstraction" convention as Option 4 (`generateArticleFromPins`), see `docs/DECISIONS.md` 2026-07-15.

### Not applied by the agent

* Migration 022 — no DDL access, apply manually (same constraint as every prior migration in this project).

---

# [1.21.0] - 2026-08-02

## TASK-013: Image Analysis (reference image style extraction)

### Added

* Reference image upload: `components/pinterest/reference-image-upload.tsx` (drag-drop or click, JPG/PNG/WebP, 5MB max) → `POST /api/pinterest/reference-image` (auth required, 30/hour rate limit, uploads to new `reference-images` Supabase Storage bucket under `${user.id}/{uuid}.{ext}`, returns the public URL). Optional field in `components/pinterest/pin-form.tsx`, under Board — preview thumbnail + remove button.
* `lib/validations/vision.ts`: `imageStyleAnalysisSchema` — exactly 4 abstract fields (`colorPalette`, `materials`, `mood`, `lightingStyle`), no free-text `description`/`scene` field. This is a structural anti-copyright guardrail, not just a prompt instruction: a vision response that describes composition/layout has nowhere valid to go, it fails `.safeParse()` before it can reach the Pinterest prompt. See `docs/DECISIONS.md` 2026-08-02 (4).
* `lib/ai/prompts/vision-style-analysis.ts`: `buildVisionStyleAnalysisPrompt()` — explicit instructions to the VISION role to extract only transferable style attributes, never composition, layout, or "a scene to recreate".
* `lib/vision/context.ts`: `buildImageAnalysisContext()` — same shape as `buildAnalysisContext()` (TASK-024): pure `ImageStyleAnalysis | null → string`.
* `lib/prompts/pinterest-pins.ts`: new optional `referenceStyleGuidance` on `PromptContext`, concatenated right next to the niche's `styleGuidanceInstruction` — additive, never a replacement; both can be present on the same generation.
* Orchestration in `app/api/pinterest/generate/route.ts`, at the same spot `analysisContext` (TASK-024) is already built: when `referenceImageUrl` is present, calls `analyzeImage()` (VISION role), validates against `imageStyleAnalysisSchema`, builds `referenceStyleGuidance`, passes it into the prompt. Best-effort — a VISION failure or invalid response is logged and generation continues without it, never blocks the request.
* Traceability via the columns that already existed for this, unused since migration 001: `generations.reference_image_url` (the uploaded URL) and `pins.image_analysis` (the validated JSON, replicated on every pin of the generation).
* Migration 021 (`reference-images` bucket + storage policies, same shape as `generated-images`/`wordpress-images`) — not applied by the agent (no DDL access), apply manually.

### Fixed (found during verification)

* `google/gemini-2.5-flash` (VISION role default) spends part of its token budget on internal reasoning before emitting visible JSON — `maxTokens: 400` reliably returned an empty response ("OpenRouter returned empty vision response"), reproduced at 600 and 800 too. Fixed at `maxTokens: 1200`, confirmed reliable across multiple real test images (threshold empirically found at ~1000).

### Verified

* `analyzeImage()` exercised end-to-end against two real existing generated-image URLs via a temporary debug route (removed afterward) — both produced valid, schema-passing JSON with plausible, purely abstract attributes (e.g. `{"colorPalette":["warm beige","soft white","light oak","leafy green"],"materials":["matte plaster","natural wood","smooth ceramic","brushed metal"],"mood":"calm, warm, spa-like minimalism","lightingStyle":"soft, diffused natural daylight"}`).
* Upload route tested end-to-end with a real file POST — correctly failed with a clear "Bucket not found" error since migration 021 isn't applied yet in the live DB (expected, confirms the code path is correct; user applies the migration before testing the full flow).
* `tsc --noEmit` and `eslint` clean on all touched/new files.

### Docs

* `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/TASKS.md` updated.

---

# [1.20.0] - 2026-08-02

## TASK-036: Project Detail Page + clickable Project cards + expandable Brand Profile

### Added

* New `app/(dashboard)/projects/[id]/page.tsx` — read-only detail page for a single Project: header (name, niche, default language, Default badge), Brand Profile (truncated via `ExpandableText`, "Edit Project" button to the existing `/projects/[id]/edit` form), WordPress connection status (connected site URL, or a "Connect WordPress" link to Edit when not connected), quick stats (Pinterest generations, WordPress articles — both scoped to this Project only), and Quick Links to `/history?project=[id]`, `/wordpress/history?project=[id]`, and `/wordpress/categories#project-[id]`.
* Follow-up same day: the header's Niche/Default Language were correctly wired from the first version (`project.niche`/`project.default_language`, both in the `select('*')` fetch) but rendered as 12px muted text directly under the `<h1>` — easy to overlook next to the Edit Project button. Verified with DB values + a Playwright screenshot before concluding it was a display issue, not a data one. Upgraded to a `Badge`-based row: niche keeps the same primary-tinted pill style as the Project list cards (`project-card.tsx`), language and "Default" now use the existing `Badge` component (`outline`/`secondary`) already used elsewhere on the same page for the WordPress connection status. Null niche/language still render nothing, never a placeholder.
* Second follow-up same day: the three badges still weren't self-explanatory at a glance. Added an icon to each — `Tag` on the Niche pill, `Globe` inside the Language badge, `Star` (filled, matching the icon already used for "Set as Default" in `project-actions.tsx`) on Default. Default is also visually pulled out of the Niche/Language group — no pill background, a thin vertical divider (`border`-colored, only rendered when Niche or Language is also present) separating it, since it's a project status flag, not a content attribute of the same kind as the other two. Verified with a before/after Playwright screenshot on the real "Blog_Home_Decor_Germany" project, immediately legible with no hover/click needed.
* New `components/ui/expandable-text.tsx` — reusable truncate-at-N-characters (default 200) text with a "Read more"/"Read less" toggle. Used on the new detail page and, in a second collapsed→editable mode, on the Brand Profile field in `project-form.tsx`.
* New `components/projects/project-card.tsx` (`'use client'`, extracted from `app/(dashboard)/projects/page.tsx`) — the whole card is now a `Link` to `/projects/[id]`. The existing "..." actions menu (Edit/Delete) stops the click from bubbling to the card's own link (`preventDefault`/`stopPropagation` on its wrapper), so it still opens without navigating away.
* `components/projects/project-form.tsx`: in edit mode, an existing Brand Profile starts collapsed as read-only `ExpandableText` instead of a full `Textarea` — clicking into it or its "Read more" link switches to the real, fully editable `Textarea` (auto-focused). Create mode, or an edit with no existing Brand Profile, always shows the editable `Textarea` directly — nothing to collapse.
* `components/wordpress/categories-manager.tsx`: each project's section now has `id="project-{projectId}"` so the new detail page's "Manage Categories" link can deep-link and auto-scroll to the right project on `/wordpress/categories`.

### Fixed (caught during verification, not part of the original request)

* `project-card.tsx` initially shipped without `'use client'` — since it's rendered directly by the Server Component `app/(dashboard)/projects/page.tsx`, its `onClick` (the actions-menu-click guard) crashed the whole `/projects` page at runtime ("Event handlers cannot be passed to Client Component props"). Caught by the Playwright verification pass, not by `tsc`/`eslint` (neither flags this — it's a runtime RSC boundary error).

### Verified

* Local Playwright (Playwright MCP not connected in this environment, same substitute used in TASK-FIX-011), authenticated via the established magic-link + `verifyOtp` + session-cookie-injection technique. Confirmed: clicking a Project card navigates to its detail page; clicking its "..." menu opens Edit/Delete without navigating; the detail page's Brand Profile (3,296-char real profile) renders collapsed with "Read more", expands on click; the edit form's Brand Profile renders collapsed (not a `<textarea>`) on load and swaps to a real, focused `<textarea>` after clicking "Read more".
* `tsc --noEmit` and `eslint` clean on all touched files.

### Docs

* `docs/UI_UX.md`: new "Project Detail" section under Projects; noted cards are now links.
* `lib/guide/content.ts`: "Projects & Brand Profile" section updated with the new detail-page point.
* `docs/TASKS.md`: TASK-036 added and marked completed.

---

# [1.19.6] - 2026-08-02

## TASK-FIX-011: Fix Project/Language overlap on the WordPress Generate form

### Fixed

* `components/wordpress/article-form.tsx`: the Project/Language/Category row (`grid grid-cols-3 gap-4`) let the Project `SelectTrigger` overflow its column and visually cover the Language select whenever the project name was long (e.g. "Blog_Home_Decor_Germany") — `SelectTrigger` defaults to `w-fit` (shrink-to-content) unless overridden, and CSS Grid items default to `min-width: auto`, so neither the trigger nor its grid cell was actually constrained to the track's `1fr` share. Fixed with `min-w-0` on each grid cell plus `w-full min-w-0` on the Project/Language triggers (matching the `w-full` convention already used elsewhere, e.g. `wp-category-mapping.tsx`) and `min-w-0` on the truncating `<span>` inside the Project trigger, which as a flex child needed it to actually engage `truncate` instead of stretching its parent.
* `components/wordpress/category-select.tsx` (shared `CategorySelect`, also used by `pins-source-article-form.tsx`): same `min-w-0` hardening applied for a long category name, for parity — not the reported symptom, but the same class of bug.
* Verified visually with a local Playwright install (Playwright MCP isn't connected in this environment) at 1440×900 and 1366×768, selecting "Blog_Home_Decor_Germany" as the Project: before, the Project trigger rendered ~290px wide inside a 170px track, fully covering the Language trigger; after, both measure exactly 170px with clean ellipsis truncation, zero overlap at either resolution (measured via `getBoundingClientRect()` on the trigger elements, not just eyeballed).
* `playwright` added as a devDependency (kept, per request, for future visual verification — not wired into any test script/CI yet).

---

# [1.19.5] - 2026-08-02

## TASK-FIX-010: Scope the WordPress History Category filter to the selected Project

### Fixed

* `/wordpress/history`'s Category filter listed every project's categories mixed together regardless of the Project filter already selected — picking a Project like "Personal Finance" still offered categories from unrelated projects (e.g. "Badezimmer Ideen"). `app/(dashboard)/wordpress/history/page.tsx` now scopes the `wordpress_categories` query to `params.project` when set, falling back to every project's categories only when Project is "All Projects" (unchanged behavior for that case).
* Category filter is disabled (trigger reads "Select a Project") whenever Project is "All Projects" — the simpler of the two options given, since a category id is only unambiguous within its own project.
* `components/wordpress/wordpress-history-filters.tsx`: changing (or clearing) the Project filter now always drops any selected Category in the same URL update, rather than leaving a Category selection that no longer belongs to the newly selected Project's scope.

---

# [1.19.4] - 2026-08-02

## TASK-FIX-009: Remove the 3-internal-image cap on the pins→article flow

### Changed

* `app/api/wordpress/generate-from-pins/route.ts`: `pinsWithImage` no longer `.slice(0, 3)`s — every selected pin with an active image is now reused as an internal image (was hard-capped at 3 regardless of how many pins were selected). The unrelated `keyword` label (a short "Pin A + Pin B + Pin C" display string, capped separately for readability) keeps its own 3-title cap, now under its own `MAX_KEYWORD_PIN_TITLES` constant instead of incidentally sharing the removed image cap's name.
* `lib/ai/prompts/wordpress-from-pins-prompt.ts`: the outline prompt's image-marker instruction listed literal marker names only up to `"IMAGE_3"` — harmless while the route capped at 3, but would have under-instructed the model for any higher count. Now builds the full `"IMAGE_1", "IMAGE_2", ..., "IMAGE_N"` list dynamically from the actual count.
* `lib/ai/prompts/wordpress-article-prompt.ts` (shared by both Option 1 and the pins flow): added one clarifying rule — when there are more image markers than Main Content sections, more than one marker may land in the same section rather than being skipped or forced into an unrelated spot. Dormant for Option 1 (always ≤3 images against 8-10 sections), only reachable from the pins flow with >8-10 images with active pins.
* Option 1 (keyword flow) untouched — still exactly 1 featured + 2-3 freshly-generated internal images, independent schema (`wordpressOutlineSchema`, fixed `.min(2).max(3)`), independent prompt (`wordpress-outline-prompt.ts`).

---

# [1.19.3] - 2026-08-02

## TASK-FIX-008: Remove duplicate H1 on WordPress-published articles

### Fixed

* Articles published to WordPress showed two stacked titles: the post's `title` field (rendered as H1 by the WP theme) and the `# {title}` line the article-writing prompt always puts first in `content` (rendered again inside the post body). `lib/wordpress/export.ts` gains `stripLeadingH1()` plus `exportToMarkdownForWordPress()`/`exportToHtmlForWordPress()`, used by `POST /api/wordpress/[id]/publish`'s post body and by the "Copy Markdown"/"Copy HTML"/"Download .md" buttons (`CopyExportButtons`, shown when a project has no WordPress connection — flagged as the same risk since they're meant to be pasted into WordPress too, per TASKS.md).
* Checked first, per the task's own instruction: `/wordpress/[id]` (OmniFlow's own reading view) does **not** have the same bug. Its page `<h1>` shows `generation.keyword`, not `article.title`; `article.title` is only ever used as the featured image's `alt` text, never rendered as a second heading. The article body's own H1 (from `content`) is the only title shown in that view, so it was left on the raw (non-stripping) `exportToHtml()` — stripping it there would have deleted the only visible title, a regression, not a fix.
* `content` itself is never modified — `wordpress_articles.content` keeps its H1 exactly as generated (useful for a future export destination with no separate title field). Stripping happens only at export/publish time.
* `exportToMarkdown()` (the old raw passthrough) removed — its only caller was the now-replaced `CopyExportButtons` markdown prop, so it had zero remaining callers after this change.

---

# [1.19.2] - 2026-08-02

## TASK-FIX-007: WordPress send status clarity + post-hoc category assignment

### Added

* Migration 020 — `wordpress_articles.scheduled_at` (nullable timestamptz): the WP-side target datetime for a scheduled post, previously never persisted (`published_at` stays null for `scheduled`, by design). Set by `POST /api/wordpress/[id]/publish` on `mode: "schedule"`, cleared on any other mode.
* New `components/wordpress/wp-send-status-badge.tsx` (`WpSendStatusBadge`) — a shared badge computing one of "Not sent to WordPress" (gray), "Sent as Draft" / "Published" / "Scheduled for [date]" (green), "Failed to send" / "Update failed" (red) from `wp_post_id`/`publish_status`/`scheduled_at`. Shown prominently at the top of `/wordpress/[id]` (with a "View on WordPress" link once `published_at` is set) and compact on every `/wordpress/history` row.
* `components/wordpress/publish-control.tsx`: clicking Save as Draft/Publish Now/Schedule when the article already has a `wp_post_id` now opens a confirmation dialog ("This article was already sent on [date] — this will update the existing WordPress post, not create a duplicate") before submitting — informational, not blocking, since `upsertPost()` already updates cleanly rather than duplicating.
* New `PATCH /api/wordpress/[id]` — reassigns `wordpress_articles.category_id` after generation (previously only settable at generation time). Validates the category belongs to the generation's own project (cross-project assignment rejected), ownership-checked per TASK-018's inline pattern. Purely local: if the article already has a `wp_post_id`, the new category is not pushed to WordPress until the next publish/update.
* New `components/wordpress/article-category-editor.tsx` on `/wordpress/[id]` — the same `CategorySelect` used at generation time, editable after the fact, immediate save on change, with a note when the article was already sent that the change won't reach WordPress until the next publish.
* `lib/validations/wordpress-article.ts`: new `updateArticleCategorySchema`.

### Changed

* `components/wordpress/wordpress-history-table.tsx` / `app/(dashboard)/wordpress/history/page.tsx`: the generations query now also selects `wp_post_id`/`publish_status`/`published_at`/`scheduled_at` to feed the compact send-status badge per row.

---

# [1.19.1] - 2026-08-02

## TASK-FIX-006: Import WordPress categories instead of requiring a manual one first

### Fixed

* `/wordpress/categories` never rendered the "Map to WordPress category" section for a project with zero OmniFlow categories — `components/wordpress/categories-manager.tsx` gated `WpCategoryMapping` behind `projectCategories.length > 0`, so a newly connected site with real WordPress categories (confirmed reachable via `fetchCategories()`, HTTP 200) showed nothing, and articles published without a category ended up "Uncategorized" on WordPress. `WpCategoryMapping` now renders whenever a site is connected, regardless of category count, with an explicit "No categories yet — create one manually or import from WordPress" empty state (`components/wordpress/wp-category-mapping.tsx`) instead of disappearing.

### Added

* "Import from WordPress" button on `/wordpress/categories`, next to "New Category", visible whenever the project has a connected site — opens a dialog listing the site's real WordPress categories (checkboxes, all checked by default), and creates a matching OmniFlow category per one kept checked, `wp_category_id` already filled in (no second manual mapping pass).
* New `components/wordpress/wp-import-categories-dialog.tsx` (`WpImportCategoriesDialog`).
* New `POST /api/wordpress/sites/[id]/categories/import` — re-fetches categories from WordPress server-side (never trusts client-supplied names, only the ids), matches by name (case-insensitive) against the project's existing OmniFlow categories: fills in `wp_category_id` only if it was unset (never overwrites an existing mapping), otherwise creates a new category. Ownership-checked per TASK-018's established inline pattern; not rate-limited — a bounded one-shot action, same precedent as the existing `GET .../categories` endpoint.
* `lib/validations/wordpress-category.ts`: new `importWordPressCategoriesSchema` (`categoryIds: number[]`, min 1).

---

# [1.19.0] - 2026-07-28

## TASK-035: WordPress REST API Publishing

### Added

* Direct WordPress publishing via the REST API — one WordPress connection per Project (Application Password, encrypted at rest), with Draft / Publish Now / Schedule on the article page.
* New `wordpress_sites` table (migration 019, TASK-035) — `site_url`, `wp_username`, `encrypted_application_password` (AES-256-GCM via new `lib/wordpress/crypto.ts`, no external dependency).
* New `lib/wordpress/rest-client.ts` — native `fetch`-based WordPress REST API client: `testConnection()`, `fetchCategories()`, `uploadMedia()` (raw binary upload to the media library), `upsertPost()`.
* New API routes: `POST /api/wordpress/sites/test`, `POST /api/wordpress/sites`, `PATCH`/`DELETE /api/wordpress/sites/[id]`, `GET /api/wordpress/sites/[id]/categories`, `POST /api/wordpress/[id]/publish`.
* "WordPress Connection" section added to the existing Project form (`components/projects/project-form.tsx`) — Site URL / WP Username / Application Password, "Test Connection" before save, "Connected to [site]" state with Disconnect/Change.
* Category mapping UI on `/wordpress/categories` — maps each OmniFlow category to a real WordPress category, auto-suggested by name match, editable.
* Publish control on the article page (`/wordpress/[id]`), replacing the export buttons when a WordPress connection is active; export buttons unchanged when there is none.

### Changed

* `wordpress_categories` gains `wp_category_id` (nullable), `wordpress_articles` gains `wp_post_id` / `publish_status` / `published_at` / `publish_error`.
* Rate limiting extended to `wordpress/sites/test` (30/hour) and `wordpress/publish` (15/hour) — the first non-AI endpoints rate-limited, since both make real external requests to a third-party WordPress host with real side effects.

### Docs

* `docs/DECISIONS.md`: 2026-07-28 entry.
* `docs/DATABASE.md`, `docs/API.md`, `docs/TASKS.md`, `lib/guide/content.ts`, `.env.example` updated.

---

# [1.18.1] - 2026-07-27

## Fixed: `middleware.ts` → `proxy.ts` migration (Next.js 16.2.9 deprecation)

### Fixed

* `middleware.ts` file convention is deprecated as of Next.js 16.2.x and renamed to `proxy.ts` (`middleware` export renamed to `proxy`); the build log showed the deprecation warning and `/dashboard`, `/projects` were 404'ing unexpectedly. Migrated via the official codemod (`npx @next/codemod@latest middleware-to-proxy .`) rather than a manual rename.
* Codemod's own `jscodeshift` runner hung indefinitely under this shell (multi-process worker forking); ran `jscodeshift --run-in-band` directly with the same transform to work around it. Result identical to what the wrapper would have produced: `middleware.ts` deleted, `proxy.ts` created, `middleware` function renamed to `proxy`, `config`/`matcher` untouched.
* `lib/supabase/middleware.ts` (`updateSession()` — the actual Supabase cookie-refresh/session logic `proxy.ts` delegates to) was not touched by the codemod and needed no change: it only uses runtime-agnostic `NextRequest`/`NextResponse` cookie APIs, so the `edge` → `nodejs` runtime change between `middleware` and `proxy` does not affect it. No `runtime: 'edge'` was configured anywhere in this project.
* Verified via `next build` (deprecation warning gone, footer now reports `ƒ Proxy (Middleware)`) and via `next start` + unauthenticated `curl` against `/dashboard` and `/projects`: both now return `307` → `/login` instead of a 404 or an unguarded pass-through, confirming the proxy's auth-gating actually executes.

### Docs

* `docs/DECISIONS.md`: 2026-07-27 (3) entry.

---

# [1.18.0] - 2026-07-27

## TASK-034: Niche Visual Conventions + Text Overlay Routing

### Added

* `lib/ai/niche-visual-conventions.ts` — `getNicheVisualConvention(niche)`, a static table of `{ framingMode, allowTextOverlay, styleGuidance }` keyed by the curated niche labels from `components/projects/project-form.tsx`. Covers Home Organization & Decor (migrated from keyword-based classification), Personal Finance / Budgeting, Food & Recipes, Travel. Unrecognized/empty niche returns `null` — caller decides the conservative default.
* `textOverlayMode` (`auto` / `always` / `never`, default `auto`) on `POST /api/pinterest/generate` (`lib/validations/pinterest.ts`). Each generated pin now stores a resolved `visualFormat`/`overlayText` decided by the AI in the same generation call (no separate outline step).
* `pins.visual_format` and `pins.overlay_text` columns (migration 018).
* `components/pinterest/pin-form.tsx`: "Text in Images" selector, shown only when the selected Project's niche allows text overlay.
* `AI_IMAGE_MODEL_TEXT` env var (default `google/gemini-3.1-flash-image`) — `lib/ai/services/image.ts` routes `visualFormat: 'text-overlay'` pins through OpenRouter to this model instead of the IMAGE role's configured provider/model, reusing the existing `OPENROUTER_IMAGE_API_KEY`. gpt-image-1 is not reliable at legible on-image text.
* `NEGATIVE_CONSTRAINTS_TEXT_OVERLAY` preset (`lib/ai/prompt-engine/presets.ts`) — replaces the blanket "no text" constraint for text-overlay pins, which would otherwise contradict the explicit render-this-text instruction `buildImagePrompt()` now adds.

### Changed

* `lib/prompts/pinterest-pins.ts`: `classifyPinComposition` (keyword heuristic) is now a fallback only, used solely when the project's niche has no entry in `niche-visual-conventions.ts` — preserves existing behavior for Home Decor projects created before `projects.niche` existed. `PROMPT_ID`: `pinterest-pins-v4` → `pinterest-pins-v5`.
* Server clamps `textOverlayMode` to `never` whenever the resolved niche convention doesn't allow text overlay, regardless of the submitted value.

### Docs

* `docs/DECISIONS.md`: 2026-07-27 (2) entry.
* `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/UI_UX.md`, `.env.example`, `lib/guide/content.ts` updated.

---

# [1.17.1] - 2026-07-27

## Pinterest `image_prompt` aligned to FLUX.2 official prompting framework

### Fixed

* `lib/prompts/pinterest-pins.ts`: the prompt used to explicitly ban style keywords and quality modifiers from `image_prompt`, contradicting Black Forest Labs' documented FLUX.2 prompting framework (Subject + Action + Style + Context), which treats Style as one of the four required components. Now instructs 2-4 concrete style keywords (photography genre, realism level, quality modifier) appended as the prompt's closing clause, never at the start.
* Same file, `space` composition mode (see 2026-07-26 (2) decision): the opening clause of the prompt could still be led by a specific object/detail from the pin's title rather than the room itself. Now forces the whole room as the grammatical subject of the first clause (e.g. "A modern kitchen featuring..."); title/description details are listed afterward, never as the opening subject.
* `PROMPT_ID`: `pinterest-pins-v3` → `pinterest-pins-v4`.

### Docs

* `docs/DECISIONS.md`: 2026-07-27 entry with FLUX.2 framework rationale.
* `docs/ARCHITECTURE.md`: stale `pinterest-pins-v2` reference corrected to `pinterest-pins-v4`.

---

# [1.17.0] - 2026-07-26

## Projects: Brand Profile truncation fix, Niche field, Default Language

### Fixed

* Brand Profile (`projects.description`) was silently capped at 500 characters by a Zod `.max(500)` and a matching `<Textarea maxLength={500}>` — the DB column itself (`text`) had no limit. Both raised to 10,000.

### Added

* `projects.niche` (nullable text, migration 017) — free text, no DB constraint. New `components/ui/combobox.tsx` (wraps `@base-ui/react/combobox`, no new dependency) offers a curated 20-item suggestion list in the Project form, but any typed value is accepted and stored as-is. Storage only for now — no prompt logic reads it yet.
* `projects.default_language` (nullable text, migration 017) — one of en/de/es/fr. Set via a Select in the Project form; pre-fills (never forces) the Language field on both the Pinterest and WordPress generation forms when that project is selected.

### Docs

* `docs/DATABASE.md`: `projects` table columns updated.
* `docs/TASKS.md`: TASK-033 added and marked completed.

---

# [1.16.0] - 2026-07-26

## WordPress Categories (manual, project-scoped)

### Added

* `wordpress_categories` table (migration 016), scoped by `project_id`, RLS via `user_id = auth.uid()` — same pattern as `boards`.
* `wordpress_articles.category_id` (nullable, `ON DELETE SET NULL`) — deleting a category never deletes its articles.
* `components/wordpress/category-select.tsx`: manual category picker with inline "+ New Category" creation and a Manage dialog (rename/delete) — no AI suggestion anywhere.
* Both generation flows (`article-form.tsx` keyword, `pins-source-article-form.tsx` pins) now have a Category field, optional, defaulting to "Uncategorized".
* `app/api/wordpress/categories/route.ts` and `.../categories/[id]/route.ts`: create/rename/delete, ownership-checked per TASK-018's established inline pattern.
* WordPress History: category badge on each card, and a Category filter alongside Project/Language/Status.
* New `/wordpress/categories` page and sidebar entry (WordPress → Categories) — manage all categories per project, mirroring the existing Pinterest Boards page.

### Docs

* `docs/DATABASE.md`: new `wordpress_categories` section, `category_id` added to `wordpress_articles`.
* `docs/DECISIONS.md`: 2026-07-26 entry — manual-only assignment rationale.
* `docs/TASKS.md`: TASK-032 added and marked completed.
* `docs/UI_UX.md`: Sidebar diagram corrected (WordPress was stale, still listed under "Platforms — disabled"), new "WordPress Categories" section added.

---

# [1.15.5] - 2026-07-20

## Dashboard restructured to reflect Pinterest + WordPress

### Changed

* `app/(dashboard)/dashboard/page.tsx`: "Generate Content" is now a dropdown button (Pinterest Pins / WordPress Article) instead of a single link to `/pinterest`; new `components/dashboard/generate-content-menu.tsx`.
* Quick Actions: "View History" split into separate "Pinterest History" and "WordPress History" cards (grid now 3 cards); "New Project" unchanged.
* Stats: new "Articles Generated" card (`wordpress_articles` count); "Projects" card is now a link to `/projects`.
* Recent Activity now merges Pinterest and WordPress generations, sorted together by date, with a per-row platform icon and type-correct link.

### Docs

* `docs/UI_UX.md`: Dashboard section rewritten for the two-platform structure.
* `docs/TASKS.md`: TASK-031 added and marked completed.

---

# [1.15.4] - 2026-07-19

## Dashboard scroll structure fixed; Pinterest Generator header spacing tightened

### Fixed

* `app/(dashboard)/layout.tsx`: the sidebar and top bar used to scroll away with the page — a wheel event starting outside `<main>` (over the sidebar or top bar) bubbled up and scrolled the whole document. Root cause: viewport scrollability is governed by `<body>`'s own `overflow` value (CSS overflow-propagation rule), not a descendant div's `overflow-hidden`. Verified visually with a Playwright-driven browser before and after (real wheel events, not just programmatic `scrollTop`) at 1440×900, 1366×768, and 768px width.
* `components/layout/scroll-lock.tsx` (new): `<ScrollLock />` client component, mounted in the dashboard layout, locks `overflow: hidden` on `html`/`body` for as long as the dashboard is mounted and restores the previous value on unmount, so `/login` and other routes outside `(dashboard)` keep normal document scroll.
* `components/pinterest/pin-form.tsx`: Pinterest Generator hero (icon + title + description) was tall enough that the full form (Keyword, Board, Project/Language/Pins) didn't reliably fit above the fold on smaller viewports. Tightened top padding, icon size, and margins (~215px → ~140px); form now fits without scrolling at 1440×900 and 1366×768.

### Docs

* `docs/UI_UX.md`: new "Scroll Containment" section under Layout Structure explaining the fixed dashboard shell and why `ScrollLock` is needed.

---

# [1.15.3] - 2026-07-18

## Pin cards: full title/description/keywords/image prompt no longer hidden behind `line-clamp` truncation with no way to view them

### Added

* `components/pinterest/pin-detail-dialog.tsx` — shared, read-only `PinDetailDialog`: full-size image, untruncated title/description, keywords as tags, and the image prompt in a monospace block (scrollable independently via `overscroll-contain`, labeled "Internal use, not exported") with a Copy-to-clipboard button
* `components/boards/board-pin-card.tsx` — client wrapper extracted from the previously inline pin card markup in `app/(dashboard)/boards/[id]/page.tsx`, so the Board Detail page (a Server Component) can open `PinDetailDialog` on click

### Changed

* `components/pinterest/pin-table.tsx`: pin cards are now clickable (`cursor-pointer`, hover state) and open `PinDetailDialog`; the checkbox, image link, Regenerate button, and Versions button all `stopPropagation()` so their own actions still fire instead of opening the dialog
* `app/(dashboard)/boards/[id]/page.tsx`: inline pin card markup replaced by `<BoardPinCard>` — same click-to-detail behavior as the Results page, no duplicated logic
* `PinDetailDialog`'s `DialogContent` gets `max-h-[90vh] overflow-y-auto` — without it, a pin with a long image prompt made the dialog taller than the viewport with no way to scroll to the cut-off content (the dialog is `position: fixed`, so page scroll can't reveal what's clipped)
* `docs/UI_UX.md`: "Pins Table"/"Pin Card View"/"Character Counters" sections (describing inline-editable fields and per-field copy buttons that were never built) replaced with "Pin Grid" and "Pin Detail Dialog", matching the actual read-only, click-to-expand behavior; `lib/guide/content.ts` "Editorial Review" section gets a point about clicking a card for full details

### Verified

* `lib/csv/pinterest.ts` (`generatePinterestCsv`, the only CSV export path, also used by `history-actions.tsx`) never included `image_prompt` — confirmed by reading the full column list: Title, Media URL, Pinterest board, Description, Link, Publish date, Keywords or tags. Nothing to remove.

### Decisions

* No Dialog/Sheet for pin detail existed to reuse — built new, modeled structurally on `ImageVersionsDialog` (controlled `open`/`onClose` state) but read-only, no duplicated card actions
* No ScrollArea component exists in the project (`components/ui/scroll-area.tsx` absent, not in `docs/COMPONENT_STANDARDS.md`) — the scroll fix uses plain Tailwind `overflow-y-auto`, consistent with the only other scrollable text block in the app (`research-form.tsx`)
* `line-clamp-2`/`line-clamp-3` intentionally kept in both grid views — the fix adds a way to see full content, it doesn't remove the density-oriented truncation in list view

---

# [1.15.2] - 2026-07-18

## TASK-028: fix "Article generation failed" on the WordPress article-writing step — per-call OpenRouter timeout instead of one fixed 60s/90s for every call

### Added

* `lib/ai/providers/openrouter.ts` / `lib/ai/services/text.ts`: `generateText()` now accepts an optional `timeoutMs`, threaded through `chatCompletion()` → `chatCompletionOnce()`, overriding the default 60s (90s with web-search plugins) fetch timeout. Omitted, behavior is unchanged for every existing caller (Pinterest generation, outline generation, `addExternalLink()`)
* `lib/wordpress/generate-article.ts`: `ARTICLE_GENERATION_TIMEOUT_MS = 120000`, passed to the full-article `generateText()` call in both `generateWordPressArticle()` (Option 1) and `generateArticleFromPins()` (Option 4) — measured at ~60-90s in practice for the 8000-max-token, 10-block, 1800-2500-word prompt, vs ~15-20s for the much lighter outline call that keeps the shared default
* Step-timing `console.log`s in `generateArticleFromPins()` (outline/article/featured-image duration in ms) — used to pin down the exact step and elapsed time behind the `AbortError` this fix addresses
* `export const maxDuration = 180` on both `/api/wordpress/generate` and `/api/wordpress/generate-from-pins` — Vercel deployment prep, no effect in local dev

### Decisions

* Per-call timeout override, generous timeout for the article-writing step only, rather than raising the shared default for every text call — see DECISIONS.md 2026-07-18
* Vercel Pro plan required for these two routes once deployed (Hobby's 60s hard cap ignores `maxDuration`) — documented in DEPLOYMENT.md
* The growing synchronous AI pipeline (outline → article → images, soon + external link search) approaching the timeout ceiling is logged as technical debt pointing toward an eventual move to Inngest, not fixed now — see TECHNICAL_DEBT.md

---

# [1.15.1] - 2026-07-18

## TASK-028: fix "AI returned an invalid outline format" — title/metaTitle length is now enforced deterministically, not by the model

### Added

* `lib/utils/text-truncate.ts` — `truncateAtWordBoundary()`, cuts a string to a max length at the last complete word (never mid-word, no "..." appended)
* `meta_title` column on `wordpress_articles` (migration 015, nullable) — separate `<title>`/SERP-facing field from the on-page `title` (H1)
* `getMetaTitle()` (`lib/wordpress/export.ts`) — falls back to a truncated `title` for articles generated before migration 015 (`meta_title` is null)
* Article page (`/wordpress/[id]`) now displays the meta title above the meta description

### Changed

* `lib/validations/wordpress.ts`: `wordpressOutlineSchema.title` limit raised `max(70)` → `max(100)` (now just a backstop); new `metaTitle` field, `max(70)`; `slug` gains an explicit `max(100)` it never had
* `lib/wordpress/generate-article.ts`: both `generateWordPressArticle()` (Option 1) and `generateArticleFromPins()` (Option 4) now run `applyOutlineTextLimits()` — truncates `title`, `metaTitle`, `slug`, `metaDescription` on the model's raw outline JSON before Zod validation, so `safeParse` can no longer reject for length overflow, only for genuine structural errors
* `lib/ai/prompts/wordpress-outline-prompt.ts` / `wordpress-from-pins-prompt.ts`: length instructions reworded from a hard "max N characters" to "aim for ~N, the system trims automatically" — the model no longer needs to sacrifice writing quality to hit an exact character count it can't reliably measure across languages

### Decisions

* Separate H1/meta title + deterministic word-boundary truncation instead of a retry-on-overflow loop — see DECISIONS.md 2026-07-18

---

# [1.15.0] - 2026-07-17

## TASK-028 (Option 4): WordPress Article Generator — Selected Pins → Unified Article

### Added

* `source_pin_ids uuid[]` on `wordpress_generations` (migration 014) — provenance for pins-based generations, no FK on array elements (ownership validated in the API route)
* `lib/ai/prompts/wordpress-from-pins-prompt.ts` — `buildWordPressFromPinsPrompt()`, synthesizes one unified article outline from multiple pins' title/description/keywords (not a concatenation); reuses the same fixed 10-block structure as Option 1. A frequency-based heuristic (`deriveThemeKeyword()`) picks a seed phrase across the pins' keywords to anchor `buildSeoGuidelines()`'s single-primary-keyword rule — the actual title/angle synthesis is still the model's own
* `lib/validations/wordpress.ts` — `buildWordpressPinsOutlineSchema(imageCount)`, same shape as Option 1's outline schema except `images` length is pinned to however many internal images are actually available (0-3) instead of a fixed 2-3; `generateArticleFromPinsSchema` for the new route's request body
* `lib/wordpress/generate-article.ts` — `generateArticleFromPins()`: same outline → article two-step pipeline as Option 1, but only the featured image is generated (`generateImage()`, role IMAGE, from a prompt describing the unified theme); internal images are the selected pins' own active `pin_images` URLs, copied as-is into the `{{IMAGE_N}}` markers — no `generateImage()` call or re-upload for those. No `addExternalLink()` call yet (pending the external-link 404 fix, tracked separately)
* `POST /api/wordpress/generate-from-pins` — separate route from Option 1's `/api/wordpress/generate` (pins-based ownership check instead of project-based, no `keyword`/`language` in the request). Validates all selected pins share one `generation_id` (400 if not), derives `project_id` and `language` server-side from the pins, rate-limited same as Option 1 (20/hour)
* `lib/queries/pin-images.ts` — `getActivePinImageUrls()`, batch lookup of each pin's active `pin_images.url`
* `components/pinterest/generate-wordpress-button.tsx` — "Generate WordPress Article" action in `SelectionActionBar` (Pinterest Editorial Workflow), active from 1 pin selected; warns via dialog before navigating when fewer than 3 pins are selected
* `/wordpress?pinIds=...` — pins-source mode on the existing WordPress generator page: pin thumbnails/titles preview, optional Research Notes, Project/Language are not selectable (derived from the pins) — new `components/wordpress/pins-source-article-form.tsx`

### Decisions

* Featured image is always newly generated from the article's unified theme (never a reused pin image); internal images are always reused pin images (never freshly generated) — see DECISIONS.md 2026-07-17
* Labeled "Option 4" rather than reusing "Option 3" (already reserved in TASKS.md for a future Blog URL → rewritten article flow) — see DECISIONS.md 2026-07-17

---

# [1.14.0] - 2026-07-15

## TASK-028 (Option 1): WordPress Article Generator

### Added

* `wordpress_generations` / `wordpress_articles` / `wordpress_article_images` tables (migration 012) + `wordpress-images` storage bucket — independent history from Pinterest's `generations`/`pins`, per the TASK-027-deferral decision (duplicate the generator layer, reuse only what's already generic)
* `lib/ai/prompts/seo-guidelines.ts` — generator-agnostic SEO rules (heading structure, keyword placement, meta description length, paragraph length, active voice, target word count), importable by any future long-form generator
* `lib/ai/prompts/wordpress-outline-prompt.ts` + `wordpress-article-prompt.ts` — two-step generation: an outline (title, slug, meta description, H2 sections, 1 featured + 2-3 internal image prompts) is planned and Zod-validated first, then the full Markdown article is written from that outline and Zod-validated
* `lib/wordpress/generate-article.ts` — orchestrates both AI text calls plus parallel image generation (`generateImage()`, role IMAGE, bounded concurrency via the existing `promisePool`); `{{IMAGE_N}}` markers are resolved into `![alt](url)` before the article is persisted. Text role centralized to `FAST` via a single `TEXT_ROLE` constant — the one place to switch to `SMART` if quality requires it
* `POST /api/wordpress/generate` — mirrors `/api/pinterest/generate`'s auth/ownership/rate-limit pattern (20/hour); reuses `buildBrandProfileContext()` unchanged, no Content Analyzer / Editorial Workflow wiring (out of scope for a bare-keyword flow)
* `lib/wordpress/export.ts` — `exportToMarkdown()` (passthrough, content is already the source of truth) and `exportToHtml()` (via `marked`, new dependency — see DECISIONS.md)
* `/wordpress` (form) and `/wordpress/[id]` (article view, Copy Markdown / Copy HTML / Download .md) — sidebar entry unhidden (`disabled` removed), no other nav restructuring
* `lib/guide/content.ts` — new "WordPress Generator" guide section

### Not implemented (explicitly out of scope for Option 1)

* Options 2 (reference image input) and 3 (rewrite from blog URL) — remain PLANNED
* Direct WordPress REST API publishing — export is copy/download only
* Credits enforcement — same gap as Pinterest generation, blocked on TASK-011

## TASK-029: Rate Limit Bypass Admin Panel

### Added

* `rate_limit_bypass` table (migration 011) + `is_rate_limit_bypassed()` Postgres function — self-referential (no email argument, reads the caller's own JWT), safe to expose to all authenticated users via `RPC`. Table itself has RLS enabled with no policies (deny-all direct access)
* `lib/supabase/admin.ts` `createAdminClient()` — first use of the `service_role` key in this codebase, confined to `app/api/admin/bypass-emails/route.ts`, only ever reached after an `ADMIN_EMAIL` session check
* `lib/rate-limit.ts` `checkRateLimit()` now takes `userEmail` and checks, in order: `ADMIN_EMAIL` env match → `rate_limit_bypass` table membership → the existing per-window counter (TASK-018, unchanged)
* `/admin/bypass` — hidden Server Component page (404 via `notFound()` for non-admins, no sidebar link) to add/remove bypass emails, backed by `GET/POST/DELETE /api/admin/bypass-emails` (each independently re-checks `ADMIN_EMAIL`)

No changes to TASK-018's rate limiting counters, ownership checks, `is_default` fix, JSON try/catch, or UUID validation.

---

# [1.12.0] - 2026-07-14

## TASK-018: Security Hardening

### Added

* Application-level rate limiting on AI-cost-incurring endpoints — new `api_rate_limits` table + `increment_rate_limit()` Postgres function (migration 010), `lib/rate-limit.ts` (`checkRateLimit()`). Limits: `pinterest/generate`, `research`, and `analyze` at 60/hour, `pinterest/generate-images` at 20/hour. Returns `429` (`rate_limited`) when exceeded
* Explicit app-level ownership checks (`user_id === auth.uid()`, `403 forbidden`) on every API route that loads a resource by ID — defense-in-depth alongside existing RLS policies (`projects/[id]`, `boards/[id]`, `generations/[id]`, `research/[id]`, `pinterest/pin-images/[id]` and `pinterest/pin-images`, `pinterest/generate`, `pinterest/schedule`, `boards`, `research`, `analyze`)
* `lib/utils/uuid.ts` (`isValidUuid()`) — URL `[id]` params are now format-validated before hitting the database, returns `400 invalid_id`
* `lib/queries/pin-images.ts` `getPinOwnerUserId()` — resolves ownership through the `pin_images → pins → generations` chain, since `pin_images` has no direct `user_id` column

### Fixed

* `is_default` cross-user bug in `PATCH /api/projects/[id]` — the default-project swap now explicitly scopes both updates to `user_id = auth.uid()` instead of relying solely on RLS
* Malformed JSON request bodies no longer crash with an unhandled 500 — all 9 POST/PATCH routes now return `400 invalid_json`

No changes to existing request/response shapes for valid requests, no changes to business logic — new error paths and one new table only.

---

# [1.11.2] - 2026-07-14

## TASK-FIX-004: Design System Consistency Corrections

### Changed

* Fond de page passé d'un tint violet subtil à un gris neutre — le violet est réservé aux boutons/liens/états actifs uniquement
* Les pages de formulaire (Research, Generate, New/Edit Project, New/Edit Board) ne s'étirent plus sur toute la largeur — largeur plafonnée via la nouvelle prop `narrow` de `PageContainer`
* Discipline "un seul bouton primary par écran" appliquée : les boutons secondaires/de navigation (Boards, Projects, Pinterest, Research, History) passent en style outline
* Boutons de soumission (Research, Generate Pins) désormais alignés à droite et dimensionnés au label plutôt qu'en pleine largeur
* Indicateur de nav actif dans la sidebar : fond plein remplacé par une barre gauche + texte foreground sombre

No database migration, no API contract changes — CSS and component-prop changes only.

---

# [1.11.1] - 2026-07-09

## TASK-FIX-003: Research Reliability & Pinterest URL Removal

### Fixed

* Research failures now show a specific, actionable error message (blocked / timeout / rate-limited / unsupported site / no content) instead of one generic string, persisted and displayed on the failed history row, with a Retry action
* Firecrawl scrape calls now use `onlyMainContent`/`waitFor` for more reliable content extraction

### Removed

* "Pinterest URL" removed as a Research source — Firecrawl does not support scraping pinterest.com at all (confirmed via live testing, not fixable with scrape params). Historical Pinterest research results remain visible; new submissions are rejected server-side.

No database migration — the `source_type` CHECK constraint is unchanged, only the app-level validation and UI selector changed.

---

# [1.11.0] - 2026-07-09

## User Guide

### Added

* New in-app Guide (`/guide`), added to the sidebar's Account group — one page, one card per feature (Projects, Research, Analyze, Generate, Editorial Review, AI Images, Boards, Scheduling, Export, History), with an anchor-link chip row for quick navigation
* Content lives in `lib/guide/content.ts` (`guideSections`) — plain data, no markdown parser or CMS added
* New standing rule in `CLAUDE.md` Documentation Discipline: any user-facing feature must update the Guide at the same time it ships, not as a follow-up task

No API or database changes — static content page only.

---

# [1.10.1] - 2026-07-09

## TASK-FIX-002: History Pagination

### Added

* Server-side pagination on the History page (`app/(dashboard)/history/page.tsx`) — 20 generations per page via Supabase `.range()`, Previous/Next controls, applied after all existing filters
* Changing a filter resets to page 1; navigating to an out-of-range page redirects to the last valid page instead of showing an incorrect empty state

No API or database changes.

---

# [1.10.0] - 2026-07-09

## TASK-026: Navigation Refactor

### Changed

* Sidebar reorganized from function-based groups (Generators / Library / Account) to platform-based groups (Workspace / Pinterest / Platforms / Account), per the structure already specified in ARCHITECTURE.md
* New disabled "Platforms" group (WordPress, Facebook, LinkedIn, Medium) — same pattern as the existing disabled Credits/Settings items, preparing the sidebar for TASK-028 and future generators

No route, API, or database changes — sidebar data structure only (`components/layout/sidebar.tsx`).

---

# [1.9.0] - 2026-07-09

## Visual Redesign: AI Purple + Cyan Rebrand

### Changed

* New color palette — violet/purple primary (`#7C3AED`) + cyan brand accent (`#0891B2`) replacing the single blue accent; new `--brand-accent` token added (`app/globals.css`), scoped to AI/analysis-context highlights only (Content Analyzer panel, Pinterest "using content analysis" indicator), distinct from shadcn's structural `--accent`
* New typography pairing — Space Grotesk (headings) + DM Sans (body), replacing Geist; `--font-heading` is now independent of `--font-sans` (previously aliased) and applied globally via a new `h1..h6` base-layer rule
* Sidebar logo mark updated to a two-tone gradient (primary → brand-accent)
* Page background now carries a subtle violet tint; cards/popovers stay achromatic for legibility in dense forms/tables

### Fixed

* Research history: a failed Pinterest-source research result showed a red "Pinterest URL" badge, reading as a miscolored category tag rather than a status indicator. Source-type badge is now always neutral (`outline` variant); a separate "Failed" badge with an icon appears only when `status === 'failed'`.

No schema or API changes — CSS tokens and four component files only.

---

# [1.8.0] - 2026-07-09

## TASK-024: Content Analyzer

### Added

* New `lib/analyzer/` provider-agnostic normalization layer (`analyzeContent()`, SMART AI role) — same philosophy as `lib/research/` and `lib/ai/`
* New `content_analyses` table (migration 009): structured theme/keywords/audience/tone/category/summary per research result, immutable, one row per `research_result_id`
* New `POST /api/analyze` — idempotent (returns the existing analysis on re-click instead of re-running the AI)
* Research page: visible "Analyze" button + result panel after a successful research call, shown before "Continue to Generate"
* `buildAnalysisContext()` (`lib/analyzer/context.ts`) injects the analysis into the AI system prompt, same pattern as Brand Profile — wired into `POST /api/pinterest/generate` via an optional `analysisId`
* Pinterest Generator form shows a visible indicator when generation is using a carried-over analysis
* Closes the `Research → Analyze → Generate` loop: research content now reaches AI generation, deliberately deferred by TASK-023

Fully backward compatible: `analysisId` is optional everywhere — direct-keyword Pinterest generation without Research/Analyze is unchanged.

---

# [1.7.0] - 2026-07-09

## TASK-023: Content Research & Input Sources

### Added

* New `lib/research/` provider-agnostic layer (`runResearch()`, Firecrawl provider) — same philosophy as `lib/ai/`, swappable without touching route code
* New `research_results` table (migration 008): keyword/website/blog/Pinterest URL research, scoped per project, immutable
* New `/research` page: research form, content preview, per-project research history with delete
* `POST /api/research`, `DELETE /api/research/[id]`
* "Continue to Generate" bridges Research → Pinterest Generator (suggested keyword + source URL via query params); `generations.website_url`/`pinterest_url` (previously unused columns) now populated for provenance
* Sidebar: "Research" added to the Generators group

Deliberately out of scope: scraped content is not yet fed into the AI generation prompt (TASK-024, Content Analyzer, will normalize research before generators consume it). Image Upload input source remains deferred to TASK-013.

## Pinterest Generator: manual board selection

### Added

* Optional `board` field on the Pinterest Generator form (combobox — pick an existing board for the selected project or type a new one). When set, it overrides the AI's per-pin board suggestion for the whole batch; when left blank, behavior is unchanged (AI suggests per pin, auto-linked via `findOrCreateBoardIds`).
* `POST /api/pinterest/generate` accepts an optional `board` field.

Follow-up to TASK-025 (Pinterest Boards Management) — no schema change.

## History: Board filter

### Added

* Board filter on the History page, scoped to the selected Project (changing Project clears the Board filter). Filters generations by matching `pins.board_id` for the chosen board, since a board isn't directly linked to a generation.

Follow-up to TASK-025 (Pinterest Boards Management) — no schema change.

---

# [1.6.0] - 2026-07-08

## TASK-025: Pinterest Boards Management

### Added

* `boards` table (migration 007) — real Pinterest board entities, scoped per project
* `pins.board_id` (nullable FK) — links a pin to its board; existing free-text `pins.board` untouched
* Auto-linking at generation time (`findOrCreateBoardIds()`): AI-suggested board names are matched case-insensitively and turned into persistent boards automatically
* `POST /api/boards`, `PATCH /api/boards/[id]`, `DELETE /api/boards/[id]`
* `/boards`, `/boards/new`, `/boards/[id]`, `/boards/[id]/edit` pages — CRUD, per-board pin history, per-board CSV export
* "Boards" nav item in the sidebar Library group

No changes to History, PinTable, or the CSV builder.

---

# [1.5.0] - 2026-07-08

## TASK-022: Brand Profile & AI Context

### Added

* `lib/brand-profile.ts` — `buildBrandProfileContext()`, a Core Platform helper reusable by any future generator
* `projects.description` now flows into Pinterest generation as brand context (tone, audience, style), injected into the FAST role's system prompt — no schema change, no new API fields

### Changed

* `ProjectForm` — "Description" relabeled "Brand Profile" with a helper line explaining it drives AI generation (copy only)

---

# [1.4.0] - 2026-07-08

## TASK-FIX-001: Pinterest Generation Reliability & Error Visibility

### Fixed

* Reasoning-capable FAST models (e.g. `openai/gpt-5-mini`) burned their entire token budget on hidden reasoning, returning empty content and a generic "Generation failed" error. `generateText()` now caps reasoning effort to `minimal` for the FAST role.
* Intermittent "response wasn't valid JSON" failures at higher pin counts: OpenRouter occasionally returns HTTP 200 with `finish_reason: "error"` (an interrupted upstream stream) after emitting partial content. `chatCompletion()` now detects this and retries automatically (up to 3 attempts) instead of trying to parse truncated content.

### Added

* `generations.error_message` column (migration 006) — persists why a generation failed
* `classifyGenerationError()` in `POST /api/pinterest/generate` — maps known AI Engine errors to specific, actionable messages instead of a generic failure string
* `RegenerateGenerationButton` — shown on the results page when a generation produced 0 pins, resubmits the same parameters

No API contract or schema changes beyond the new nullable column.

---

# [1.3.0] - 2026-07-08

## TASK-AI-001: AI Engine Architecture Refactor

### Added

* `lib/ai/` — provider-agnostic AI Engine. Business code now only calls `generateText()`, `analyzeImage()`, `generateImage()` (`lib/ai/engine.ts`)
* Four AI roles (FAST, SMART, VISION, IMAGE) with independent provider/model configuration via `lib/ai/config.ts` and new env vars (`AI_FAST_PROVIDER`/`MODEL`, `AI_SMART_PROVIDER`/`MODEL`, `AI_VISION_PROVIDER`/`MODEL`, `AI_IMAGE_PROVIDER`/`MODEL`)
* `lib/ai/providers/openrouter.ts` — `chatCompletion()` (moved from `lib/openrouter/client.ts`) and new `visionCompletion()` (implemented, not yet wired into any route — ready for TASK-013)
* `lib/ai/providers/openai.ts` — `generateImage()` moved from `lib/openai/image-client.ts`
* `lib/ai/prompt-engine/` — dedicated Prompt Engine that turns the Pinterest Package into the IMAGE prompt (`engine.ts`, `presets.ts`, `templates/photography-styles.ts`), moved from `lib/prompts/image-generator.ts` with byte-identical prompt text
* Reserved (unused) `FAL_API_KEY` / `HIGHFIELD_API_KEY` env vars for future image providers

### Changed

* `POST /api/pinterest/generate` — uses `generateText({role: 'FAST', ...})` instead of calling OpenRouter directly
* `POST /api/pinterest/generate-images` — uses `generateImage()` and `buildImagePrompt()` from the AI Engine instead of calling OpenAI directly
* `lib/prompts/image-generator.ts` — trimmed to `IMAGE_CONFIG` only (batch size, concurrency, output size)

### Removed

* `lib/openrouter/client.ts`, `lib/openai/image-client.ts` — logic moved into `lib/ai/providers/`

No API contract, database schema, prompt content, or product behavior changed.

---

# [1.2.0] - 2026-06-26

## TASK-021: Image Versioning & Regeneration

### Added

* `pin_images` table with versioning support (migration 005)
* Partial unique index: one active image per pin enforced at database level
* GET /api/pinterest/pin-images — list all versions for a pin
* PATCH /api/pinterest/pin-images/[id] — set active image version
* DELETE /api/pinterest/pin-images/[id] — delete a version with safety checks
* ImageVersionsDialog — thumbnail grid for comparing and managing image versions
* Lightbox preview in ImageVersionsDialog — click any thumbnail to view full-size with dark overlay
* Per-pin Regenerate button (hover overlay on image area)
* Per-pin Versions button showing version count (visible when count > 1)
* PinImage and PinImageInsert types in types/database.ts
* lib/queries/pin-images.ts — shared query for fetching pin image versions
* Variation directive in image prompt for version > 1 — regenerated images vary camera angle, composition, lighting, styling, props, and perspective

### Changed

* POST /api/pinterest/generate-images — creates versioned pin_images records instead of overwriting; supports selective regeneration when pinIds provided
* buildImagePrompt() accepts optional version parameter; version > 1 injects explicit variation instructions for meaningfully different results
* Storage path changed from `{user_id}/{pin_id}.png` to `{user_id}/{pin_id}/{version}.png`
* ImageVersionsDialog — active version uses primary badge with checkmark, "Use this" is a primary button, delete action de-emphasized as icon-only ghost button
* GenerateImagesButton — shows "Regenerate (N)" when all selected pins already have images
* PinTable — accepts generationId and imageVersionCounts props for regeneration and version display
* EditorialWorkspace — passes imageVersionCounts to PinTable, computes allPinsHaveImages for button label
* getGenerationWithPins — returns imageVersionCounts alongside generation and pins
* ScheduleDialog — accepts optional selectedPinIds for selective scheduling; button shows "Schedule (N)" when selection active
* PATCH /api/pinterest/schedule — accepts optional pinIds array for selective scheduling and clearing
* EditorialWorkspace — SelectionActionBar now includes Schedule between Regenerate and Export
* DATABASE.md — documented pin_images table, updated storage path pattern
* API.md — documented new pin-images endpoints, updated generate-images documentation

---

# [1.1.0] - 2026-06-26

## TASK-020: Editorial Workflow

### Added

* EditorialSelectionProvider — reusable React Context for item selection state (components/editorial/selection-provider.tsx)
* SelectionToolbar — Select All / Select None / Invert buttons with real-time counter (components/editorial/selection-toolbar.tsx)
* SelectionActionBar — contextual action bar visible only when items are selected (components/editorial/selection-action-bar.tsx)
* EditorialWorkspace — wrapper composing provider + toolbar + action bar + pin grid (components/editorial/editorial-workspace.tsx)
* Per-pin selection checkbox in PinTable with hover-reveal and selected state styling
* Selective image generation: POST /api/pinterest/generate-images now accepts optional pinIds array

### Changed

* PinTable converted to client component with selection context integration
* ExportCsvButton accepts optional selectedPinIds — exports only selected pins when selection exists
* GenerateImagesButton accepts optional selectedPinIds — generates images only for selected pins when selection exists
* Results page refactored to use EditorialWorkspace wrapper — header remains server-rendered, editorial area is client-interactive

---

# [1.0.10] - 2026-06-26

## Documentation: Final Vision Alignment

### Changed

* PROJECT.md: OmniFlow presented as a multi-platform AI content platform; Pinterest identified as first module; WordPress acknowledged as next planned module
* PROJECT.md: problem statement broadened from Pinterest-only to multi-platform content creation
* PROJECT.md: success criteria generalized to platform-agnostic language with Pinterest as first validated module
* PROJECT.md: removed "WordPress Publishing" and "SEO Article Generation" from out-of-scope (now in roadmap)
* PROJECT.md: added Platform Roadmap section referencing TASKS.md
* UI_UX.md: overview rewritten from "Pinterest-First SaaS" to multi-platform content workspace
* UI_UX.md: primary goal broadened to platform-agnostic content generation
* UI_UX.md: future screens split into "Planned (in roadmap)" and "Not MVP" categories
* RULES.md: Rule #25 updated — removed WordPress and SEO Articles from prohibited list; added note about roadmap-gated implementation
* DECISIONS.md: "Pinterest First MVP" decision updated — WordPress and SEO Articles reclassified from "excluded" to "not in MVP, now in roadmap"
* DECISIONS.md: added "Platform Vision Evolution" decision (2026-06-26)

---

# [1.0.9] - 2026-06-26

## Documentation: Architecture Alignment

### Changed

* ARCHITECTURE.md updated to reflect the new long-term product vision
* Product vision: OmniFlow presented as an AI content platform, not a Pinterest generator
* High-level architecture: documented the full pipeline (Research → Analyze → Generate → Review → Images → Schedule → Export) with implemented vs planned status
* Module architecture: added platform-based module diagram (Core, Pinterest, WordPress, Facebook, LinkedIn, Medium)
* Pinterest module: separated current state from roadmap evolution
* Multi-generator strategy: documented Pinterest as validation module, WordPress as first reuse
* Navigation: documented planned platform-based sidebar structure
* Scalability target: added "Múltiples plataformas de contenido"
* Out of scope: removed "SEO Articles" (now covered by TASK-028 WordPress Generator)

### Added

* Product Vision section
* High-Level Architecture pipeline with implementation status
* Module Architecture diagram
* Brand Profile section (planned — TASK-022)
* Research Layer section (planned — TASK-023)
* Content Analyzer section (planned — TASK-024)
* Editorial Workflow section (planned — TASK-020)
* Pinterest Module section with current state and roadmap
* Multi-Generator Strategy section
* Navigation section (planned — TASK-026)
* Future Evolution section with phased progression

---

# [1.0.8] - 2026-06-26

## Documentation: Technical Debt Separation

### Added

* docs/TECHNICAL_DEBT.md — dedicated document for infrastructure improvements and internal refactoring
* TASKS.md: technical debt reference section pointing to TECHNICAL_DEBT.md
* ARCHITECTURE.md: technical debt reference section pointing to TECHNICAL_DEBT.md

### Changed

* ARCHITECTURE.md: updated folder structure — removed deleted files (openrouter/image-client.ts, action-bar, metric-card, relative-date), added new utils (format-date.ts, status.ts)

---

# [1.0.7] - 2026-06-26

## TASK-019: Frontend Production Readiness

### Added

* loading.tsx for dashboard (uses DashboardSkeleton), history (uses TableSkeleton), projects, pinterest, and results pages
* error.tsx boundary for dashboard route group with retry button
* lib/utils/format-date.ts — shared timeAgo() utility
* lib/utils/status.ts — shared statusToVariant() utility
* aria-label on icon-only DropdownMenuTriggers: history-actions, project-actions, user-menu
* aria-label on back navigation link in results page
* next.config.ts: remotePatterns for Supabase Storage (*.supabase.co/storage/**)
* Image sizes attribute on PinTable for responsive image optimization

### Removed

* LogoutButton component (dead code — replaced by UserMenu in TASK-016)
* lib/openrouter/image-client.ts (dead code — replaced by lib/openai/image-client.ts in TASK-014)
* MetricCard component (unused — dashboard uses inline metric grid)
* ActionBar component (unused — trivial flex wrapper)
* RelativeDate component (unused — timeAgo() utility covers the use case without requiring a client component)
* unoptimized flag from PinTable Image component (no longer needed with remotePatterns)

### Changed

* Eliminated 4 duplicate timeAgo() implementations (dashboard, history-table, results, projects)
* Eliminated 2 duplicate statusToVariant() implementations (dashboard, history-table)

---

# [1.0.6] - 2026-06-26

## TASK-017A: Roadmap Reorganization

### Changed

* Roadmap reorganizado según la nueva visión estratégica del producto
* Product Vision added: Research → Analyze → Generate → Review → Images → Schedule → Export
* Pinterest established as first module implementing the complete flow; WordPress reuses the architecture
* Roadmap organized in 4 phases after Security Hardening and Visual Refinement
* FASE 1 — Pinterest Professional Workflow: TASK-020 Editorial Workflow, TASK-021 Image Versioning & Regeneration, TASK-022 Brand Profile & AI Context
* FASE 2 — Intelligent Content Research: TASK-023 Content Research & Input Sources, TASK-024 Content Analyzer, TASK-025 Pinterest Boards Management
* FASE 3 — Platform Architecture: TASK-026 Navigation Refactor, TASK-027 Multi-Generator Architecture
* FASE 4 — WordPress: TASK-028 WordPress Generator
* TASK-011 Credits and TASK-012 Stripe repositioned after platform phases
* TASK-013 Image Analysis remains DEFERRED
* Removed "SEO Articles" from OUT OF MVP (now covered by TASK-028)

---

# [1.0.5] - 2026-06-26

## TASK-IMG-001: Base Image Generation Prompt Enhancement

### Changed

* Image prompt system upgraded from pinterest-image-v1 to pinterest-image-v2
* LLM instructions now require hyper-specific scene descriptions: concrete subjects, materials, textures, named colors, camera angles, 3-5 supporting details per scene — replaces vague "detailed prompt for vertical image"
* Image prompts are now always generated in English regardless of content language for optimal gpt-image-1 results
* System prompt upgraded: LLM now acts as "visual director" in addition to SEO content creator

### Added

* buildImagePrompt() function in lib/prompts/image-generator.ts — wraps LLM-generated scene descriptions with professional photography directives before sending to gpt-image-1
* inferPhotographyStyle() — niche-aware photography style mapping based on board name (18 categories + generic fallback)
* Photography directives: DSLR full-frame, shallow depth of field, bokeh, natural diffused lighting, rule of thirds, vertical 2:3 filling entire frame
* Quality directives: ultra high resolution, visible textures, rich natural colors, aspirational mood
* Strict negative constraints: no text, typography, watermarks, logos, overlays, frames, borders, collages, or graphic elements
* Niche categories: food, interior, travel, fashion, garden, beauty, fitness, DIY, family, business, wedding, pet, art, education, tech, holiday, organization

---

# [1.0.4] - 2026-06-25

## TASK-017: Documentation Consolidation

### Fixed

* TASKS.md: removed completed tasks from NEXT TASKS section, fixed structure
* TASKS.md: TASK-014 goal corrected from "OpenRouter" to "OpenAI (gpt-image-1)"
* TASKS.md: TASK-001 corrected from "Next.js 15" to "Next.js 16"
* TASKS.md: TASK-014 completed entry corrected from OpenRouter to OpenAI reference
* ARCHITECTURE.md: removed "React Query" from Technical Rules (not installed)
* ARCHITECTURE.md: removed Inngest and Credits Validation from generation flow (not implemented)
* ARCHITECTURE.md: added missing layout components (mobile-nav, user-menu) and skeletons folder
* ARCHITECTURE.md: added sheet and custom UI components to component list
* DATABASE.md: pins.image_prompt description corrected from "FAL / Ideogram" to "image generation"
* DATABASE.md: pins.media_url description corrected from "Future" to "Generated image URL"
* DATABASE.md: generated-images bucket corrected from "Reserved for future" to "Active"
* API.md: marked non-implemented endpoints (GET /api/projects, GET /api/pinterest/generations, POST /api/pinterest/export-csv, credits, stripe) as deferred or not implemented
* RULES.md: Rule #11 corrected — OpenRouter for text/vision only, image generation exception documented
* RULES.md: Rule #9 and #13 corrected — replaced FAL references with OpenAI
* RULES.md: Rule #15 updated — Inngest deferred, MVP uses synchronous generation
* DECISIONS.md: fixed malformed "OpenRouter As Unified AI Gateway" entry
* PROJECT.md: Storage section updated to reflect implemented state
* PROJECT.md: Input Methods now distinguish Implemented / Planned / Deferred status

### Changed

* Roadmap reordered: Security → Visual Refinement → Multi-Generator Architecture → WordPress → Credits → Stripe
* TASK-018 (Security Hardening) defined as next priority
* TASK-019 (Visual Refinement) defined
* TASK-020 (Multi-Generator Architecture) defined
* TASK-021 (WordPress Generator) defined
* TASK-011/012 moved later in roadmap (Credits and Stripe after platform expansion)
* MVP Release Checklist updated with current completion status

---

# [1.0.3] - 2026-06-25

## Blueprint Implementation — Visual Refinement

### Changed

* Dashboard: reordered to Control Center layout — primary CTA "Generate Content" in header, Quick Actions promoted above metrics with hero prominence, Pinterest Generator card uses primary tint and Zap icon, metrics reduced to compact text-lg
* Sidebar: navigation restructured for multi-platform scalability — "Content" group split into "Generators" (Pinterest, future platforms) and "Library" (History), brand tagline "AI CONTENT OS" added below logo mark
* Pinterest Generator: elevated to AI Workspace — larger hero icon (h-14 w-14), text-2xl title, taller keyword input (h-12), taller generate button (h-12), increased vertical padding (pt-8 sm:pt-16), wider spacing between hero and form (mb-10)
* Results page: refined header — larger back button (h-7 w-7), dot separators use border color, actions bar with left padding aligned to content, pin count label above grid
* Pin cards: redesigned for AI-generated content feel — image placeholder with Sparkles + "AI Generated" label when no image exists, numbered index as circular badge, increased image max-h to 56 (224px), hover shadow-sm + subtle image scale, gap-4 between cards, 13px title size

---

# [1.0.2] - 2026-06-25

## Frontend Architecture Formalization

### Added

* Adopted DESIGN_SYSTEM.md as official visual identity reference
* Adopted UI_PRINCIPLES.md as official UX principles reference
* Adopted COMPONENT_STANDARDS.md as official component implementation reference
* PROJECT.md: added Frontend Standards section referencing the three documents
* ARCHITECTURE.md: added Frontend Architecture section with four-level hierarchy (Design System → UI Principles → Component Standards → Feature Components)
* RULES.md: added Rules #26–#31 for frontend development (standards required, reuse before create, visual consistency, server components default, no visual libraries without justification, component standards compliance)
* RULES.md: Golden Rule updated to include DESIGN_SYSTEM.md, UI_PRINCIPLES.md, COMPONENT_STANDARDS.md

---

# [1.0.1] - 2026-06-25

## TASK-016B: Premium Visual Redesign

### Changed

* Design tokens: deeper indigo accent (oklch hue 260), softer shadows, reduced border opacity (border/60), warmer backgrounds
* Sidebar: Linear-inspired — branded logo mark, 11px section labels, 13px nav items, 15px icons, primary tint on active state, w-56
* Topbar: minimal — plain text credits, avatar initials with primary/10 tint, removed Badge for credits
* Dashboard: complete home redesign — time-based greeting, 4-stat grid, 3 quick action cards with hover arrows, activity timeline with inline metadata
* Projects: card grid (sm:2 lg:3) replacing table — folder icon, description preview, generation count, relative dates, "Default" as inline text
* Pinterest Generator: hero-style layout — centered icon + heading + description above form, 3-column settings row, h-11 keyword input, removed Card wrapper
* Results: streamlined header — back arrow + keyword as h1, inline metadata row, removed Card summary, pin cards with visual prominence
* PinTable: cards grid (sm:2 lg:3) replacing table — large image thumbnails (aspect 2:3), board as inline pill, #index in corner, line-clamp-3 descriptions
* History: card-based timeline replacing table — status dots, inline metadata, hover-reveal actions, rounded-xl cards
* History filters: compact h-9 controls, search with subtle placeholder, tighter select widths
* Empty states: larger padding (py-20), rounded-2xl icon containers (h-12 w-12), relaxed line-height descriptions, max-w-xs text
* Auth pages: removed Card wrapper, branded logo mark, "Welcome back" / "Create your account" copy, h-10 inputs, error in tinted background
* UserMenu: simplified to plain trigger (no Button wrapper), h-7 w-7 avatar
* PageContainer: max-w-5xl centered, space-y-8 for more breathing room, py-6/py-8 padding
* PageHeader: 13px description, 0.5 spacing between title and description

---

# [1.0.0] - 2026-06-25

## TASK-016: UI/UX Design System & Professional Redesign

### Added

* Design System: brand blue accent (oklch hue 250), success/warning semantic tokens, 4-level shadow scale
* StatusDot component: colored indicator for generation status (success/warning/error/processing)
* MetricCard component: dashboard metric with icon, value, and subtitle
* PageContainer component: standardized page wrapper with responsive padding
* ActionBar component: consistent button bar for page-level actions
* RelativeDate component: "2h ago" / "3d ago" from timestamps
* MobileNav component: slide-in drawer via Sheet for mobile sidebar
* UserMenu component: dropdown with avatar initials, email, settings link, sign out
* DashboardSkeleton and TableSkeleton loading placeholders
* Badge variants: success (green) and warning (amber)
* Dashboard: real metrics from database + recent activity with clickable rows
* Credits badge in topbar showing current balance

### Changed

* Sidebar: platform-agnostic navigation groups (Workspace/Content/Account), active state with left border accent, reduced width to w-60
* Topbar: hamburger menu for mobile, user dropdown replaces plain email+logout, height reduced to h-12
* Dashboard: replaced static hardcoded cards with real Supabase queries (generations count, pins count, credits)
* Projects page: added description column, relative dates, improved table headers
* Pinterest Generator: centered card layout, side-by-side language/pins selects, Sparkles icon on button
* Results screen: metadata summary card with icons, ActionBar for actions, semantic status badges
* History table: status dots instead of text badges, relative dates, responsive column hiding, project name as pill badge
* History filters: responsive stacked layout on mobile
* PinTable: rounded-lg borders, uppercase tracking headers, improved text density
* Empty states: icon prop support, increased padding, contextual messages per screen
* Auth pages: consistent card sizing (max-w-sm), font-semibold titles, 1.5 label spacing
* All page-level action buttons: size="sm" with 3.5px icons for visual consistency
* Color system: replaced grayscale-only palette with cool-toned blues (oklch), added --success and --warning tokens
* Border radius: reduced base from 0.625rem to 0.5rem (8px)
* Body: added antialiased rendering
* Layout: h-screen with overflow-hidden shell, overflow-y-auto on main content
* Toast: limited to 3 visible, text-sm class applied

### Removed

* LogoutButton standalone component (replaced by UserMenu dropdown)

---

# [0.9.1] - 2026-06-24

## TASK-015 Enhancement: Spread by Hours scheduling mode

### Added

* Scheduling Mode selector: "Spread by Days" or "Spread by Hours"
* Hour interval options: 30 minutes, 1 hour, 2 hours, 4 hours
* calculateHourSchedule() for intraday pin distribution
* Zod discriminated union schema for days vs hours modes

### Changed

* Schedule dialog now shows mode selector before frequency/interval
* API route handles both modes via discriminated union validation
* Renamed internal types: Frequency → DayFrequency, added HourInterval

---

# [0.9.0] - 2026-06-24

## TASK-015: Content Scheduling & Pinterest CSV Compliance

### Added

* PATCH /api/pinterest/schedule — apply auto-schedule or clear all dates
* ScheduleDialog component: date picker, time picker, frequency selector, real-time preview
* Frequency options: Daily, Every 2 Days, Every 3 Days, Weekly, Every Weekday (Mon-Fri)
* Schedule preview shows first 5 pins + "N more" count
* Clear Schedule action to remove all publish dates
* formatPinterestPublishDate() in lib/csv/pinterest.ts — ISO 8601 format (YYYY-MM-DDTHH:mm:ss)
* Zod validation for schedule input with past-date rejection
* calculateScheduleDates() with weekday-aware scheduling

### Changed

* PinTable shows "Publish Date" column conditionally when any pin has a date
* CSV export now formats publish_date in ISO 8601 (was raw timestamp)
* Results page includes "Schedule Pins" button when generation is completed

---

# [0.8.1] - 2026-06-24

## TASK-014 Fix: Switch image generation from OpenRouter to OpenAI

### Fixed

* OpenRouter does not have /api/v1/images/generations endpoint (returned 404)
* Replaced OpenRouter image client with OpenAI direct API (api.openai.com/v1/images/generations)

### Added

* lib/openai/image-client.ts — OpenAI Images API client with 120s timeout
* OPENAI_API_KEY and OPENAI_IMAGE_MODEL environment variables

### Changed

* API route now imports from lib/openai/image-client instead of lib/openrouter/image-client
* Model defaults to gpt-image-1 via OPENAI_IMAGE_MODEL env var
* .env.example updated with OpenAI variables (replacing OPENROUTER_IMAGE_MODEL)

---

# [0.8.0] - 2026-06-24

## TASK-014: AI Image Generation

### Added

* OpenAI image client (lib/openai/image-client.ts) — generates images via gpt-image-1 with 120s timeout
* POST /api/pinterest/generate-images — batch image generation for all pins in a generation
* Promise pool utility (lib/utils/promise-pool.ts) — concurrency-limited parallel processing
* Image prompt config (lib/prompts/image-generator.ts) — pinterest-image-v1, 1024x1536 vertical
* GenerateImagesButton component — state-aware (none/processing/completed/partial/failed) with retry support
* PinTable now shows image thumbnails when media_url exists (using next/image with unoptimized for external URLs)
* Migration 004: image_status column on generations + Supabase Storage bucket generated-images + storage policies
* .env.example updated with OPENROUTER_IMAGE_MODEL

### Changed

* Results page includes Generate Images button when generation is completed
* DATABASE.md updated with image_status column
* types/database.ts updated with ImageStatus type

---

# [0.7.2] - 2026-06-24

## TASK-010B: Prompt Architecture & Partial Completion

### Added

* lib/prompts/pinterest-pins.ts — extracted prompt with ID `pinterest-pins-v1`
* lib/prompts/index.ts — prompt barrel export
* Partial completion support: generations with fewer pins than requested are marked `completed`, not `failed`
* Warning logged when pinsGenerated < pinsRequested
* API response now includes `pinsGenerated` count

### Changed

* API route refactored to use lib/prompts instead of inline buildPrompt()
* Results page shows "Generated X of Y pins" badge when partial completion occurs
* DECISIONS.md: registered prompt architecture decision

---

# [0.7.1] - 2026-06-24

## TASK-010A: UX & Technical Refinements

### Fixed

* Pinterest Generator project selector now displays project name instead of UUID
* History filters project selector now displays project name instead of UUID

### Changed

* TASKS.md: added Backlog section with deferred improvements (pagination, bulk delete, date range filter, GIN index)
* DECISIONS.md: registered decision to defer History performance optimizations until data volume justifies them

---

# [0.7.0] - 2026-06-24

## TASK-010: History Module

### Added

* History page with generations table (keyword, project name, language, pins, status, date)
* Keyword search with 300ms debounce (ilike query)
* Filters by project, language, and status via URL searchParams
* Row actions dropdown: View Results, Export CSV, Delete Generation
* Delete generation with confirmation dialog (CASCADE deletes associated pins)
* Export CSV directly from history (fetches pins via API, reuses shared CSV lib)
* GET /api/generations/[id] — returns generation + pins
* DELETE /api/generations/[id] — deletes generation with CASCADE
* Shared query utility: lib/queries/generations.ts
* Shared CSV utility: lib/csv/pinterest.ts
* DeleteGenerationDialog component
* HistoryFilters component
* HistoryTable component
* HistoryActions component

### Changed

* Sidebar: History link enabled in main navigation
* ExportCsvButton refactored to use shared CSV utility
* /pinterest/[id] page refactored to use shared generation query

---

# [0.6.0] - 2026-06-24

## TASK-005 / TASK-006 / TASK-007: Pinterest Generator MVP

### Added

* OpenRouter client (lib/openrouter/client.ts) with fetch wrapper, 60s timeout, JSON mode
* Pinterest generation API route: POST /api/pinterest/generate
* PinForm component: project selector, keyword input, language select, pins count select
* PinTable component: results table showing title, description, board, keywords
* ExportCsvButton: client-side Pinterest-compatible CSV export (UTF-8 BOM)
* Generation results page at /pinterest/[id] with metadata badges
* Pinterest types (types/pinterest.ts): languages, pin options, request/response types
* Zod validation schemas for generation input and OpenRouter response
* Structured prompt engineering for Pinterest SEO content generation
* Cost-optimized max_tokens calculation (350 tokens/pin + 100 overhead)
* .env.example updated with OpenRouter variables

### Changed

* Pinterest page replaced placeholder with functional generation form
* Empty state shown when no projects exist (links to create project)

---

# [0.5.0] - 2026-06-24

## TASK-004: Projects Module

### Added

* POST /api/projects — create project (first project auto-set as default)
* PATCH /api/projects/[id] — update project name, description, or set as default
* DELETE /api/projects/[id] — delete project with confirmation dialog
* Projects list page with table (name, date, actions)
* New project page with form
* Edit project page with pre-filled form
* Zod validation schemas (create + update) in lib/validations/project.ts
* ProjectForm reusable component (create + edit modes)
* ProjectActions dropdown (edit, set default, delete)
* DeleteProjectDialog confirmation modal
* EmptyState reusable component
* Badge for default project indicator
* Toast notifications via Sonner for all CRUD actions

---

# [0.4.0] - 2026-06-24

## TASK-003: Dashboard Layout

### Added

* Sidebar component with active link highlighting and disabled links
* Topbar component with user email and Sign Out button
* PageHeader reusable component (title, description, actions slot)
* Dashboard page with static summary cards (Total Generations, Total Pins, Available Credits)
* Placeholder pages: /projects, /pinterest, /history, /credits, /settings

### Changed

* Dashboard layout refactored from header-only to full AppShell (Sidebar + Topbar + content area)

---

# [0.3.0] - 2026-06-24

## TASK-002: Database Schema & RLS

### Added

* Migration 001_initial_schema.sql
* Table: profiles (extends auth.users with name, credits_balance, plan)
* Table: projects (with is_default flag)
* Table: generations (Pinterest generation requests)
* Table: pins (generated Pinterest content)
* Foreign Keys with ON DELETE CASCADE on all relationships
* RLS policies on all tables
* Trigger: auto-create profile on user signup
* Trigger: auto-update updated_at on all tables
* Indexes on user_id, project_id, generation_id, status, language, created_at
* TypeScript types for all database entities (types/database.ts)
* Insert types with optional defaults

### Deferred

* credit_transactions table (to TASK-011)
* subscriptions table (to TASK-012)

### Changed

* DATABASE.md updated with new columns (profiles.name, projects.is_default)
* Validation strategy: language, model, pins_requested validated in application layer (Zod), not in PostgreSQL

---

# [0.2.0] - 2026-06-23

## TASK-001: Project Foundation Setup

### Added

* Next.js 16 with App Router and TypeScript (strict mode)
* Tailwind CSS v4 + Shadcn UI components (button, input, card, label)
* Supabase Auth integration (login, register, logout)
* Auth middleware for route protection
* Auth callback route for PKCE flow
* Login page with email/password and Zod validation
* Register page with email/password/confirm and Zod validation
* Dashboard placeholder (protected route)
* ApiResponse type definition
* ESLint + Prettier configuration
* .env.example with Supabase variables
* README.md with setup instructions

---

# [0.1.0] - 2026-06-23

## Project Initialization

### Added

* PROJECT.md
* ARCHITECTURE.md
* DATABASE.md
* API.md
* UI_UX.md
* RULES.md
* DECISIONS.md
* TASKS.md
* TESTING.md
* DEPLOYMENT.md
* CHANGELOG.md

### Defined

* Pinterest-First MVP strategy
* CSV Export workflow
* OpenRouter as AI provider
* Supabase as backend platform
* Stripe for credits
* Inngest for background jobs

### Removed

* WordPress MVP scope
* SEO Articles MVP scope
* Pinterest API dependency
* Pinterest OAuth dependency

---

# Versioning Rules

## Major Version

Increment:

```txt id="4vkafm"
1.0.0 → 2.0.0
```

When:

* Major architecture changes
* Major product direction changes

---

## Minor Version

Increment:

```txt id="6g94er"
1.0.0 → 1.1.0
```

When:

* New feature added

Examples:

```txt id="v8h1zw"
CSV Export
History Module
Credits System
```

---

## Patch Version

Increment:

```txt id="jw83si"
1.0.0 → 1.0.1
```

When:

* Bug fixes
* Refactors
* Performance improvements

---

# Changelog Rules

Every completed task must update:

```txt id="hqvyhz"
TASKS.md
CHANGELOG.md
```

before being considered finished.

If a feature is visible to users, it must appear in the changelog.
