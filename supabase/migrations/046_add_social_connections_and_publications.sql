-- ============================================
-- OmniFlow Migration 046
-- TASK-068: Facebook Pages — social_connections, social_publications,
-- Facebook fields on social_content_generations
-- ============================================
-- Additive only: two new tables, four nullable columns, one policy
-- replaced by a stricter version. No backfill, existing rows untouched.
--
-- 1. social_connections — one connected social account per project and
--    platform (MVP: one Facebook Page per project). Generic on purpose:
--    Instagram / TikTok / others reuse it later with a new platform value.
--
--    encrypted_access_token: the Page access token, AES-256-GCM encrypted
--    by the server (lib/social/meta/token-crypto.ts, key
--    SOCIAL_TOKEN_ENCRYPTION_KEY — never in the database, never in the
--    browser). Postgres column privileges keep it out of reach of the
--    `authenticated` role entirely: that role may only SELECT the safe
--    columns listed below and DELETE its own rows. Column privileges only
--    work when no table-wide privilege exists, hence the REVOKE ALL first
--    (Supabase grants ALL on new public tables by default). Every write,
--    and the only read of the token, go through the server's service-role
--    client (lib/queries/social-connections.ts), always filtered by the
--    connection id AND the owner, after the ownership check done with the
--    caller's own session.
--
-- 2. social_publications — one row per (saved content, Page): the state of
--    each publication step (post, then first comment). The unique key
--    makes a second publication of the same content on the same Page
--    impossible; retries reuse the row.
--
-- 3. social_content_generations — Facebook fields: call to action, first
--    comment lead-in, link placement and the Content Stream used. The
--    article URL itself stays in cta_url (validated WordPress permalink).

-- --------------------------------------------
-- 1. social_connections
-- --------------------------------------------

CREATE TABLE social_connections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id              uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform                text NOT NULL CHECK (platform IN ('facebook')),
  account_type            text NOT NULL CHECK (account_type IN ('facebook_page')),
  external_account_id     text NOT NULL CHECK (external_account_id ~ '^[0-9]{1,32}$'),
  external_account_name   text NOT NULL,
  encrypted_access_token  text NOT NULL,
  token_expires_at        timestamptz,
  granted_scopes          text[] NOT NULL DEFAULT '{}',
  status                  text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'expired', 'revoked', 'error')),
  last_verified_at        timestamptz,
  last_error_code         text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  -- MVP: one Facebook Page per project.
  CONSTRAINT social_connections_project_platform_key UNIQUE (project_id, platform)
);

CREATE INDEX social_connections_user_idx ON social_connections (user_id);

ALTER TABLE social_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own social connections"
  ON social_connections FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own social connections"
  ON social_connections FOR DELETE
  USING (user_id = auth.uid());

REVOKE ALL ON public.social_connections FROM anon, authenticated;
GRANT SELECT (
  id, user_id, project_id, platform, account_type, external_account_id, external_account_name,
  token_expires_at, granted_scopes, status, last_verified_at, last_error_code, created_at, updated_at
) ON public.social_connections TO authenticated;
GRANT DELETE ON public.social_connections TO authenticated;
GRANT ALL ON public.social_connections TO service_role;

CREATE TRIGGER set_social_connections_updated_at
  BEFORE UPDATE ON social_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- --------------------------------------------
-- 2. social_publications
-- --------------------------------------------

