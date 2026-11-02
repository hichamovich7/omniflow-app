-- ============================================
-- OmniFlow Migration 047
-- TASK-091: Pinterest Accounts, board sections, multi-destination Content Streams
-- ============================================
-- Hierarchy: Project → Pinterest Account → Content Stream → Board → Section → Pin.
--
-- Additive only: no table, column or row is deleted. Existing data keeps
-- working unchanged:
--   * existing boards / Content Streams have no account (NULL = legacy, not
--     linked) until the user links them by hand — no account is ever created
--     automatically;
--   * every existing content_stream_boards row stays, becomes active, and the
--     oldest link of each stream becomes its primary destination;
--   * pins.board / pins.board_section (free text) stay the source of the CSV
--     and of every older reader; the new pins columns are nullable references.
--
-- The only non-additive DDL is on content_stream_boards: its primary key
-- (content_stream_id, board_id) is replaced by a surrogate `id`, because the
-- same board can now be used with several sections (a nullable section_id
-- cannot be part of a primary key). No row is lost: the new key is filled for
-- every existing row before it becomes the primary key, and the former
-- "one row per stream + board" rule is kept for rows without a section by a
-- partial unique index.
--
-- No credential of any kind is stored: no password, cookie, token or session.
--
-- Run once, in one transaction (the whole file fails or applies as a unit).

BEGIN;

-- ============================================
-- 1. pinterest_accounts
-- ============================================
CREATE TABLE pinterest_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 100),
  username      text,
  profile_url   text,
  main_keyword  text,
  website_url   text,
  language      text,
  market        text,
  account_type  text NOT NULL DEFAULT 'business' CHECK (account_type IN ('business', 'personal')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Target of the composite foreign keys below: a board / stream that points
  -- at an account must point at an account of its own project.
  CONSTRAINT pinterest_accounts_id_project_unique UNIQUE (id, project_id)
);

CREATE UNIQUE INDEX pinterest_accounts_project_name_unique ON pinterest_accounts (project_id, lower(name));
CREATE INDEX pinterest_accounts_user_id_idx ON pinterest_accounts (user_id);

ALTER TABLE pinterest_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own pinterest accounts"
  ON pinterest_accounts FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = pinterest_accounts.project_id
        AND p.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_accounts TO authenticated;

CREATE TRIGGER set_pinterest_accounts_updated_at
  BEFORE UPDATE ON pinterest_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. boards → one Pinterest account (optional), active flag, external id
-- ============================================
ALTER TABLE boards ADD COLUMN pinterest_account_id uuid;
ALTER TABLE boards ADD COLUMN is_active boolean NOT NULL DEFAULT true;
ALTER TABLE boards ADD COLUMN external_id text;

-- Composite key: the account must belong to the board's own project. With
-- MATCH SIMPLE (default) a NULL account (legacy board) is never checked.
-- NO ACTION: an account that still has boards cannot be deleted (accounts are
-- archived, never deleted, by the app); a project delete removes both in the
-- same statement, which NO ACTION allows.
ALTER TABLE boards
  ADD CONSTRAINT boards_pinterest_account_fkey
  FOREIGN KEY (pinterest_account_id, project_id)
  REFERENCES pinterest_accounts (id, project_id);

CREATE INDEX boards_pinterest_account_id_idx ON boards (pinterest_account_id);

-- Hardened like 031: a board can only be written into a project the caller
-- owns, and only under an account the caller owns.
DROP POLICY IF EXISTS "Users access own boards" ON boards;

CREATE POLICY "Users access own boards"
  ON boards FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = boards.project_id
        AND p.user_id = auth.uid()
    )
    AND (
      boards.pinterest_account_id IS NULL
      OR EXISTS (
        SELECT 1 FROM pinterest_accounts a
        WHERE a.id = boards.pinterest_account_id
          AND a.user_id = auth.uid()
      )
    )
  );

-- ============================================
-- 3. pinterest_board_sections
-- ============================================
-- Names are kept exactly as typed (no case change). Two sections of one board
-- cannot share a name, compared case-insensitively ("Ideas" / "ideas" would be
-- the same Pinterest section). "/" is Pinterest's Board/Section separator in
-- the CSV, so it can never appear in a name (same rule as pins.board_section).
CREATE TABLE pinterest_board_sections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id     uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 100 AND strpos(name, '/') = 0),
  external_id  text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- Target of content_stream_boards' composite key (section of THAT board).
  CONSTRAINT pinterest_board_sections_id_board_unique UNIQUE (id, board_id)
);

CREATE UNIQUE INDEX pinterest_board_sections_board_name_unique ON pinterest_board_sections (board_id, lower(name));
CREATE INDEX pinterest_board_sections_user_id_idx ON pinterest_board_sections (user_id);

ALTER TABLE pinterest_board_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own pinterest board sections"
  ON pinterest_board_sections FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM boards b
      WHERE b.id = pinterest_board_sections.board_id
        AND b.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_board_sections TO authenticated;

CREATE TRIGGER set_pinterest_board_sections_updated_at
  BEFORE UPDATE ON pinterest_board_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. content_streams → one Pinterest account (optional)
-- ============================================
-- NULL = legacy stream, not linked yet: it keeps working exactly as before.
ALTER TABLE content_streams ADD COLUMN pinterest_account_id uuid;

ALTER TABLE content_streams
  ADD CONSTRAINT content_streams_pinterest_account_fkey
  FOREIGN KEY (pinterest_account_id, project_id)
  REFERENCES pinterest_accounts (id, project_id);

CREATE INDEX content_streams_pinterest_account_id_idx ON content_streams (pinterest_account_id);

