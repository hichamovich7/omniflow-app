-- 042 — WordPress publish lock (TASK-FIX-058).
--
-- publish_started_at: when the publish currently holding the article's lock
-- started. The publish route sets publish_status = 'publishing' and this
-- column in one conditional UPDATE, so two concurrent publishes of the same
-- article can never both run; it is reset to NULL with the final status. A
-- value older than the route's maxDuration + margin (90s) is a stale lock
-- from a killed request and may be taken over.
--
-- publish_status stays free text validated in code (migration 019) — the new
-- 'publishing' and 'uncertain' values need no CHECK change. RLS ("Users
-- access own wordpress articles") and grants already cover this column.
-- Nullable, no default: existing rows are untouched.

ALTER TABLE wordpress_articles
ADD COLUMN publish_started_at timestamptz;
