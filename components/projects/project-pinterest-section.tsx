'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Archive, Layers, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status';
import { cn } from '@/lib/utils';
import { useProjectDialogs } from '@/components/projects/project-dialogs';
import { sendJson } from '@/components/pinterest-accounts/structure-dialogs';
import type { DestinationDraft, EditingContentStream } from '@/components/projects/content-stream-form-dialog';
import type { StreamDraft } from '@/lib/projects/project-dashboard';
import type { ContentStreamStatus } from '@/types/content-streams';

export interface WorkspaceStream {
  id: string;
  name: string;
  status: ContentStreamStatus;
  accountId: string | null;
  categoryName: string | null;
  targetPinsPerDay: number | null;
  editing: EditingContentStream;
  /** Current destinations, primary first — sent back whole when a board is added. */
  destinations: DestinationDraft[];
  destinationLabels: { label: string; isPrimary: boolean; isActive: boolean; weight: number }[];
  /** Free active boards of the stream's account, addable in one click. */
  freeBoards: { id: string; name: string }[];
}

export interface WorkspaceAccount {
  id: string;
  name: string;
  meta: string;
  status: string;
  counts: string;
  /** "+ Stream" prefill: every free board of the account, suggested category. */
  draft: StreamDraft;
}

/** Header buttons of the Pinterest block. */
export function PinterestSectionActions() {
  const dialogs = useProjectDialogs();
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={dialogs.createAccount}>
        <Plus />
        Pinterest account
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => dialogs.createStream()}>
        <Plus />
        Add content stream
      </Button>
    </>
  );
}

/**
 * TASK-092: Pinterest block of the project workspace — Account → Content
 * Stream → destinations (★ primary, Board / Section, weight). "+ Stream" opens
 * the stream dialog prefilled with the account's free boards; a free board is
 * added to a stream in one click (its whole destination list is re-sent).
 */
