-- ============================================
-- OmniFlow Migration 010
-- TASK-018: Security Hardening — Rate Limiting
-- ============================================

CREATE TABLE api_rate_limits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint     text NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX api_rate_limits_user_endpoint_window_idx
  ON api_rate_limits(user_id, endpoint, window_start);

ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own rate limits" ON api_rate_limits
  FOR ALL USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.api_rate_limits TO authenticated;

-- Atomic increment: single UPSERT avoids the read-then-write race of
-- separate SELECT/UPDATE calls under concurrent requests from the same user.
CREATE OR REPLACE FUNCTION increment_rate_limit(
  p_user_id uuid,
  p_endpoint text,
  p_window_start timestamptz
) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  new_count integer;
BEGIN
  INSERT INTO api_rate_limits (user_id, endpoint, window_start, count)
  VALUES (p_user_id, p_endpoint, p_window_start, 1)
  ON CONFLICT (user_id, endpoint, window_start)
  DO UPDATE SET count = api_rate_limits.count + 1
  RETURNING count INTO new_count;

  RETURN new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_rate_limit(uuid, text, timestamptz) TO authenticated;
