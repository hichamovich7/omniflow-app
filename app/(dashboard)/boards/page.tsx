import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { BoardActions } from '@/components/boards/board-actions';
import { Plus, LayoutGrid, FolderOpen } from 'lucide-react';
import { timeAgo } from '@/lib/utils/format-date';

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
          <Link href="/boards/new" className={buttonVariants({ size: 'sm' })}>
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
          <Link href="/projects/new" className={buttonVariants({ size: 'sm' })}>
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
          <Link href="/boards/new" className={buttonVariants({ size: 'sm' })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Board
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((board) => {
            const projectName = Array.isArray(board.projects)
              ? board.projects[0]?.name
              : board.projects?.name;
            const pinCount = Array.isArray(board.pins) ? board.pins.length : 0;

            return (
              <div
                key={board.id}
                className="group relative rounded-xl border border-border/60 bg-card p-5 transition-colors hover:border-border"
              >
                <div className="absolute right-3 top-3">
                  <BoardActions boardId={board.id} boardName={board.name} redirectAfterDelete="/boards" />
                </div>
                <Link href={`/boards/${board.id}`} className="flex items-start gap-3 pr-6">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{board.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">
                      {projectName ?? 'No project'}
                    </p>
                  </div>
                </Link>
                <div className="mt-4 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{pinCount} pin{pinCount !== 1 ? 's' : ''}</span>
                  <span>·</span>
                  <span>{timeAgo(board.created_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
