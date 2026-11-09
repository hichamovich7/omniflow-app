import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/ai/engine';
import {
  assertCompleteRegenerationAllowed,
  preparePinTextRegeneration,
  regenerateAndSavePinText,
  regenerateCompletePin,
} from '@/lib/pinterest/pin-text';
import { generatePinImage, singlePinSlot } from '@/lib/pinterest/pin-image-generation';
import { createMediaStorage, type MediaStorage } from '@/lib/storage';
import { DEFAULT_NICHE_CONVENTION, getNicheVisualConvention } from '@/lib/ai/niche-visual-conventions';
import { BANNER_TEMPLATES, regeneratePinTextRequestSchema } from '@/lib/validations/pinterest';
import { SocialGenerationError } from '@/lib/social/pinterest-from-article';
import { WordPressReadError } from '@/lib/wordpress/post-reader';
import { checkRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';
import type { Pin } from '@/types/database';

// "Regenerate complete Pins" makes one text call and then one image call.
export const maxDuration = 120;

/**
 * Regenerates one saved Pin (TASK-076, TASK-099), whatever its source
 * (keyword, OmniFlow article, existing WordPress post — resolved server-side
 * from its generation). Optional body `{ mode }`:
 * - "text-and-image-prompt" (default, also with no body): one text AI call —
 *   new title, description, keywords and image_prompt; no image call, the
 *   current image is kept.
 * - "complete": the same text call, then one image call made from the new
 *   prompt; text, prompt and image are saved together only if the image
 *   succeeds. Step-by-step Pins (several image calls) are refused.
 * Link, UTM, board, section, schedule, status and every other Pin are never
 * written. On any failure the Pin is left as it was.
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

  // No body = the default mode; a body must be valid JSON matching the schema.
  const raw = await request.text().catch(() => '');
  let body: unknown = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: 'Invalid JSON body', code: 'invalid_json' } },
        { status: 400 }
      );
    }
  }
  const parsed = regeneratePinTextRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid regeneration mode', code: 'invalid_request' } },
      { status: 400 }
    );
  }
  const { mode } = parsed.data;

  try {
    // Ownership, project and source checks run before the rate limit so a
    // rejected request never consumes trial budget.
    const prepared = await preparePinTextRegeneration(supabase, user.id, id);

    let mediaStorage: MediaStorage | null = null;
    if (mode === 'complete') {
      // Before any AI call: at most one image call per Pin, no concurrent image batch, storage ready.
      assertCompleteRegenerationAllowed(prepared.pin);
      const { data: generation } = await supabase
        .from('generations')
        .select('image_status')
        .eq('id', prepared.generation.id)
        .single();
      if ((generation as { image_status?: string } | null)?.image_status === 'processing') {
        return NextResponse.json<ApiResponse<null>>(
          { data: null, error: { message: 'Image generation already in progress. The Pin was not modified.', code: 'conflict' } },
          { status: 409 }
        );
      }
      try {
        mediaStorage = createMediaStorage(supabase, 'generated-images');
      } catch (error) {
        console.error('[pinterest regenerate] media storage unavailable:', error instanceof Error ? error.message : error);
        return NextResponse.json<ApiResponse<null>>(
          { data: null, error: { message: 'Media storage is not available', code: 'storage_unavailable' } },
          { status: 500 }
        );
      }
    }

    // Same budget as "Regenerate this Pin": one shared hourly bucket.
    const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'pinterest/regenerate-pin', 30, 3600, {
      enforceTrialLimit: true,
    });
    if (!rateLimit.allowed) {
      return rateLimitErrorResponse(rateLimit);
    }

    if (mode === 'text-and-image-prompt' || !mediaStorage) {
      const pin = await regenerateAndSavePinText(supabase, prepared, { generateText }, { withImagePrompt: true });
      return NextResponse.json<ApiResponse<Pin>>({ data: pin, error: null });
    }

    // The paid image also counts in the image budget of "Generate images".
    const imageRateLimit = await checkRateLimit(user.id, user.email ?? '', 'pinterest/generate-images', 20, 3600, {
      enforceTrialLimit: true,
    });
    if (!imageRateLimit.allowed) {
      return rateLimitErrorResponse(imageRateLimit);
    }

    const { data: project } = await supabase.from('projects').select('niche').eq('id', prepared.generation.project_id).single();
    const niche = (project as { niche?: string | null } | null)?.niche ?? null;
    const storage = mediaStorage;
    const pin = await regenerateCompletePin(supabase, prepared, {
      generateText,
      renderImage: async (candidate, pinUpdate) => {
        await generatePinImage(
          {
            supabase,
            mediaStorage: storage,
            userId: user.id,
            generationId: prepared.generation.id,
            niche,
            allowedBannerTemplates:
              getNicheVisualConvention(niche)?.allowedBannerTemplates ??
              DEFAULT_NICHE_CONVENTION.allowedBannerTemplates ??
              [...BANNER_TEMPLATES],
          },
          candidate,
          singlePinSlot(),
          { pinUpdate }
        );
      },
    });
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
