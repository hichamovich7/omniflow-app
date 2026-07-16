-- ============================================
-- OmniFlow Migration 012
-- TASK-028 (Option 1): WordPress Article Generator
-- ============================================

-- 1. wordpress_generations — one row per generation request, mirrors `generations`
CREATE TABLE wordpress_generations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  keyword     text NOT NULL,
  language    text NOT NULL,
  source_type text NOT NULL DEFAULT 'keyword' CHECK (source_type IN ('keyword', 'url', 'pins')),
  status      text NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wordpress_generations_user_id_idx ON wordpress_generations(user_id);
CREATE INDEX wordpress_generations_project_id_idx ON wordpress_generations(project_id);
CREATE INDEX wordpress_generations_created_at_idx ON wordpress_generations(created_at DESC);

ALTER TABLE wordpress_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own wordpress generations"
  ON wordpress_generations FOR ALL
  USING (user_id = auth.uid());

-- 2. wordpress_articles — the generated article, one per generation
CREATE TABLE wordpress_articles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id         uuid NOT NULL REFERENCES wordpress_generations(id) ON DELETE CASCADE,
  title                 text NOT NULL,
  slug                  text NOT NULL,
  meta_description      text NOT NULL,
  content               text NOT NULL,
  word_count            integer NOT NULL DEFAULT 0,
  featured_image_prompt text,
  featured_image_url    text,
  status                text NOT NULL DEFAULT 'pending',
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wordpress_articles_generation_id_idx ON wordpress_articles(generation_id);

ALTER TABLE wordpress_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own wordpress articles"
  ON wordpress_articles FOR ALL
  USING (
    generation_id IN (
      SELECT id FROM wordpress_generations WHERE user_id = auth.uid()
    )
  );

-- 3. wordpress_article_images — internal images referenced from the article body
--    via {{IMAGE_N}} markers. The featured image is NOT stored here — it lives
--    on wordpress_articles.featured_image_url (one per article, not a list).
CREATE TABLE wordpress_article_images (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id       uuid NOT NULL REFERENCES wordpress_articles(id) ON DELETE CASCADE,
  placement_marker text NOT NULL,
  prompt           text NOT NULL,
  alt_text         text NOT NULL,
  url              text,
  position         integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wordpress_article_images_article_id_idx ON wordpress_article_images(article_id);

ALTER TABLE wordpress_article_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own wordpress article images"
  ON wordpress_article_images FOR ALL
  USING (
    article_id IN (
      SELECT wa.id FROM wordpress_articles wa
      JOIN wordpress_generations wg ON wa.generation_id = wg.id
      WHERE wg.user_id = auth.uid()
    )
  );

-- 4. Grants (authenticated client reads/writes through RLS above)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wordpress_generations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wordpress_articles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wordpress_article_images TO authenticated;

-- 5. Storage bucket for featured + internal article images (mirrors migration 004)
INSERT INTO storage.buckets (id, name, public)
VALUES ('wordpress-images', 'wordpress-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload wordpress images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'wordpress-images');

CREATE POLICY "Authenticated users can delete wordpress images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'wordpress-images');

CREATE POLICY "Public can view wordpress images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'wordpress-images');
