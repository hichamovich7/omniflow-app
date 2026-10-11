import { MediaStorageError, type MediaStorageProviderName } from './types';

/**
 * Object key layout (TASK-049). R2 keys are prefixed by media type and
 * channel; the "folders" are virtual and appear with the first object.
 * Supabase keeps its historical paths (`<user>/<pin>/<version>.png`,
 * `<user>/<generation>/<MARKER>.png`) so old URLs and code paths never change.
 */
export const R2_MEDIA_PREFIXES = {
  pinterest: 'images/pinterest',
  wordpress: 'images/wordpress',
  facebookImage: 'images/facebook',
  reels: 'videos/reels',
  facebookVideo: 'videos/facebook',
  tiktok: 'videos/tiktok',
} as const;

export type MediaChannel = keyof typeof R2_MEDIA_PREFIXES;

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function assertSegment(segment: string): void {
  if (!SAFE_SEGMENT.test(segment) || segment.includes('..')) {
    throw new MediaStorageError(`Invalid media key segment: ${JSON.stringify(segment)}`, 'r2', 'key');
  }
}

/** Folder of one piece of content: `<prefix>/<ownerId>/<groupId>` (no trailing slash). */
export function r2MediaFolder(channel: MediaChannel, ownerId: string, groupId: string): string {
  assertSegment(ownerId);
  assertSegment(groupId);
  return `${R2_MEDIA_PREFIXES[channel]}/${ownerId}/${groupId}`;
}

/** `<prefix>/<ownerId>/<groupId>/<fileName>`; fileName may contain sub-folders (`<pin>/<version>.png`). */
export function r2MediaKey(channel: MediaChannel, ownerId: string, groupId: string, fileName: string): string {
  const parts = fileName.split('/');
  parts.forEach(assertSegment);
  return `${r2MediaFolder(channel, ownerId, groupId)}/${parts.join('/')}`;
}

/** Keys written by the R2 provider start with `images/` or `videos/`; Supabase paths start with a user id. */
export function isR2MediaKey(path: string): boolean {
  return /^(images|videos)\//.test(path);
}

/** The key for the active provider: R2 layout, or the unchanged Supabase path. */
export function resolveMediaKey(
  provider: MediaStorageProviderName,
  r2: { channel: MediaChannel; ownerId: string; groupId: string; fileName: string },
  supabasePath: string
): string {
  return provider === 'r2' ? r2MediaKey(r2.channel, r2.ownerId, r2.groupId, r2.fileName) : supabasePath;
}
