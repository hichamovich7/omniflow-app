-- ============================================
-- OmniFlow Migration 026
-- TASK-FIX-034: WordPress Generator homepage + Core Settings (1-Click Blog Post)
-- ============================================

-- Five optional Core Settings fields for the "1-Click Blog Post" generator
-- (TASK-028 Option 1 only). All nullable, no DB CHECK — validated at the Zod
-- layer (lib/validations/wordpress.ts), same convention as visual_format/
-- overlay_text (migration 018) and title_banner_template/cta_banner_template
-- (migration 025). Null means "None" / not chosen — the outline and article
-- prompts fall back to their pre-existing behavior with zero regression.
-- Option 3 (url) and Option 4 (pins) generations simply never populate these.

ALTER TABLE wordpress_generations ADD COLUMN article_type text;
ALTER TABLE wordpress_generations ADD COLUMN article_size text;
ALTER TABLE wordpress_generations ADD COLUMN tone_of_voice text;
ALTER TABLE wordpress_generations ADD COLUMN point_of_view text;
ALTER TABLE wordpress_generations ADD COLUMN target_country text;
