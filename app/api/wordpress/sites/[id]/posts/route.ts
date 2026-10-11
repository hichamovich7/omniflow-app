import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loadOwnedWordPressSite } from '@/lib/social/pinterest-from-wordpress-post';
import { SocialGenerationError } from '@/lib/social/pinterest-from-article';
import { searchWordPressPosts, WordPressReadError, type WordPressPostListItem } from '@/lib/wordpress/post-reader';
import { WORDPRESS_POST_SEARCH_PAGE_SIZE, wordpressPostSearchSchema } from '@/lib/validations/wordpress-post-source';
import { checkRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

export interface WordPressPostSearchResult {
  posts: WordPressPostListItem[];
  page: number;
  hasMore: boolean;
}

/**
 * Searches the posts of a connected WordPress site (Pinterest from an
 * existing article). Owned connection only; one GET to WordPress — nothing
 * is ever written there. No AI call, no database write.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const url = new URL(request.url);
  const parsed = wordpressPostSearchSchema.safeParse({
    search: url.searchParams.get('search') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'wordpress/search-posts', 120, 3600);
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit);
  }

  try {
    const { credentials } = await loadOwnedWordPressSite(supabase, user.id, id);
    const { posts, totalPages } = await searchWordPressPosts(credentials, {
      ...parsed.data,
      perPage: WORDPRESS_POST_SEARCH_PAGE_SIZE,
    });
    return NextResponse.json<ApiResponse<WordPressPostSearchResult>>({
      data: { posts, page: parsed.data.page, hasMore: totalPages > parsed.data.page },
      error: null,
    });
  } catch (err) {
    if (err instanceof SocialGenerationError || err instanceof WordPressReadError) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: err.message, code: err.code } },
        { status: err.status }
      );
    }
    console.error('[wordpress posts] search failed:', err instanceof Error ? err.name : 'unknown error');
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Could not search this WordPress site.', code: 'server_error' } },
      { status: 500 }
    );
  }
}
