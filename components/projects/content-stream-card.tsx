import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status';
import { Pencil, Archive } from 'lucide-react';
import type { ContentStream } from '@/types/content-streams';

interface ContentStreamCardProps {
  stream: ContentStream;
  categoryName: string | null;
  boardName: string | null;
  onEdit: () => void;
  onArchive: () => void;
}

/**
 * Compact card for one content stream (TASK-COMMAND-CENTER-PHASE-2.md Phase
 * 2a.1). Only shows the raw target numbers the founder set — no computed
 * "missing pins"/coverage figure, since that read still depends on real
 * pins.publish_date data not wired up in this phase (Phase 2d).
 */
export function ContentStreamCard({ stream, categoryName, boardName, onEdit, onArchive }: ContentStreamCardProps) {
  const isArchived = stream.status === 'archived';

  return (
    <div className="rounded-xl border border-border/60 bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{stream.name}</p>
          <StatusBadge status={stream.status} className="mt-1.5" />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit "${stream.name}"`}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {!isArchived && (
            <Button type="button" variant="ghost" size="icon-sm" onClick={onArchive} aria-label={`Archive "${stream.name}"`}>
              <Archive className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">WordPress category</dt>
        <dd className="text-right text-foreground">{categoryName ?? 'None'}</dd>
        <dt className="text-muted-foreground">Pinterest board</dt>
        <dd className="text-right text-foreground">{boardName ?? 'None'}</dd>
        <dt className="text-muted-foreground">Pins / day target</dt>
        <dd className="text-right text-foreground">{stream.target_pins_per_day ?? '—'}</dd>
        <dt className="text-muted-foreground">Articles / week target</dt>
        <dd className="text-right text-foreground">{stream.target_articles_per_week ?? '—'}</dd>
        <dt className="text-muted-foreground">Buffer days target</dt>
        <dd className="text-right text-foreground">{stream.target_buffer_days ?? '—'}</dd>
      </dl>
    </div>
  );
}
