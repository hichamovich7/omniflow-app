import type { SupabaseClient } from '@supabase/supabase-js';
import { createMediaStorage, resolveMediaKey, type MediaStorage } from '@/lib/storage';
import { describeOptimization, optimizeImage } from '@/lib/media/optimize-image';

/**
 * Storage of generated WordPress article images (TASK-049). Built once at
 * the start of a generation, before any AI call, so a misconfigured R2 fails
 * before anything is paid for.
 *   supabase → wordpress-images/<user>/<generation>/<MARKER>.<ext>
 *   r2       → images/wordpress/<user>/<generation>/<MARKER>.<ext>
 * TASK-050: every image is optimized first with the wordpress-article profile
 * (WebP, longest side ≤ 1600, explicit JPEG fallback), so `<ext>` is the real
 * format. Images stored before TASK-050 keep their `.png` path and URL.
 */
export function createArticleImageStorage(supabase: SupabaseClient): MediaStorage {
  return createMediaStorage(supabase, 'wordpress-images');
}

/** Optimizes and stores one image, returns its public URL; throws (never a broken URL, never the raw PNG) on failure. */
export async function storeArticleImage(
  storage: MediaStorage,
  params: { userId: string; generationId: string; marker: string; body: Buffer }
): Promise<string> {
  let optimized;
  try {
    optimized = await optimizeImage(params.body, 'wordpress-article');
  } catch (err) {
    throw new Error(`Image optimization failed for ${params.marker}: ${err instanceof Error ? err.message : 'unknown error'}`);
  }
  console.log(`[wordpress images] ${params.marker} ${describeOptimization(optimized)}`);

  const fileName = `${params.marker}.${optimized.extension}`;
  const key = resolveMediaKey(
    storage.provider,
    { channel: 'wordpress', ownerId: params.userId, groupId: params.generationId, fileName },
    `${params.userId}/${params.generationId}/${fileName}`
  );
  try {
    return (await storage.upload({ key, body: optimized.buffer, contentType: optimized.contentType })).publicUrl;
  } catch (err) {
    throw new Error(`Storage upload failed for ${params.marker}: ${err instanceof Error ? err.message : 'unknown error'}`);
  }
}
