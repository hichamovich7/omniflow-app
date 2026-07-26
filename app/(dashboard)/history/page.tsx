import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGenerationsWordPressUsage } from '@/lib/queries/wordpress-usage';
import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { HistoryFilters } from '@/components/history/history-filters';
import { HistoryTable } from '@/components/history/history-table';
import { HistoryBulkBar } from '@/components/history/history-bulk-bar';
import { HistoryPagination } from '@/components/history/history-pagination';
import { EmptyState } from '@/components/empty-state';
import { EditorialSelectionProvider } from '@/components/editorial/selection-provider';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Clock, Search } from 'lucide-react';

const PAGE_SIZE = 20;

interface HistoryPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const currentPage = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .order('name');

  const { data: boards } = await supabase
    .from('boards')
    .select('id, name, project_id')
    .order('name', { ascending: true });

  let query = supabase
    .from('generations')
    .select('id, keyword, language, pins_requested, status, created_at, projects(name)', { count: 'exact' })
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
  if (params.board) {
    const { data: pinRows } = await supabase
      .from('pins')
      .select('generation_id')
      .eq('board_id', params.board);
    const generationIds = Array.from(new Set((pinRows ?? []).map((p) => p.generation_id)));
    query = query.in('id', generationIds.length > 0 ? generationIds : ['00000000-0000-0000-0000-000000000000']);
  }

  const rangeStart = (currentPage - 1) * PAGE_SIZE;
  query = query.range(rangeStart, rangeStart + PAGE_SIZE - 1);

  const { data: generations, count } = await query;
  const list = generations ?? [];
  const wordpressUsageMap = await getGenerationsWordPressUsage(supabase, list.map((g) => g.id));
  const wordpressUsage = Object.fromEntries(wordpressUsageMap);
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const hasFilters = !!(params.q || params.project || params.language || params.status || params.board);

  if (list.length === 0 && currentPage > totalPages) {
    const clamped = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== 'page' && value) clamped.set(key, value);
    }
    if (totalPages > 1) clamped.set('page', String(totalPages));
    const queryString = clamped.toString();
    redirect(queryString ? `/history?${queryString}` : '/history');
  }

  return (
    <PageContainer>
      <PageHeader title="History" description="Browse your past generations" />

      <HistoryFilters projects={projects ?? []} boards={boards ?? []} />

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
            <Link href="/history" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              Clear filters
            </Link>
          ) : (
            <Link href="/pinterest" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              Go to Generator
            </Link>
          )}
        </EmptyState>
      ) : (
        <EditorialSelectionProvider>
          <HistoryBulkBar
            generations={list.map((g) => ({
              id: g.id,
              keyword: g.keyword,
              wordpressArticles: wordpressUsage[g.id]?.articles,
            }))}
          />
          <HistoryTable generations={list} wordpressUsage={wordpressUsage} />
          <HistoryPagination currentPage={currentPage} totalPages={totalPages} searchParams={params} />
        </EditorialSelectionProvider>
      )}
    </PageContainer>
  );
}
