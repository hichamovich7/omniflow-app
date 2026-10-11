import type { SupabaseClient } from '@supabase/supabase-js';
import type { SourceAssetOptions } from '@/lib/wordpress/media-source';
import { getMediaStorageProvider, isR2Configured, readR2Config, type StorageEnv } from './config';
import { createR2MediaStorage } from './r2-provider';
import { createR2S3Client, type FetchLike } from './s3-client';
import { createSupabaseMediaStorage } from './supabase-provider';
import type { MediaStorage, SupabaseMediaBucket } from './types';

/**
 * Entry point of the media storage layer (TASK-049). Server-side only.
 *
 *   MEDIA_STORAGE_PROVIDER=supabase (default) → Supabase bucket, historical paths
 *   MEDIA_STORAGE_PROVIDER=r2                → Cloudflare R2, `images/<channel>/…`
 *
 * With `r2`, a missing / invalid R2 configuration throws: there is no silent
 * fallback to Supabase. Objects already stored stay where they are; their
 * location is read from their key (see isR2MediaKey) or URL, never the flag.
 */

export * from './types';
export { getMediaStorageProvider, isR2Configured, readR2Config } from './config';
export { isR2MediaKey, r2MediaFolder, r2MediaKey, resolveMediaKey, R2_MEDIA_PREFIXES, type MediaChannel } from './keys';

export interface MediaStorageDeps {
  env?: StorageEnv;
  fetch?: FetchLike;
}

/** R2 storage built from env; throws a MediaStorageError when not configured. */
export function createR2StorageFromEnv(deps: MediaStorageDeps = {}): MediaStorage {
  const config = readR2Config(deps.env);
  return createR2MediaStorage(config, createR2S3Client(config, { fetch: deps.fetch }));
}

/** R2 storage when configured, otherwise null (cleanup / copy of objects written under the r2 flag). */
export function getR2StorageIfConfigured(deps: MediaStorageDeps = {}): MediaStorage | null {
  return isR2Configured(deps.env) ? createR2StorageFromEnv(deps) : null;
}

/** The storage new public media are written to. `bucket` is the Supabase bucket used by the supabase provider. */
export function createMediaStorage(
  supabase: SupabaseClient,
  bucket: SupabaseMediaBucket,
  deps: MediaStorageDeps = {}
): MediaStorage {
  return getMediaStorageProvider(deps.env) === 'r2'
    ? createR2StorageFromEnv(deps)
    : createSupabaseMediaStorage(supabase, bucket);
}

/**
 * WordPress media reuse identity (TASK-FIX-060): R2 public URLs map to
 * `storage:<bucket>/<key>`, like Supabase URLs, so the mapping survives a
 * future change of the public domain.
 */
export function mediaSourceOptions(env: StorageEnv = process.env): SourceAssetOptions {
  const publicUrl = env.R2_PUBLIC_URL?.trim();
  const bucket = env.R2_BUCKET?.trim();
  return publicUrl && bucket ? { cdnOrigins: [{ baseUrl: publicUrl, bucket }] } : {};
}

/** The R2 object key behind a public R2 URL, or null for any other URL. */
export function r2KeyFromPublicUrl(url: string, env: StorageEnv = process.env): string | null {
  const base = env.R2_PUBLIC_URL?.trim().replace(/\/+$/, '');
  if (!base || !url.startsWith(`${base}/`)) return null;
  try {
    return decodeURIComponent(url.slice(base.length + 1).split(/[?#]/)[0]);
  } catch {
    return null;
  }
}

/**
 * Removes every R2 object under `folder` (e.g. `images/wordpress/<user>/<generation>`)
 * when R2 is configured — whatever the active provider, since objects written
 * under the r2 flag stay in R2. No-op without R2 settings. Throws on failure:
 * callers decide whether cleanup is best-effort.
 */
export async function removeR2Folder(folder: string, deps: MediaStorageDeps = {}): Promise<number> {
  const r2 = getR2StorageIfConfigured(deps);
  if (!r2) return 0;
  const keys = await r2.list(folder);
  if (keys.length > 0) await r2.remove(keys);
  return keys.length;
}
