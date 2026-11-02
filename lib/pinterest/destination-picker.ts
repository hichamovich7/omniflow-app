import type { PinterestStructure } from '@/lib/queries/pinterest-accounts';

/**
 * TASK-091: the Pinterest form's dependent lists — Pinterest Account →
 * Content Stream → Board → Section (optional). Pure: the same rules as the
 * server (lib/pinterest/destinations.ts), so a board of another account, an
 * inactive board or a section of another board is never offered. `legacy` =
 * the former free-text board / section, kept for projects and streams not
 * linked to an account yet.
 */
export type DestinationSelection =
  | { mode: 'legacy' }
  | { mode: 'account'; accountId: string; streamId: string | null; boardId: string | null; sectionId: string | null };

export const LEGACY_SELECTION: DestinationSelection = { mode: 'legacy' };

export function accountChoices(structure: PinterestStructure, projectId: string) {
  return structure.accounts.filter((account) => account.project_id === projectId && account.status !== 'archived');
}

export function streamChoices(structure: PinterestStructure, accountId: string) {
  return structure.streams.filter((stream) => stream.pinterest_account_id === accountId && stream.status !== 'archived');
}

/** Active boards of the account; with a stream, only the boards of its active destinations (primary first). */
export function boardChoices(structure: PinterestStructure, accountId: string, streamId: string | null) {
  const accountBoards = structure.boards.filter((board) => board.pinterest_account_id === accountId && board.is_active);
  if (!streamId) return accountBoards;
  const stream = structure.streams.find((candidate) => candidate.id === streamId);
  if (!stream) return [];
  const ordered = [...stream.destinations]
    .filter((destination) => destination.is_active)
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  const ids = ordered.map((destination) => destination.board_id).filter((id, index, all) => all.indexOf(id) === index);
  return ids
    .map((id) => accountBoards.find((board) => board.id === id))
    .filter((board): board is NonNullable<typeof board> => !!board);
}

export function sectionChoices(structure: PinterestStructure, boardId: string) {
  return structure.boards.find((board) => board.id === boardId)?.sections.filter((section) => section.is_active) ?? [];
}

/** Active destinations a stream would distribute Pins across ("Auto"). */
export function activeStreamDestinationCount(structure: PinterestStructure, accountId: string, streamId: string): number {
  const stream = structure.streams.find((candidate) => candidate.id === streamId);
  if (!stream) return 0;
  const boards = new Set(boardChoices(structure, accountId, null).map((board) => board.id));
  return stream.destinations.filter((destination) => {
    if (!destination.is_active || !boards.has(destination.board_id)) return false;
    if (!destination.section_id) return true;
    return sectionChoices(structure, destination.board_id).some((section) => section.id === destination.section_id);
  }).length;
}

/** Selection for a newly chosen account: its first stream (Auto) or, without stream, its first board. */
export function selectAccount(structure: PinterestStructure, accountId: string): DestinationSelection {
  const [stream] = streamChoices(structure, accountId);
  if (stream) return { mode: 'account', accountId, streamId: stream.id, boardId: null, sectionId: null };
  const [board] = boardChoices(structure, accountId, null);
  return { mode: 'account', accountId, streamId: null, boardId: board?.id ?? null, sectionId: null };
}

/**
 * Default selection: the account of the suggested board (article flows) when
 * it has one, else the project's first active account, else legacy.
 */
export function initialDestinationSelection(
  structure: PinterestStructure,
  projectId: string,
  suggestedBoardName?: string | null
): DestinationSelection {
  const accounts = accountChoices(structure, projectId);
  if (accounts.length === 0) return LEGACY_SELECTION;
  const suggested = suggestedBoardName
    ? structure.boards.find(
        (board) =>
          board.project_id === projectId &&
          board.name === suggestedBoardName &&
          board.is_active &&
          accounts.some((account) => account.id === board.pinterest_account_id)
      )
    : undefined;
  if (suggested?.pinterest_account_id) {
    const stream = streamChoices(structure, suggested.pinterest_account_id).find((candidate) =>
      boardChoices(structure, suggested.pinterest_account_id as string, candidate.id).some((board) => board.id === suggested.id)
    );
    return { mode: 'account', accountId: suggested.pinterest_account_id, streamId: stream?.id ?? null, boardId: suggested.id, sectionId: null };
  }
  return selectAccount(structure, accounts[0].id);
}

/** Request fields for /api/pinterest/generate; null in legacy mode (the free-text board is sent instead). */
export function destinationRequestFields(selection: DestinationSelection) {
  if (selection.mode === 'legacy') return null;
  return {
    pinterestAccountId: selection.accountId,
    ...(selection.streamId ? { contentStreamId: selection.streamId } : {}),
    ...(selection.boardId ? { boardId: selection.boardId } : {}),
    ...(selection.boardId && selection.sectionId ? { boardSectionId: selection.sectionId } : {}),
  };
}

/** Blocking problem of the current selection (shown under the lists), or null. */
export function destinationSelectionError(structure: PinterestStructure, selection: DestinationSelection): string | null {
  if (selection.mode === 'legacy') return null;
  if (!selection.streamId && !selection.boardId) {
    return boardChoices(structure, selection.accountId, null).length === 0
      ? 'This account has no active board yet. Add one on the Pinterest Accounts page.'
      : 'Choose a Content Stream or a board.';
  }
  if (selection.streamId && !selection.boardId && activeStreamDestinationCount(structure, selection.accountId, selection.streamId) === 0) {
    return 'This Content Stream has no active board. Add one in the project page.';
  }
  return null;
}
