import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updateWordPressCategorySchema } from '@/lib/validations/wordpress-category';
import { slugify } from '@/lib/queries/wordpress-categories';
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
      { data: null, error: { message: 'Invalid category ID', code: 'invalid_id' } },
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

  const parsed = updateWordPressCategorySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { data: existingCategory } = await supabase
    .from('wordpress_categories')
    .select('id, user_id')
    .eq('id', id)
    .single();

  if (!existingCategory) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Category not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  if (existingCategory.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this category', code: 'forbidden' } },
      { status: 403 }
    );
  }

  const update = {
    ...parsed.data,
    ...(parsed.data.name ? { slug: slugify(parsed.data.name) } : {}),
  };

  const { data: category, error: dbError } = await supabase
    .from('wordpress_categories')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (dbError) {
    const message =
      dbError.code === '23505' ? 'A category with this name already exists in this project' : 'Category not found';
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message, code: dbError.code === '23505' ? 'invalid_request' : 'not_found' } },
      { status: dbError.code === '23505' ? 400 : 404 }
    );
  }

  return NextResponse.json<ApiResponse<{ category: typeof category }>>(
    { data: { category }, error: null }
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
      { data: null, error: { message: 'Invalid category ID', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  const { data: existingCategory } = await supabase
    .from('wordpress_categories')
    .select('id, user_id')
    .eq('id', id)
    .single();

  if (!existingCategory) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Category not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  if (existingCategory.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this category', code: 'forbidden' } },
      { status: 403 }
    );
  }

  const { error: dbError } = await supabase
    .from('wordpress_categories')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (dbError) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to delete category', code: 'server_error' } },
      { status: 500 }
    );
  }

  return NextResponse.json<ApiResponse<{ success: boolean }>>(
    { data: { success: true }, error: null }
  );
}
