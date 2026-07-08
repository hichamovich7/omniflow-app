-- ============================================
-- OmniFlow Migration 006
-- Generation failure UX: persist a human-readable error reason
-- ============================================

ALTER TABLE generations ADD COLUMN error_message text;
