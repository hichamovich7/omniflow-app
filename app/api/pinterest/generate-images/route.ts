import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { generateImage } from '@/lib/openai/image-client';
import { IMAGE_CONFIG, IMAGE_PROMPT_ID, buildImagePrompt } from '@/lib/prompts/image-generator';
import { promisePool } from '@/lib/utils/promise-pool';
import type { ApiResponse } from '@/types/api';
import type { Pin } from '@/types/database';

const requestSchema = z.object({
  generationId: z.string().uuid(),
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

  const body = await request.json();
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid request', code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { generationId } = parsed.data;

  const { data: generation } = await supabase
    .from('generations')
    .select('id, image_status, status')
    .eq('id', generationId)
    .single();

  if (!generation) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Generation not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  if (generation.image_status === 'processing') {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Image generation already in progress', code: 'conflict' } },
      { status: 409 }
    );
  }

  const { data: pins } = await supabase
    .from('pins')
    .select('*')
    .eq('generation_id', generationId)
    .is('media_url', null)
    .order('created_at', { ascending: true })
    .limit(IMAGE_CONFIG.maxBatchSize);

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

  const model = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1';

  const { successes, failures } = await promisePool(
    pinsToProcess,
    async (pin) => {
      const imageBuffer = await generateImage({
        model,
        prompt: buildImagePrompt(pin),
        size: IMAGE_CONFIG.size,
      });

      const filePath = `${user.id}/${pin.id}.png`;

      const { error: uploadError } = await supabase.storage
        .from('generated-images')
        .upload(filePath, imageBuffer, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      const { data: publicUrl } = supabase.storage
        .from('generated-images')
        .getPublicUrl(filePath);

      await supabase
        .from('pins')
        .update({ media_url: publicUrl.publicUrl })
        .eq('id', pin.id);

      return pin.id;
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