DROP POLICY IF EXISTS "Users access own content streams" ON content_streams;

CREATE POLICY "Users access own content streams"
  ON content_streams FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = content_streams.project_id
        AND p.user_id = auth.uid()
    )
    AND (
      content_streams.wordpress_category_id IS NULL
      OR EXISTS (
        SELECT 1 FROM wordpress_categories wc
        WHERE wc.id = content_streams.wordpress_category_id
          AND wc.user_id = auth.uid()
          AND wc.project_id = content_streams.project_id
      )
    )
    AND (
      content_streams.pinterest_account_id IS NULL
      OR EXISTS (
        SELECT 1 FROM pinterest_accounts a
        WHERE a.id = content_streams.pinterest_account_id
          AND a.user_id = auth.uid()
      )
    )
  );

-- ============================================
-- 5. content_stream_boards → Pinterest destinations (extended, not duplicated)
-- ============================================
ALTER TABLE content_stream_boards ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE content_stream_boards ADD COLUMN section_id uuid;
ALTER TABLE content_stream_boards ADD COLUMN is_primary boolean NOT NULL DEFAULT false;
ALTER TABLE content_stream_boards ADD COLUMN is_active boolean NOT NULL DEFAULT true;
ALTER TABLE content_stream_boards ADD COLUMN weight integer NOT NULL DEFAULT 1;
ALTER TABLE content_stream_boards ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- Existing links: the oldest link of each stream becomes its primary
-- destination (single-board streams: their only board). Every row is already
-- active (column default). Nothing else changes.
UPDATE content_stream_boards csb
SET is_primary = true
FROM (
  SELECT DISTINCT ON (content_stream_id) id
  FROM content_stream_boards
  ORDER BY content_stream_id, created_at, board_id
) first_link
WHERE csb.id = first_link.id;

-- Surrogate key (every row already has its id from the column default).
ALTER TABLE content_stream_boards DROP CONSTRAINT content_stream_boards_pkey;
ALTER TABLE content_stream_boards ADD CONSTRAINT content_stream_boards_pkey PRIMARY KEY (id);

ALTER TABLE content_stream_boards
  ADD CONSTRAINT content_stream_boards_weight_range CHECK (weight BETWEEN 1 AND 100);

-- A primary destination is always an active one.
ALTER TABLE content_stream_boards
  ADD CONSTRAINT content_stream_boards_primary_is_active CHECK (NOT is_primary OR is_active);

-- The section must belong to the row's own board (composite key). MATCH
-- SIMPLE: a row without a section is the board itself and is never checked.
ALTER TABLE content_stream_boards
  ADD CONSTRAINT content_stream_boards_section_fkey
  FOREIGN KEY (section_id, board_id)
  REFERENCES pinterest_board_sections (id, board_id)
  ON DELETE CASCADE;

-- No duplicate stream + board + section: one row for the board without a
-- section, one row per section of that board.
CREATE UNIQUE INDEX content_stream_boards_board_unique
  ON content_stream_boards (content_stream_id, board_id)
  WHERE section_id IS NULL;
CREATE UNIQUE INDEX content_stream_boards_board_section_unique
  ON content_stream_boards (content_stream_id, board_id, section_id)
  WHERE section_id IS NOT NULL;

-- At most one primary destination per stream (and it is active, see CHECK).
CREATE UNIQUE INDEX content_stream_boards_one_primary
  ON content_stream_boards (content_stream_id)
  WHERE is_primary;

CREATE INDEX content_stream_boards_stream_idx ON content_stream_boards (content_stream_id);
CREATE INDEX content_stream_boards_section_id_idx ON content_stream_boards (section_id);

CREATE TRIGGER set_content_stream_boards_updated_at
  BEFORE UPDATE ON content_stream_boards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Same as 031, plus: when the stream is linked to an account, the board must
-- be a board of that same account (a legacy stream without an account keeps
-- the former project-only rule), and a section must be the caller's.
-- Every column is qualified: pinterest_board_sections also has a board_id.
DROP POLICY IF EXISTS "Users access own content stream boards" ON content_stream_boards;

CREATE POLICY "Users access own content stream boards"
  ON content_stream_boards FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM content_streams cs
      JOIN boards b ON b.project_id = cs.project_id
      WHERE cs.id = content_stream_boards.content_stream_id
        AND b.id = content_stream_boards.board_id
        AND cs.user_id = auth.uid()
        AND b.user_id = auth.uid()
        AND (cs.pinterest_account_id IS NULL OR b.pinterest_account_id = cs.pinterest_account_id)
    )
    AND (
      content_stream_boards.section_id IS NULL
      OR EXISTS (
        SELECT 1 FROM pinterest_board_sections s
        WHERE s.id = content_stream_boards.section_id
          AND s.board_id = content_stream_boards.board_id
          AND s.user_id = auth.uid()
      )
    )
  );

-- ============================================
-- 6. pins → structured destination references (nullable, history kept)
-- ============================================
-- pins.board_id (migration 007) is already the board reference — reused, no
-- second board column. pins.board / pins.board_section keep the exact names
-- used at generation time (CSV, history, older Pins).
ALTER TABLE pins ADD COLUMN pinterest_account_id uuid REFERENCES pinterest_accounts(id) ON DELETE SET NULL;
ALTER TABLE pins ADD COLUMN pinterest_section_id uuid REFERENCES pinterest_board_sections(id) ON DELETE SET NULL;

CREATE INDEX pins_pinterest_account_id_idx ON pins (pinterest_account_id);
CREATE INDEX pins_pinterest_section_id_idx ON pins (pinterest_section_id);

COMMIT;
