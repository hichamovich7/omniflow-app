CREATE TABLE content_analyses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_result_id  uuid NOT NULL UNIQUE REFERENCES research_results(id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  theme               text NOT NULL,
  keywords            text NOT NULL,
  audience            text NOT NULL,
  tone                text NOT NULL,
  category            text NOT NULL,
  summary             text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX content_analyses_project_id_idx ON content_analyses(project_id);

ALTER TABLE content_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own content analyses" ON content_analyses
  FOR ALL USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.content_analyses TO authenticated;
