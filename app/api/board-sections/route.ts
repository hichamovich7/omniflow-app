import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createBoardSectionSchema } from '@/lib/validations/pinterest-accounts';
import type { PinterestBoardSection } from '@/types/pinterest-accounts';
import type { ApiResponse } from '@/types/api';

function fail(message: string, code: string, status: number) {
  return NextResponse.json<ApiResponse<null>>({ data: null, error: { message, code } }, { status });
}

/**
 * TASK-091: add a section to one of the caller's boards (account page and
 * the Pinterest form's "Add section"). The name is kept exactly as typed;
 * two sections of one board cannot share a name (case-insensitive).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return fail('Unauthorized', 'unauthorized', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 'invalid_json', 400);
  }

  const parsed = createBoardSectionSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0].message, 'invalid_request', 400);

  const { data: board } = await supabase.from('boards').select('id, user_id').eq('id', parsed.data.boardId).single();
  if (!board) return fail('Board not found', 'not_found', 404);
  if (board.user_id !== user.id) return fail('You do not have access to this board', 'forbidden', 403);

  const { data: section, error } = await supabase
    .from('pinterest_board_sections')
    .insert({
      board_id: parsed.data.boardId,
      user_id: user.id,
      name: parsed.data.name,
      external_id: parsed.data.externalId ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('POST /api/board-sections — Supabase error:', error);
    return error.code === '23505'
      ? fail('This board already has a section with this name', 'duplicate_name', 409)
      : fail('Failed to create section', 'server_error', 500);
  }

  return NextResponse.json<ApiResponse<{ section: PinterestBoardSection }>>(
    { data: { section: section as PinterestBoardSection }, error: null },
    { status: 201 }
  );
}
