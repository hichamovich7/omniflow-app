'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Layers } from 'lucide-react';
import { ContentStreamCard } from '@/components/projects/content-stream-card';
import {
  ContentStreamFormDialog,
  type BoardOption,
  type CategoryOption,
  type EditingContentStream,
} from '@/components/projects/content-stream-form-dialog';
import { ArchiveContentStreamDialog } from '@/components/projects/archive-content-stream-dialog';
import type { ContentStream } from '@/types/content-streams';

interface ContentStreamsSectionProps {
  projectId: string;
  streams: ContentStream[];
  categories: CategoryOption[];
  boards: BoardOption[];
  /** This project's stream -> currently linked board id (single board per stream in this UI; schema stays N:N). */
  streamBoardMap: Record<string, string | undefined>;
}

/**
 * Phase 2a.1 — content stream management inside a project's own page.
 * Presentational/orchestration only: all writes go through
 * app/api/content-streams/*, which re-verify ownership server-side
 * (isOwnedProject/isCategoryInProject/isBoardInProject) regardless of what
 * this component sends. See docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md.
 */
export function ContentStreamsSection({ projectId, streams, categories, boards, streamBoardMap }: ContentStreamsSectionProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingStream, setEditingStream] = useState<ContentStream | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ContentStream | null>(null);

  function openCreate() {
    setEditingStream(null);
    setFormOpen(true);
  }

  function openEdit(stream: ContentStream) {
    setEditingStream(stream);
    setFormOpen(true);
  }

  const editing: EditingContentStream | undefined = editingStream
    ? {
        id: editingStream.id,
        name: editingStream.name,
        wordpressCategoryId: editingStream.wordpress_category_id,
        boardId: streamBoardMap[editingStream.id] ?? null,
        status: editingStream.status,
        targetPinsPerDay: editingStream.target_pins_per_day,
        targetArticlesPerWeek: editingStream.target_articles_per_week,
        targetBufferDays: editingStream.target_buffer_days,
      }
    : undefined;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Content Streams</h2>
        {streams.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            Add content stream
          </Button>
        )}
      </div>

      {streams.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 py-10 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Layers className="h-4.5 w-4.5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No content streams yet</p>
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            Add content stream
          </Button>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {streams.map((stream) => {
            const boardId = streamBoardMap[stream.id] ?? null;
            return (
              <ContentStreamCard
                key={stream.id}
                stream={stream}
                categoryName={categories.find((c) => c.id === stream.wordpress_category_id)?.name ?? null}
                boardName={boards.find((b) => b.id === boardId)?.name ?? null}
                onEdit={() => openEdit(stream)}
                onArchive={() => setArchiveTarget(stream)}
              />
            );
          })}
        </div>
      )}

      <ContentStreamFormDialog
        // Remounts fresh every time the target changes or the dialog opens,
        // so its internal state always starts from `editing` instead of
        // needing an effect + setState to resync (react-hooks/set-state-in-effect).
        key={`${formOpen ? 'open' : 'closed'}-${editingStream?.id ?? 'create'}`}
        open={formOpen}
        onOpenChange={setFormOpen}
        projectId={projectId}
        categories={categories}
        boards={boards}
        editing={editing}
      />

      {archiveTarget && (
        <ArchiveContentStreamDialog
          contentStreamId={archiveTarget.id}
          contentStreamName={archiveTarget.name}
          open={!!archiveTarget}
          onOpenChange={(open) => {
            if (!open) setArchiveTarget(null);
          }}
        />
      )}
    </div>
  );
}
