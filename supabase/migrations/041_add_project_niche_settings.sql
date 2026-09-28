-- 041 — Per-project niche settings (Niche Profiles Phase 2, TASK-045).
-- Stores ONLY the user's customizations of the niche profile (tone,
-- audience, keywords, Pinterest angles, visual style, CTA, disabled
-- sub-niches), versioned: { "version": 1, "fields": { ... } } — shape
-- validated in the app (lib/niche/settings.ts, Zod).
-- NULL = use OmniFlow's recommended values (lib/niche/profiles.ts): every
-- existing project keeps its current behavior. No backfill, no index.
-- RLS unchanged: the existing projects policies (user_id = auth.uid())
-- already cover this column.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS niche_settings jsonb;

COMMENT ON COLUMN projects.niche_settings IS
  'Niche Profiles Phase 2: user customizations only ({version, fields}); NULL = OmniFlow recommended values.';
