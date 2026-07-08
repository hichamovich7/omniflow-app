import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { ResearchForm } from '@/components/research/research-form';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { Plus, Search } from 'lucide-react';

export default async function ResearchPage() {
  const supabase = await createClient();

  const [{ data: projects }, { data: researchResults }] = await Promise.all([
    supabase.from('projects').select('id, name, is_default').order('created_at', { ascending: false }),
    supabase
      .from('research_results')
      .select('id, project_id, source_type, input, title, status, created_at')
      .order('created_at', { ascending: false }),
  ]);

  const list = projects ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Research"
        description="Research a topic from a keyword, website, blog, or Pinterest URL before generating pins"
      />

      {list.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Research belongs to a project. Create a project before researching a source."
          icon={Search}
        >
          <Link href="/projects/new" className={buttonVariants({ size: 'sm' })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Project
          </Link>
        </EmptyState>
      ) : (
        <ResearchForm projects={list} researchResults={researchResults ?? []} />
      )}
    </PageContainer>
  );
}
