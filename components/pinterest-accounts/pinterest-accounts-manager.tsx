'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, ExternalLink, Pencil, Plus, Power, PowerOff, Trash2, UserRound, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status';
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

  function boardList(list: DestinationBoardOption[]) {
    if (list.length === 0) return <p className="text-xs text-muted-foreground">No board yet.</p>;
    return (
      <ul className="space-y-2">
        {list.map((board) => (
          <li key={board.id} className="rounded-lg border border-border/60 bg-card p-3" data-testid="account-board">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{board.name}</span>
                {!board.is_active && <Badge variant="outline">Inactive</Badge>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={board.is_active ? `Deactivate board "${board.name}"` : `Activate board "${board.name}"`}
                  disabled={busy === `/api/boards/${board.id}`}
                  onClick={() =>
                    patch(`/api/boards/${board.id}`, { isActive: !board.is_active }, board.is_active ? 'Board deactivated' : 'Board activated')
                  }
                >
                  {board.is_active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit board "${board.name}"`}
                  onClick={() =>
                    open({
                      kind: 'board',
                      editing: { id: board.id, name: board.name, accountId: board.pinterest_account_id, isActive: board.is_active },
                    })
                  }
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Delete board "${board.name}"`}
                  onClick={() => open({ kind: 'delete-board', id: board.id, name: board.name })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {board.sections.length === 0 && <span className="text-xs text-muted-foreground">No section</span>}
              {board.sections.map((section) => (
                <span key={section.id} className="inline-flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className={section.is_active ? undefined : 'text-muted-foreground line-through'}
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
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Delete section "${section.name}"`}
                    onClick={() => open({ kind: 'delete-section', id: section.id, name: section.name, boardName: board.name })}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </span>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => open({ kind: 'section', boardId: board.id, boardName: board.name })}
              >
                <Plus className="h-3 w-3" />
                Section
              </Button>
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
      <section key={account.id} className="rounded-2xl border border-border/60 bg-surface p-4 sm:p-5" data-testid="pinterest-account-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{account.name}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={account.status} />
              <Badge variant="outline">{account.account_type === 'business' ? 'Business' : 'Personal'}</Badge>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit "${account.name}"`} onClick={() => open({ kind: 'account', editing: account })}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
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
              {isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive"
              aria-label={`Delete "${account.name}"`}
              onClick={() => open({ kind: 'delete-account', account, counts })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Username</dt>
            <dd className="truncate text-right">{account.username ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Profile</dt>
            <dd className="min-w-0 truncate text-right">
              {account.profile_url ? (
                <a href={account.profile_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  Open <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Main niche</dt>
            <dd className="truncate text-right">{account.main_keyword ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Website</dt>
            <dd className="min-w-0 truncate text-right">{account.website_url ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Language / market</dt>
            <dd className="truncate text-right">{languageMarket || '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Streams · Boards · Sections</dt>
            <dd className="text-right tabular-nums" data-testid="account-counts">
              {counts.contentStreams} · {counts.boards} · {counts.sections}
            </dd>
          </div>
        </dl>

        {streamNames.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Content Streams: <span className="text-foreground">{streamNames.join(', ')}</span>
          </p>
        )}
        {account.notes && <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">{account.notes}</p>}

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Boards</h3>
            {!isArchived && (
              <Button type="button" variant="outline" size="sm" onClick={() => open({ kind: 'board', defaultAccountId: account.id })}>
                <Plus className="h-3.5 w-3.5" />
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {live.length} account{live.length === 1 ? '' : 's'} · Content Streams are linked to an account in the project page.
        </p>
        <Button type="button" size="sm" onClick={() => open({ kind: 'account' })}>
          <Plus className="h-3.5 w-3.5" />
          Add account
        </Button>
      </div>

      {live.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 py-10 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <UserRound className="h-4.5 w-4.5 text-muted-foreground" />
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            No Pinterest account in this project yet. Existing boards and streams keep working as legacy until you link them.
          </p>
        </div>
      )}

      {live.map(accountCard)}

      {legacyBoards.length > 0 && (
        <section className="rounded-2xl border border-dashed border-border/60 p-4 sm:p-5" data-testid="legacy-boards">
          <h2 className="text-sm font-medium">Boards without an account (legacy)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            They keep working as before. Edit a board to attach it to an account — never done automatically.
          </p>
          <div className="mt-3">{boardList(legacyBoards)}</div>
        </section>
      )}

      {archived.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Archived accounts</h2>
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
