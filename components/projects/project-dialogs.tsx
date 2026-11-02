'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  ContentStreamFormDialog,
  type AccountOption,
  type BoardOption,
  type CategoryOption,
  type EditingContentStream,
} from '@/components/projects/content-stream-form-dialog';
import { ArchiveContentStreamDialog } from '@/components/projects/archive-content-stream-dialog';
import { AccountFormDialog, BoardFormDialog } from '@/components/pinterest-accounts/structure-dialogs';
import type { StreamDraft } from '@/lib/projects/project-dashboard';

type DialogState =
  | { kind: 'create-stream'; draft?: StreamDraft }
  | { kind: 'edit-stream'; editing: EditingContentStream }
  | { kind: 'archive-stream'; id: string; name: string }
  | { kind: 'account' }
  | { kind: 'board'; accountId: string | null }
  | null;

interface ProjectDialogs {
  createStream: (draft?: StreamDraft) => void;
  editStream: (editing: EditingContentStream) => void;
  archiveStream: (id: string, name: string) => void;
  createAccount: () => void;
  createBoard: (accountId: string | null) => void;
}

const ProjectDialogsContext = createContext<ProjectDialogs | null>(null);

export function useProjectDialogs(): ProjectDialogs {
  const value = useContext(ProjectDialogsContext);
  if (!value) throw new Error('useProjectDialogs must be used inside <ProjectDialogsProvider>');
  return value;
}

/**
 * TASK-092: the project workspace's dialogs, opened from the Pinterest block
 * and from "Needs attention". Each opening remounts the dialog fresh (its
 * state starts from the prefill), and every write goes through the existing
 * API routes, which re-check ownership.
 */
export function ProjectDialogsProvider({
  projectId,
  categories,
  boards,
  accounts,
  children,
}: {
  projectId: string;
  categories: CategoryOption[];
  boards: BoardOption[];
  accounts: AccountOption[];
  children: ReactNode;
}) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [session, setSession] = useState(0);

  const open = useCallback((next: NonNullable<DialogState>) => {
    setSession((n) => n + 1);
    setDialog(next);
  }, []);

  const value = useMemo<ProjectDialogs>(
    () => ({
      createStream: (draft) => open({ kind: 'create-stream', draft }),
      editStream: (editing) => open({ kind: 'edit-stream', editing }),
      archiveStream: (id, name) => open({ kind: 'archive-stream', id, name }),
      createAccount: () => open({ kind: 'account' }),
      createBoard: (accountId) => open({ kind: 'board', accountId }),
    }),
    [open]
  );

  const close = (next: boolean) => {
    if (!next) setDialog(null);
  };

  return (
    <ProjectDialogsContext.Provider value={value}>
      {children}

      {(dialog?.kind === 'create-stream' || dialog?.kind === 'edit-stream') && (
        <ContentStreamFormDialog
          key={session}
          open
          onOpenChange={close}
          projectId={projectId}
          categories={categories}
          boards={boards}
          accounts={accounts}
          editing={dialog.kind === 'edit-stream' ? dialog.editing : undefined}
          initialName={dialog.kind === 'create-stream' ? dialog.draft?.name : undefined}
          initialDraft={dialog.kind === 'create-stream' ? dialog.draft : undefined}
        />
      )}
      {dialog?.kind === 'archive-stream' && (
        <ArchiveContentStreamDialog
          key={session}
          contentStreamId={dialog.id}
          contentStreamName={dialog.name}
          open
          onOpenChange={close}
        />
      )}
      {dialog?.kind === 'account' && <AccountFormDialog key={session} open onOpenChange={close} projectId={projectId} />}
      {dialog?.kind === 'board' && (
        <BoardFormDialog
          key={session}
          open
          onOpenChange={close}
          projectId={projectId}
          accounts={accounts}
          defaultAccountId={dialog.accountId}
        />
      )}
    </ProjectDialogsContext.Provider>
  );
}
