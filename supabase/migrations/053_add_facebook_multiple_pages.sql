-- ============================================
-- OmniFlow Migration 053
-- TASK-102: several Facebook Pages per project + Page suggestion by
-- WordPress category
-- ============================================
-- (049 stays reserved for TASK-078 Phase B; 046-052 are applied and never
-- modified or replayed.)
--
-- 1. social_connections — one row per (project, platform, Page) instead of
--    one row per (project, platform). Existing rows already satisfy the new
--    key (at most one Page per project until now), so they keep their id,
--    their token and every publication that points to them. Connecting the
--    same Page again updates that same row (no duplicate); connecting
--    another Page adds a row and never replaces the others. RLS policies,
--    column privileges (token unreadable by `authenticated`) and the
--    service-role-only writes of migration 046 are unchanged.
--
-- 2. facebook_page_category_mappings — "WordPress category → Facebook Page"
--    per project. Only a suggestion for the Page selector: it never chooses
--    a Page on its own, and a publication or a schedule never reads it (the
--    target Page is frozen on the social_publications row when the person
--    confirms). The Page is stored by its Facebook id (not by connection
--    id), so a disconnect + reconnect of the same Page keeps the mapping;
--    while that Page is not connected the mapping simply suggests nothing.
--
-- Additive except the replaced unique constraint. No backfill, no data
-- change.

-- --------------------------------------------
-- 1. social_connections: one row per Page
-- --------------------------------------------

ALTER TABLE social_connections
  DROP CONSTRAINT social_connections_project_platform_key;

ALTER TABLE social_connections
  ADD CONSTRAINT social_connections_project_platform_account_key UNIQUE (project_id, platform, external_account_id);

-- --------------------------------------------
-- 2. facebook_page_category_mappings
-- --------------------------------------------

CREATE TABLE facebook_page_category_mappings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id              uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  wordpress_category_id   uuid NOT NULL REFERENCES wordpress_categories(id) ON DELETE CASCADE,
  external_account_id     text NOT NULL CHECK (external_account_id ~ '^[0-9]{1,32}$'),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  -- One suggested Page per category of a project.
  CONSTRAINT facebook_page_category_mappings_category_key UNIQUE (project_id, wordpress_category_id)
);

CREATE INDEX facebook_page_category_mappings_user_idx ON facebook_page_category_mappings (user_id);

ALTER TABLE facebook_page_category_mappings ENABLE ROW LEVEL SECURITY;

-- Own rows only; on write the project, the category (same project) and a
-- connected Page of that project must all be the caller's own. Columns of
-- the mapping row are qualified with the table name: inside the subqueries
-- an unqualified project_id / external_account_id would be the inner
-- table's own column (always true).
CREATE POLICY "Users access own Facebook page category mappings"
  ON facebook_page_category_mappings FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM projects p WHERE p.id = facebook_page_category_mappings.project_id AND p.user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM wordpress_categories wc
      WHERE wc.id = facebook_page_category_mappings.wordpress_category_id
        AND wc.project_id = facebook_page_category_mappings.project_id
        AND wc.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM social_connections c
      WHERE c.project_id = facebook_page_category_mappings.project_id
        AND c.user_id = auth.uid()
        AND c.platform = 'facebook'
        AND c.external_account_id = facebook_page_category_mappings.external_account_id
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facebook_page_category_mappings TO authenticated;
GRANT ALL ON public.facebook_page_category_mappings TO service_role;

CREATE TRIGGER set_facebook_page_category_mappings_updated_at
  BEFORE UPDATE ON facebook_page_category_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
