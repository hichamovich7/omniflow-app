-- ============================================
-- OmniFlow Migration 040
-- TASK-044 phase 2: Pinterest generation from a WordPress article
-- ============================================

-- The WordPress article (wordpress_generations.id) a Pinterest generation was
-- created from on /pinterest/create?source=wordpress. Traceability only: an
-- internal reference, never a destination URL — pins.link_url stays empty
-- and is filled manually by the user in the CSV.
-- NULL = generation from a keyword (every row before this migration).
-- Written best-effort after the generation completes, so generating from an
-- article still works before this migration is applied.
-- Additive only: no backfill, no RLS change (the existing
-- "Users access own generations" policy already covers the row).
ALTER TABLE generations
  ADD COLUMN source_wordpress_generation_id uuid
  REFERENCES wordpress_generations(id) ON DELETE SET NULL;

CREATE INDEX idx_generations_source_wordpress_generation_id
  ON generations(source_wordpress_generation_id)
  WHERE source_wordpress_generation_id IS NOT NULL;
