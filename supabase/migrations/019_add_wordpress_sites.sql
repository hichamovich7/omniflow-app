-- ============================================
-- OmniFlow Migration 019
-- TASK-035: WordPress REST API Publishing
-- ============================================

-- 1. Create wordpress_sites table (one WordPress connection per project)
CREATE TABLE wordpress_sites (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                      uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  user_id                         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  site_url                        text NOT NULL,
  wp_username                     text NOT NULL,
  encrypted_application_password  text NOT NULL,
  created_at                      timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes
-- No separate index on project_id — the UNIQUE constraint above already
-- provides a single-column unique btree index for exact lookups.

-- 3. RLS
-- user_id is denormalized here (same as wordpress_categories, migration 016)
-- rather than reached via a subquery (as wordpress_articles does in migration
-- 012), because every route that creates/edits a wordpress_sites row already
-- has the parent project row in hand to perform the ownership check, so
-- denormalizing costs nothing and keeps the RLS policy a plain indexed
-- equality check.
ALTER TABLE wordpress_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own wordpress sites"
  ON wordpress_sites FOR ALL
  USING (user_id = auth.uid());

-- 4. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wordpress_sites TO authenticated;

-- 5. wp_category_id — maps an OmniFlow category (wordpress_categories.id) to
-- the real WordPress category term id returned by GET /wp-json/wp/v2/categories.
-- Nullable: a category can exist in OmniFlow without ever being mapped: the
-- publish flow treats an unmapped category as "Uncategorized" on the WP side.
ALTER TABLE wordpress_categories ADD COLUMN wp_category_id integer;

-- 6. Publishing fields on wordpress_articles.
-- publish_status is not a DB enum/CHECK — validated at the Zod layer
-- (lib/validations/wordpress-publish.ts), same convention as
-- generations.language (migration 017) and pins.visual_format (migration 018).
ALTER TABLE wordpress_articles ADD COLUMN wp_post_id integer;
ALTER TABLE wordpress_articles ADD COLUMN publish_status text NOT NULL DEFAULT 'draft';
ALTER TABLE wordpress_articles ADD COLUMN published_at timestamptz;
ALTER TABLE wordpress_articles ADD COLUMN publish_error text;

CREATE INDEX wordpress_articles_publish_status_idx ON wordpress_articles(publish_status);
