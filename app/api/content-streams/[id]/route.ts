import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updateContentStreamSchema } from '@/lib/validations/content-streams';
import {
  ContentStreamOwnershipError,
  findBoardOccupant,
  getContentStreamBoards,
  linkBoardToContentStream,
  listBoardOccupants,
  unlinkBoardFromContentStream,
  updateContentStream,
} from '@/lib/queries/content-streams';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Unauthorized', code: 'unauthorized' } },
      { status: 401 }
    );
  }

  const { id } = await params;

  if (!isValidUuid(id)) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid content stream ID', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  const { data: existingStream } = await supabase.from('content_streams').select('id, project_id, user_id').eq('id', id).single();

  if (!existingStream) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Content stream not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  if (existingStream.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this content stream', code: 'forbidden' } },
      { status: 403 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid JSON body', code: 'invalid_json' } },
      { status: 400 }
    );
  }

  const body = (rawBody ?? {}) as Record<string, unknown>;
  const boardIdProvided = Object.prototype.hasOwnProperty.call(body, 'boardId');
  const { boardId, ...rest } = body;

  if (boardId !== undefined && boardId !== null && (typeof boardId !== 'string' || !isValidUuid(boardId))) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid board ID', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  const parsed = updateContentStreamSchema.safeParse(rest);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  // Validated before any write: a rejected board must never leave the
  // stream's other fields half-updated.
  if (boardIdProvided && typeof boardId === 'string') {
    const occupants = await listBoardOccupants(supabase, [boardId]);
    const occupant = findBoardOccupant(occupants, boardId, id);
    if (occupant) {
      return NextResponse.json<ApiResponse<null>>(
        {
          data: null,
          error: {
            message: `This board is already used by "${occupant.content_stream_name}". Pick a different board, or archive that stream first.`,
            code: 'board_taken',
          },
        },
        { status: 409 }
      );
    }
  }

  let updated;
  try {
    updated = await updateContentStream(supabase, user.id, id, parsed.data);
  } catch (err) {
    if (err instanceof ContentStreamOwnershipError) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: err.message, code: err.code } },
        { status: 400 }
      );
    }
    console.error('PATCH /api/content-streams/[id] — Supabase error:', err);
    const pgError = err as { code?: string };
    const message =
      pgError?.code === '23505' ? 'A content stream with this name already exists in this project' : 'Failed to update content stream';
    return NextResponse.json<ApiResponse<null>>({ data: null, error: { message, code: 'server_error' } }, { status: 500 });
  }

  // Board changes are applied after the field update, and reported
  // separately — the field update already succeeded regardless of what
  // happens to the board link, so it is never presented as a full failure.
  let boardWarning: string | undefined;

  if (boardIdProvided) {
    try {
      const currentLinks = await getContentStreamBoards(supabase, id);
      for (const link of currentLinks) {
        if (link.board_id !== boardId) {
          await unlinkBoardFromContentStream(supabase, user.id, id, link.board_id);
        }
      }
      if (typeof boardId === 'string' && !currentLinks.some((link) => link.board_id === boardId)) {
        await linkBoardToContentStream(supabase, user.id, id, boardId);
      }
    } catch (err) {
      boardWarning =
        err instanceof ContentStreamOwnershipError
          ? err.message
          : 'The content stream was updated, but the board link could not be changed. Try again from Edit.';
    }
  }

  return NextResponse.json<ApiResponse<{ contentStream: typeof updated; boardWarning?: string }>>({
    data: { contentStream: updated, boardWarning },
    error: null,
  });
}
