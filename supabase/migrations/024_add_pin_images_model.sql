-- ============================================
-- OmniFlow Migration 024
-- TASK-FIX-018: Image model traceability on pin_images
-- ============================================

-- Records which image model actually generated this specific pin_images row
-- (e.g. 'black-forest-labs/flux.2-pro' or 'google/gemini-3.1-flash-image'),
-- so rendering issues can be attributed to a confirmed model instead of
-- inferred after the fact from AI_IMAGE_MODEL/AI_IMAGE_MODEL_TEXT env vars,
-- which can change over time. Nullable — existing rows predate this column.
ALTER TABLE pin_images ADD COLUMN image_model text;
