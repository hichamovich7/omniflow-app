'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

export interface ArticleBoardOption {
  id: string;
  name: string;
}

export interface ContentStreamOption {
  id: string;
  name: string;
  boardIds: string[];
}

const ALL_STREAMS = '__all__';
const NO_BOARD = '__none__';

/**
 * Board choice for Pins generated from an article (TASK-044 phase 2): only
 * the project's real boards, optionally narrowed to a Content Stream. There
 * is no free-text entry, so no board is ever created from here. The Content
 * Stream is a filter only; it is not saved on the generation.
 */
export function ArticleBoardPicker({
  boards,
  contentStreams,
  board,
  onBoardChange,
  boardNameSuggestion,
  disabled,
}: {
  boards: ArticleBoardOption[];
  contentStreams: ContentStreamOption[];
  board: string;
  onBoardChange: (name: string) => void;
  boardNameSuggestion: string | null;
  disabled: boolean;
}) {
  const [streamId, setStreamId] = useState(ALL_STREAMS);
  const stream = contentStreams.find((s) => s.id === streamId);
  const visibleBoards = stream ? boards.filter((b) => stream.boardIds.includes(b.id)) : boards;

  function handleStreamChange(nextStreamId: string) {
    setStreamId(nextStreamId);
    const next = contentStreams.find((s) => s.id === nextStreamId);
    if (next && !boards.some((b) => b.name === board && next.boardIds.includes(b.id))) {
      const [first] = boards.filter((b) => next.boardIds.includes(b.id));
      onBoardChange(first?.name ?? '');
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="content-stream" className="text-xs font-medium text-muted-foreground">
          Content Stream (optional)
        </Label>
        <Select value={streamId} onValueChange={(v) => v && handleStreamChange(v)} disabled={disabled}>
          <SelectTrigger id="content-stream" className="w-full">
            <span className="truncate text-sm">{stream?.name ?? 'All boards'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STREAMS}>All boards</SelectItem>
            {contentStreams.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="board" className="text-xs font-medium text-muted-foreground">
          Board
        </Label>
        <Select
          value={board || NO_BOARD}
          onValueChange={(v) => v && onBoardChange(v === NO_BOARD ? '' : v)}
          disabled={disabled}
        >
          <SelectTrigger id="board" className="w-full" aria-describedby="board-help">
            <span className="truncate text-sm">{board || 'No board — AI suggests a name'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_BOARD}>No board — AI suggests a name (not created)</SelectItem>
            {visibleBoards.map((b) => (
              <SelectItem key={b.id} value={b.name}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {stream && visibleBoards.length === 0 && (
        <p className="text-xs text-muted-foreground sm:col-span-2">This Content Stream has no board yet.</p>
      )}
      {boards.length === 0 || (!board && boardNameSuggestion) ? (
        <p className="text-xs text-muted-foreground sm:col-span-2" data-testid="board-suggestion">
          {boardNameSuggestion
            ? `No existing board matches this article. Suggested board name: "${boardNameSuggestion}". It is not created automatically — add it to your project first if you want to use it.`
            : 'This project has no board yet. It is not created automatically.'}
        </p>
      ) : null}
    </div>
  );
}
