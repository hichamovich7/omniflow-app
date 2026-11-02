import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeStreamDestinations, updateContentStreamSchema } from '@/lib/validations/content-streams';
import {
  ContentStreamOwnershipError,
  findBoardOccupant,
  getContentStreamBoards,
  listBoardOccupants,
  updateContentStream,
} from '@/lib/queries/content-streams';
import {
  assertStreamDestinations,
  getOwnedAccount,
  PinterestStructureError,
  syncStreamDestinations,
} from '@/lib/queries/pinterest-accounts';
import { destinationsOutsideAccount, legacyBoardDestinations } from '@/lib/pinterest/stream-destinations';
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

  if (boardIdProvided && parsed.data.destinations) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Send either boardId or destinations, not both', code: 'invalid_request' } },
      { status: 400 }
    );
  }

  // TASK-091: `destinations` replaces the stream's whole list; the former
  // `boardId` becomes a single primary destination; neither = unchanged.
  const destinations = parsed.data.destinations
    ? normalizeStreamDestinations(parsed.data.destinations)
    : boardIdProvided
      ? legacyBoardDestinations(typeof boardId === 'string' ? boardId : null)
      : undefined;

  // Validated before any write: a rejected account or board must never leave
  // the stream's other fields half-updated.
  const accountChanged = parsed.data.pinterestAccountId !== undefined;
  if (accountChanged || destinations) {
    try {
      let accountId: string | null;
      if (accountChanged) {
        accountId = parsed.data.pinterestAccountId ?? null;
        if (accountId) {
          const account = await getOwnedAccount(supabase, user.id, existingStream.project_id, accountId);
          if (account.status === 'archived') {
            throw new PinterestStructureError('account_archived', 'This Pinterest account is archived.');
          }
        }
      } else {
        const { data: current } = await supabase.from('content_streams').select('pinterest_account_id').eq('id', id).single();
        accountId = (current as { pinterest_account_id?: string | null } | null)?.pinterest_account_id ?? null;
      }

      if (destinations) {
        await assertStreamDestinations(supabase, user.id, existingStream.project_id, accountId, destinations);
      } else {
        // Account changed, destinations kept: they must all fit the new account.
        const currentBoardIds = [...new Set((await getContentStreamBoards(supabase, id)).map((link) => link.board_id))];
        const { data: boards } = currentBoardIds.length
          ? await supabase.from('boards').select('id, pinterest_account_id').in('id', currentBoardIds)
          : { data: [] };
        if (destinationsOutsideAccount((boards ?? []) as { id: string; pinterest_account_id: string | null }[], accountId).length > 0) {
          throw new PinterestStructureError(
            'destination_account_mismatch',
            'This stream still uses boards of another Pinterest account. Update its boards together with the account.'
          );
        }
      }
    } catch (err) {
      if (!(err instanceof PinterestStructureError)) throw err;
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: err.message, code: err.code } },
        { status: 400 }
      );
    }
  }

  if (destinations && destinations.length > 0) {
    const boardIds = [...new Set(destinations.map((destination) => destination.boardId))];
    const occupants = await listBoardOccupants(supabase, boardIds);
    for (const candidate of boardIds) {
      const occupant = findBoardOccupant(occupants, candidate, id);
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

  if (destinations) {
    try {
      await syncStreamDestinations(supabase, user.id, id, destinations);
    } catch (err) {
      console.error('PATCH /api/content-streams/[id] — destinations error:', err);
      boardWarning = 'The content stream was updated, but its boards could not be changed. Try again from Edit.';
    }
  }

  return NextResponse.json<ApiResponse<{ contentStream: typeof updated; boardWarning?: string }>>({
    data: { contentStream: updated, boardWarning },
    error: null,
  });
}
