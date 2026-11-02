import type { SupabaseClient } from '@supabase/supabase-js';
import type { PinterestAccount, PinterestAccountStatus, PinterestBoardSection } from '@/types/pinterest-accounts';
import type { ContentStreamStatus } from '@/types/content-streams';
import type { StreamDestinationInput } from '@/lib/validations/content-streams';

/**
 * TASK-091 (migration 047): Pinterest accounts, board sections and Content
 * Stream destinations. Every write is checked here against the caller and the
 * project before it reaches the database; RLS (047) enforces the same rules
 * for any direct client call.
 */

export type PinterestStructureErrorCode =
  | 'project_forbidden'
  | 'account_forbidden'
  | 'account_archived'
  | 'board_forbidden'
  | 'board_account_mismatch'
  | 'section_forbidden'
  | 'section_board_mismatch'
  | 'destination_account_mismatch'
  | 'board_in_use_by_other_account';

export class PinterestStructureError extends Error {
  constructor(
    public code: PinterestStructureErrorCode,
    message: string
  ) {
    super(message);
  }
}

export interface OwnedAccountRef {
  id: string;
  user_id: string;
  project_id: string;
  status: PinterestAccountStatus | string;
}

export interface DestinationBoardRef {
  id: string;
  user_id: string;
  project_id: string;
  pinterest_account_id: string | null;
}

export interface DestinationSectionRef {
  id: string;
  user_id: string;
  board_id: string;
}

/** The account exists, is the caller's and belongs to this project. */
export function isAccountInProject(account: OwnedAccountRef | null | undefined, projectId: string, userId: string): boolean {
  return !!account && account.user_id === userId && account.project_id === projectId;
}

/**
 * Pure check of a stream's destination list — the same rules as RLS 047:
 * every board is the caller's and in the stream's project; when the stream
 * is linked to an account, every board belongs to that account (a legacy
 * stream without account keeps the project-only rule); every section is the
 * caller's and belongs to its row's board. Returns the first violation.
 */
export function checkStreamDestinations(
  destinations: Pick<StreamDestinationInput, 'boardId' | 'sectionId'>[],
  context: {
    userId: string;
    projectId: string;
    accountId: string | null;
    boards: DestinationBoardRef[];
    sections: DestinationSectionRef[];
  }
): { code: PinterestStructureErrorCode; message: string } | null {
  const boardById = new Map(context.boards.map((board) => [board.id, board]));
  const sectionById = new Map(context.sections.map((section) => [section.id, section]));
  for (const destination of destinations) {
    const board = boardById.get(destination.boardId);
    if (!board || board.user_id !== context.userId || board.project_id !== context.projectId) {
      return { code: 'board_forbidden', message: 'A board was not found in this project.' };
    }
    if (context.accountId && board.pinterest_account_id !== context.accountId) {
      return { code: 'board_account_mismatch', message: 'Every board must belong to the Content Stream\'s Pinterest account.' };
    }
    if (destination.sectionId) {
      const section = sectionById.get(destination.sectionId);
      if (!section || section.user_id !== context.userId) {
        return { code: 'section_forbidden', message: 'A board section was not found.' };
      }
      if (section.board_id !== board.id) {
        return { code: 'section_board_mismatch', message: 'A section does not belong to its board.' };
      }
    }
  }
  return null;
}

export async function getOwnedAccount(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  accountId: string
): Promise<OwnedAccountRef> {
  const { data } = await supabase
    .from('pinterest_accounts')
    .select('id, user_id, project_id, status')
    .eq('id', accountId)
    .single();
  const account = data as OwnedAccountRef | null;
  if (!isAccountInProject(account, projectId, userId)) {
    throw new PinterestStructureError('account_forbidden', 'Pinterest account not found in this project.');
  }
  return account as OwnedAccountRef;
}

/** Loads the boards / sections a destination list points at, then runs checkStreamDestinations(). */
export async function assertStreamDestinations(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  accountId: string | null,
  destinations: Pick<StreamDestinationInput, 'boardId' | 'sectionId'>[]
): Promise<void> {
  if (destinations.length === 0) return;
  const boardIds = [...new Set(destinations.map((d) => d.boardId))];
  const sectionIds = [...new Set(destinations.map((d) => d.sectionId).filter((id): id is string => !!id))];
  const [{ data: boards }, { data: sections }] = await Promise.all([
    supabase.from('boards').select('id, user_id, project_id, pinterest_account_id').in('id', boardIds),
    sectionIds.length
      ? supabase.from('pinterest_board_sections').select('id, user_id, board_id').in('id', sectionIds)
      : Promise.resolve({ data: [] }),
  ]);
  const violation = checkStreamDestinations(destinations, {
    userId,
    projectId,
    accountId,
    boards: (boards ?? []) as DestinationBoardRef[],
    sections: (sections ?? []) as DestinationSectionRef[],
  });
  if (violation) throw new PinterestStructureError(violation.code, violation.message);
}

