'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, ExternalLink, Info, LayoutGrid, Pencil, Plus, Power, PowerOff, Trash2, TriangleAlert, UserRound, X } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status';
import { cn } from '@/lib/utils';
import { DeleteBoardsDialog } from '@/components/boards/delete-boards-dialog';
import {
  AccountFormDialog,
  accountDeleteConsequences,
  BoardFormDialog,
  DeleteConfirmDialog,
  SECTION_DELETE_CONSEQUENCES,
  SectionFormDialog,
  sendJson,
  type EditingBoard,
  type EditingSection,
} from '@/components/pinterest-accounts/structure-dialogs';
import type { PinterestAccount } from '@/types/pinterest-accounts';
import type { DestinationBoardOption, PinterestAccountCounts } from '@/lib/queries/pinterest-accounts';

export interface AccountView {
  account: PinterestAccount;
  counts: PinterestAccountCounts;
  /** Names of the account's non-archived Content Streams. */
  streamNames: string[];
}

type DialogState =
  | { kind: 'account'; editing?: PinterestAccount }
  | { kind: 'board'; editing?: EditingBoard; defaultAccountId?: string | null }
  | { kind: 'section'; boardId: string; boardName: string; editing?: EditingSection }
  // TASK-094: permanent deletes, each behind a typed confirmation.
  | { kind: 'delete-account'; account: PinterestAccount; counts: PinterestAccountCounts }
  | { kind: 'delete-board'; id: string; name: string }
  | { kind: 'delete-section'; id: string; name: string; boardName: string }
  | null;

/**
 * TASK-091: Project → Pinterest Account → Content Stream → Board → Section.
 * Accounts, boards and sections are managed by hand here (no Pinterest API).
 * Every write goes through the app's routes, which re-check ownership.
 */
