-- ============================================
-- OmniFlow Migration 033
-- TASK-FIX-042 (Command Center Phase 2b): tasks
-- ============================================
-- Design: docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md §5.3 / §7 / §8 / §11.
-- Additive only. No accepted_at column (§11 §3 — "accepted" is read off
-- status != 'suggested'). No related_article_id / related_generation_id
-- (§11 §4). No pinterest_accounts table (§1.3a — board_id plays that role).
--
-- type / priority / status are validated at the Zod layer only
-- (lib/validations/tasks.ts), no CHECK — same convention as
-- wordpress_articles.article_type: these sets are expected to grow.
-- source is a small, closed, stable set, so a CHECK is safe (same reasoning
-- as content_streams.status).

CREATE TABLE tasks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id         uuid REFERENCES projects(id) ON DELETE SET NULL,
  content_stream_id  uuid REFERENCES content_streams(id) ON DELETE SET NULL,
  board_id           uuid REFERENCES boards(id) ON DELETE SET NULL,
  title              text NOT NULL,
  description        text,
  source             text NOT NULL CHECK (source IN ('manual', 'automatic', 'recurring')),
  type               text NOT NULL,
  due_date           date,
  scheduled_at       timestamptz,
  estimated_minutes  integer CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
  priority           text NOT NULL DEFAULT 'medium',
  status             text NOT NULL DEFAULT 'pending',
  recurrence_rule    text,
  pinned_to_today    boolean NOT NULL DEFAULT false,
  created_by_user    boolean NOT NULL DEFAULT true,
  completed_at       timestamptz,
  skipped_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- An unaccepted automatic suggestion can never be pinned to today (§5.3).
  CONSTRAINT tasks_suggested_not_pinned CHECK (NOT (pinned_to_today AND status = 'suggested'))
);

-- Indexes (§5.3)
CREATE INDEX tasks_user_id_idx ON tasks (user_id);
CREATE INDEX tasks_project_id_idx ON tasks (project_id);
CREATE INDEX tasks_content_stream_id_idx ON tasks (content_stream_id);
CREATE INDEX tasks_board_id_idx ON tasks (board_id);
CREATE INDEX tasks_status_idx ON tasks (status);
CREATE INDEX tasks_due_date_idx ON tasks (due_date);
CREATE INDEX tasks_pinned_today_idx ON tasks (user_id) WHERE pinned_to_today;

-- At most one live Sunday analytics review routine per user (§11 §7). Guards
-- against two concurrent "Start review" clicks creating two routines.
CREATE UNIQUE INDEX tasks_one_weekly_review_routine
  ON tasks (user_id)
  WHERE type = 'weekly_review' AND source = 'recurring' AND status <> 'cancelled';

-- RLS — same hardened shape as 031 (content_streams): USING protects
-- existing rows; WITH CHECK also verifies every referenced row belongs to
-- the caller, so a direct PostgREST call cannot attach a task to another
-- user's project / content stream / board. The TypeScript checks in
-- lib/queries/tasks.ts are defense-in-depth, not the boundary.
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own tasks"
  ON tasks FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (
      project_id IS NULL
      OR EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid())
    )
    AND (
      content_stream_id IS NULL
      OR EXISTS (SELECT 1 FROM content_streams cs WHERE cs.id = content_stream_id AND cs.user_id = auth.uid())
    )
    AND (
      board_id IS NULL
      OR EXISTS (SELECT 1 FROM boards b WHERE b.id = board_id AND b.user_id = auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;

-- updated_at trigger (reuses function created in migration 001)
CREATE TRIGGER set_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
