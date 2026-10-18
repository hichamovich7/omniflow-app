import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/ai/engine';
import { checkRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { facebookPostRequestSchema } from '@/lib/validations/facebook';
import {
  FACEBOOK_POST_PROMPT_ID,
  FacebookPostError,
  generateFacebookPost,
  loadFacebookPostSource,
  saveFacebookPost,
  type FacebookPostSource,
  type SavedFacebookPost,
} from '@/lib/social/facebook-post';
import { SocialGenerationError } from '@/lib/social/pinterest-from-article';
import { WordPressReadError } from '@/lib/wordpress/post-reader';
import type { ApiResponse } from '@/types/api';

// Up to two text generations (one corrective retry) plus WordPress GETs.
export const maxDuration = 60;

/**
 * Facebook Page post from a WordPress article (TASK-068). The article is
 * only read; the post is saved to the caller's Facebook history
 * (social_content_generations, platform facebook) and returned with its id.
 * Nothing is published here — publication is a separate, confirmed action.
 * Same limits as the Medium summary: hourly rate limit + lifetime trial cap.
 */
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

  const parsed = facebookPostRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  // After validation so a malformed request never consumes the quota.
  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'social/facebook-post', 30, 3600, {
    enforceTrialLimit: true,
  });
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit);
  }

  let source: FacebookPostSource;
  try {
    source = await loadFacebookPostSource(supabase, user.id, parsed.data);
  } catch (err) {
    if (!(err instanceof SocialGenerationError) && !(err instanceof WordPressReadError) && !(err instanceof FacebookPostError)) throw err;
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: err.message, code: err.code } },
      { status: err.status }
    );
  }

  try {
    const result = await generateFacebookPost(source, generateText);
    const saved = await saveFacebookPost(supabase, user.id, source, result);
    return NextResponse.json<ApiResponse<SavedFacebookPost>>({ data: saved, error: null });
  } catch (err) {
    if (err instanceof FacebookPostError) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: err.message, code: err.code } },
        { status: err.status }
      );
    }
    console.error(`[${FACEBOOK_POST_PROMPT_ID}] generation failed:`, err instanceof Error ? err.message : 'unknown error');
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'The Facebook post could not be generated. Please try again.', code: 'generation_failed' } },
      { status: 500 }
    );
  }
}
