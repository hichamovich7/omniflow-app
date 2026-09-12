-- ============================================
-- OmniFlow Migration 025
-- TASK-FIX-024: Multi-template banner compositing
-- ============================================

-- Which static SVG shape (lib/pinterest/banner-templates/) is composited for
-- each banner. Two independent columns because the title hook (top) and the
-- CTA banner (bottom) are composited separately and can use different shapes
-- on the same pin. Not a DB enum/CHECK — validated at the Zod layer
-- (lib/validations/pinterest.ts BANNER_TEMPLATES), same convention as
-- visual_format/overlay_text (migration 018).

-- Only set when visual_format = 'text-overlay' (the title hook banner is only
-- ever composited in that case).
ALTER TABLE pins ADD COLUMN title_banner_template text;

-- Set on every pin regardless of visual_format — the CTA banner is composited
-- on every generated image.
ALTER TABLE pins ADD COLUMN cta_banner_template text;
