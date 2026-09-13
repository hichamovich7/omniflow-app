-- ============================================
-- OmniFlow Migration 029
-- TASK-FIX-037: WordPress "1-Click Blog Post" — External Linking (manual URLs, Phase 4)
-- ============================================

-- User-supplied URLs the article prompt is instructed to insert as Markdown
-- links where contextually relevant. Comma-separated text, same convention as
-- seo_keywords (migration 028) — not a Postgres array, not jsonb. Purely
-- additive to the existing, unconditional addExternalLink() (OpenRouter
-- web_search) mechanism in lib/ai/services/external-link.ts, which this
-- column and its consumers never touch.
ALTER TABLE wordpress_generations ADD COLUMN manual_external_urls text;
