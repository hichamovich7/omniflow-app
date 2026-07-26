import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createWordPressCategorySchema } from '@/lib/validations/wordpress-category';
import { slugify } from '@/lib/queries/wordpress-categories';
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

  const parsed = createWordPressCategorySchema.safeParse(body);

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

  const { data: category, error: dbError } = await supabase
    .from('wordpress_categories')
    .insert({
      project_id: projectId,
      user_id: user.id,
      name,
      slug: slugify(name),
    })
    .select()
    .single();

  if (dbError) {
    console.error('POST /api/wordpress/categories — Supabase error:', dbError);
    const message =
      dbError.code === '23505' ? 'A category with this name already exists in this project' : 'Failed to create category';
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message, code: dbError.code === '23505' ? 'invalid_request' : 'server_error' } },
      { status: dbError.code === '23505' ? 400 : 500 }
    );
  }

  return NextResponse.json<ApiResponse<{ category: typeof category }>>(
    { data: { category }, error: null },
    { status: 201 }
  );
}