interface StoredDestination {
  id: string;
  board_id: string;
  section_id: string | null;
  is_primary: boolean | null;
}

const destinationKey = (boardId: string, sectionId: string | null | undefined) => `${boardId}:${sectionId ?? ''}`;

/**
 * Replaces a stream's destinations with `destinations` (already validated and
 * normalized). Kept rows are updated in place (same id), missing rows are
 * removed, new rows inserted. The primary flag is cleared first and set last,
 * so the "one primary per stream" index never sees two primaries.
 */
export async function syncStreamDestinations(
  supabase: SupabaseClient,
  userId: string,
  contentStreamId: string,
  destinations: StreamDestinationInput[]
): Promise<void> {
  const { data } = await supabase
    .from('content_stream_boards')
    .select('id, board_id, section_id, is_primary')
    .eq('content_stream_id', contentStreamId);
  const stored = (data ?? []) as StoredDestination[];
  const storedByKey = new Map(stored.map((row) => [destinationKey(row.board_id, row.section_id), row]));
  const wanted = new Set(destinations.map((d) => destinationKey(d.boardId, d.sectionId)));

  if (stored.some((row) => row.is_primary)) {
    const { error } = await supabase
      .from('content_stream_boards')
      .update({ is_primary: false })
      .eq('content_stream_id', contentStreamId)
      .eq('is_primary', true);
    if (error) throw error;
  }

  const removed = stored.filter((row) => !wanted.has(destinationKey(row.board_id, row.section_id)));
  if (removed.length > 0) {
    const { error } = await supabase
      .from('content_stream_boards')
      .delete()
      .in(
        'id',
        removed.map((row) => row.id)
      );
    if (error) throw error;
  }

  // Primary last.
  const ordered = [...destinations].sort((a, b) => Number(a.isPrimary) - Number(b.isPrimary));
  for (const destination of ordered) {
    const values = { is_primary: destination.isPrimary, is_active: destination.isActive, weight: destination.weight };
    const existing = storedByKey.get(destinationKey(destination.boardId, destination.sectionId));
    const { error } = existing
      ? await supabase.from('content_stream_boards').update(values).eq('id', existing.id)
      : await supabase.from('content_stream_boards').insert({
          content_stream_id: contentStreamId,
          board_id: destination.boardId,
          section_id: destination.sectionId ?? null,
          user_id: userId,
          ...values,
        });
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

export interface DestinationBoardOption {
  id: string;
  name: string;
  project_id: string;
  pinterest_account_id: string | null;
  is_active: boolean;
  sections: { id: string; name: string; is_active: boolean }[];
}

export interface DestinationStreamOption {
  id: string;
  name: string;
  project_id: string;
  status: ContentStreamStatus;
  pinterest_account_id: string | null;
  destinations: {
    id: string;
    board_id: string;
    section_id: string | null;
    is_primary: boolean;
    is_active: boolean;
    weight: number;
  }[];
}

export interface PinterestStructure {
  accounts: PinterestAccount[];
  boards: DestinationBoardOption[];
  streams: DestinationStreamOption[];
}

/**
 * Accounts, boards (with their sections) and streams (with their
 * destinations) of the given projects — one read for the account page, the
 * Content Stream form and the Pinterest form's dependent lists. Before
 * migration 047 the new tables do not exist: everything degrades to the
 * legacy shape (no account, no section, every link primary + active).
 */
export async function loadPinterestStructure(supabase: SupabaseClient, projectIds: string[]): Promise<PinterestStructure> {
  if (projectIds.length === 0) return { accounts: [], boards: [], streams: [] };

  const [accountsRes, boardsRes, streamsRes] = await Promise.all([
    supabase.from('pinterest_accounts').select('*').in('project_id', projectIds).order('name'),
    supabase.from('boards').select('*').in('project_id', projectIds).order('name'),
    supabase.from('content_streams').select('*').in('project_id', projectIds).order('name'),
  ]);

  const boardsRaw = (boardsRes.data ?? []) as Array<{
    id: string;
    name: string;
    project_id: string;
    pinterest_account_id?: string | null;
    is_active?: boolean;
  }>;
  const streamsRaw = (streamsRes.data ?? []) as Array<{
    id: string;
    name: string;
    project_id: string;
    status: ContentStreamStatus;
    pinterest_account_id?: string | null;
  }>;

  const boardIds = boardsRaw.map((board) => board.id);
  const streamIds = streamsRaw.map((stream) => stream.id);
  const [sectionsRes, linksRes] = await Promise.all([
    boardIds.length
      ? supabase.from('pinterest_board_sections').select('*').in('board_id', boardIds).order('name')
      : Promise.resolve({ data: [] }),
    streamIds.length
      ? supabase.from('content_stream_boards').select('*').in('content_stream_id', streamIds).order('created_at')
      : Promise.resolve({ data: [] }),
  ]);

  const sections = (sectionsRes.data ?? []) as PinterestBoardSection[];
  const links = (linksRes.data ?? []) as Array<{
    id?: string;
    content_stream_id: string;
    board_id: string;
    section_id?: string | null;
    is_primary?: boolean;
    is_active?: boolean;
    weight?: number;
  }>;

  return {
    accounts: (accountsRes.error ? [] : accountsRes.data ?? []) as PinterestAccount[],
    boards: boardsRaw.map((board) => ({
      id: board.id,
      name: board.name,
      project_id: board.project_id,
      pinterest_account_id: board.pinterest_account_id ?? null,
      is_active: board.is_active !== false,
      sections: sections
        .filter((section) => section.board_id === board.id)
        .map((section) => ({ id: section.id, name: section.name, is_active: section.is_active })),
    })),
    streams: streamsRaw.map((stream) => {
      const own = links.filter((link) => link.content_stream_id === stream.id);
      // Before 047 there is no primary flag: the first link plays that role.
      const hasPrimary = own.some((link) => link.is_primary === true);
      return {
        id: stream.id,
        name: stream.name,
        project_id: stream.project_id,
        status: stream.status,
        pinterest_account_id: stream.pinterest_account_id ?? null,
        destinations: own.map((link, index) => ({
          id: link.id ?? `${link.content_stream_id}:${link.board_id}`,
          board_id: link.board_id,
          section_id: link.section_id ?? null,
          is_primary: hasPrimary ? link.is_primary === true : index === 0,
          is_active: link.is_active !== false,
          weight: link.weight ?? 1,
        })),
      };
    }),
  };
}

export interface PinterestAccountCounts {
  contentStreams: number;
  boards: number;
  sections: number;
}

/** Per-account counts for the account page (archived streams not counted). */
export function countAccountStructure(structure: PinterestStructure, accountId: string): PinterestAccountCounts {
  const boards = structure.boards.filter((board) => board.pinterest_account_id === accountId);
  return {
    contentStreams: structure.streams.filter(
      (stream) => stream.pinterest_account_id === accountId && stream.status !== 'archived'
    ).length,
    boards: boards.length,
    sections: boards.reduce((sum, board) => sum + board.sections.length, 0),
  };
}

/**
 * Name of a stream linked to another account that still uses this board, or
 * null. A board cannot move to another account (or back to "no account")
 * while such a stream uses it — that stream would point at a board of a
 * different account. Legacy streams (no account) never block.
 */
export function findBlockingStream(
  streams: { name: string; status: string; pinterest_account_id: string | null }[],
  nextAccountId: string | null
): string | null {
  const blocking = streams.find(
    (stream) => stream.status !== 'archived' && stream.pinterest_account_id && stream.pinterest_account_id !== nextAccountId
  );
  return blocking?.name ?? null;
}

export async function listStreamsUsingBoard(
  supabase: SupabaseClient,
  boardId: string
): Promise<{ name: string; status: string; pinterest_account_id: string | null }[]> {
  const { data } = await supabase
    .from('content_stream_boards')
    .select('content_streams(name, status, pinterest_account_id)')
    .eq('board_id', boardId);
  return ((data ?? []) as unknown as Array<{ content_streams: unknown }>)
    .flatMap((row) => (Array.isArray(row.content_streams) ? row.content_streams : [row.content_streams]))
    .filter(Boolean)
    .map((stream) => {
      const value = stream as { name: string; status: string; pinterest_account_id?: string | null };
      return { name: value.name, status: value.status, pinterest_account_id: value.pinterest_account_id ?? null };
    });
}
