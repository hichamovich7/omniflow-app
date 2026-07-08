CREATE TABLE research_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_type   text NOT NULL CHECK (source_type IN ('keyword', 'website', 'blog', 'pinterest')),
  input         text NOT NULL,
  title         text,
  content       text NOT NULL,
  source_url    text,
  status        text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX research_results_project_id_idx ON research_results(project_id);

ALTER TABLE research_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own research results" ON research_results
  FOR ALL USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.research_results TO authenticated;
