-- ============================================
-- OmniFlow Migration 020
-- TASK-FIX-007: WordPress send status clarity
-- ============================================

-- wordpress_articles.published_at is set only for immediate publishes
-- (migration 019) — it stays null for a scheduled post, so the exact WP
-- target datetime was never persisted anywhere. Needed to render
-- "Scheduled for [date]" instead of a generic "Scheduled" badge.
ALTER TABLE wordpress_articles ADD COLUMN scheduled_at timestamptz;
