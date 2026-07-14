-- ============================================
-- OmniFlow Migration 011
-- TASK-029: Rate Limit Bypass Admin Panel
-- ============================================

CREATE TABLE rate_limit_bypass (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email    text NOT NULL UNIQUE,
  added_at timestamptz NOT NULL DEFAULT now()
);

-- RLS enabled, no policies defined: deny-all for the anon/authenticated client.
-- The only two access paths are (1) is_rate_limit_bypassed() below — a
-- self-referential, read-only SECURITY DEFINER function safe to expose broadly —
-- and (2) the service-role client in lib/supabase/admin.ts, used exclusively by
-- app/api/admin/bypass-emails/route.ts, which re-verifies the caller's session
-- email against ADMIN_EMAIL before ever touching this table.
ALTER TABLE rate_limit_bypass ENABLE ROW LEVEL SECURITY;

-- Answers "is the calling session's own email on the bypass list" — takes no
-- email argument, so it can't be used to probe or bypass rate limiting on
-- another user's behalf. Reads the email claim from the caller's own verified
-- JWT rather than trusting an application-supplied parameter.
CREATE OR REPLACE FUNCTION is_rate_limit_bypassed()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM rate_limit_bypass
    WHERE email = (auth.jwt() ->> 'email')
  );
$$;

GRANT EXECUTE ON FUNCTION is_rate_limit_bypassed() TO authenticated;

-- Explicit grant for the service-role admin client (Supabase's service_role
-- already bypasses RLS by default; this documents intent alongside the rest of
-- the project's grant migrations, e.g. 003_add_grants.sql).
GRANT SELECT, INSERT, DELETE ON public.rate_limit_bypass TO service_role;
