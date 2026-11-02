import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { boardRow, createBoardSchema } from '@/lib/validations/board';
import { getOwnedAccount, PinterestStructureError } from '@/lib/queries/pinterest-accounts';
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

  const parsed = createBoardSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { projectId } = parsed.data;

  const { data: project } = await supabase
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .single();

  if (!project) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Project not found', code: 'invalid_project' } },
      { status: 400 }
    );
  }

  if (project.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this project', code: 'forbidden' } },
      { status: 403 }
    );
  }

  // TASK-091: an optional Pinterest account, which must be one of this project's.
  if (parsed.data.pinterestAccountId) {
    try {
      const account = await getOwnedAccount(supabase, user.id, projectId, parsed.data.pinterestAccountId);
      if (account.status === 'archived') {
        throw new PinterestStructureError('account_archived', 'This Pinterest account is archived.');
      }
    } catch (err) {
      if (!(err instanceof PinterestStructureError)) throw err;
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: err.message, code: err.code } },
        { status: 400 }
      );
    }
  }

  const { data: board, error: dbError } = await supabase
    .from('boards')
    .insert({
      project_id: projectId,
      user_id: user.id,
      ...boardRow(parsed.data),
    })
    .select()
    .single();

  if (dbError) {
    // TASK-093: a taken name is the caller's to fix (attach the existing board), not a server failure.
    if (dbError.code === '23505') {
      return NextResponse.json<ApiResponse<null>>(
        {
          data: null,
          error: {
            message: 'A board with this name already exists in this project — attach the existing board instead.',
            code: 'duplicate_name',
          },
        },
        { status: 409 }
      );
    }
    console.error('POST /api/boards — Supabase error:', dbError);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to create board', code: 'server_error' } },
      { status: 500 }
    );
  }

  return NextResponse.json<ApiResponse<{ boardId: string }>>(
    { data: { boardId: board.id }, error: null },
    { status: 201 }
  );
}
