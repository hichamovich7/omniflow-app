import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updateArticleCategorySchema } from '@/lib/validations/wordpress-article';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';
import type { WordPressArticle } from '@/types/wordpress';

/**
 * Reassigns an already-generated article's category (TASK-FIX-007) — the
 * generation form only ever offered this at creation time. Does not touch
 * WordPress: if the article already has a `wp_post_id`, the new category
 * only takes effect on the next publish/update call.
 */
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
      { data: null, error: { message: 'Invalid article ID', code: 'invalid_id' } },
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

  const parsed = updateArticleCategorySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { data: generation } = await supabase
    .from('wordpress_generations')
    .select('id, user_id, project_id')
    .eq('id', id)
    .single();

  if (!generation) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Article not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  if (generation.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this article', code: 'forbidden' } },
      { status: 403 }
    );
  }

  const { categoryId } = parsed.data;

  // Cross-project category assignment would silently corrupt the mapping
  // (`wp_category_id` is meaningless outside the WordPress site it was
  // fetched from) — verified against this generation's own project, not
  // just against the caller's ownership.
  if (categoryId) {
    const { data: category } = await supabase
      .from('wordpress_categories')
      .select('id, project_id, user_id')
      .eq('id', categoryId)
      .single();

    if (!category || category.project_id !== generation.project_id || category.user_id !== user.id) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: 'Invalid category for this project', code: 'invalid_request' } },
        { status: 400 }
      );
    }
  }

  const { data: article, error: dbError } = await supabase
    .from('wordpress_articles')
    .update({ category_id: categoryId })
    .eq('generation_id', id)
    .select()
    .single();

  if (dbError || !article) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Article not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  return NextResponse.json<ApiResponse<{ article: WordPressArticle }>>(
    { data: { article: article as WordPressArticle }, error: null }
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
      { data: null, error: { message: 'Invalid article ID', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  const { data: existingGeneration } = await supabase
    .from('wordpress_generations')
    .select('id, user_id')
    .eq('id', id)
    .single();

  if (!existingGeneration) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Article not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  if (existingGeneration.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this article', code: 'forbidden' } },
      { status: 403 }
    );
  }

  // Storage cleanup — best-effort. Featured + internal images for this
  // generation always live under this exact prefix (see generate-article.ts),
  // so listing it covers every file without needing to parse stored public
  // URLs. Never blocks the DB delete below: a failure here (or an already-
  // absent file) is logged and swallowed, not surfaced to the user.
  const folderPath = `${user.id}/${id}`;
  try {
    const { data: files, error: listError } = await supabase.storage
      .from('wordpress-images')
      .list(folderPath);

    if (listError) {
      console.error(`[wordpress delete] Failed to list storage files for ${id}:`, listError);
    } else if (files && files.length > 0) {
      const filePaths = files.map((file) => `${folderPath}/${file.name}`);
      const { error: removeError } = await supabase.storage.from('wordpress-images').remove(filePaths);
      if (removeError) {
        console.error(`[wordpress delete] Failed to remove storage files for ${id}:`, removeError);
      }
    }
  } catch (err) {
    console.error(`[wordpress delete] Unexpected storage cleanup error for ${id}:`, err);
  }

  // wordpress_articles and wordpress_article_images both have ON DELETE CASCADE
  // to wordpress_generations (migration 012) — deleting the generation row is
  // enough, no separate deletes needed to respect the FK order.
  const { error: dbError } = await supabase
    .from('wordpress_generations')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (dbError) {
    console.error('[wordpress delete] Failed to delete wordpress generation:', dbError);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to delete article', code: 'server_error' } },
      { status: 500 }
    );
  }

  return NextResponse.json<ApiResponse<{ success: boolean }>>(
    { data: { success: true }, error: null }
  );
}
