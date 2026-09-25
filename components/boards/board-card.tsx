'use client';

import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import { BoardActions } from './board-actions';
import { useSelection } from '@/components/editorial/selection-provider';
import { DataListCheckbox } from '@/components/shared/data-list';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/utils/format-date';

interface BoardCardProps {
  boardId: string;
  boardName: string;
  projectName: string | null;
  pinCount: number;
  createdAt: string;
}

export function BoardCard({
  boardId,
  boardName,
  projectName,
  pinCount,
  createdAt,
}: BoardCardProps) {
  const { isSelected, toggle } = useSelection();
  const selected = isSelected(boardId);

  return (
    <div
      className={`group relative rounded-xl border bg-card p-5 transition-colors ${
        selected
          ? 'border-primary/40 ring-1 ring-primary/20'
          : 'border-border/60 hover:border-border'
      }`}
    >
      {/* Always visible below `lg` (touch); from `lg` it appears on hover or keyboard focus. */}
      <div
        className={cn(
          'absolute top-1.5 left-1.5 z-10 transition-opacity motion-reduce:transition-none',
          !selected && 'lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100'
        )}
      >
        <DataListCheckbox
          checked={selected}
          onToggle={() => toggle(boardId)}
          label={`Select board: ${boardName}`}
        />
      </div>

      <div className="absolute right-3 top-3">
        <BoardActions boardId={boardId} boardName={boardName} redirectAfterDelete="/boards" />
      </div>

      <Link href={`/boards/${boardId}`} className="flex items-start gap-3 px-6">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{boardName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            {projectName ?? 'No project'}
          </p>
        </div>
      </Link>
      <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          {pinCount} pin{pinCount !== 1 ? 's' : ''}
        </span>
        <span>·</span>
        <span>{timeAgo(createdAt)}</span>
      </div>
    </div>
  );
}