export function PinterestAccountsManager({
  projectId,
  accounts,
  boards,
}: {
  projectId: string;
  accounts: AccountView[];
  boards: DestinationBoardOption[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  // Remount the dialog fresh on every opening (no effect + setState resync).
  const [session, setSession] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  function open(next: NonNullable<DialogState>) {
    setSession((n) => n + 1);
    setDialog(next);
  }

  async function patch(url: string, body: unknown, success: string) {
    setBusy(url);
    const result = await sendJson(url, 'PATCH', body);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(success);
    router.refresh();
  }

  const live = accounts.filter((view) => view.account.status !== 'archived');
  const archived = accounts.filter((view) => view.account.status === 'archived');
  const legacyBoards = boards.filter((board) => !board.pinterest_account_id);
  const accountOptions = accounts.map((view) => view.account);

  // TASK-095 (validated mockup): every action has a visible boundary, deletes
  // are red, sections are tinted chips with their own ×, counts are tiles.
  function boardList(list: DestinationBoardOption[], legacy = false) {
    if (list.length === 0) return <p className="text-sm text-muted-foreground">No board yet.</p>;
    return (
      <ul className="space-y-2.5">
        {list.map((board) => (
          <li key={board.id} className="rounded-xl border border-border-strong/45 bg-surface-muted p-3 sm:p-3.5" data-testid="account-board">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground" aria-hidden="true">
                  <LayoutGrid className="size-3.5" />
                </span>
                <span className="truncate text-[0.9375rem] font-semibold">{board.name}</span>
                {board.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {legacy && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      open({
                        kind: 'board',
                        editing: { id: board.id, name: board.name, accountId: board.pinterest_account_id, isActive: board.is_active },
                      })
                    }
                  >
                    Attach to an account
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  title={board.is_active ? 'Deactivate board' : 'Activate board'}
                  aria-label={board.is_active ? `Deactivate board "${board.name}"` : `Activate board "${board.name}"`}
                  disabled={busy === `/api/boards/${board.id}`}
                  onClick={() =>
                    patch(`/api/boards/${board.id}`, { isActive: !board.is_active }, board.is_active ? 'Board deactivated' : 'Board activated')
                  }
                >
                  {board.is_active ? <PowerOff /> : <Power />}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  title="Edit board"
                  aria-label={`Edit board "${board.name}"`}
                  onClick={() =>
                    open({
                      kind: 'board',
                      editing: { id: board.id, name: board.name, accountId: board.pinterest_account_id, isActive: board.is_active },
                    })
                  }
                >
                  <Pencil />
                </Button>
                <Button
                  type="button"
                  variant="destructive-outline"
                  size="icon-sm"
                  title="Delete board"
                  aria-label={`Delete board "${board.name}"`}
                  onClick={() => open({ kind: 'delete-board', id: board.id, name: board.name })}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Sections · {board.sections.length}</p>
              <div className="flex flex-wrap items-center gap-2">
                {board.sections.map((section) => (
                  <span
                    key={section.id}
                    className={cn(
                      'inline-flex h-8 items-stretch overflow-hidden rounded-full border text-[0.8125rem] font-semibold',
                      section.is_active
                        ? 'border-primary/40 bg-selected text-primary-hover dark:text-info-foreground'
                        : 'border-dashed border-border-strong bg-card text-muted-foreground'
                    )}
                    data-testid="section-chip"
                  >
                    <button
                      type="button"
                      className={cn(
                        'cursor-pointer px-3 outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                        !section.is_active && 'line-through'
                      )}
                      aria-label={`Edit section "${section.name}"${section.is_active ? '' : ' (inactive)'}`}
                      onClick={() =>
                        open({
                          kind: 'section',
                          boardId: board.id,
                          boardName: board.name,
                          editing: { id: section.id, name: section.name, isActive: section.is_active },
                        })
                      }
                    >
                      {section.name}
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'flex w-7 cursor-pointer items-center justify-center border-l outline-none hover:bg-destructive-soft hover:text-destructive-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                        section.is_active ? 'border-primary/40' : 'border-dashed border-border-strong'
                      )}
                      title="Delete section"
                      aria-label={`Delete section "${section.name}"`}
                      onClick={() => open({ kind: 'delete-section', id: section.id, name: section.name, boardName: board.name })}
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full border border-dashed border-primary bg-card px-3 text-[0.8125rem] font-semibold text-primary-hover outline-none hover:bg-selected focus-visible:ring-2 focus-visible:ring-ring dark:text-info"
                  onClick={() => open({ kind: 'section', boardId: board.id, boardName: board.name })}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Section
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  function accountCard(view: AccountView) {
    const { account, counts, streamNames } = view;
    const isArchived = account.status === 'archived';
    const accountBoards = boards.filter((board) => board.pinterest_account_id === account.id);
    const languageMarket = [account.language, account.market].filter(Boolean).join(' · ');
    return (
      <section key={account.id} className="rounded-2xl border border-border bg-card p-4 shadow-xs sm:p-5" data-testid="pinterest-account-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{account.name}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={account.status} showDot />
              <Badge variant="neutral">{account.account_type === 'business' ? 'Business' : 'Personal'}</Badge>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" aria-label={`Edit "${account.name}"`} onClick={() => open({ kind: 'account', editing: account })}>
              <Pencil />
              <span className="max-sm:sr-only">Edit</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={isArchived ? `Restore "${account.name}"` : `Archive "${account.name}"`}
              disabled={busy === `/api/pinterest-accounts/${account.id}`}
              onClick={() =>
                patch(
                  `/api/pinterest-accounts/${account.id}`,
                  { status: isArchived ? 'active' : 'archived' },
                  isArchived ? 'Pinterest account restored' : 'Pinterest account archived'
                )
              }
            >
              {isArchived ? <ArchiveRestore /> : <Archive />}
              <span className="max-sm:sr-only">{isArchived ? 'Restore' : 'Archive'}</span>
            </Button>
            <Button
              type="button"
              variant="destructive-outline"
              size="sm"
              aria-label={`Delete "${account.name}"`}
              onClick={() => open({ kind: 'delete-account', account, counts })}
            >
              <Trash2 />
              <span className="max-sm:sr-only">Delete</span>
            </Button>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-7 gap-y-1.5 text-[0.8125rem] sm:grid-cols-2">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Username</dt>
            <dd className="truncate text-right font-medium">{account.username ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Profile</dt>
            <dd className="min-w-0 truncate text-right">
              {account.profile_url ? (
                <a href={account.profile_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary-hover hover:underline dark:text-info">
                  Open <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Main niche</dt>
            <dd className="truncate text-right font-medium">{account.main_keyword ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Website</dt>
            <dd className="min-w-0 truncate text-right font-medium">{account.website_url ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Language / market</dt>
            <dd className="truncate text-right font-medium">{languageMarket || '—'}</dd>
          </div>
        </dl>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-2.5" data-testid="account-counts">
          <CountTile
            value={counts.contentStreams}
            label={counts.contentStreams === 0 && !isArchived ? 'Content Streams — add one' : 'Content Streams'}
            attention={counts.contentStreams === 0 && !isArchived}
          />
          <CountTile value={counts.boards} label={counts.boards === 1 ? 'Board' : 'Boards'} />
          <CountTile value={counts.sections} label={counts.sections === 1 ? 'Section' : 'Sections'} />
        </div>

        {streamNames.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Content Streams: <span className="text-foreground">{streamNames.join(', ')}</span>
          </p>
        )}
        {account.notes && <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">{account.notes}</p>}

        <div className="mt-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold tracking-wide text-secondary-foreground uppercase">Boards</h3>
            {!isArchived && (
              <Button type="button" variant="outline" size="sm" onClick={() => open({ kind: 'board', defaultAccountId: account.id })}>
                <Plus />
                Board
              </Button>
            )}
          </div>
          {boardList(accountBoards)}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Alert variant="info" className="min-w-0 flex-1">
          <Info aria-hidden="true" />
          <span>
            <strong className="font-semibold">
              {live.length} account{live.length === 1 ? '' : 's'}
            </strong>{' '}
            · Content Streams are linked to an account in the project page.
          </span>
        </Alert>
        <Button type="button" onClick={() => open({ kind: 'account' })}>
          <Plus />
          Add account
        </Button>
      </div>

      {live.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-card py-10 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-selected">
            <UserRound className="h-4.5 w-4.5 text-primary-hover" />
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            No Pinterest account in this project yet. Existing boards and streams keep working as legacy until you link them.
          </p>
        </div>
      )}

      {live.map(accountCard)}

      {legacyBoards.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-dashed border-border-strong bg-card p-4 sm:p-5" data-testid="legacy-boards">
          <h2 className="text-sm font-bold">Boards without an account (legacy)</h2>
          <Alert variant="warning">
            <TriangleAlert aria-hidden="true" />
            <span>
              {legacyBoards.length} board{legacyBoards.length === 1 ? ' has' : 's have'} no account yet. They keep working as before; attach each one
              to its account — never done automatically.
            </span>
          </Alert>
          {boardList(legacyBoards, true)}
        </section>
      )}

      {archived.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-secondary-foreground">Archived accounts</h2>
          {archived.map(accountCard)}
        </div>
      )}

      {dialog?.kind === 'account' && (
        <AccountFormDialog
          key={session}
          open
          onOpenChange={(next) => !next && setDialog(null)}
          projectId={projectId}
          editing={dialog.editing}
        />
      )}
      {dialog?.kind === 'board' && (
        <BoardFormDialog
          key={session}
          open
          onOpenChange={(next) => !next && setDialog(null)}
          projectId={projectId}
          accounts={accountOptions}
          editing={dialog.editing}
          defaultAccountId={dialog.defaultAccountId}
          projectBoards={boards.map((board) => ({ id: board.id, name: board.name, accountId: board.pinterest_account_id }))}
        />
      )}
      {dialog?.kind === 'delete-account' && (
        <DeleteConfirmDialog
          key={session}
          open
          onOpenChange={(next) => !next && setDialog(null)}
          title="Delete Pinterest account"
          itemName={dialog.account.name}
          consequences={accountDeleteConsequences(dialog.counts)}
          url={`/api/pinterest-accounts/${dialog.account.id}`}
          successMessage="Pinterest account deleted"
        />
      )}
      {dialog?.kind === 'delete-board' && (
        <DeleteBoardsDialog
          key={session}
          open
          onOpenChange={(next) => !next && setDialog(null)}
          boards={[{ id: dialog.id, name: dialog.name }]}
        />
      )}
      {dialog?.kind === 'delete-section' && (
        <DeleteConfirmDialog
          key={session}
          open
          onOpenChange={(next) => !next && setDialog(null)}
          title={`Delete section of "${dialog.boardName}"`}
          itemName={dialog.name}
          consequences={SECTION_DELETE_CONSEQUENCES}
          url={`/api/board-sections/${dialog.id}`}
          successMessage="Section deleted"
        />
      )}
      {dialog?.kind === 'section' && (
        <SectionFormDialog
          key={session}
          open
          onOpenChange={(next) => !next && setDialog(null)}
          boardId={dialog.boardId}
          boardName={dialog.boardName}
          editing={dialog.editing}
        />
      )}
    </div>
  );
}

/** TASK-095: one count per tile; amber when the account still needs it (no stream). */
function CountTile({ value, label, attention = false }: { value: number; label: string; attention?: boolean }) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-0.5 rounded-xl border px-3 py-2.5',
        attention ? 'border-warning/45 bg-warning-soft text-warning' : 'border-border bg-surface-muted'
      )}
    >
      <span className="text-xl leading-6 font-bold tabular-nums">{value}</span>
      <span className={cn('truncate text-xs font-semibold', !attention && 'text-muted-foreground')}>{label}</span>
    </div>
  );
}
