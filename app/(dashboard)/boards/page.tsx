import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { BoardCard } from '@/components/boards/board-card';
import { BoardsBulkBar } from '@/components/boards/boards-bulk-bar';
import { EditorialSelectionProvider } from '@/components/editorial/selection-provider';
import { Plus, LayoutGrid, FolderOpen } from 'lucide-react';

export default async function BoardsPage() {
  const supabase = await createClient();

  const [{ data: boards }, { count: projectCount }] = await Promise.all([
    supabase
      .from('boards')
      .select('*, projects(name), pins(id)')
      .order('created_at', { ascending: false }),
    supabase.from('projects').select('id', { count: 'exact', head: true }),
  ]);

  const list = boards ?? [];
  const hasProjects = (projectCount ?? 0) > 0;

  return (
    <PageContainer>
      <PageHeader title="Boards" description="Organize your generated pins by Pinterest board">
        {hasProjects && (
          <Link href="/boards/new" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
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
          <Link href="/projects/new" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Project
          </Link>
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState
          title="No boards yet"
          description="Boards are created automatically when you generate pins, or you can create one manually."
          icon={LayoutGrid}
        >
          <Link href="/boards/new" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Board
          </Link>
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
        </EditorialSelectionProvider>
      )}
    </PageContainer>
  );
}
