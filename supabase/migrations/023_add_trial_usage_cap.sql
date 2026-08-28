-- ============================================
-- OmniFlow Migration 023
-- Lightweight lifetime trial usage cap — distinct from the future Credits
-- System (TASK-011/012, still PLANNED, not built here). See docs/DECISIONS.md.
-- ============================================

ALTER TABLE profiles ADD COLUMN total_generations_used integer NOT NULL DEFAULT 0;

-- Atomic increment, same pattern as increment_rate_limit() (migration 010) —
-- a single UPDATE ... RETURNING avoids the read-then-write race of separate
-- SELECT/UPDATE calls under concurrent requests from the same user. Not
-- SECURITY DEFINER: runs under the caller's own RLS context, same as
-- increment_rate_limit — relies on the existing "Users access own profile"
-- policy (id = auth.uid()) from migration 001.
CREATE OR REPLACE FUNCTION increment_trial_usage(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  new_count integer;
BEGIN
  UPDATE profiles
  SET total_generations_used = total_generations_used + 1
  WHERE id = p_user_id
  RETURNING total_generations_used INTO new_count;

  RETURN new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_trial_usage(uuid) TO authenticated;
