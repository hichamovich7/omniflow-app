-- ============================================
-- OmniFlow Migration 030
-- TASK-FIX-039 Phase 2a: Content Streams
-- ============================================
-- Discovery/design: docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md (§5.1/§5.2).
-- Scope: content_streams + content_stream_boards only. No tasks table, no
-- pinterest_accounts table (per §1.3a — a board plays that role via
-- board_id, no new table introduced for it).

-- 1. Create content_streams table
CREATE TABLE content_streams (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id                uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name                   text NOT NULL,
  wordpress_category_id  uuid REFERENCES wordpress_categories(id) ON DELETE SET NULL,
  target_pins_per_day    integer CHECK (target_pins_per_day IS NULL OR target_pins_per_day >= 0),
  target_articles_per_week integer CHECK (target_articles_per_week IS NULL OR target_articles_per_week >= 0),
  target_buffer_days     integer CHECK (target_buffer_days IS NULL OR target_buffer_days >= 0),
  status                 text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'warming', 'paused', 'archived')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE UNIQUE INDEX content_streams_project_name_unique ON content_streams (project_id, name);
CREATE INDEX content_streams_user_id_idx ON content_streams (user_id);
CREATE INDEX content_streams_project_id_idx ON content_streams (project_id);
CREATE INDEX content_streams_category_id_idx ON content_streams (wordpress_category_id);
CREATE INDEX content_streams_status_idx ON content_streams (status);

-- 3. RLS
-- USING protects existing rows exactly like every other table in this
-- schema (SELECT/UPDATE/DELETE visibility). WITH CHECK is stricter and
-- applies to the row being INSERTed or the new row values on UPDATE: it is
-- not enough that the caller owns the content_streams row itself — the
-- project (and, if set, the WordPress category) it points at must also
-- belong to the same caller, and the category must belong to the same
-- project. Without this, a direct Supabase client call (bypassing
-- lib/queries/content-streams.ts entirely) could attach a stream to
-- another user's project or a mismatched category — the TypeScript
-- ownership checks in that file are not a security boundary by themselves.
--
-- EXISTS against projects/wordpress_categories is sufficient here and no
-- SECURITY DEFINER function is introduced: those tables already run under
-- the same "authenticated" role and their own RLS policies
-- (`user_id = auth.uid()`) apply to the subquery too, which only reinforces
-- the same predicate already written below — never references
-- content_streams, so there is no recursion risk.
ALTER TABLE content_streams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own content streams"
  ON content_streams FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id
        AND p.user_id = auth.uid()
    )
    AND (
      wordpress_category_id IS NULL
      OR EXISTS (
        SELECT 1 FROM wordpress_categories wc
        WHERE wc.id = wordpress_category_id
          AND wc.user_id = auth.uid()
          AND wc.project_id = content_streams.project_id
      )
    )
  );

-- 4. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_streams TO authenticated;

-- 5. updated_at trigger (reuses function created in migration 001)
CREATE TRIGGER set_content_streams_updated_at
  BEFORE UPDATE ON content_streams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- content_stream_boards (many-to-many join table)
-- ============================================
-- A content stream can span several boards, and — while the current
-- 1-account = 1-subniche = 1-board experiment holds — a board is expected
-- to belong to at most one *active* stream. That "at most one active
-- stream" rule is intentionally NOT a DB constraint: it depends on
-- content_streams.status, a column on the other side of this join, and a
-- clean partial index/CHECK cannot express a cross-table condition without
-- a trigger. Per docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md (§11 §8,
-- resolved 2026-09-16), this stays an application-layer rule enforced by
-- the future UI, not a database constraint — the schema itself remains a
-- flexible N:N relation.

CREATE TABLE content_stream_boards (
  content_stream_id  uuid NOT NULL REFERENCES content_streams(id) ON DELETE CASCADE,
  board_id            uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_stream_id, board_id)
);

CREATE INDEX content_stream_boards_board_id_idx ON content_stream_boards (board_id);
CREATE INDEX content_stream_boards_user_id_idx ON content_stream_boards (user_id);

-- Same reasoning as content_streams above: USING protects existing rows,
-- WITH CHECK guarantees that a new/updated link can only point at a
-- content stream the caller owns and a board that (a) the caller owns and
-- (b) belongs to that same content stream's project — never verifiable
-- from user_id alone, since a board and a stream can each independently
-- belong to the same user but different projects. The second EXISTS joins
-- boards to content_streams on project_id, so it establishes "same
-- project" and "board owned by caller" in one check; combined with the
-- first EXISTS ("stream owned by caller") and the top-level
-- `user_id = auth.uid()`, all three of content_stream_boards.user_id,
-- the stream's user_id, and the board's user_id are transitively forced to
-- the same value — a separate fourth check would be redundant, not an
-- omission.
ALTER TABLE content_stream_boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own content stream boards"
  ON content_stream_boards FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM content_streams cs
      WHERE cs.id = content_stream_id
        AND cs.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM boards b
      JOIN content_streams cs ON cs.project_id = b.project_id
      WHERE b.id = board_id
        AND cs.id = content_stream_id
        AND b.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_stream_boards TO authenticated;
