-- ============================================
-- OmniFlow Migration 017
-- TASK-033: Project Niche + Default Language
-- ============================================

-- Both nullable, no default, no backfill. `niche` is free text (a curated
-- suggestion list exists only in the UI, never enforced in the DB).
-- `default_language` is plain text like `generations.language` /
-- `wordpress_generations.language` elsewhere in this schema — validated at
-- the Zod layer, not a DB enum/CHECK.
ALTER TABLE projects ADD COLUMN niche text;
ALTER TABLE projects ADD COLUMN default_language text;
