-- ============================================
-- OmniFlow Migration 028
-- TASK-FIX-036: WordPress "1-Click Blog Post" — SEO Keywords block (Phase 3)
-- ============================================

-- Optional keywords/phrases the article prompt weaves in naturally at least
-- once each. Comma-separated text, same convention as pins.keywords — not a
-- Postgres array, and not a jsonb column (flat-column convention unchanged
-- from Phase 1/2, migrations 026/027) — see DECISIONS.md 2026-09-13 (5).
ALTER TABLE wordpress_generations ADD COLUMN seo_keywords text;
