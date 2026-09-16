import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContentStream, ContentStreamBoard, ContentStreamInsert, ContentStreamStatus } from '@/types/content-streams';
import type { CreateContentStreamInput, UpdateContentStreamInput } from '@/lib/validations/content-streams';

export type ContentStreamOwnershipErrorCode = 'project_forbidden' | 'category_forbidden' | 'board_forbidden';

export class ContentStreamOwnershipError extends Error {
  constructor(
    public code: ContentStreamOwnershipErrorCode,
    message: string
  ) {
    super(message);
  }
}

/**
 * Pure ownership checks — no network call, unit-testable without a real
 * Supabase client. Mirrors the same shape check already used by
 * app/api/boards/route.ts (`project.user_id !== user.id`), extended to also
 * verify a referenced row belongs to the *same project* it's being attached
 * under, per TASK-COMMAND-CENTER-PHASE-2.md §7 ("ownership of a referenced
 * row must still be verified server-side at write time").
 */
export function isOwnedProject(project: { user_id: string } | null | undefined, userId: string): boolean {
  return !!project && project.user_id === userId;
}

export function isCategoryInProject(
  category: { user_id: string; project_id: string } | null | undefined,
  projectId: string,
  userId: string
): boolean {
  return !!category && category.user_id === userId && category.project_id === projectId;
}

export function isBoardInProject(
  board: { user_id: string; project_id: string } | null | undefined,
  projectId: string,
  userId: string
): boolean {
  return !!board && board.user_id === userId && board.project_id === projectId;
}

export async function listContentStreams(supabase: SupabaseClient, projectId: string): Promise<ContentStream[]> {
  const { data } = await supabase.from('content_streams').select('*').eq('project_id', projectId).order('name');

  return (data ?? []) as ContentStream[];
}

export async function getContentStreamBoards(supabase: SupabaseClient, contentStreamId: string): Promise<ContentStreamBoard[]> {
  const { data } = await supabase.from('content_stream_boards').select('*').eq('content_stream_id', contentStreamId);

  return (data ?? []) as ContentStreamBoard[];
}

export async function createContentStream(
  supabase: SupabaseClient,
  userId: string,
  input: CreateContentStreamInput
): Promise<ContentStream> {
  const { data: project } = await supabase.from('projects').select('id, user_id').eq('id', input.projectId).single();

  if (!isOwnedProject(project, userId)) {
    throw new ContentStreamOwnershipError('project_forbidden', 'Project not found or not owned by this user');
  }

  if (input.wordpressCategoryId) {
    const { data: category } = await supabase
      .from('wordpress_categories')
      .select('id, user_id, project_id')
      .eq('id', input.wordpressCategoryId)
      .single();

    if (!isCategoryInProject(category, input.projectId, userId)) {
      throw new ContentStreamOwnershipError(
        'category_forbidden',
        'Category not found, not owned by this user, or belongs to a different project'
      );
    }
  }

  const insertRow: ContentStreamInsert = {
    project_id: input.projectId,
    user_id: userId,
    name: input.name,
    wordpress_category_id: input.wordpressCategoryId ?? null,
    target_pins_per_day: input.targetPinsPerDay ?? null,
    target_articles_per_week: input.targetArticlesPerWeek ?? null,
    target_buffer_days: input.targetBufferDays ?? null,
    status: input.status ?? 'active',
  };

  const { data, error } = await supabase.from('content_streams').insert(insertRow).select().single();

  if (error) throw error;
  return data as ContentStream;
}