export function ProjectPinterestSection({
  projectId,
  accounts,
  streams,
  archivedAccounts,
}: {
  projectId: string;
  accounts: WorkspaceAccount[];
  streams: WorkspaceStream[];
  archivedAccounts: number;
}) {
  const dialogs = useProjectDialogs();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const live = streams.filter((stream) => stream.status !== 'archived');
  const archived = streams.filter((stream) => stream.status === 'archived');
  const legacy = live.filter((stream) => !stream.accountId || !accounts.some((account) => account.id === stream.accountId));

  async function addBoard(stream: WorkspaceStream, board: { id: string; name: string }) {
    setBusy(`${stream.id}:${board.id}`);
    const destinations = [
      ...stream.destinations,
      { boardId: board.id, sectionId: null, isPrimary: stream.destinations.length === 0, isActive: true, weight: 1 },
    ];
    const result = await sendJson<{ boardWarning?: string }>(`/api/content-streams/${stream.id}`, 'PATCH', { destinations });
    setBusy(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    if (result.data.boardWarning) toast.warning(result.data.boardWarning);
    else toast.success(`${board.name} added to "${stream.name}"`);
    router.refresh();
  }

  function streamBlock(stream: WorkspaceStream) {
    return (
      // TASK-095: visible boundaries, outlined actions, red delete, tinted primary destination.
      <div key={stream.id} className="space-y-2.5 rounded-xl border border-border-strong/45 bg-surface-muted p-3" data-testid="workspace-stream">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[0.9375rem] font-semibold">{stream.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {stream.targetPinsPerDay ?? '—'} Pins / day · WordPress:{' '}
              <span className={stream.categoryName ? 'font-medium text-foreground' : 'font-semibold text-warning'}>{stream.categoryName ?? 'no category'}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <StatusBadge status={stream.status} showDot />
            <Button type="button" variant="outline" size="icon-sm" title="Edit stream" onClick={() => dialogs.editStream(stream.editing)} aria-label={`Edit "${stream.name}"`}>
              <Pencil />
            </Button>
            {stream.status !== 'archived' && (
              <Button type="button" variant="outline" size="icon-sm" title="Archive stream" onClick={() => dialogs.archiveStream(stream.id, stream.name)} aria-label={`Archive "${stream.name}"`}>
                <Archive />
              </Button>
            )}
            {stream.status === 'archived' && (
              <Button
                type="button"
                variant="destructive-outline"
                size="icon-sm"
                title="Delete stream"
                onClick={() => dialogs.deleteStream(stream.id, stream.name)}
                aria-label={`Delete "${stream.name}"`}
              >
                <Trash2 />
              </Button>
            )}
          </div>
        </div>

        {stream.destinationLabels.length === 0 ? (
          <p className="text-xs font-semibold text-warning">No Pinterest destination yet.</p>
        ) : (
          <ul className="space-y-1" data-testid="workspace-stream-destinations">
            {stream.destinationLabels.map((destination, index) => (
              <li
                key={index}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[0.8125rem]',
                  destination.isPrimary ? 'border-primary/40 bg-selected font-semibold' : 'border-border bg-card font-medium',
                  !destination.isActive && 'border-dashed'
                )}
              >
                <span className={destination.isActive ? 'min-w-0 truncate' : 'min-w-0 truncate text-muted-foreground line-through'}>
                  {destination.isPrimary && <Star className="mr-1 inline h-3 w-3 fill-primary text-primary" aria-label="Primary" />}
                  {destination.label}
                </span>
                {stream.destinationLabels.length > 1 && <span className="shrink-0 font-semibold text-muted-foreground tabular-nums">×{destination.weight}</span>}
              </li>
            ))}
          </ul>
        )}

        {stream.status !== 'archived' && stream.freeBoards.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium">Free boards of the account:</span>
            {stream.freeBoards.map((board) => (
              <Button
                key={board.id}
                type="button"
                variant="outline"
                size="xs"
                className="border-dashed border-primary text-primary-hover hover:border-primary hover:bg-selected dark:text-info"
                disabled={busy === `${stream.id}:${board.id}`}
                onClick={() => addBoard(stream, board)}
                aria-label={`Add board "${board.name}" to "${stream.name}"`}
              >
                <Plus className="h-3 w-3" />
                {board.name}
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (accounts.length === 0 && streams.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong bg-card py-10 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-selected">
          <Layers className="h-4.5 w-4.5 text-primary-hover" />
        </div>
        <p className="text-sm text-muted-foreground">No content streams yet</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={dialogs.createAccount}>
            <Plus className="h-3.5 w-3.5" />
            Pinterest account
          </Button>
          <Button type="button" size="sm" onClick={() => dialogs.createStream()}>
            <Plus className="h-3.5 w-3.5" />
            Add content stream
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {accounts.map((account) => {
        const accountStreams = live.filter((stream) => stream.accountId === account.id);
        return (
          <div key={account.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-xs" data-testid="workspace-account">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-muted px-3 py-2.5">
              <div className="min-w-0">
                <h3 className="truncate text-[0.9375rem] font-bold">{account.name}</h3>
                <p className="text-xs text-muted-foreground">{account.meta}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">{account.counts}</span>
                <StatusBadge status={account.status as ContentStreamStatus} showDot />
                <Button type="button" size="sm" onClick={() => dialogs.createStream(account.draft)}>
                  <Plus />
                  Stream
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => dialogs.createBoard(account.id)}>
                  <Plus />
                  Board
                </Button>
              </div>
            </div>
            <div className="space-y-2 p-3">
              {accountStreams.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No Content Stream yet. &ldquo;+ Stream&rdquo; creates one with every free board of this account already added.
                </p>
              ) : (
                accountStreams.map(streamBlock)
              )}
            </div>
          </div>
        );
      })}

      {legacy.length > 0 && (
        <div className="space-y-2 rounded-xl border border-dashed border-warning/60 bg-card p-3" data-testid="workspace-legacy-streams">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold">Content Streams without account</h3>
            <Badge variant="warning">Legacy</Badge>
          </div>
          <p className="text-xs text-muted-foreground">They keep working as before. Link them to an account from &ldquo;Needs attention&rdquo; or Edit.</p>
          {legacy.map(streamBlock)}
        </div>
      )}

      {archived.length > 0 && (
        <details className="rounded-xl border border-border bg-card p-3">
          <summary className="cursor-pointer text-sm font-semibold">Archived streams ({archived.length})</summary>
          <div className="mt-2 space-y-2">{archived.map(streamBlock)}</div>
        </details>
      )}

      <p className="text-xs text-muted-foreground">
        {archivedAccounts > 0 ? `${archivedAccounts} archived account${archivedAccounts === 1 ? '' : 's'} hidden. ` : ''}
        Sections, account details and inactive boards:{' '}
        <Link href={`/pinterest-accounts?project=${projectId}`} className="font-semibold text-primary-hover hover:underline dark:text-info">
          Pinterest Accounts
        </Link>
        .
      </p>
    </div>
  );
}
