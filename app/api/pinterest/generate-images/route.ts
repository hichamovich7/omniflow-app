import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { IMAGE_PROMPT_ID } from '@/lib/ai/prompt-engine/engine';
import type { TemplateSelectionHistoryItem } from '@/lib/pinterest/template-selection';
import type { PinQualityHistoryItem } from '@/lib/pinterest/quality-gate';
import { createMediaStorage, type MediaStorage } from '@/lib/storage';
import {
  DEFAULT_NICHE_CONVENTION,
  getNicheVisualConvention,
} from '@/lib/ai/niche-visual-conventions';
import { BANNER_TEMPLATES } from '@/lib/validations/pinterest';
import { IMAGE_CONFIG } from '@/lib/prompts/image-generator';
import { promisePool } from '@/lib/utils/promise-pool';
import { checkRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { generatePinImage, PinImageError } from '@/lib/pinterest/pin-image-generation';
import type { ApiResponse } from '@/types/api';
import type { Pin } from '@/types/database';

// The per-Pin pipeline (classic, AI Integrated, legacy composite, composer,
// AI-generated design) lives in lib/pinterest/pin-image-generation.ts (TASK-099).

const requestSchema = z.object({
  generationId: z.string().uuid(),
  pinIds: z.array(z.string().uuid()).optional(),
});

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

  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'pinterest/generate-images', 20, 3600, {
    enforceTrialLimit: true,
  });
  if (!rateLimit.allowed) {
    return rateLimitErrorResponse(rateLimit);
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

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid request', code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { generationId, pinIds } = parsed.data;

  const { data: generation } = await supabase
    .from('generations')
    .select('id, image_status, status, user_id, project_id')
    .eq('id', generationId)
    .single();

  if (!generation) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Generation not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  if (generation.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this generation', code: 'forbidden' } },
      { status: 403 }
    );
  }

  const { data: project } = await supabase
    .from('projects')
    .select('niche')
    .eq('id', generation.project_id)
    .single();
  const allowedBannerTemplates =
    getNicheVisualConvention(project?.niche)?.allowedBannerTemplates ??
    DEFAULT_NICHE_CONVENTION.allowedBannerTemplates ??
    [...BANNER_TEMPLATES];

  if (generation.image_status === 'processing') {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Image generation already in progress', code: 'conflict' } },
      { status: 409 }
    );
  }

  const isSelectiveRegeneration = pinIds && pinIds.length > 0;

  let pinsQuery = supabase
    .from('pins')
    .select('*')
    .eq('generation_id', generationId)
    .order('created_at', { ascending: true })
    .limit(IMAGE_CONFIG.maxBatchSize);

  if (isSelectiveRegeneration) {
    pinsQuery = pinsQuery.in('id', pinIds);
  } else {
    pinsQuery = pinsQuery.is('media_url', null);
  }

  const { data: pins } = await pinsQuery;

  const pinsToProcess = (pins ?? []) as Pin[];

  if (pinsToProcess.length === 0) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'No pins need images', code: 'invalid_request' } },
      { status: 400 }
    );
  }

  // TASK-049: resolved before any paid image call — a misconfigured R2 fails
  // here, explicitly, never after generation and never by falling back.
  let mediaStorage: MediaStorage;
  try {
    mediaStorage = createMediaStorage(supabase, 'generated-images');
  } catch (error) {
    console.error('[pinterest images] media storage unavailable:', error instanceof Error ? error.message : error);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Media storage is not available', code: 'storage_unavailable' } },
      { status: 500 }
    );
  }

  await supabase
    .from('generations')
    .update({ image_status: 'processing' })
    .eq('id', generationId);

  // Image generation stays concurrent, but template decisions are released
  // in pin order so repetition penalties cannot depend on provider latency.
  const selectionTurns = pinsToProcess.map(() => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  });
  const selectionHistory: TemplateSelectionHistoryItem[] = [];
  const qualityHistory: PinQualityHistoryItem[] = [];

  const { successes, failures } = await promisePool(
    pinsToProcess,
    async (pin, index) => {
      const previousSelection =
        index === 0 ? Promise.resolve() : selectionTurns[index - 1].promise;
      let selectionReleased = false;
      const releaseSelection = () => {
        if (selectionReleased) return;
        selectionReleased = true;
        selectionTurns[index].resolve();
      };
      return generatePinImage(
        {
          supabase,
          mediaStorage,
          userId: user.id,
          generationId,
          niche: project?.niche ?? null,
          allowedBannerTemplates,
        },
        pin,
        { index, previousSelection, releaseSelection, selectionHistory, qualityHistory }
      );
    },
    IMAGE_CONFIG.concurrency
  );

  if (failures.length > 0) {
    console.warn(
      `[${IMAGE_PROMPT_ID}] ${failures.length} image(s) failed:`,
      failures.map((e) => e.message)
    );
  }
  // TASK-088: failures that name their Pin (AI-generated design) — shown to the user.
  const failedPins = failures
    .filter((error): error is PinImageError => error instanceof PinImageError)
    .map((error) => ({ pinId: error.pinId, message: error.message }));

  const imageStatus =
    successes.length === 0
      ? 'failed'
      : failures.length > 0
        ? 'partial'
        : 'completed';

  await supabase
    .from('generations')
    .update({ image_status: imageStatus })
    .eq('id', generationId);

  return NextResponse.json<
    ApiResponse<{
      imageStatus: string;
      imagesGenerated: number;
      imagesFailed: number;
      failedPins?: Array<{ pinId: string; message: string }>;
    }>
  >({
    data: {
      imageStatus,
      imagesGenerated: successes.length,
      imagesFailed: failures.length,
      ...(failedPins.length > 0 ? { failedPins } : {}),
    },
    error: null,
  });
}
