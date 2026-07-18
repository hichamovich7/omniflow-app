import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getBoardWithPins } from '@/lib/queries/boards';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/empty-state';
import { BoardActions } from '@/components/boards/board-actions';
import { BoardPinCard } from '@/components/boards/board-pin-card';
import { ExportCsvButton } from '@/components/pinterest/export-csv-button';
import { ArrowLeft, LayoutGrid } from 'lucide-react';

export default async function BoardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { board, pins } = await getBoardWithPins(supabase, id);

  if (!board) {
    redirect('/boards');
  }

  const projectName = Array.isArray(board.projects) ? board.projects[0]?.name : board.projects?.name;

  return (
    <PageContainer>
      <div className="flex items-center gap-2">
        <Link
          href="/boards"
          className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted transition-colors"
          aria-label="Back to boards"
        >
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </Link>
        <div className="flex-1 min-w-0 space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight truncate">{board.name}</h1>
          <p className="text-sm text-muted-foreground">
            {projectName ?? 'No project'} · {pins.length} pin{pins.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {pins.length > 0 && <ExportCsvButton pins={pins} keyword={board.name} />}
          <BoardActions boardId={board.id} boardName={board.name} redirectAfterDelete="/boards" />
        </div>
      </div>

      {pins.length === 0 ? (
        <EmptyState
          title="No pins on this board yet"
          description="Pins are added automatically when a generation's suggested board matches this one."
          icon={LayoutGrid}
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {pins.map((pin) => (
            <BoardPinCard key={pin.id} pin={pin} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
