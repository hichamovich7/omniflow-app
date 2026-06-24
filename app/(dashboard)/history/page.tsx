import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { HistoryFilters } from '@/components/history/history-filters';
import { HistoryTable } from '@/components/history/history-table';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';

interface HistoryPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .order('name');

  let query = supabase
    .from('generations')
    .select('id, keyword, language, pins_requested, status, created_at, projects(name)')
    .order('created_at', { ascending: false });

  if (params.q) {
    query = query.ilike('keyword', `%${params.q}%`);
  }
  if (params.project) {
    query = query.eq('project_id', params.project);
  }
  if (params.language) {
    query = query.eq('language', params.language);
  }
  if (params.status) {
    query = query.eq('status', params.status);
  }

  const { data: generations } = await query;
  const list = generations ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="History" description="Review previous generations" />

      <HistoryFilters projects={projects ?? []} />

      {list.length === 0 ? (
        <EmptyState
          title="No generations found"
          description="Generate your first Pinterest content to see it here"
        >
          <Link href="/pinterest" className={buttonVariants()}>
            Go to Pinterest Generator
          </Link>
        </EmptyState>
      ) : (
        <HistoryTable generations={list} />
      )}
    </div>
  );
}
