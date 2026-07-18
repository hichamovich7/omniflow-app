-- ============================================
-- OmniFlow Migration 015
-- TASK-028: separate SEO meta_title from the H1 title on wordpress_articles
-- ============================================

-- Nullable: existing rows predate this column and have no meta title.
-- Readers fall back to `title` (truncated) when this is null — see
-- lib/wordpress/export.ts getMetaTitle(). No backfill needed.
ALTER TABLE wordpress_articles ADD COLUMN meta_title text;
