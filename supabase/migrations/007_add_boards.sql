-- ============================================
-- OmniFlow Migration 007
-- TASK-025: Pinterest Boards Management
-- ============================================

-- 1. Create boards table
CREATE TABLE boards (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE UNIQUE INDEX boards_project_name_unique ON boards (project_id, name);
CREATE INDEX boards_project_id_idx ON boards (project_id);

-- 3. RLS
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own boards"
  ON boards FOR ALL
  USING (user_id = auth.uid());

-- 4. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.boards TO authenticated;

-- 5. updated_at trigger (reuses function created in migration 001)
CREATE TRIGGER set_boards_updated_at
  BEFORE UPDATE ON boards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Link pins to boards (nullable — existing pins stay unlinked, no backfill)
ALTER TABLE pins ADD COLUMN board_id uuid REFERENCES boards(id) ON DELETE SET NULL;
CREATE INDEX pins_board_id_idx ON pins(board_id);
