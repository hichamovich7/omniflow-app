import type { StreamDestinationInput } from '@/lib/validations/content-streams';

/**
 * Pre-TASK-091 contract (`boardId`, one board per stream): the board becomes
 * the stream's single primary, active destination; null clears every
 * destination — exactly what the former link / unlink did.
 */
export function legacyBoardDestinations(boardId: string | null): StreamDestinationInput[] {
  return boardId ? [{ boardId, sectionId: null, isPrimary: true, isActive: true, weight: 1 }] : [];
}

/**
 * The stream's current boards that would not belong to `nextAccountId` —
 * checked when a stream changes account without sending a new destination
 * list (a linked stream may only use boards of its own account).
 */
export function destinationsOutsideAccount(
  boards: { id: string; pinterest_account_id: string | null }[],
  nextAccountId: string | null
): string[] {
  if (!nextAccountId) return [];
  return boards.filter((board) => board.pinterest_account_id !== nextAccountId).map((board) => board.id);
}
