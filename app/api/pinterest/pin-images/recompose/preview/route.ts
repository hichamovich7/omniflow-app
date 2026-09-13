import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getPinOwnerUserId } from '@/lib/queries/pin-images';
import {
  DEFAULT_NICHE_CONVENTION,
  getNicheVisualConvention,
} from '@/lib/ai/niche-visual-conventions';
import { pickCtaMessage } from '@/lib/pinterest/cta-messages';
import {
  MANUAL_POSITION_CHOICES,
  MANUAL_TEMPLATE_CHOICES,
  recomposeExistingPin,
} from '@/lib/pinterest/manual-recomposition';
import { getPinSourceStoragePath } from '@/lib/pinterest/pin-image-storage';
import { PinQualityGateError } from '@/lib/pinterest/quality-gate';
import { readPinterestStrategyAngle } from '@/lib/pinterest/strategy';
import { BANNER_TEMPLATES } from '@/lib/validations/pinterest';
import type { RecompositionPreviewIssueCode } from '@/lib/pinterest/recomposition-preview';
import type { ApiResponse } from '@/types/api';
import type { Pin, PinImage } from '@/types/database';

const requestSchema = z.object({
  pinId: z.string().uuid(),
  template: z.enum(MANUAL_TEMPLATE_CHOICES),
  position: z.enum(MANUAL_POSITION_CHOICES),
});

interface InvalidPreviewResponse {
  qualityStatus: 'RECOMPOSE' | 'FAIL';
  issues: RecompositionPreviewIssueCode[];
  template: string;
  position: string;
}

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

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid preview options', code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { pinId, template, position } = parsed.data;
  const ownerUserId = await getPinOwnerUserId(supabase, pinId);
  if (ownerUserId !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Pin not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  const [{ data: pinData }, { data: activeVersionData }] = await Promise.all([
    supabase.from('pins').select('*').eq('id', pinId).single(),
    supabase
      .from('pin_images')
      .select('*')
      .eq('pin_id', pinId)
      .eq('is_active', true)
      .single(),
  ]);
  const pin = pinData as Pin | null;
  const activeVersion = activeVersionData as PinImage | null;
  const angle = pin ? readPinterestStrategyAngle(pin.image_analysis) : null;

  if (!pin || !activeVersion) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Pin image not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  if (pin.visual_format !== 'text-overlay' || !pin.overlay_text || !angle) {
    return NextResponse.json<ApiResponse<null>>(
      {
        data: null,
        error: {
          message: 'This Pin does not have a structured text layout to preview',
          code: 'unsupported_pin',
        },
      },
      { status: 400 }
    );
  }

  const { data: sourceBlob, error: sourceError } = await supabase.storage
    .from('generated-images')
    .download(getPinSourceStoragePath(activeVersion.storage_path));
  if (sourceError || !sourceBlob) {
    return NextResponse.json<ApiResponse<null>>(
      {
        data: null,
        error: {
          message: 'The original photo is unavailable. Generate a fresh image once to enable previews.',
          code: 'source_unavailable',
        },
      },
      { status: 409 }
    );
  }

  const { data: generation } = await supabase
    .from('generations')
    .select('project_id')
    .eq('id', pin.generation_id)
    .single();
  const { data: project } = generation?.project_id
    ? await supabase.from('projects').select('niche').eq('id', generation.project_id).single()
    : { data: null };
  const allowedTemplates =
    getNicheVisualConvention(project?.niche)?.allowedBannerTemplates ??
    DEFAULT_NICHE_CONVENTION.allowedBannerTemplates ??
    [...BANNER_TEMPLATES];

  const { data: siblingPins } = await supabase
    .from('pins')
    .select('id')
    .eq('generation_id', pin.generation_id)
    .order('created_at', { ascending: true });
  const pinIndex = Math.max(0, (siblingPins ?? []).findIndex((sibling) => sibling.id === pin.id));

  try {
    const composition = await recomposeExistingPin({
      sourceImageBuffer: Buffer.from(await sourceBlob.arrayBuffer()),
      overlayText: pin.overlay_text,
      angle,
      ctaText: pickCtaMessage(pin.language, pinIndex),
      ctaTemplate: pin.cta_banner_template,
      templateChoice: template,
      positionChoice: position,
      allowedTemplates,
    });

    return new NextResponse(new Uint8Array(composition.imageBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Pin-Quality-Status': composition.quality.status,
        'X-Pin-Quality-Issues': composition.quality.issues.map((issue) => issue.code).join(','),
        'X-Pin-Template': composition.template,
        'X-Pin-Position': composition.position,
      },
    });
  } catch (error) {
    if (error instanceof PinQualityGateError) {
      const issue: RecompositionPreviewIssueCode =
        error.status === 'RECOMPOSE'
          ? 'quality-gate-unresolved'
          : error.message.includes('fit')
            ? 'text-overflow'
            : 'quality-gate-failed';
      return NextResponse.json<ApiResponse<InvalidPreviewResponse>>({
        data: {
          qualityStatus: error.status,
          issues: [issue],
          template,
          position,
        },
        error: null,
      });
    }

    console.error(`Manual preview failed for pin ${pinId}:`, error);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Could not render this preview', code: 'preview_failed' } },
      { status: 500 }
    );
  }
}
