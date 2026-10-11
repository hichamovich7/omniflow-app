import type { SupabaseClient } from '@supabase/supabase-js';
import { createMediaStorage, resolveMediaKey, type MediaStorage } from '@/lib/storage';

/**
 * Storage of generated WordPress article images (TASK-049). Built once at
 * the start of a generation, before any AI call, so a misconfigured R2 fails
 * before anything is paid for.
 *   supabase → wordpress-images/<user>/<generation>/<MARKER>.png (unchanged)
 *   r2       → images/wordpress/<user>/<generation>/<MARKER>.png
 */
export function createArticleImageStorage(supabase: SupabaseClient): MediaStorage {
  return createMediaStorage(supabase, 'wordpress-images');
}

/** Stores one image and returns its public URL; throws (never a broken URL) when the upload fails. */
export async function storeArticleImage(
  storage: MediaStorage,
  params: { userId: string; generationId: string; marker: string; body: Buffer }
): Promise<string> {
  const fileName = `${params.marker}.png`;
  const key = resolveMediaKey(
    storage.provider,
    { channel: 'wordpress', ownerId: params.userId, groupId: params.generationId, fileName },
    `${params.userId}/${params.generationId}/${fileName}`
  );
  try {
    return (await storage.upload({ key, body: params.body, contentType: 'image/png' })).publicUrl;
  } catch (err) {
    throw new Error(`Storage upload failed for ${params.marker}: ${err instanceof Error ? err.message : 'unknown error'}`);
  }
}
