-- ============================================
-- OmniFlow Migration 039
-- TASK-FIX-055: structured FAQ on WordPress articles
-- ============================================

-- The FAQ items actually rendered into wordpress_articles.content at
-- generation time: [{ "question": "...", "answer": "..." }]. Same validated
-- array as the visible section (rendered once, in the same step), used for
-- the FAQPage JSON-LD sent on publish. `content` stays the source of truth
-- for display and exports.
-- NULL = article generated before this migration (or FAQ not saved); an
-- empty array = generated with no FAQ section. The shape is validated in the
-- application layer (Zod, lib/wordpress/faq-data.ts), same convention as
-- wordpress_generations.quality_report (migration 037).
-- Additive only: no backfill, no index, no RLS change (the existing
-- "Users access own wordpress articles" policy already covers the row).
ALTER TABLE wordpress_articles ADD COLUMN faq jsonb;
