-- ============================================
-- OmniFlow Migration 027
-- TASK-FIX-035: WordPress "1-Click Blog Post" — Structure block (Phase 2)
-- ============================================

-- Structure settings for "1-Click Blog Post" (TASK-028 Option 1 only). Kept
-- as flat nullable columns, same convention as TASK-FIX-034's Core Settings
-- (article_type/article_size/tone_of_voice/point_of_view/target_country,
-- migration 026) rather than a consolidated jsonb column — see DECISIONS.md
-- for the reasoning (no jsonb precedent anywhere else in this schema, and the
-- column count added by Phase 1+2 combined is still small).

-- Free-text introduction hook brief, optional, with 5 client-side presets
-- (components/wordpress/article-form.tsx) — editable after picking one.
ALTER TABLE wordpress_generations ADD COLUMN hook_brief text;

-- Each include_* is a 3-state toggle: true ("Oui" — force presence), false
-- ("Non" — force absence), null ("Non défini" — the default, reproducing
-- pre-existing generation behavior exactly, same as every column here being
-- unset). No DB CHECK — the tri-state itself is exactly what a nullable
-- boolean already models, no Zod-layer enum needed either.
ALTER TABLE wordpress_generations ADD COLUMN include_conclusion boolean;
ALTER TABLE wordpress_generations ADD COLUMN include_tables boolean;
ALTER TABLE wordpress_generations ADD COLUMN include_h3 boolean;
ALTER TABLE wordpress_generations ADD COLUMN include_lists boolean;
ALTER TABLE wordpress_generations ADD COLUMN include_italics boolean;
ALTER TABLE wordpress_generations ADD COLUMN include_quotes boolean;
ALTER TABLE wordpress_generations ADD COLUMN include_key_takeaways boolean;
ALTER TABLE wordpress_generations ADD COLUMN include_faq boolean;
ALTER TABLE wordpress_generations ADD COLUMN include_bold boolean;
