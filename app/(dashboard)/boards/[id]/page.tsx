import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getBoardWithPins } from '@/lib/queries/boards';
import { PageContainer } from '@/components/ui/page-container';
import { ResourceHeader } from '@/components/shared/resource-header';
import { EmptyState } from '@/components/empty-state';
import { BoardActions } from '@/components/boards/board-actions';
import { BoardPinGrid } from '@/components/boards/board-pin-grid';
import { ExportCsvButton } from '@/components/pinterest/export-csv-button';
import { LayoutGrid } from 'lucide-react';

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
      <ResourceHeader
        title={board.name}
        backHref="/boards"
        backLabel="Back to boards"
        metadata={
          <>
            <span>{projectName ?? 'No project'}</span>
            <span aria-hidden="true" className="text-border">·</span>
            <span>
              {pins.length} pin{pins.length !== 1 ? 's' : ''}
            </span>
          </>
        }
        actions={
          <>
            {pins.length > 0 && <ExportCsvButton pins={pins} keyword={board.name} />}
            <BoardActions boardId={board.id} boardName={board.name} redirectAfterDelete="/boards" />
          </>
        }
      />

      {pins.length === 0 ? (
        <EmptyState
          title="No pins on this board yet"
          description="Pins are added automatically when a generation's suggested board matches this one."
          icon={LayoutGrid}
        />
      ) : (
        <BoardPinGrid pins={pins} />
      )}
    </PageContainer>
  );
}
