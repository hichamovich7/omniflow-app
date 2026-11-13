-- ============================================
-- TASK-100: Facebook scheduling — OmniFlow's own queue
-- ============================================
-- Additive only: two nullable columns, two statuses, one CHECK, one partial
-- index. Existing rows are untouched (their status stays valid).
--
-- A scheduled publication is a social_publications row with
-- status = 'scheduled' and the UTC instant in scheduled_at. Nothing is sent
-- to Facebook before that time: the cron route
-- (GET /api/cron/facebook-scheduled) claims due rows with a conditional
-- UPDATE (scheduled → publishing), then runs the same post → comment flow as
-- "Publish now". 'cancelled' = schedule cancelled before it ran; a cancelled
-- row is never claimed. The UNIQUE (content, Page) key of migration 046 is
-- unchanged: one publication per content and Page, scheduled or not.
--
-- Run after 046 (and 047). Rollback: see the end of this file.

-- 1. Statuses: add 'scheduled' and 'cancelled' to the status CHECK.
--    The inline CHECK of 046 has a generated name; drop it by its definition
--    (the one listing 'publishing' — not the comment_status CHECK).
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.social_publications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%publishing%'
      AND pg_get_constraintdef(oid) NOT LIKE '%comment_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.social_publications DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE social_publications
  ADD CONSTRAINT social_publications_status_check
    CHECK (status IN ('scheduled', 'cancelled', 'publishing', 'published', 'partial', 'failed', 'unknown'));

-- 2. When: one UTC instant + the IANA zone the person chose (display only).
ALTER TABLE social_publications
  ADD COLUMN scheduled_at        timestamptz,
  ADD COLUMN scheduled_timezone  text CHECK (scheduled_timezone IS NULL OR char_length(scheduled_timezone) BETWEEN 1 AND 64);

ALTER TABLE social_publications
  ADD CONSTRAINT social_publications_scheduled_needs_time
    CHECK (status <> 'scheduled' OR (scheduled_at IS NOT NULL AND scheduled_timezone IS NOT NULL));

-- 3. The cron route reads only due scheduled rows.
CREATE INDEX social_publications_due_idx
  ON social_publications (scheduled_at)
  WHERE status = 'scheduled';

-- RLS / grants: unchanged (policy "Users access own social publications"
-- of 046 covers the new columns). The cron route uses the service-role
-- client and filters every write by id + user_id.

-- Rollback (only when no row is 'scheduled' or 'cancelled'):
--   DROP INDEX IF EXISTS social_publications_due_idx;
--   ALTER TABLE social_publications DROP CONSTRAINT IF EXISTS social_publications_scheduled_needs_time;
--   ALTER TABLE social_publications DROP COLUMN IF EXISTS scheduled_timezone, DROP COLUMN IF EXISTS scheduled_at;
--   ALTER TABLE social_publications DROP CONSTRAINT IF EXISTS social_publications_status_check;
--   ALTER TABLE social_publications ADD CONSTRAINT social_publications_status_check
--     CHECK (status IN ('publishing', 'published', 'partial', 'failed', 'unknown'));
