import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchCategories, WordPressApiError } from '@/lib/wordpress/rest-client';
import { decryptSecret } from '@/lib/wordpress/crypto';
import { slugify } from '@/lib/queries/wordpress-categories';
import { importWordPressCategoriesSchema } from '@/lib/validations/wordpress-category';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';
import type { WordPressCategory, WordPressSite } from '@/types/wordpress';

export async function POST(
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
      { data: null, error: { message: 'Invalid connection ID', code: 'invalid_id' } },
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

  const parsed = importWordPressCategoriesSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { data: site } = await supabase
    .from('wordpress_sites')
    .select('*')
    .eq('id', id)
    .single();

  if (!site) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'WordPress connection not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  if ((site as WordPressSite).user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this connection', code: 'forbidden' } },
      { status: 403 }
    );
  }

  // Re-fetch from WordPress rather than trusting client-supplied names — the
  // client only ever sends back ids it got from the same GET endpoint.
  let wpCategories;
  try {
    const password = decryptSecret((site as WordPressSite).encrypted_application_password);
    wpCategories = await fetchCategories({
      siteUrl: (site as WordPressSite).site_url,
      username: (site as WordPressSite).wp_username,
      password,
    });
  } catch (err) {
    const message =
      err instanceof WordPressApiError ? err.message : 'Could not fetch categories from WordPress.';
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message, code: 'connection_failed' } },
      { status: 400 }
    );
  }

  const selected = wpCategories.filter((c) => parsed.data.categoryIds.includes(c.id));
  const projectId = (site as WordPressSite).project_id;

  const { data: existing } = await supabase
    .from('wordpress_categories')
    .select('*')
    .eq('project_id', projectId);

  const existingByName = new Map(
    ((existing ?? []) as WordPressCategory[]).map((c) => [c.name.toLowerCase(), c])
  );

  const result: WordPressCategory[] = [];

  for (const wpCategory of selected) {
    const match = existingByName.get(wpCategory.name.toLowerCase());

    if (match) {
      if (!match.wp_category_id) {
        const { data: updated } = await supabase
          .from('wordpress_categories')
          .update({ wp_category_id: wpCategory.id })
          .eq('id', match.id)
          .eq('user_id', user.id)
          .select()
          .single();
        if (updated) result.push(updated as WordPressCategory);
      } else {
        result.push(match);
      }
      continue;
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('wordpress_categories')
      .insert({
        project_id: projectId,
        user_id: user.id,
        name: wpCategory.name,
        slug: slugify(wpCategory.name),
        wp_category_id: wpCategory.id,
      })
      .select()
      .single();

    if (insertErr) {
      // Concurrent request created the same (project_id, name) row first —
      // non-fatal for a bulk import, just skip it.
      console.error('POST .../categories/import — insert error:', insertErr);
      continue;
    }

    result.push(inserted as WordPressCategory);
  }

  return NextResponse.json<ApiResponse<{ categories: WordPressCategory[] }>>(
    { data: { categories: result }, error: null }
  );
}
