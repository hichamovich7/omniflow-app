import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchCategories, WordPressApiError } from '@/lib/wordpress/rest-client';
import { decryptSecret } from '@/lib/wordpress/crypto';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';
import type { WordPressSite } from '@/types/wordpress';

export async function GET(
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

  try {
    const password = decryptSecret((site as WordPressSite).encrypted_application_password);
    const categories = await fetchCategories({
      siteUrl: (site as WordPressSite).site_url,
      username: (site as WordPressSite).wp_username,
      password,
    });

    return NextResponse.json<ApiResponse<{ categories: { id: number; name: string; slug: string }[] }>>(
      { data: { categories }, error: null }
    );
  } catch (err) {
    const message =
      err instanceof WordPressApiError ? err.message : 'Could not fetch categories from WordPress.';
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message, code: 'connection_failed' } },
      { status: 400 }
    );
  }
}
