import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BoardCard } from '@/components/boards/board-card';
import { BoardFilters } from '@/components/boards/board-filters';
import { BoardPagination } from '@/components/boards/board-pagination';
import { BoardsBulkBar } from '@/components/boards/boards-bulk-bar';
import { EditorialSelectionProvider } from '@/components/editorial/selection-provider';
import { Plus, LayoutGrid, FolderOpen, Search } from 'lucide-react';

const PAGE_SIZE = 20;

interface BoardsPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function BoardsPage({ searchParams }: BoardsPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const currentPage = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .order('name');

  let query = supabase
    .from('boards')
    .select('*, projects(name), pins(id)', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (params.project) {
    query = query.eq('project_id', params.project);
  }
  if (params.search) {
    query = query.ilike('name', `%${params.search}%`);
  }

  const rangeStart = (currentPage - 1) * PAGE_SIZE;
  query = query.range(rangeStart, rangeStart + PAGE_SIZE - 1);

  const { data: boards, count } = await query;
  const list = boards ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const hasFilters = !!(params.project || params.search);
  const hasProjects = (projects ?? []).length > 0;

  if (list.length === 0 && currentPage > totalPages) {
    const clamped = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== 'page' && value) clamped.set(key, value);
    }
    if (totalPages > 1) clamped.set('page', String(totalPages));
    const queryString = clamped.toString();
    redirect(queryString ? `/boards?${queryString}` : '/boards');
  }

  return (
    <PageContainer>
      <PageHeader title="Boards" description="Organize your generated pins by Pinterest board">
        {hasProjects && (
          <Link href="/boards/new" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Board
          </Link>
        )}
      </PageHeader>

      {!hasProjects ? (
        <EmptyState
          title="No projects yet"
          description="Boards belong to a project. Create a project before creating a board."
          icon={FolderOpen}
        >
          <Link href="/projects/new" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Project
          </Link>
        </EmptyState>
      ) : (
        <>
          <BoardFilters projects={projects ?? []} />

          {list.length === 0 ? (
            <EmptyState
              title={hasFilters ? 'No matching results' : 'No boards yet'}
              description={
                hasFilters
                  ? 'Try adjusting your filters to find what you\'re looking for.'
                  : 'Boards are created automatically when you generate pins, or you can create one manually.'
              }
              icon={hasFilters ? Search : LayoutGrid}
            >
              {hasFilters ? (
                <Link href="/boards" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                  Clear filters
                </Link>
              ) : (
                <Link href="/boards/new" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  New Board
                </Link>
              )}
            </EmptyState>
          ) : (
            <EditorialSelectionProvider>
              <BoardsBulkBar boards={list.map((board) => ({ id: board.id, name: board.name }))} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((board) => {
                  const projectName = Array.isArray(board.projects)
                    ? board.projects[0]?.name
                    : board.projects?.name;
                  const pinCount = Array.isArray(board.pins) ? board.pins.length : 0;

                  return (
                    <BoardCard
                      key={board.id}
                      boardId={board.id}
                      boardName={board.name}
                      projectName={projectName ?? null}
                      pinCount={pinCount}
                      createdAt={board.created_at}
                    />
                  );
                })}
              </div>
              <BoardPagination currentPage={currentPage} totalPages={totalPages} searchParams={params} />
            </EditorialSelectionProvider>
          )}
        </>
      )}
    </PageContainer>
  );
}
