import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { HistoryFilters } from '@/components/history/history-filters';
import { HistoryTable } from '@/components/history/history-table';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { Clock, Search } from 'lucide-react';

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
  const hasFilters = !!(params.q || params.project || params.language || params.status);

  return (
    <PageContainer>
      <PageHeader title="History" description="Browse your past generations" />

      <HistoryFilters projects={projects ?? []} />

      {list.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No matching results' : 'No generations yet'}
          description={
            hasFilters
              ? 'Try adjusting your filters to find what you\'re looking for.'
              : 'Your generation history will appear here once you create your first batch of pins.'
          }
          icon={hasFilters ? Search : Clock}
        >
          {hasFilters ? (
            <Link href="/history" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Clear filters
            </Link>
          ) : (
            <Link href="/pinterest" className={buttonVariants({ size: 'sm' })}>
              Go to Generator
            </Link>
          )}
        </EmptyState>
      ) : (
        <HistoryTable generations={list} />
      )}
    </PageContainer>
  );
}
