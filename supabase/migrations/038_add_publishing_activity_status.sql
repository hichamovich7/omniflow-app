-- ============================================
-- OmniFlow Migration 038
-- TASK-FIX-053: expected (future) external publishing activity
-- ============================================
-- Additive: distinguishes a confirmed external publication from one that is
-- only planned in another tool for a future day.
--
--   published = the user confirms the Pins went live outside OmniFlow
--               (today or a past day) — the only rows counted as published.
--   expected  = Pins scheduled in another tool for a day (usually future);
--               improves the coverage forecast, never counted as published.
--
-- Every existing row becomes 'published' (default), which is what they all
-- were (035 only accepted today or earlier). Does NOT modify 035: the table,
-- the UNIQUE (user_id, content_stream_id, activity_date) constraint, the
-- RLS policy (USING + WITH CHECK on stream ownership) and the grants are
-- unchanged, so user isolation and one-entry-per-stream-and-day are kept.
--
-- "future" depends on the user's local calendar day, which Postgres does not
-- know (CURRENT_DATE is the server's UTC day), so the rule "a future day can
-- only be expected" is enforced in lib/queries/stream-publishing-activity.ts,
-- not by a CHECK here. The set of statuses is small, closed and stable, so a
-- CHECK is safe (same reasoning as `source` in 035).

ALTER TABLE content_stream_publishing_activity
  ADD COLUMN status text NOT NULL DEFAULT 'published'
  CONSTRAINT content_stream_publishing_activity_status_check CHECK (status IN ('published', 'expected'));
