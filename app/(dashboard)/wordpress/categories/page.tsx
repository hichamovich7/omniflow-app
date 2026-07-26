import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CategoriesManager } from '@/components/wordpress/categories-manager';
import { FolderOpen, Plus } from 'lucide-react';

export default async function WordPressCategoriesPage() {
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .order('created_at', { ascending: false });

  const list = projects ?? [];

  const { data: categories } =
    list.length > 0
      ? await supabase
          .from('wordpress_categories')
          .select('id, project_id, name')
          .in('project_id', list.map((p) => p.id))
          .order('name')
      : { data: [] };

  return (
    <PageContainer>
      <PageHeader
        title="WordPress Categories"
        description="Organize your WordPress articles by topic, scoped to each project"
      />

      {list.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Categories belong to a project. Create a project before creating a category."
          icon={FolderOpen}
        >
          <Link href="/projects/new" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Project
          </Link>
        </EmptyState>
      ) : (
        <CategoriesManager projects={list} categories={categories ?? []} />
      )}
    </PageContainer>
  );
}
