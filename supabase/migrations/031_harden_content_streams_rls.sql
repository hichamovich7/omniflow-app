-- ============================================
-- OmniFlow Migration 031
-- TASK-FIX-039 Phase 2a: Harden content_streams / content_stream_boards RLS
-- ============================================
-- Corrective, additive migration. Does NOT modify 030 and does NOT recreate
-- either table — both already exist on the linked Supabase project.
--
-- Why this migration exists: 030_add_content_streams.sql was applied to the
-- live database manually via the SQL Editor, before the RLS hardening pass
-- documented in docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md §14a was written.
-- `supabase_migrations.schema_migrations` does not exist on this project,
-- confirming no migration has ever been applied through the tracked
-- migration mechanism — every migration in this repository, including 030,
-- has so far only ever been run by hand. As a direct result, the live
-- policies on both tables currently have `with_check = null` (USING-only,
-- exactly the weak pre-hardening version) even though the local copy of
-- 030 in this repository already contains the hardened WITH CHECK clauses.
-- This migration reproduces that same hardened state explicitly and
-- reproducibly, instead of relying on 030 ever being re-run.
--
-- Idempotent by construction: DROP POLICY IF EXISTS then CREATE POLICY,
-- using the exact same policy names as 030. Safe to run on:
--   (a) the current live database (weak with_check = null policies today), and
--   (b) any future environment where 030 already applied the hardened
--       policies verbatim (031 will drop and recreate the identical policy).
-- Neither case touches table structure, data, or any other object.

-- ============================================
-- content_streams
-- ============================================
DROP POLICY IF EXISTS "Users access own content streams" ON content_streams;

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

-- ============================================
-- content_stream_boards
-- ============================================
DROP POLICY IF EXISTS "Users access own content stream boards" ON content_stream_boards;

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
