import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { generateImage, resolveImageModel } from '@/lib/ai/engine';
import { buildImagePrompt, IMAGE_PROMPT_ID } from '@/lib/ai/prompt-engine/engine';
import { compositeBanner } from '@/lib/pinterest/compositing';
import { extractAccentColor } from '@/lib/pinterest/color-extraction';
import { pickCtaMessage } from '@/lib/pinterest/cta-messages';
import { readPinterestStrategyAngle } from '@/lib/pinterest/strategy';
import {
  selectHeadlineTemplate,
  type TemplateSelectionHistoryItem,
} from '@/lib/pinterest/template-selection';
import {
  composeHeadlineWithQualityGate,
  type PinQualityHistoryItem,
} from '@/lib/pinterest/quality-gate';
import {
  DEFAULT_NICHE_CONVENTION,
  getNicheVisualConvention,
} from '@/lib/ai/niche-visual-conventions';
import { BANNER_TEMPLATES } from '@/lib/validations/pinterest';
import { IMAGE_CONFIG } from '@/lib/prompts/image-generator';
import { promisePool } from '@/lib/utils/promise-pool';
import { checkRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import type { ApiResponse } from '@/types/api';
import type { Pin } from '@/types/database';

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

      try {
        const { data: existingVersions } = await supabase
          .from('pin_images')
          .select('version')
          .eq('pin_id', pin.id)
          .order('version', { ascending: false })
          .limit(1);

        const nextVersion = (existingVersions?.[0]?.version ?? 0) + 1;
        const { model: imageModel } = resolveImageModel(pin.visual_format);
        const rawImageBuffer = await generateImage({
          prompt: buildImagePrompt(pin, nextVersion),
          size: IMAGE_CONFIG.size,
          visualFormat: pin.visual_format,
        });

        const { accentColor, textColor } = await extractAccentColor(rawImageBuffer);
        const ctaText = pickCtaMessage(pin.language, index);
        let imageBuffer = await compositeBanner(
          rawImageBuffer,
          ctaText,
          'bottom',
          accentColor,
          textColor,
          pin.cta_banner_template ?? 'clean-band'
        );

        let selectedHeadlineTemplate = pin.title_banner_template ?? 'clean-band';
        let selectedHeadlinePosition: 'top' | 'bottom' | undefined;
        let headlineComposed = false;
        const angle = readPinterestStrategyAngle(pin.image_analysis);

        // Provider calls remain concurrent. Only this small local decision is
        // ordered, making repetition penalties stable for the whole batch.
        await previousSelection;
        if (pin.visual_format === 'text-overlay' && pin.overlay_text && angle) {
          const selection = await selectHeadlineTemplate(
            {
              imageBuffer,
              text: pin.overlay_text,
              angle,
              accentColor,
              allowedTemplates: allowedBannerTemplates,
            },
            selectionHistory
          );
          const composition = await composeHeadlineWithQualityGate({
            imageBuffer,
            text: pin.overlay_text,
            angle,
            accentColor,
            textColor,
            selectedTemplate: selection.template,
            selectedPosition: selection.position,
            allowedTemplates: allowedBannerTemplates,
            history: qualityHistory,
          });
          imageBuffer = composition.buffer;
          selectedHeadlineTemplate = composition.template;
          selectedHeadlinePosition = composition.position;
          headlineComposed = true;
          selectionHistory.push({
            angle,
            template: composition.template,
            position: composition.position,
          });
          qualityHistory.push(composition.historyItem);
        }
        releaseSelection();

        if (pin.visual_format === 'text-overlay' && pin.overlay_text && !headlineComposed) {
          imageBuffer = await compositeBanner(
            imageBuffer,
            pin.overlay_text,
            'top',
            accentColor,
            textColor,
            selectedHeadlineTemplate,
            selectedHeadlinePosition
          );
        }

        const filePath = `${user.id}/${pin.id}/${nextVersion}.png`;
        const { error: uploadError } = await supabase.storage
          .from('generated-images')
          .upload(filePath, imageBuffer, { contentType: 'image/png' });

        if (uploadError) {
          throw new Error(`Storage upload failed: ${uploadError.message}`);
        }

        const { data: publicUrl } = supabase.storage
          .from('generated-images')
          .getPublicUrl(filePath);

        await supabase
          .from('pin_images')
          .update({ is_active: false })
          .eq('pin_id', pin.id)
          .eq('is_active', true);

        await supabase.from('pin_images').insert({
          pin_id: pin.id,
          storage_path: filePath,
          url: publicUrl.publicUrl,
          is_active: true,
          version: nextVersion,
          image_model: imageModel,
        });

        await supabase
          .from('pins')
          .update({
            media_url: publicUrl.publicUrl,
            ...(angle && pin.visual_format === 'text-overlay'
              ? { title_banner_template: selectedHeadlineTemplate }
              : {}),
          })
          .eq('id', pin.id);

        return pin.id;
      } catch (error) {
        await previousSelection;
        releaseSelection();
        throw error;
      }
    },
    IMAGE_CONFIG.concurrency
  );

  if (failures.length > 0) {
    console.warn(
      `[${IMAGE_PROMPT_ID}] ${failures.length} image(s) failed:`,
      failures.map((e) => e.message)
    );
  }

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
    ApiResponse<{ imageStatus: string; imagesGenerated: number; imagesFailed: number }>
  >({
    data: {
      imageStatus,
      imagesGenerated: successes.length,
      imagesFailed: failures.length,
    },
    error: null,
  });
}
