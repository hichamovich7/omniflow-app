'use client';

import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import { BoardActions } from './board-actions';
import { useSelection } from '@/components/editorial/selection-provider';
import { timeAgo } from '@/lib/utils/format-date';

interface BoardCardProps {
  boardId: string;
  boardName: string;
  projectName: string | null;
  pinCount: number;
  createdAt: string;
}

export function BoardCard({ boardId, boardName, projectName, pinCount, createdAt }: BoardCardProps) {
  const { isSelected, toggle } = useSelection();
  const selected = isSelected(boardId);

  return (
    <div
      className={`group relative rounded-xl border bg-card p-5 transition-colors ${
        selected ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border/60 hover:border-border'
      }`}
    >
      <label
        className={`absolute left-3 top-3 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded border transition-all ${
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border/80 bg-card/90 opacity-0 group-hover:opacity-100'
        }`}
        aria-label={`Select board: ${boardName}`}
      >
        <input type="checkbox" checked={selected} onChange={() => toggle(boardId)} className="sr-only" />
        {selected && (
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </label>

      <div className="absolute right-3 top-3">
        <BoardActions boardId={boardId} boardName={boardName} redirectAfterDelete="/boards" />
      </div>

      <Link href={`/boards/${boardId}`} className="flex items-start gap-3 px-6">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{boardName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">{projectName ?? 'No project'}</p>
        </div>
      </Link>
      <div className="mt-4 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span>{pinCount} pin{pinCount !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span>{timeAgo(createdAt)}</span>
      </div>
    </div>
  );
}
