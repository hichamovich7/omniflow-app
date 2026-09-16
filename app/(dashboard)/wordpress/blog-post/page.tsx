import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageContainer } from '@/components/ui/page-container';
import { ArticleForm } from '@/components/wordpress/article-form';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Plus, FileText } from 'lucide-react';

export default async function WordPressBlogPostPage() {
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, is_default, default_language')
    .order('created_at', { ascending: false });

  const list = projects ?? [];
  const projectIds = list.map((p) => p.id);

  // Project Context (TASK-FIX-040) reads the WordPress connection
  // status and any matching Content Stream(s) for whichever project the
  // user picks in the client — fetched once here, for every owned project,
  // so switching projects never needs a new client-side request. Both
  // queries are additionally scoped by RLS (user_id = auth.uid()) on top of
  // this project_id filter.
  const [{ data: categoriesData }, { data: sitesData }, { data: streamsData }] =
    projectIds.length > 0
      ? await Promise.all([
          supabase.from('wordpress_categories').select('*').in('project_id', projectIds).order('name'),
          supabase.from('wordpress_sites').select('project_id, site_url').in('project_id', projectIds),
          supabase
            .from('content_streams')
            .select('id, project_id, name, wordpress_category_id, status')
            .in('project_id', projectIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

  return (
    <PageContainer narrow>
      {list.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create a project before generating an article. Projects help you organize your content."
          icon={FileText}
        >
          <Link href="/projects/new" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Project
          </Link>
        </EmptyState>
      ) : (
        <ArticleForm
          projects={list}
          categories={categoriesData ?? []}
          sites={sitesData ?? []}
          contentStreams={streamsData ?? []}
        />
      )}
    </PageContainer>
  );
}