export async function updateContentStream(
  supabase: SupabaseClient,
  userId: string,
  contentStreamId: string,
  patch: UpdateContentStreamInput
): Promise<ContentStream> {
  const { data: stream } = await supabase
    .from('content_streams')
    .select('id, project_id, user_id')
    .eq('id', contentStreamId)
    .single();

  if (!stream || stream.user_id !== userId) {
    throw new ContentStreamOwnershipError('project_forbidden', 'Content stream not found or not owned by this user');
  }

  if (patch.wordpressCategoryId) {
    const { data: category } = await supabase
      .from('wordpress_categories')
      .select('id, user_id, project_id')
      .eq('id', patch.wordpressCategoryId)
      .single();

    if (!isCategoryInProject(category, stream.project_id, userId)) {
      throw new ContentStreamOwnershipError(
        'category_forbidden',
        'Category not found, not owned by this user, or belongs to a different project'
      );
    }
  }

  const updateRow: Record<string, unknown> = {};
  if (patch.name !== undefined) updateRow.name = patch.name;
  if (patch.wordpressCategoryId !== undefined) updateRow.wordpress_category_id = patch.wordpressCategoryId;
  if (patch.targetPinsPerDay !== undefined) updateRow.target_pins_per_day = patch.targetPinsPerDay;
  if (patch.targetArticlesPerWeek !== undefined) updateRow.target_articles_per_week = patch.targetArticlesPerWeek;
  if (patch.targetBufferDays !== undefined) updateRow.target_buffer_days = patch.targetBufferDays;
  if (patch.status !== undefined) updateRow.status = patch.status;

  const { data, error } = await supabase.from('content_streams').update(updateRow).eq('id', contentStreamId).select().single();

  if (error) throw error;
  return data as ContentStream;
}

export async function archiveContentStream(supabase: SupabaseClient, userId: string, contentStreamId: string): Promise<ContentStream> {
  return updateContentStream(supabase, userId, contentStreamId, { status: 'archived' });
}

export async function linkBoardToContentStream(
  supabase: SupabaseClient,
  userId: string,
  contentStreamId: string,
  boardId: string
): Promise<ContentStreamBoard> {
  const { data: stream } = await supabase
    .from('content_streams')
    .select('id, project_id, user_id')
    .eq('id', contentStreamId)
    .single();

  if (!stream || stream.user_id !== userId) {
    throw new ContentStreamOwnershipError('project_forbidden', 'Content stream not found or not owned by this user');
  }

  const { data: board } = await supabase.from('boards').select('id, user_id, project_id').eq('id', boardId).single();

  if (!isBoardInProject(board, stream.project_id, userId)) {
    throw new ContentStreamOwnershipError(
      'board_forbidden',
      'Board not found, not owned by this user, or belongs to a different project than the content stream'
    );
  }

  const { data, error } = await supabase
    .from('content_stream_boards')
    .insert({ content_stream_id: contentStreamId, board_id: boardId, user_id: userId })
    .select()
    .single();

  if (error) throw error;
  return data as ContentStreamBoard;
}

export interface BoardOccupant {
  board_id: string;
  content_stream_id: string;
  content_stream_name: string;
  status: ContentStreamStatus;
}

/**
 * Every content stream currently linked to any of the given boards, for the
 * "one board per active stream" experiment rule (TASK-COMMAND-CENTER-PHASE-2.md
 * §11 §8 — application-layer only, never a DB constraint). Fetches once for
 * a whole project's boards; findBoardOccupant() below decides per-board.
 */
export async function listBoardOccupants(supabase: SupabaseClient, boardIds: string[]): Promise<BoardOccupant[]> {
  if (boardIds.length === 0) return [];

  const { data } = await supabase
    .from('content_stream_boards')
    .select('board_id, content_stream_id, content_streams(name, status)')
    .in('board_id', boardIds);

  return ((data ?? []) as unknown as Array<{
    board_id: string;
    content_stream_id: string;
    content_streams: { name: string; status: ContentStreamStatus } | null;
  }>).map((row) => ({
    board_id: row.board_id,
    content_stream_id: row.content_stream_id,
    content_stream_name: row.content_streams?.name ?? '',
    status: row.content_streams?.status ?? 'archived',
  }));
}

/**
 * Pure decision, unit-testable without a real Supabase client: a board is
 * "taken" only by a non-archived stream other than `excludeStreamId` (the
 * stream being edited, so it never blocks itself on its own current board).
 * `archived` never occupies a board — archiving is exactly what frees it.
 */
export function findBoardOccupant(
  occupants: BoardOccupant[],
  boardId: string,
  excludeStreamId?: string
): BoardOccupant | null {
  return (
    occupants.find(
      (o) => o.board_id === boardId && o.content_stream_id !== excludeStreamId && o.status !== 'archived'
    ) ?? null
  );
}

export async function unlinkBoardFromContentStream(
  supabase: SupabaseClient,
  userId: string,
  contentStreamId: string,
  boardId: string
): Promise<void> {
  const { error } = await supabase
    .from('content_stream_boards')
    .delete()
    .eq('content_stream_id', contentStreamId)
    .eq('board_id', boardId)
    .eq('user_id', userId);

  if (error) throw error;
}
