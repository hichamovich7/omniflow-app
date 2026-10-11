import { r2MediaKey } from '@/lib/storage/keys';
import type { MediaStorageProviderName } from '@/lib/storage/types';

export function getPinImageStoragePath(
  userId: string,
  pinId: string,
  version: number
): string {
  return `${userId}/${pinId}/${version}.png`;
}

/**
 * Key of a Pin image version for the active provider (TASK-049):
 *   supabase → `<user>/<pin>/<version>.<ext>` (unchanged)
 *   r2       → `images/pinterest/<user>/<generation>/<pin>/<version>.<ext>`
 */
export function getPinImageObjectKey(
  provider: MediaStorageProviderName,
  params: { userId: string; generationId: string; pinId: string; version: number; extension?: string }
): string {
  const fileName = `${params.version}.${params.extension ?? 'png'}`;
  return provider === 'r2'
    ? r2MediaKey('pinterest', params.userId, params.generationId, `${params.pinId}/${fileName}`)
    : `${params.userId}/${params.pinId}/${fileName}`;
}

const R2_PIN_KEY = /^images\/pinterest\/([^/]+)\/[^/]+\/([^/]+)\/([^/]+)$/;

/**
 * Private recomposition source of a Pin image — always in the Supabase
 * `generated-images` bucket, never in the public R2 bucket. An R2 image key
 * maps back to the historical Supabase layout `<user>/<pin>/<version>.source.<ext>`.
 */
export function getPinSourceStoragePath(storagePath: string): string {
  const r2 = R2_PIN_KEY.exec(storagePath);
  const path = r2 ? `${r2[1]}/${r2[2]}/${r2[3]}` : storagePath;
  const extensionIndex = path.lastIndexOf('.');
  if (extensionIndex === -1) return `${path}.source`;
  return `${path.slice(0, extensionIndex)}.source${path.slice(extensionIndex)}`;
}
