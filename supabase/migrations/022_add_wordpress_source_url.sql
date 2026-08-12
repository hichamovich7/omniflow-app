-- ============================================
-- OmniFlow Migration 022
-- TASK-028 (Option 3): External Source (URL or pasted text) → SEO Article
-- ============================================

-- Records the scraped source URL when source_type = 'url' and the input was
-- a link — null when the input was pasted text directly. Provenance only,
-- mirrors source_pin_ids (migration 014) for Option 4. No new source_type
-- enum value: 'url' (already reserved by the migration 012 CHECK constraint)
-- covers both the link and pasted-text sub-cases.
ALTER TABLE wordpress_generations ADD COLUMN source_url text;
