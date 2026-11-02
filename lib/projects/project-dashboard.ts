import type { PinterestStructure } from '@/lib/queries/pinterest-accounts';

/**
 * TASK-092: pure view model of the one-page project workspace — the
 * WordPress category table, the "Needs attention" list, free boards and the
 * prefilled "+ Stream" draft. No database access, unit-testable.
 */

export interface DashboardCategory {
  id: string;
  name: string;
}

export interface CategoryRow {
  id: string;
  name: string;
  /** Non-archived streams using this category. */
  streams: { id: string; name: string }[];
  /** Their Pinterest accounts, "No account" for legacy streams; unique. */
  accounts: string[];
  articles: number;
}

const liveStreams = (structure: PinterestStructure) => structure.streams.filter((stream) => stream.status !== 'archived');

export function buildCategoryRows(
  structure: PinterestStructure,
  categories: DashboardCategory[],
  streamCategory: Record<string, string | null>,
  articlesByCategory: Record<string, number>
): CategoryRow[] {
  return categories.map((category) => {
    const streams = liveStreams(structure).filter((stream) => streamCategory[stream.id] === category.id);
    const accounts = streams
      .map((stream) => structure.accounts.find((account) => account.id === stream.pinterest_account_id)?.name ?? 'No account')
      .filter((name, index, all) => all.indexOf(name) === index);
    return {
      id: category.id,
      name: category.name,
      streams: streams.map((stream) => ({ id: stream.id, name: stream.name })),
      accounts,
      articles: articlesByCategory[category.id] ?? 0,
    };
  });
}

export type TodoKind = 'board_without_account' | 'stream_without_account' | 'stream_without_category' | 'category_without_stream';

export interface TodoItem {
  kind: TodoKind;
  /** Board, stream or category id. */
  id: string;
  name: string;
}

/**
 * What is not linked yet, in a stable order: boards without account, streams
 * without account, streams without WordPress category, categories no stream
 * uses. Archived streams and archived accounts' boards are ignored. Nothing is
 * ever linked automatically — each item gets an explicit action in the UI.
 */
export function buildTodos(
  structure: PinterestStructure,
  categories: DashboardCategory[],
  streamCategory: Record<string, string | null>
): TodoItem[] {
  const streams = liveStreams(structure);
  const todos: TodoItem[] = [];
  for (const board of structure.boards) {
    if (!board.pinterest_account_id) todos.push({ kind: 'board_without_account', id: board.id, name: board.name });
  }
  for (const stream of streams) {
    if (!stream.pinterest_account_id) todos.push({ kind: 'stream_without_account', id: stream.id, name: stream.name });
  }
  for (const stream of streams) {
    if (!streamCategory[stream.id]) todos.push({ kind: 'stream_without_category', id: stream.id, name: stream.name });
  }
  for (const category of categories) {
    if (!streams.some((stream) => streamCategory[stream.id] === category.id)) {
      todos.push({ kind: 'category_without_stream', id: category.id, name: category.name });
    }
  }
  return todos;
}

/** Board ids used by a non-archived stream other than `exceptStreamId` ("one board per active stream"). */
export function occupiedBoardIds(structure: PinterestStructure, exceptStreamId?: string): Set<string> {
  const ids = new Set<string>();
  for (const stream of liveStreams(structure)) {
    if (stream.id === exceptStreamId) continue;
    for (const destination of stream.destinations) ids.add(destination.board_id);
  }
  return ids;
}

/** Active boards of the account that no other live stream uses, in name order. */
export function freeBoardsForAccount(structure: PinterestStructure, accountId: string, exceptStreamId?: string) {
  const occupied = occupiedBoardIds(structure, exceptStreamId);
  return structure.boards.filter(
    (board) => board.pinterest_account_id === accountId && board.is_active && !occupied.has(board.id)
  );
}

/** First category whose name is contained in `text` (case-insensitive), longest name first. */
export function suggestCategoryId(text: string, categories: DashboardCategory[]): string | null {
  const lower = text.toLowerCase();
  const match = [...categories]
    .sort((a, b) => b.name.length - a.name.length)
    .find((category) => category.name.trim() && lower.includes(category.name.trim().toLowerCase()));
  return match?.id ?? null;
}

export interface StreamDraft {
  accountId: string | null;
  name: string;
  categoryId: string | null;
  destinations: { boardId: string; sectionId: string | null; isPrimary: boolean; isActive: boolean; weight: number }[];
}

/**
 * "+ Stream" prefill: the account, every free board of it (no section, weight
 * 1, the first one primary) and a WordPress category suggested from the
 * account's name and main keyword. Everything stays editable before saving.
 */
export function prefillStreamDraft(
  structure: PinterestStructure,
  categories: DashboardCategory[],
  accountId: string
): StreamDraft {
  const account = structure.accounts.find((candidate) => candidate.id === accountId);
  const boards = freeBoardsForAccount(structure, accountId);
  return {
    accountId,
    name: '',
    categoryId: account ? suggestCategoryId(`${account.name} ${account.main_keyword ?? ''}`, categories) : null,
    destinations: boards.map((board, index) => ({
      boardId: board.id,
      sectionId: null,
      isPrimary: index === 0,
      isActive: true,
      weight: 1,
    })),
  };
}

/** "Create a stream" from a category without stream: named after it, linked to it, no account yet. */
export function draftFromCategory(category: DashboardCategory): StreamDraft {
  return { accountId: null, name: category.name, categoryId: category.id, destinations: [] };
}
