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
import {
  getPinImageStoragePath,
  getPinSourceStoragePath,
} from '@/lib/pinterest/pin-image-storage';
import { readPinterestStrategyAngle } from '@/lib/pinterest/strategy';
import { BANNER_TEMPLATES, type BannerTemplate } from '@/lib/validations/pinterest';
import type { ApiResponse } from '@/types/api';
import type { Pin, PinImage } from '@/types/database';

const requestSchema = z.object({
  pinId: z.string().uuid(),
  template: z.enum(MANUAL_TEMPLATE_CHOICES),
  position: z.enum(MANUAL_POSITION_CHOICES),
});

interface RecompositionResponse {
  version: PinImage;
  qualityStatus: 'PASS' | 'WARN';
  template: BannerTemplate;
  position: 'top' | 'bottom';
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
      { data: null, error: { message: 'Invalid recomposition options', code: 'invalid_request' } },
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

  const [{ data: pinData }, { data: versionsData }] = await Promise.all([
    supabase.from('pins').select('*').eq('id', pinId).single(),
    supabase
      .from('pin_images')
      .select('*')
      .eq('pin_id', pinId)
      .order('version', { ascending: false }),
  ]);
  const pin = pinData as Pin | null;
  const versions = (versionsData ?? []) as PinImage[];
  const activeVersion = versions.find((version) => version.is_active);
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
          message: 'This Pin does not have a structured text layout to recompose',
          code: 'unsupported_pin',
        },
      },
      { status: 400 }
    );
  }

  const sourcePath = getPinSourceStoragePath(activeVersion.storage_path);
  const { data: sourceBlob, error: sourceError } = await supabase.storage
    .from('generated-images')
    .download(sourcePath);

  if (sourceError || !sourceBlob) {
    return NextResponse.json<ApiResponse<null>>(
      {
        data: null,
        error: {
          message: 'The original photo is unavailable. Generate a fresh image once to enable recomposition.',
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
  const sourceImageBuffer = Buffer.from(await sourceBlob.arrayBuffer());

  let composition;
  try {
    composition = await recomposeExistingPin({
      sourceImageBuffer,
      overlayText: pin.overlay_text,
      angle,
      ctaText: pickCtaMessage(pin.language, pinIndex),
      ctaTemplate: pin.cta_banner_template,
      templateChoice: template,
      positionChoice: position,
      allowedTemplates,
    });
  } catch (error) {
    console.error(`Manual recomposition failed for pin ${pinId}:`, error);
    return NextResponse.json<ApiResponse<null>>(
      {
        data: null,
        error: {
          message: 'No export-safe layout could be composed with these options',
          code: 'quality_gate_failed',
        },
      },
      { status: 422 }
    );
  }

  if (composition.quality.status !== 'PASS' && composition.quality.status !== 'WARN') {
    return NextResponse.json<ApiResponse<null>>(
      {
        data: null,
        error: { message: 'The recomposed image did not pass the Quality Gate', code: 'quality_gate_failed' },
      },
      { status: 422 }
    );
  }

  const nextVersion = (versions[0]?.version ?? 0) + 1;
  const imagePath = getPinImageStoragePath(user.id, pin.id, nextVersion);
  const newSourcePath = getPinSourceStoragePath(imagePath);
  const bucket = supabase.storage.from('generated-images');
  const { error: sourceUploadError } = await bucket.upload(newSourcePath, sourceImageBuffer, {
    contentType: 'image/png',
    upsert: true,
  });
  if (sourceUploadError) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Could not preserve the source photo', code: 'storage_error' } },
      { status: 500 }
    );
  }

  const { error: imageUploadError } = await bucket.upload(imagePath, composition.imageBuffer, {
    contentType: 'image/png',
    upsert: true,
  });
  if (imageUploadError) {
    await bucket.remove([newSourcePath]);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Could not store the recomposed image', code: 'storage_error' } },
      { status: 500 }
    );
  }

  const { data: publicUrl } = bucket.getPublicUrl(imagePath);
  const { data: insertedData, error: insertError } = await supabase
    .from('pin_images')
    .insert({
      pin_id: pin.id,
      storage_path: imagePath,
      url: publicUrl.publicUrl,
      is_active: false,
      version: nextVersion,
      image_model: activeVersion.image_model,
    })
    .select('*')
    .single();

  if (insertError || !insertedData) {
    await bucket.remove([newSourcePath, imagePath]);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Could not create the new image version', code: 'database_error' } },
      { status: 500 }
    );
  }

  const inserted = insertedData as PinImage;
  const { error: deactivateError } = await supabase
    .from('pin_images')
    .update({ is_active: false })
    .eq('pin_id', pin.id)
    .eq('is_active', true);
  const { error: activateError } = deactivateError
    ? { error: deactivateError }
    : await supabase.from('pin_images').update({ is_active: true }).eq('id', inserted.id);
  const { error: pinUpdateError } = activateError
    ? { error: activateError }
    : await supabase
        .from('pins')
        .update({ media_url: publicUrl.publicUrl, title_banner_template: composition.template })
        .eq('id', pin.id);

  if (deactivateError || activateError || pinUpdateError) {
    await supabase.from('pin_images').update({ is_active: false }).eq('id', inserted.id);
    await supabase.from('pin_images').update({ is_active: true }).eq('id', activeVersion.id);
    await supabase.from('pin_images').delete().eq('id', inserted.id);
    await bucket.remove([newSourcePath, imagePath]);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Could not activate the new image version', code: 'database_error' } },
      { status: 500 }
    );
  }

  return NextResponse.json<ApiResponse<RecompositionResponse>>({
    data: {
      version: { ...inserted, is_active: true },
      qualityStatus: composition.quality.status,
      template: composition.template,
      position: composition.position,
    },
    error: null,
  });
}
