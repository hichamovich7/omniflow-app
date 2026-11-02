// TASK-093: "Add board" on an account, when the board already exists in the
// project. Board names are unique per project (boards_project_name_unique), so
// an existing legacy board is attached to the account instead of re-created.
// Pure helpers — the dialog writes through PATCH /api/boards/[id].

export interface ExistingBoard {
  id: string;
  name: string;
  /** null = legacy board (no Pinterest account yet). */
  accountId: string | null;
}

export type BoardNameConflict =
  | { kind: 'legacy'; board: ExistingBoard; exact: boolean }
  | { kind: 'same_account'; board: ExistingBoard; exact: boolean }
  | { kind: 'other_account'; board: ExistingBoard; exact: boolean };

const normalize = (name: string) => name.trim().toLowerCase();

/** Legacy boards of the project, the ones "Existing board" can attach — sorted by name. */
export function attachableBoards(boards: ExistingBoard[]): ExistingBoard[] {
  return boards
    .filter((board) => !board.accountId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The project board the typed name points to, if any. Case-insensitive, like
 * the names people type; `exact` = the database would refuse the new board
 * (the unique index compares names as stored).
 */
export function boardNameConflict(
  boards: ExistingBoard[],
  name: string,
  accountId: string | null
): BoardNameConflict | null {
  const wanted = normalize(name);
  if (!wanted) return null;
  const board = boards.find((candidate) => normalize(candidate.name) === wanted);
  if (!board) return null;
  const exact = board.name === name.trim();
  if (!board.accountId) return { kind: 'legacy', board, exact };
  if (board.accountId === accountId) return { kind: 'same_account', board, exact };
  return { kind: 'other_account', board, exact };
}
