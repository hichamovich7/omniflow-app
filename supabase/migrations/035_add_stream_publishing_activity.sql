-- ============================================
-- OmniFlow Migration 035
-- TASK-FIX-043: manual / external publishing activity per content stream
-- ============================================
-- OmniFlow never talks to Pinterest, so it cannot know about Pins created or
-- published with another tool. This table lets the user record, per content
-- stream and per local day, how many Pins went live outside OmniFlow.
--
-- Additive only. It never touches `pins` (no publish_date change, no new pin
-- rows), so the Created / Planned counters and any real Pinterest statistic
-- stay untouched: these rows are always read back as manual/external data.
--
-- `source` is a small, closed, stable set, so a CHECK is safe (same reasoning
-- as content_streams.status and tasks.source).

CREATE TABLE content_stream_publishing_activity (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content_stream_id  uuid NOT NULL REFERENCES content_streams(id) ON DELETE CASCADE,
  activity_date      date NOT NULL,
  published_count    integer NOT NULL CHECK (published_count >= 0),
  note               text CHECK (note IS NULL OR char_length(note) <= 500),
  source             text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'external')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- One entry per stream and day: saving again updates the same row (upsert).
  CONSTRAINT content_stream_publishing_activity_unique_day UNIQUE (user_id, content_stream_id, activity_date)
);

CREATE INDEX content_stream_publishing_activity_stream_idx ON content_stream_publishing_activity (content_stream_id);
CREATE INDEX content_stream_publishing_activity_user_date_idx ON content_stream_publishing_activity (user_id, activity_date);

-- RLS — same hardened shape as 031 / 033: USING protects existing rows,
-- WITH CHECK also verifies the referenced content stream belongs to the
-- caller, so a direct PostgREST call cannot attach activity to another
-- user's stream. The TypeScript check in
-- lib/queries/stream-publishing-activity.ts is defense-in-depth only.
ALTER TABLE content_stream_publishing_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own stream publishing activity"
  ON content_stream_publishing_activity FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM content_streams cs
      WHERE cs.id = content_stream_id
        AND cs.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_stream_publishing_activity TO authenticated;

-- updated_at trigger (reuses function created in migration 001)
CREATE TRIGGER set_content_stream_publishing_activity_updated_at
  BEFORE UPDATE ON content_stream_publishing_activity
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
