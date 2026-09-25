-- ============================================
-- OmniFlow Migration 036
-- TASK-FIX-043: `planned` content stream status
-- ============================================
-- Additive: widens the status CHECK created inline by 030 to also accept
-- 'planned' (a stream prepared for later, not started yet — never counted as
-- active, never recommended). Every existing value is kept; no row changes.
-- Does NOT modify 030.
--
-- 030 declared the CHECK inline, so Postgres named it
-- `content_streams_status_check`. DROP ... IF EXISTS keeps this idempotent.

ALTER TABLE content_streams DROP CONSTRAINT IF EXISTS content_streams_status_check;

ALTER TABLE content_streams
  ADD CONSTRAINT content_streams_status_check
  CHECK (status IN ('active', 'planned', 'warming', 'paused', 'archived'));
