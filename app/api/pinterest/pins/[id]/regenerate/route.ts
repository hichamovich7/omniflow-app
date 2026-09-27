import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/ai/engine';
import { regeneratePinSchema } from '@/lib/validations/pinterest';
import { prepareArticlePinRegeneration, regenerateAndSavePin } from '@/lib/pinterest/pin-text';
import { SocialGenerationError } from '@/lib/social/pinterest-from-article';
import { checkRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';
import type { Pin } from '@/types/database';

export const maxDuration = 60;

/**
 * Regenerates the text of one saved Pin from its source WordPress article
 * (TASK-044 phase 2): same prompt, same angle, same article context, no URL.
 * Only that Pin is updated; the article is only read.
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
      { data: null, error: { message: 'Invalid Pin ID', code: 'invalid_id' } },
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

  const parsed = regeneratePinSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  try {
    // Ownership, completion and project checks run before the rate limit so
    // a rejected request never consumes trial budget.
    const prepared = await prepareArticlePinRegeneration(supabase, user.id, id, parsed.data.wordpressArticleId);

    const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'pinterest/regenerate-pin', 30, 3600, {
      enforceTrialLimit: true,
    });
    if (!rateLimit.allowed) {
      return rateLimitErrorResponse(rateLimit);
    }

    const pin = await regenerateAndSavePin(supabase, prepared, { generateText });
    return NextResponse.json<ApiResponse<Pin>>({ data: pin, error: null });
  } catch (err) {
    if (err instanceof SocialGenerationError) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: err.message, code: err.code } },
        { status: err.status }
      );
    }
    console.error('Pin regeneration failed:', err);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Pin regeneration failed. Please try again.', code: 'server_error' } },
      { status: 500 }
    );
  }
}
