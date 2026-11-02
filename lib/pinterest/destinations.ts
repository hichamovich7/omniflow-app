import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * TASK-091: where each generated Pin goes — Project → Pinterest Account →
 * Content Stream → Board → Section. Resolved server-side from the user's
 * choice before any AI call and never from the model's answer: the model
 * cannot invent a board or a section in this mode, and no AI request is ever
 * made to pick one.
 */

export interface PinDestination {
  accountId: string;
  boardId: string;
  /** Exact board name, as configured — written to pins.board (CSV column). */
  boardName: string;
  sectionId: string | null;
  /** Exact section name, as configured — written to pins.board_section. */
  sectionName: string | null;
}

export interface WeightedDestination extends PinDestination {
  isPrimary: boolean;
  weight: number;
}

/**
 * Deterministic smooth weighted round-robin over the active destinations.
 * The primary destination is first in line (it gets the first Pin and wins
 * every tie), then the stored order. Each Pin gets exactly one destination —
 * never duplicated on several boards — and over `count` Pins each destination
 * receives a share proportional to its weight (2 / 1 → 2 Pins out of 3).
 * Same input, same output: no randomness.
 */
export function distributePinDestinations<T extends { isPrimary: boolean; weight: number }>(
  destinations: T[],
  count: number
): T[] {
  if (destinations.length === 0 || count <= 0) return [];
  const ordered = [...destinations].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const weights = ordered.map((destination) => Math.max(1, Math.floor(destination.weight)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const current = weights.map(() => 0);
  const plan: T[] = [];
  for (let pin = 0; pin < count; pin++) {
    let best = 0;
    for (let index = 0; index < ordered.length; index++) {
      current[index] += weights[index];
      if (current[index] > current[best]) best = index;
    }
    current[best] -= total;
    plan.push(ordered[best]);
  }
  return plan;
}

export type DestinationErrorCode =
  | 'account_not_found'
  | 'account_archived'
  | 'stream_not_found'
  | 'stream_account_mismatch'
  | 'board_not_found'
  | 'board_account_mismatch'
  | 'board_inactive'
  | 'board_not_in_stream'
  | 'section_not_found'
  | 'section_board_mismatch'
  | 'section_inactive'
  | 'no_active_destination'
  | 'destination_required';

export class DestinationError extends Error {
  constructor(
    public code: DestinationErrorCode,
    message: string
  ) {
    super(message);
  }
}

export interface DestinationRequest {
  pinterestAccountId: string;
  contentStreamId?: string;
  boardId?: string;
  boardSectionId?: string;
}

export interface ResolvedDestinations {
  accountId: string;
  accountName: string;
  contentStreamName: string | null;
  /** Candidates in priority order (primary first). One entry when a board was chosen. */
  candidates: WeightedDestination[];
  /** One destination per Pin, deterministic (see distributePinDestinations). */
  plan: (count: number) => PinDestination[];
}

interface AccountRow {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  status: string;
}

interface StreamRow {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  status: string;
  pinterest_account_id: string | null;
}

interface BoardRow {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  pinterest_account_id: string | null;
  is_active: boolean | null;
}

interface SectionRow {
  id: string;
  board_id: string;
  user_id: string;
  name: string;
  is_active: boolean | null;
}

interface LinkRow {
  board_id: string;
  section_id: string | null;
  is_primary: boolean | null;
  is_active: boolean | null;
  weight: number | null;
}

function toPinDestination(destination: WeightedDestination): PinDestination {
  return {
    accountId: destination.accountId,
    boardId: destination.boardId,
    boardName: destination.boardName,
    sectionId: destination.sectionId,
    sectionName: destination.sectionName,
  };
}

/**
 * Validates the chosen account / stream / board / section against the
 * caller and the project, then returns the destination candidates:
 *   - board chosen (optionally a section) → every Pin goes there;
 *   - stream only → the stream's active destinations, weighted, primary first.
 * Inactive boards / sections / destinations are never used. Throws a
 * DestinationError (nothing written) on any mismatch.
 */
export async function resolveGenerationDestinations(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  request: DestinationRequest
): Promise<ResolvedDestinations> {
  const { data: account } = await supabase
    .from('pinterest_accounts')
    .select('id, project_id, user_id, name, status')
    .eq('id', request.pinterestAccountId)
    .single();
  const accountRow = account as AccountRow | null;
  if (!accountRow || accountRow.user_id !== userId || accountRow.project_id !== projectId) {
    throw new DestinationError('account_not_found', 'This Pinterest account was not found in this project.');
  }
  if (accountRow.status === 'archived') {
    throw new DestinationError('account_archived', 'This Pinterest account is archived. Choose an active account.');
  }

  let stream: StreamRow | null = null;
  if (request.contentStreamId) {
    const { data } = await supabase
      .from('content_streams')
      .select('id, project_id, user_id, name, status, pinterest_account_id')
      .eq('id', request.contentStreamId)
      .single();
    stream = data as StreamRow | null;
    if (!stream || stream.user_id !== userId || stream.project_id !== projectId || stream.status === 'archived') {
      throw new DestinationError('stream_not_found', 'This Content Stream was not found in this project.');
    }
    if (stream.pinterest_account_id !== accountRow.id) {
      throw new DestinationError('stream_account_mismatch', 'This Content Stream belongs to another Pinterest account.');
    }
  }

  const base = { accountId: accountRow.id, accountName: accountRow.name, contentStreamName: stream?.name ?? null };

  if (request.boardId) {
    const { data: board } = await supabase
      .from('boards')
      .select('id, project_id, user_id, name, pinterest_account_id, is_active')
      .eq('id', request.boardId)
      .single();
    const boardRow = board as BoardRow | null;
    if (!boardRow || boardRow.user_id !== userId || boardRow.project_id !== projectId) {
      throw new DestinationError('board_not_found', 'This board was not found in this project.');
    }
    if (boardRow.pinterest_account_id !== accountRow.id) {
      throw new DestinationError('board_account_mismatch', 'This board belongs to another Pinterest account.');
    }
    if (boardRow.is_active === false) {
      throw new DestinationError('board_inactive', 'This board is inactive. Activate it or choose another board.');
    }

    if (stream) {
      const { data: links } = await supabase
        .from('content_stream_boards')
        .select('board_id, is_active')
        .eq('content_stream_id', stream.id);
      const inStream = ((links ?? []) as Array<{ board_id: string; is_active: boolean | null }>).some(
        (link) => link.board_id === boardRow.id && link.is_active !== false
      );
      if (!inStream) {
        throw new DestinationError('board_not_in_stream', 'This board is not an active destination of this Content Stream.');
      }
    }

    let section: SectionRow | null = null;
    if (request.boardSectionId) {
      const { data } = await supabase
        .from('pinterest_board_sections')
        .select('id, board_id, user_id, name, is_active')
        .eq('id', request.boardSectionId)
        .single();
      section = data as SectionRow | null;
      if (!section || section.user_id !== userId) {
        throw new DestinationError('section_not_found', 'This board section was not found.');
      }
      if (section.board_id !== boardRow.id) {
        throw new DestinationError('section_board_mismatch', 'This section belongs to another board.');
      }
      if (section.is_active === false) {
        throw new DestinationError('section_inactive', 'This section is inactive. Activate it or choose another section.');
      }
    }

    const only: WeightedDestination = {
      accountId: accountRow.id,
      boardId: boardRow.id,
      boardName: boardRow.name,
      sectionId: section?.id ?? null,
      sectionName: section?.name ?? null,
      isPrimary: true,
      weight: 1,
    };
    return { ...base, candidates: [only], plan: (count) => Array.from({ length: Math.max(0, count) }, () => toPinDestination(only)) };
  }

  if (!stream) {
    throw new DestinationError('destination_required', 'Choose a Content Stream or a board for this Pinterest account.');
  }

  const { data: links } = await supabase
    .from('content_stream_boards')
    .select('board_id, section_id, is_primary, is_active, weight')
    .eq('content_stream_id', stream.id)
    .order('created_at', { ascending: true });
  const activeLinks = ((links ?? []) as LinkRow[]).filter((link) => link.is_active !== false);

  const boardIds = [...new Set(activeLinks.map((link) => link.board_id))];
  const sectionIds = [...new Set(activeLinks.map((link) => link.section_id).filter((id): id is string => !!id))];
  const [{ data: boards }, { data: sections }] = await Promise.all([
    boardIds.length
      ? supabase.from('boards').select('id, project_id, user_id, name, pinterest_account_id, is_active').in('id', boardIds)
      : Promise.resolve({ data: [] }),
    sectionIds.length
      ? supabase.from('pinterest_board_sections').select('id, board_id, user_id, name, is_active').in('id', sectionIds)
      : Promise.resolve({ data: [] }),
  ]);
  const boardById = new Map(((boards ?? []) as BoardRow[]).map((board) => [board.id, board]));
  const sectionById = new Map(((sections ?? []) as SectionRow[]).map((section) => [section.id, section]));

  const candidates: WeightedDestination[] = [];
  for (const link of activeLinks) {
    const board = boardById.get(link.board_id);
    // Defense in depth: the database already refuses these links (RLS 047).
    if (!board || board.user_id !== userId || board.project_id !== projectId) continue;
    if (board.pinterest_account_id !== accountRow.id || board.is_active === false) continue;
    const section = link.section_id ? sectionById.get(link.section_id) : null;
    if (link.section_id && (!section || section.board_id !== board.id || section.is_active === false)) continue;
    candidates.push({
      accountId: accountRow.id,
      boardId: board.id,
      boardName: board.name,
      sectionId: section?.id ?? null,
      sectionName: section?.name ?? null,
      isPrimary: link.is_primary === true,
      weight: link.weight ?? 1,
    });
  }

  if (candidates.length === 0) {
    throw new DestinationError(
      'no_active_destination',
      'This Content Stream has no active board. Add or activate a destination in the project page.'
    );
  }

  return {
    ...base,
    candidates: [...candidates].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
    plan: (count) => distributePinDestinations(candidates, count).map(toPinDestination),
  };
}
