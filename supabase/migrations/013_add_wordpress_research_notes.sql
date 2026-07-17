-- ============================================
-- OmniFlow Migration 013
-- TASK-028: optional user-supplied research notes on WordPress generations
-- ============================================

ALTER TABLE wordpress_generations ADD COLUMN research_notes text;
