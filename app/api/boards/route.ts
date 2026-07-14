import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createBoardSchema } from '@/lib/validations/board';
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

  const { projectId, name } = parsed.data;

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

  const { data: board, error: dbError } = await supabase
    .from('boards')
    .insert({
      project_id: projectId,
      user_id: user.id,
      name,
    })
    .select()
    .single();

  if (dbError) {
    console.error('POST /api/boards — Supabase error:', dbError);
    const message = dbError.code === '23505' ? 'A board with this name already exists in this project' : 'Failed to create board';
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message, code: 'server_error' } },
      { status: 500 }
    );
  }

  return NextResponse.json<ApiResponse<{ boardId: string }>>(
    { data: { boardId: board.id }, error: null },
    { status: 201 }
  );
}
