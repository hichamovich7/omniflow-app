-- ============================================
-- OmniFlow Migration 016
-- TASK-032: WordPress Categories (manual, project-scoped)
-- ============================================

-- 1. Create wordpress_categories table
CREATE TABLE wordpress_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       text NOT NULL,
  slug       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE UNIQUE INDEX wordpress_categories_project_name_unique ON wordpress_categories (project_id, name);
CREATE INDEX wordpress_categories_project_id_idx ON wordpress_categories (project_id);

-- 3. RLS
ALTER TABLE wordpress_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own wordpress categories"
  ON wordpress_categories FOR ALL
  USING (user_id = auth.uid());

-- 4. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wordpress_categories TO authenticated;

-- 5. Link articles to categories (nullable — deleting a category must never
-- delete the articles that used it, it only unsets this column).
ALTER TABLE wordpress_articles ADD COLUMN category_id uuid REFERENCES wordpress_categories(id) ON DELETE SET NULL;
CREATE INDEX wordpress_articles_category_id_idx ON wordpress_articles(category_id);
