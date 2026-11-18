import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, rateLimitErrorResponse, reserveTrialUnits } from '@/lib/rate-limit';
import { generateImage, resolveImageModel } from '@/lib/ai/services/image';
import { createMediaStorage } from '@/lib/storage';
import { getSocialContentGeneration } from '@/lib/queries/social-content';
import { listPublicationsForGenerations } from '@/lib/queries/social-publications';
import { supabaseVariantStore } from '@/lib/queries/facebook-image-variants';
import { facebookImageSelectionSchema, facebookImageVariantsSchema } from '@/lib/validations/facebook';
import {
  generateFacebookImageVariants,
  ImageVariantError,
  selectFacebookImage,
  type GenerateVariantsResult,
} from '@/lib/social/facebook-image-variants';
import { storeFacebookVariantImage } from '@/lib/social/facebook-variant-storage';
import { jsonError } from '@/lib/social/facebook-server';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

/**
 * POST /api/social/generations/[id]/image-variants and
 * PATCH /api/social/generations/[id]/image — TASK-101. The caller's own
 * session (RLS + user_id filters). No Meta or WordPress call, no write to
 * social_publications: only the draft's image columns and its variants.
 */

async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}

function variantErrorResponse(err: ImageVariantError) {
  if (err.code === 'trial_limit') return rateLimitErrorResponse({ allowed: false, remaining: 0, reason: 'trial_limit' });
  return jsonError(err.status, err.code, err.message);
}

export async function handleGenerateImageVariants(request: Request, id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, 'unauthorized', 'Unauthorized');
  if (!isValidUuid(id)) return jsonError(400, 'invalid_id', 'Invalid content ID');

  const json = await readJson(request);
  if (!json.ok) return jsonError(400, 'invalid_json', 'Invalid JSON body');
  const parsed = facebookImageVariantsSchema.safeParse(json.body);
  if (!parsed.success) return jsonError(400, 'invalid_request', parsed.error.issues[0].message);

  // Hourly window per request (no trial unit here: units are reserved per image call below).
  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'social/facebook-image-variants', 10, 3600);
  if (!rateLimit.allowed) return rateLimitErrorResponse(rateLimit);

  const draft = await getSocialContentGeneration(supabase, user.id, id);
  const publication = draft ? ((await listPublicationsForGenerations(supabase, user.id, [id]))[id] ?? null) : null;

  try {
    const storage = createMediaStorage(supabase, 'generated-images');
    let imageModel: string | null = null;
    try {
      imageModel = resolveImageModel('photo').model;
    } catch {
      imageModel = null;
    }
    const result = await generateFacebookImageVariants(
      { draft, publication, count: parsed.data.count },
      {
        store: supabaseVariantStore(supabase, user.id),
        reserveUnits: (units) => reserveTrialUnits(user.id, user.email ?? '', units),
        generateImage: ({ prompt, size }) => generateImage({ prompt, size }),
        storeImage: (input) => storeFacebookVariantImage(storage, input),
        newId: randomUUID,
        imageModel,
      }
    );
    return NextResponse.json<ApiResponse<GenerateVariantsResult>>({ data: result, error: null });
  } catch (err) {
    if (err instanceof ImageVariantError) return variantErrorResponse(err);
    console.error('[facebook] image variants failed:', err instanceof Error ? err.name : 'unknown error');
    return jsonError(500, 'variants_failed', 'The images could not be generated. Please try again.');
  }
}

export async function handleSelectImage(request: Request, id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, 'unauthorized', 'Unauthorized');
  if (!isValidUuid(id)) return jsonError(400, 'invalid_id', 'Invalid content ID');

  const json = await readJson(request);
  if (!json.ok) return jsonError(400, 'invalid_json', 'Invalid JSON body');
  const parsed = facebookImageSelectionSchema.safeParse(json.body);
  if (!parsed.success) return jsonError(400, 'invalid_request', parsed.error.issues[0].message);

  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'social/facebook-image-select', 60, 3600);
  if (!rateLimit.allowed) return rateLimitErrorResponse(rateLimit);

  const draft = await getSocialContentGeneration(supabase, user.id, id);
  const publication = draft ? ((await listPublicationsForGenerations(supabase, user.id, [id]))[id] ?? null) : null;

  try {
    const updated = await selectFacebookImage({ draft, publication, variantId: parsed.data.variantId }, { store: supabaseVariantStore(supabase, user.id) });
    return NextResponse.json<ApiResponse<typeof updated>>({ data: updated, error: null });
  } catch (err) {
    if (err instanceof ImageVariantError) return variantErrorResponse(err);
    console.error('[facebook] image selection failed:', err instanceof Error ? err.name : 'unknown error');
    return jsonError(500, 'update_failed', 'The image could not be changed. Please try again.');
  }
}