CREATE TABLE social_publications (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id                      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Deleting the saved content or the connection keeps the record of a
  -- post that exists on Facebook.
  social_content_generation_id    uuid REFERENCES social_content_generations(id) ON DELETE SET NULL,
  connection_id                   uuid REFERENCES social_connections(id) ON DELETE SET NULL,
  platform                        text NOT NULL CHECK (platform IN ('facebook')),
  external_account_id             text NOT NULL,
  external_account_name           text NOT NULL,
  status                          text NOT NULL DEFAULT 'publishing'
                                    CHECK (status IN ('publishing', 'published', 'partial', 'failed', 'unknown')),
  post_message                    text NOT NULL,
  post_image_url                  text CHECK (post_image_url IS NULL OR post_image_url ~* '^https://'),
  external_post_id                text,
  external_post_url               text CHECK (external_post_url IS NULL OR external_post_url ~* '^https://'),
  published_at                    timestamptz,
  comment_requested               boolean NOT NULL DEFAULT false,
  comment_message                 text,
  comment_status                  text NOT NULL DEFAULT 'not_requested'
                                    CHECK (comment_status IN ('not_requested', 'pending', 'published', 'failed', 'unknown')),
  external_comment_id             text,
  comment_published_at            timestamptz,
  error_code                      text,
  error_message                   text,
  fbtrace_id                      text,
  attempt_count                   integer NOT NULL DEFAULT 1 CHECK (attempt_count >= 0),
  comment_attempt_count           integer NOT NULL DEFAULT 0 CHECK (comment_attempt_count >= 0),
  -- Set while a step runs; older than the routes' maxDuration + margin
  -- (90 s) = a killed request, taken over only after reconciliation.
  locked_at                       timestamptz,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_publications_comment_needs_request
    CHECK (comment_requested OR comment_status = 'not_requested'),
  -- The same content can never be published twice on the same Page.
  CONSTRAINT social_publications_generation_account_key UNIQUE (social_content_generation_id, external_account_id)
);

CREATE INDEX social_publications_user_idx ON social_publications (user_id, created_at DESC);
CREATE INDEX social_publications_connection_idx ON social_publications (connection_id) WHERE connection_id IS NOT NULL;

ALTER TABLE social_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own social publications"
  ON social_publications FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid())
    AND (
      social_content_generation_id IS NULL
      OR EXISTS (SELECT 1 FROM social_content_generations s WHERE s.id = social_content_generation_id AND s.user_id = auth.uid())
    )
    AND (
      connection_id IS NULL
      OR EXISTS (SELECT 1 FROM social_connections c WHERE c.id = connection_id AND c.user_id = auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_publications TO authenticated;

CREATE TRIGGER set_social_publications_updated_at
  BEFORE UPDATE ON social_publications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- --------------------------------------------
-- 3. social_content_generations — Facebook fields
-- --------------------------------------------

ALTER TABLE social_content_generations
  ADD COLUMN call_to_action      text,
  ADD COLUMN first_comment_text  text,
  ADD COLUMN link_placement      text CHECK (link_placement IS NULL OR link_placement IN ('first_comment', 'main_post', 'none')),
  ADD COLUMN content_stream_id   uuid REFERENCES content_streams(id) ON DELETE SET NULL;

-- A link placement other than "none" needs the validated article URL.
ALTER TABLE social_content_generations
  ADD CONSTRAINT social_content_link_needs_url
    CHECK (link_placement IS NULL OR link_placement = 'none' OR cta_url IS NOT NULL);

-- Same policy as 045, plus: the Content Stream must belong to the caller.
DROP POLICY IF EXISTS "Users access own social content generations" ON social_content_generations;

CREATE POLICY "Users access own social content generations"
  ON social_content_generations FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.user_id = auth.uid())
    AND (
      source_wordpress_generation_id IS NULL
      OR EXISTS (SELECT 1 FROM wordpress_generations wg WHERE wg.id = source_wordpress_generation_id AND wg.user_id = auth.uid())
    )
    AND (
      source_wordpress_site_id IS NULL
      OR EXISTS (SELECT 1 FROM wordpress_sites ws WHERE ws.id = source_wordpress_site_id AND ws.user_id = auth.uid())
    )
    AND (
      source_pinterest_generation_id IS NULL
      OR EXISTS (SELECT 1 FROM generations g WHERE g.id = source_pinterest_generation_id AND g.user_id = auth.uid())
    )
    AND (
      content_stream_id IS NULL
      OR EXISTS (SELECT 1 FROM content_streams cs WHERE cs.id = content_stream_id AND cs.user_id = auth.uid())
    )
  );
