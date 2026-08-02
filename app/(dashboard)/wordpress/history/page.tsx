import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { WordPressHistoryFilters } from '@/components/wordpress/wordpress-history-filters';
import { WordPressHistoryTable } from '@/components/wordpress/wordpress-history-table';
import { WordPressHistoryBulkBar } from '@/components/wordpress/wordpress-history-bulk-bar';
import { WordPressHistoryPagination } from '@/components/wordpress/wordpress-history-pagination';
import { EmptyState } from '@/components/empty-state';
import { EditorialSelectionProvider } from '@/components/editorial/selection-provider';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Clock, Search } from 'lucide-react';

const PAGE_SIZE = 20;

interface WordPressHistoryPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function WordPressHistoryPage({ searchParams }: WordPressHistoryPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const currentPage = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .order('name');

  const { data: categories } =
    projects && projects.length > 0
      ? await supabase
          .from('wordpress_categories')
          .select('id, name')
          .in('project_id', projects.map((p) => p.id))
          .order('name')
      : { data: [] };

  let query = supabase
    .from('wordpress_generations')
    .select(
      'id, keyword, language, status, created_at, projects(name), wordpress_articles(title, word_count, wp_post_id, publish_status, published_at, scheduled_at, wordpress_categories(name))',
      { count: 'exact' }
    )
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
  if (params.category) {
    const { data: articlesInCategory } = await supabase
      .from('wordpress_articles')
      .select('generation_id')
      .eq('category_id', params.category);
    const generationIds = Array.from(new Set((articlesInCategory ?? []).map((a) => a.generation_id)));
    query = query.in('id', generationIds.length > 0 ? generationIds : ['00000000-0000-0000-0000-000000000000']);
  }

  const rangeStart = (currentPage - 1) * PAGE_SIZE;
  query = query.range(rangeStart, rangeStart + PAGE_SIZE - 1);

  const { data: generations, count } = await query;
  const list = generations ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const hasFilters = !!(params.q || params.project || params.language || params.status || params.category);

  if (list.length === 0 && currentPage > totalPages) {
    const clamped = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== 'page' && value) clamped.set(key, value);
    }
    if (totalPages > 1) clamped.set('page', String(totalPages));
    const queryString = clamped.toString();
    redirect(queryString ? `/wordpress/history?${queryString}` : '/wordpress/history');
  }

  return (
    <PageContainer>
      <PageHeader title="WordPress History" description="Browse your generated articles" />

      <WordPressHistoryFilters projects={projects ?? []} categories={categories ?? []} />

      {list.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No matching results' : 'No articles yet'}
          description={
            hasFilters
              ? 'Try adjusting your filters to find what you\'re looking for.'
              : 'Your generated articles will appear here once you create your first one.'
          }
          icon={hasFilters ? Search : Clock}
        >
          {hasFilters ? (
            <Link href="/wordpress/history" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              Clear filters
            </Link>
          ) : (
            <Link href="/wordpress" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              Go to Generator
            </Link>
          )}
        </EmptyState>
      ) : (
        <EditorialSelectionProvider>
          <WordPressHistoryBulkBar
            articles={list.map((g) => {
              const article = Array.isArray(g.wordpress_articles) ? g.wordpress_articles[0] : g.wordpress_articles;
              return { generationId: g.id, title: article?.title ?? g.keyword };
            })}
          />
          <WordPressHistoryTable generations={list} />
          <WordPressHistoryPagination currentPage={currentPage} totalPages={totalPages} searchParams={params} />
        </EditorialSelectionProvider>
      )}
    </PageContainer>
  );
}
