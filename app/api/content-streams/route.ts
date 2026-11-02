import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createContentStreamSchema, normalizeStreamDestinations } from '@/lib/validations/content-streams';
import {
  ContentStreamOwnershipError,
  createContentStream,
  findBoardOccupant,
  listBoardOccupants,
} from '@/lib/queries/content-streams';
import {
  assertStreamDestinations,
  getOwnedAccount,
  PinterestStructureError,
  syncStreamDestinations,
} from '@/lib/queries/pinterest-accounts';
import { legacyBoardDestinations } from '@/lib/pinterest/stream-destinations';
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

  // `boardId` (one board) is the pre-TASK-091 contract, still accepted: it
  // becomes the stream's single primary destination.
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

  if (typeof boardId === 'string' && parsed.data.destinations) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Send either boardId or destinations, not both', code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const destinations = normalizeStreamDestinations(
    parsed.data.destinations ?? legacyBoardDestinations(typeof boardId === 'string' ? boardId : null)
  );
  const accountId = parsed.data.pinterestAccountId ?? null;

  // Everything is checked before creating anything: a rejected account or
  // destination must never leave a half-created content stream behind.
  try {
    if (accountId) {
      const account = await getOwnedAccount(supabase, user.id, parsed.data.projectId, accountId);
      if (account.status === 'archived') {
        throw new PinterestStructureError('account_archived', 'This Pinterest account is archived.');
      }
    }
    await assertStreamDestinations(supabase, user.id, parsed.data.projectId, accountId, destinations);
  } catch (err) {
    if (!(err instanceof PinterestStructureError)) throw err;
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: err.message, code: err.code } },
      { status: 400 }
    );
  }

  const boardIds = [...new Set(destinations.map((destination) => destination.boardId))];
  if (boardIds.length > 0) {
    const occupants = await listBoardOccupants(supabase, boardIds);
    for (const id of boardIds) {
      const occupant = findBoardOccupant(occupants, id);
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

  if (destinations.length > 0) {
    try {
      await syncStreamDestinations(supabase, user.id, contentStream.id, destinations);
      boardLinked = true;
    } catch (err) {
      console.error('POST /api/content-streams — destinations error:', err);
      boardWarning = 'The content stream was created, but its boards could not be linked. Open Edit to try again.';
    }
  }

  return NextResponse.json<ApiResponse<{ contentStream: typeof contentStream; boardLinked: boolean; boardWarning?: string }>>(
    { data: { contentStream, boardLinked, boardWarning }, error: null },
    { status: 201 }
  );
}
