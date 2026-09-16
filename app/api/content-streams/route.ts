import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createContentStreamSchema } from '@/lib/validations/content-streams';
import {
  ContentStreamOwnershipError,
  createContentStream,
  findBoardOccupant,
  linkBoardToContentStream,
  listBoardOccupants,
} from '@/lib/queries/content-streams';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

export async function POST(request: Request) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid JSON body', code: 'invalid_json' } },
      { status: 400 }
    );
  }

  const { boardId, ...rest } = (body ?? {}) as Record<string, unknown>;

  if (boardId !== undefined && boardId !== null && (typeof boardId !== 'string' || !isValidUuid(boardId))) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid board ID', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  const parsed = createContentStreamSchema.safeParse(rest);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  // Checked before creating anything: a rejected board must never leave a
  // half-created content stream behind.
  if (typeof boardId === 'string') {
    const occupants = await listBoardOccupants(supabase, [boardId]);
    const occupant = findBoardOccupant(occupants, boardId);
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

  let contentStream;
  try {
    contentStream = await createContentStream(supabase, user.id, parsed.data);
  } catch (err) {
    if (err instanceof ContentStreamOwnershipError) {
      const status = err.code === 'project_forbidden' ? 403 : 400;
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: err.message, code: err.code } },
        { status }
      );
    }
    console.error('POST /api/content-streams — Supabase error:', err);
    const pgError = err as { code?: string };
    const message =
      pgError?.code === '23505' ? 'A content stream with this name already exists in this project' : 'Failed to create content stream';
    return NextResponse.json<ApiResponse<null>>({ data: null, error: { message, code: 'server_error' } }, { status: 500 });
  }

  // The stream itself now exists regardless of what happens next — board
  // linking is reported separately so a failure here is never presented as
  // a fully successful create.
  let boardLinked = false;
  let boardWarning: string | undefined;

  if (typeof boardId === 'string') {
    try {
      await linkBoardToContentStream(supabase, user.id, contentStream.id, boardId);
      boardLinked = true;
    } catch (err) {
      boardWarning =
        err instanceof ContentStreamOwnershipError
          ? err.message
          : 'The content stream was created, but the board could not be linked. Open Edit to try again.';
    }
  }

  return NextResponse.json<ApiResponse<{ contentStream: typeof contentStream; boardLinked: boolean; boardWarning?: string }>>(
    { data: { contentStream, boardLinked, boardWarning }, error: null },
    { status: 201 }
  );
}
