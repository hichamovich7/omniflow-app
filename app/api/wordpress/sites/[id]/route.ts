import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updateWordPressSiteSchema } from '@/lib/validations/wordpress-site';
import { testConnection, normalizeSiteUrl, WordPressApiError } from '@/lib/wordpress/rest-client';
import { encryptSecret } from '@/lib/wordpress/crypto';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';
import type { WordPressSitePublic } from '@/types/wordpress';

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

  const parsed = updateWordPressSiteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { data: existingSite } = await supabase
    .from('wordpress_sites')
    .select('id, user_id')
    .eq('id', id)
    .single();

  if (!existingSite) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'WordPress connection not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  if (existingSite.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this connection', code: 'forbidden' } },
      { status: 403 }
    );
  }

  const { siteUrl, wpUsername, applicationPassword } = parsed.data;

  try {
    await testConnection(siteUrl, wpUsername, applicationPassword);
  } catch (err) {
    const message = err instanceof WordPressApiError ? err.message : 'Could not connect to that WordPress site.';
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message, code: 'connection_failed' } },
      { status: 400 }
    );
  }

  const { data: site, error: dbError } = await supabase
    .from('wordpress_sites')
    .update({
      site_url: normalizeSiteUrl(siteUrl),
      wp_username: wpUsername,
      encrypted_application_password: encryptSecret(applicationPassword),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, project_id, user_id, site_url, wp_username, created_at')
    .single();

  if (dbError) {
    console.error('PATCH /api/wordpress/sites/[id] — Supabase error:', dbError);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to update the WordPress connection', code: 'server_error' } },
      { status: 500 }
    );
  }

  return NextResponse.json<ApiResponse<{ site: WordPressSitePublic }>>(
    { data: { site: site as WordPressSitePublic }, error: null }
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
      { data: null, error: { message: 'Invalid connection ID', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  const { data: existingSite } = await supabase
    .from('wordpress_sites')
    .select('id, project_id, user_id')
    .eq('id', id)
    .single();

  if (!existingSite) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'WordPress connection not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  if (existingSite.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this connection', code: 'forbidden' } },
      { status: 403 }
    );
  }

  // A stale wp_post_id could otherwise collide with an unrelated post if the
  // user later connects a *different* WordPress site to this same project —
  // reset publish tracking for this project's articles before disconnecting.
  const { data: generations } = await supabase
    .from('wordpress_generations')
    .select('id')
    .eq('project_id', existingSite.project_id);

  const generationIds = (generations ?? []).map((g) => g.id);

  if (generationIds.length > 0) {
    const { error: resetError } = await supabase
      .from('wordpress_articles')
      .update({ publish_status: 'draft', wp_post_id: null, published_at: null, publish_error: null })
      .in('generation_id', generationIds)
      .in('publish_status', ['scheduled', 'published']);

    if (resetError) {
      console.error('DELETE /api/wordpress/sites/[id] — failed to reset publish tracking:', resetError);
    }
  }

  const { error: dbError } = await supabase
    .from('wordpress_sites')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (dbError) {
    console.error('DELETE /api/wordpress/sites/[id] — Supabase error:', dbError);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to disconnect WordPress', code: 'server_error' } },
      { status: 500 }
    );
  }

  return NextResponse.json<ApiResponse<{ success: boolean }>>(
    { data: { success: true }, error: null }
  );
}
