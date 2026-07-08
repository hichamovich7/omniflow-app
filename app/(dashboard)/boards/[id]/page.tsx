import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getBoardWithPins } from '@/lib/queries/boards';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/empty-state';
import { BoardActions } from '@/components/boards/board-actions';
import { ExportCsvButton } from '@/components/pinterest/export-csv-button';
import { ArrowLeft, LayoutGrid, Sparkles } from 'lucide-react';

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
            <div
              key={pin.id}
              className="rounded-xl border border-border/60 bg-card overflow-hidden"
            >
              {pin.media_url ? (
                <div className="relative aspect-2/3 max-h-56 w-full overflow-hidden bg-muted">
                  <Image
                    src={pin.media_url}
                    alt={pin.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex aspect-2/3 max-h-56 w-full items-center justify-center bg-muted/50">
                  <Sparkles className="h-5 w-5 text-muted-foreground/30" />
                </div>
              )}
              <div className="p-4 space-y-2">
                <h3 className="text-[13px] font-medium leading-snug line-clamp-2">{pin.title}</h3>
                <p className="text-[12px] leading-relaxed text-muted-foreground line-clamp-3">
                  {pin.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
