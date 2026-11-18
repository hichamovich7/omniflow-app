import { describeOptimization, optimizeImage } from '@/lib/media/optimize-image';
import { resolveMediaKey, type MediaStorage } from '@/lib/storage';
import type { StoredVariantImage } from '@/lib/social/facebook-image-variants';

/**
 * Stores one Facebook image variant (TASK-101): optimised to
 * facebook-feed-portrait (4:5 JPEG) and written under
 * `images/facebook/<user>/<draft>/<batch>-<n>.jpg` (R2), or
 * `<user>/facebook/<draft>/<batch>-<n>.jpg` in the Supabase
 * `generated-images` bucket. Throws on failure — no URL without a stored file.
 */
export async function storeFacebookVariantImage(
  storage: MediaStorage,
  params: { userId: string; generationId: string; batchId: string; position: number; body: Buffer }
): Promise<StoredVariantImage> {
  const optimized = await optimizeImage(params.body, 'facebook-feed-portrait');
  console.log(`[facebook images] variant ${params.position} ${describeOptimization(optimized)}`);
  const fileName = `${params.batchId}-${params.position}.${optimized.extension}`;
  const key = resolveMediaKey(
    storage.provider,
    { channel: 'facebookImage', ownerId: params.userId, groupId: params.generationId, fileName },
    `${params.userId}/facebook/${params.generationId}/${fileName}`
  );
  const stored = await storage.upload({ key, body: optimized.buffer, contentType: optimized.contentType });
  return { url: stored.publicUrl, key: stored.key, width: optimized.width, height: optimized.height };
}
