import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/ai/engine';
import { checkRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { mediumSummaryRequestSchema } from '@/lib/validations/medium-summary';
import {
  generateMediumSummary,
  loadOmniflowArticleMediumSource,
  loadWordPressPostMediumSource,
  MediumSummaryError,
  MEDIUM_SUMMARY_PROMPT_ID,
  type MediumSummaryResult,
  type MediumSummarySource,
} from '@/lib/social/medium-summary';
import { SocialGenerationError } from '@/lib/social/pinterest-from-article';
import { WordPressReadError } from '@/lib/wordpress/post-reader';
import type { ApiResponse } from '@/types/api';

// Up to two text generations (one corrective retry) plus WordPress GETs.
export const maxDuration = 60;

/**
 * Medium summary from a WordPress article (TASK-062). Read-only: the article
 * is read (Supabase select / WordPress GET), the summary is returned and not
 * saved, nothing is written to WordPress and Medium is never called.
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

  const parsed = mediumSummaryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  // After validation so a malformed request never consumes the quota.
  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'social/medium-summary', 30, 3600, {
    enforceTrialLimit: true,
  });
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit);
  }

  let source: MediumSummarySource;
  try {
    source =
      'wordpressArticleId' in parsed.data
        ? await loadOmniflowArticleMediumSource(supabase, user.id, parsed.data.wordpressArticleId)
        : await loadWordPressPostMediumSource(supabase, user.id, parsed.data.wordpressPost);
  } catch (err) {
    if (!(err instanceof SocialGenerationError) && !(err instanceof WordPressReadError)) throw err;
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: err.message, code: err.code } },
      { status: err.status }
    );
  }

  try {
    const result = await generateMediumSummary(source, generateText);
    return NextResponse.json<ApiResponse<MediumSummaryResult>>({ data: result, error: null });
  } catch (err) {
    if (err instanceof MediumSummaryError) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: err.message, code: err.code } },
        { status: err.status }
      );
    }
    console.error(`[${MEDIUM_SUMMARY_PROMPT_ID}] generation failed:`, err instanceof Error ? err.message : 'unknown error');
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'The Medium summary could not be generated. Please try again.', code: 'generation_failed' } },
      { status: 500 }
    );
  }
}
