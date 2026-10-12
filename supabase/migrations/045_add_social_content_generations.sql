-- ============================================
-- OmniFlow Migration 045
-- TASK-063: social_content_generations — saved Medium summaries
-- (and, later, Facebook / Instagram / Reels / TikTok content)
-- ============================================
-- One row per generated piece of social content, linked to its project and
-- to the source it was written from. Only Medium writes rows today
-- (POST /api/social/medium-summary, after the summary passed its checks);
-- the other platforms are accepted by the CHECK so their generators can use
-- the same table later without a migration.
--
-- Sources (all nullable, ON DELETE SET NULL — deleting a source never
-- deletes the saved content):
--   omniflow_article        source_wordpress_generation_id (+ the site /
--                           WordPress post id when the article was published)
--   external_wordpress_post source_wordpress_site_id + source_wordpress_article_id
--                           (the WordPress post id on that site — bigint)
--   pinterest_generation    source_pinterest_generation_id, plus the
--                           WordPress source of that generation when it was
--                           made from an article (either kind above)
--
-- cta_url: only the exact, validated permalink of the published post
-- (never built, never a Pinterest URL); image_url: an image already in the
-- source article, by its exact URL. No secret, token or credential of any
-- external service is stored here.
--
-- Additive only: no backfill, no change to existing tables. Without this
-- migration Medium summaries are still generated and shown, with a
-- "not saved" warning.

CREATE TABLE social_content_generations (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id                      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform                        text NOT NULL
                                    CHECK (platform IN ('medium', 'facebook', 'instagram', 'reels', 'tiktok')),
  status                          text NOT NULL DEFAULT 'completed'
                                    CHECK (status IN ('completed', 'failed')),
  source_type                     text NOT NULL
                                    CHECK (source_type IN ('omniflow_article', 'external_wordpress_post', 'pinterest_generation')),
  source_wordpress_generation_id  uuid REFERENCES wordpress_generations(id) ON DELETE SET NULL,
  source_wordpress_site_id        uuid REFERENCES wordpress_sites(id) ON DELETE SET NULL,
  source_wordpress_article_id     bigint CHECK (source_wordpress_article_id IS NULL OR source_wordpress_article_id > 0),
  source_pinterest_generation_id  uuid REFERENCES generations(id) ON DELETE SET NULL,
  source_title                    text,
  language                        text,
  title                           text NOT NULL,
  subtitle                        text,
  content_markdown                text NOT NULL,
  content_html                    text NOT NULL,
  word_count                      integer CHECK (word_count IS NULL OR word_count >= 0),
  image_url                       text,
  image_alt                       text,
  cta_url                         text,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  -- A WordPress post id only makes sense with the site it belongs to.
  CONSTRAINT social_content_wp_article_needs_site
    CHECK (source_wordpress_article_id IS NULL OR source_wordpress_site_id IS NOT NULL),
  -- Only absolute http(s) links are ever stored.
  CONSTRAINT social_content_cta_url_http CHECK (cta_url IS NULL OR cta_url ~* '^https?://'),
  CONSTRAINT social_content_image_url_https CHECK (image_url IS NULL OR image_url ~* '^https://')
);

CREATE INDEX social_content_generations_user_created_idx
  ON social_content_generations (user_id, platform, created_at DESC);
CREATE INDEX social_content_generations_project_idx ON social_content_generations (project_id);
CREATE INDEX social_content_generations_wp_generation_idx
  ON social_content_generations (source_wordpress_generation_id) WHERE source_wordpress_generation_id IS NOT NULL;
CREATE INDEX social_content_generations_pinterest_idx
  ON social_content_generations (source_pinterest_generation_id) WHERE source_pinterest_generation_id IS NOT NULL;

-- RLS — same hardened shape as 033 (tasks): USING protects existing rows;
-- WITH CHECK also requires every referenced project / source to belong to
-- the caller, so a direct PostgREST call cannot attach content to another
-- user's project or article. The checks in lib/queries/social-content.ts
-- and the API route are defense in depth, not the boundary.
ALTER TABLE social_content_generations ENABLE ROW LEVEL SECURITY;

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
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_content_generations TO authenticated;

-- updated_at trigger (reuses function created in migration 001)
CREATE TRIGGER set_social_content_generations_updated_at
  BEFORE UPDATE ON social_content_generations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
