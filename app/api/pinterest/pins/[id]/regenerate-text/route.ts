import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/ai/engine';
import { preparePinTextRegeneration, regenerateAndSavePinText } from '@/lib/pinterest/pin-text';
import { SocialGenerationError } from '@/lib/social/pinterest-from-article';
import { WordPressReadError } from '@/lib/wordpress/post-reader';
import { checkRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';
import type { Pin } from '@/types/database';

export const maxDuration = 60;

/**
 * Regenerates only the title, description and keywords of one saved Pin
 * (TASK-076), whatever its source (keyword, OmniFlow article, existing
 * WordPress post — resolved server-side from its generation, no body).
 * One text AI call, never the image model; image, link, board, section,
 * schedule and every other Pin are left untouched.
 */
export async function POST(
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
      { data: null, error: { message: 'Invalid Pin ID', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  try {
    // Ownership, project and source checks run before the rate limit so a
    // rejected request never consumes trial budget.
    const prepared = await preparePinTextRegeneration(supabase, user.id, id);

    // Same budget as "Regenerate this Pin": one shared hourly bucket.
    const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'pinterest/regenerate-pin', 30, 3600, {
      enforceTrialLimit: true,
    });
    if (!rateLimit.allowed) {
      return rateLimitErrorResponse(rateLimit);
    }

    const pin = await regenerateAndSavePinText(supabase, prepared, { generateText });
    return NextResponse.json<ApiResponse<Pin>>({ data: pin, error: null });
  } catch (err) {
    if (err instanceof SocialGenerationError) {
      // Structured for a strategy-safeguard rejection, { message, code } otherwise.
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: err.toApiError() },
        { status: err.status }
      );
    }
    if (err instanceof WordPressReadError) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: err.message, code: err.code } },
        { status: err.status }
      );
    }
    console.error('Pin text regeneration failed:', err);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Text regeneration failed. Please try again.', code: 'server_error' } },
      { status: 500 }
    );
  }
}
