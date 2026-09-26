import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/ai/engine';
import { generateSocialContentSchema } from '@/lib/validations/social';
import {
  generatePinterestFromArticle,
  loadArticlePinterestSource,
  SocialGenerationError,
  type ArticlePinterestResult,
} from '@/lib/social/pinterest-from-article';
import { checkRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

export const maxDuration = 60;

/**
 * Social Content Studio (TASK-044 phase 1): generates platform content from
 * an owned, completed WordPress article. Only Pinterest is available. The
 * article is only read; nothing is persisted and nothing is published.
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

  const parsed = generateSocialContentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  try {
    // Ownership and completion are checked before the rate limit so a
    // rejected request never consumes trial budget.
    const source = await loadArticlePinterestSource(supabase, user.id, id);

    const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'wordpress/social', 20, 3600, {
      enforceTrialLimit: true,
    });
    if (!rateLimit.allowed) {
      return rateLimitErrorResponse(rateLimit);
    }

    const result = await generatePinterestFromArticle(source, { generateText });

    return NextResponse.json<ApiResponse<ArticlePinterestResult>>({ data: result, error: null });
  } catch (err) {
    if (err instanceof SocialGenerationError) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: err.message, code: err.code } },
        { status: err.status }
      );
    }
    console.error('Social content generation failed:', err);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Social content generation failed. Please try again.', code: 'server_error' } },
      { status: 500 }
    );
  }
}
