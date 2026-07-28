import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createWordPressSiteSchema } from '@/lib/validations/wordpress-site';
import { testConnection, normalizeSiteUrl, WordPressApiError } from '@/lib/wordpress/rest-client';
import { encryptSecret } from '@/lib/wordpress/crypto';
import type { ApiResponse } from '@/types/api';
import type { WordPressSitePublic } from '@/types/wordpress';

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

  const parsed = createWordPressSiteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { projectId, siteUrl, wpUsername, applicationPassword } = parsed.data;

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

  // Never trust a client-reported "test passed" — re-validate the credential
  // triple server-side before any write.
  try {
    await testConnection(siteUrl, wpUsername, applicationPassword);
  } catch (err) {
    const message = err instanceof WordPressApiError ? err.message : 'Could not connect to that WordPress site.';
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message, code: 'connection_failed' } },
      { status: 400 }
    );
  }

  const encrypted_application_password = encryptSecret(applicationPassword);

  const { data: site, error: dbError } = await supabase
    .from('wordpress_sites')
    .insert({
      project_id: projectId,
      user_id: user.id,
      site_url: normalizeSiteUrl(siteUrl),
      wp_username: wpUsername,
      encrypted_application_password,
    })
    .select('id, project_id, user_id, site_url, wp_username, created_at')
    .single();

  if (dbError) {
    const isDuplicate = dbError.code === '23505';
    console.error('POST /api/wordpress/sites — Supabase error:', dbError);
    return NextResponse.json<ApiResponse<null>>(
      {
        data: null,
        error: {
          message: isDuplicate
            ? 'This project already has a WordPress connection — disconnect it first.'
            : 'Failed to save the WordPress connection',
          code: isDuplicate ? 'invalid_request' : 'server_error',
        },
      },
      { status: isDuplicate ? 400 : 500 }
    );
  }

  return NextResponse.json<ApiResponse<{ site: WordPressSitePublic }>>(
    { data: { site: site as WordPressSitePublic }, error: null },
    { status: 201 }
  );
}
