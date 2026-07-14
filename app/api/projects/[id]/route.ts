import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updateProjectSchema } from '@/lib/validations/project';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
      { data: null, error: { message: 'Invalid project ID', code: 'invalid_id' } },
      { status: 400 }
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

  const parsed = updateProjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { data: existingProject } = await supabase
    .from('projects')
    .select('id, user_id')
    .eq('id', id)
    .single();

  if (!existingProject) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Project not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  if (existingProject.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this project', code: 'forbidden' } },
      { status: 403 }
    );
  }

  const { is_default, ...fields } = parsed.data;

  if (is_default) {
    await supabase
      .from('projects')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .eq('is_default', true);

    await supabase
      .from('projects')
      .update({ is_default: true })
      .eq('id', id)
      .eq('user_id', user.id);
  }

  const hasFieldUpdates = Object.keys(fields).length > 0;

  if (hasFieldUpdates) {
    const { data: project, error: dbError } = await supabase
      .from('projects')
      .update(fields)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (dbError) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: 'Project not found', code: 'not_found' } },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse<{ project: typeof project }>>(
      { data: { project }, error: null }
    );
  }

  const { data: project, error: dbError } = await supabase
    .from('projects')
    .select()
    .eq('id', id)
    .single();

  if (dbError) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Project not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  return NextResponse.json<ApiResponse<{ project: typeof project }>>(
    { data: { project }, error: null }
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
      { data: null, error: { message: 'Invalid project ID', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  const { data: existingProject } = await supabase
    .from('projects')
    .select('id, user_id')
    .eq('id', id)
    .single();

  if (!existingProject) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Project not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  if (existingProject.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this project', code: 'forbidden' } },
      { status: 403 }
    );
  }

  const { error: dbError } = await supabase
    .from('projects')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (dbError) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to delete project', code: 'server_error' } },
      { status: 500 }
    );
  }

  return NextResponse.json<ApiResponse<{ success: boolean }>>(
    { data: { success: true }, error: null }
  );
}
