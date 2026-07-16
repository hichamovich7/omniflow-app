import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageContainer } from '@/components/ui/page-container';
import { ArticleForm } from '@/components/wordpress/article-form';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { Plus, FileText } from 'lucide-react';

export default async function WordPressPage() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, is_default')
    .order('created_at', { ascending: false });

  const list = projects ?? [];

  return (
    <PageContainer narrow>
      {list.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create a project before generating an article. Projects help you organize your content."
          icon={FileText}
        >
          <Link href="/projects/new" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Project
          </Link>
        </EmptyState>
      ) : (
        <ArticleForm projects={list} />
      )}
    </PageContainer>
  );
}
