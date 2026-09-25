-- ============================================
-- OmniFlow Migration 034
-- TASK-FIX-042 (Command Center Phase 2c, minimal): task_occurrences
-- ============================================
-- Design: docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md §5.4 / §9.
-- Only for tasks.source = 'recurring'. Rows are created lazily, the first
-- time the user interacts with a given day's instance (§9) — never
-- pre-generated, no cron/Inngest dependency (RULES.md Rule #15).
-- status is Zod-validated only (pending | scheduled | completed | skipped).

CREATE TABLE task_occurrences (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  occurrence_date  date NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  scheduled_at     timestamptz,
  pinned_to_today  boolean NOT NULL DEFAULT false,
  completed_at     timestamptz,
  skipped_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- One row per routine per day (§5.4).
  CONSTRAINT task_occurrences_task_date_unique UNIQUE (task_id, occurrence_date)
);

CREATE INDEX task_occurrences_user_id_idx ON task_occurrences (user_id);
CREATE INDEX task_occurrences_occurrence_date_idx ON task_occurrences (occurrence_date);

-- RLS: the parent task must belong to the caller, never verifiable from
-- task_occurrences.user_id alone.
ALTER TABLE task_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own task occurrences"
  ON task_occurrences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND t.user_id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_occurrences TO authenticated;
