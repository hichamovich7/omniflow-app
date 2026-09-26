import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exportArticleSchema } from '@/lib/validations/wordpress-export';
import { getPinsSeoSource, getWordPressArticleByGenerationId } from '@/lib/queries/wordpress';
import { getWordPressSiteWithSecretByProjectId } from '@/lib/queries/wordpress-sites';
import { decryptSecret } from '@/lib/wordpress/crypto';
import { prepareArticleExport, type PreparedExport } from '@/lib/wordpress/export-with-links';
import type { WordPressSiteCredentials } from '@/lib/wordpress/rest-client';
import { checkRateLimit } from '@/lib/rate-limit';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

// Read-only WordPress calls (posts list + tag lookups), bounded by the
// internal-links fetch budget — no AI call, no upload, nothing written.
export const maxDuration = 30;

/**
 * Builds the Copy Markdown / Copy HTML export on demand (TASK-FIX-052),
 * optionally with automatic internal links. The stored article is only read,
 * never modified — nothing is written to Supabase or WordPress.
 */
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

  const parsed = exportArticleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { generation, article } = await getWordPressArticleByGenerationId(supabase, id);

  if (!generation || !article) {
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

  const { format, includeInternalLinks } = parsed.data;
  let credentials: WordPressSiteCredentials | null = null;
  let categoryIds: number[] = [];

  // WordPress is only contacted when internal links are asked for.
  if (includeInternalLinks) {
    const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'wordpress/export', 60, 3600);
    if (!rateLimit.allowed) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: 'Rate limit exceeded. Try again later.', code: 'rate_limited' } },
        { status: 429 }
      );
    }

    const site = await getWordPressSiteWithSecretByProjectId(supabase, generation.project_id);
    if (site) {
      credentials = {
        siteUrl: site.site_url,
        username: site.wp_username,
        password: decryptSecret(site.encrypted_application_password),
      };
    }

    if (credentials && article.category_id) {
      const { data: category } = await supabase
        .from('wordpress_categories')
        .select('wp_category_id')
        .eq('id', article.category_id)
        .single();
      if (category?.wp_category_id) categoryIds = [category.wp_category_id];
    }
  }

  const pins =
    credentials && generation.source_type === 'pins'
      ? await getPinsSeoSource(supabase, generation.source_pin_ids ?? [])
      : null;

  const prepared = await prepareArticleExport(credentials, {
    article,
    generation,
    pins,
    categoryIds,
    format,
    includeInternalLinks,
  });

  return NextResponse.json<ApiResponse<PreparedExport & { format: 'html' | 'markdown' }>>({
    data: { format, ...prepared },
    error: null,
  });
}
