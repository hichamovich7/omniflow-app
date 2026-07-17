-- ============================================
-- OmniFlow Migration 014
-- TASK-028 (Option 4): Pins → WordPress Article — provenance tracking
-- ============================================

-- Tracks which Pinterest pins (if any) a WordPress generation was built from.
-- No FK possible on array elements; ownership of the referenced pins is
-- validated at insert time in the API route, not enforced by the DB.
ALTER TABLE wordpress_generations ADD COLUMN source_pin_ids uuid[];
