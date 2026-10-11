import type { MediaChannel } from '@/lib/storage/keys';

/**
 * Media profiles (TASK-050) — the single place output dimensions, formats and
 * quality are defined. Routes and components never hard-code them.
 *
 * Only `active` profiles may be used by optimizeImage(). `planned` profiles
 * (Facebook, Instagram, TikTok / Reels) are configuration only: no pipeline
 * produces them yet, and one image is stored per use — never a set of
 * variants "just in case".
 */

export type MediaPlatform = 'pinterest' | 'wordpress' | 'facebook' | 'instagram' | 'tiktok' | 'reels';
export type MediaImageFormat = 'jpeg' | 'webp' | 'png';
export type MediaProfileStatus = 'active' | 'planned';

export type MediaResize =
  /** Exact output size, scaled down only (a smaller image keeps its size). */
  | { mode: 'exact'; width: number; height: number; fit: 'cover'; maxAspectDeviation: number }
  /** Longest sides capped, aspect ratio kept, scaled down only. */
  | { mode: 'max'; maxWidth: number; maxHeight: number; fit: 'inside' };

export interface MediaProfile {
  id: MediaProfileId;
  platform: MediaPlatform;
  purpose: string;
  status: MediaProfileStatus;
  resize: MediaResize;
  format: MediaImageFormat;
  /** Encoder quality (1-100). */
  quality: number;
  /** Lowest quality tried, step by step, to fit under maxBytes before failing. */
  minQuality: number;
  maxBytes: number;
  /** `flatten` paints transparent pixels on `background` (JPEG has no alpha); `preserve` keeps alpha. */
  transparency: { mode: 'flatten'; background: string } | { mode: 'preserve' };
  extension: 'jpg' | 'webp' | 'png';
  contentType: 'image/jpeg' | 'image/webp' | 'image/png';
  /** Explicit, logged fallback used only when encoding to `format` fails. */
  fallbackProfileId?: MediaProfileId;
  /** R2 prefix the result is stored under. */
  storageChannel: MediaChannel;
}

const MB = 1024 * 1024;
const WHITE = '#ffffff';

const jpeg = { format: 'jpeg', extension: 'jpg', contentType: 'image/jpeg' } as const;
const webp = { format: 'webp', extension: 'webp', contentType: 'image/webp' } as const;

function planned(
  id: MediaProfileId,
  platform: MediaPlatform,
  purpose: string,
  width: number,
  height: number,
  storageChannel: MediaChannel
): MediaProfile {
  return {
    id,
    platform,
    purpose,
    status: 'planned',
    resize: { mode: 'exact', width, height, fit: 'cover', maxAspectDeviation: 0.02 },
    ...jpeg,
    quality: 88,
    minQuality: 72,
    maxBytes: 4 * MB,
    transparency: { mode: 'flatten', background: WHITE },
    storageChannel,
  };
}

export const MEDIA_PROFILE_IDS = [
  'pinterest-pin',
  'wordpress-article',
  'wordpress-article-jpeg',
  'facebook-feed-portrait',
  'facebook-feed-square',
  'facebook-story',
  'facebook-cover',
  'instagram-post-portrait',
  'instagram-post-square',
  'instagram-story-reel',
  'tiktok-vertical',
  'reels-vertical',
] as const;
export type MediaProfileId = (typeof MEDIA_PROFILE_IDS)[number];

export const MEDIA_PROFILES: Record<MediaProfileId, MediaProfile> = {
  // ---------------------------------------------------------------- active
  'pinterest-pin': {
    id: 'pinterest-pin',
    platform: 'pinterest',
    purpose: 'Pin image (2:3)',
    status: 'active',
    // Provider images are 1024x1536 (2:3): a plain downscale, no crop. More
    // than 1 % off 2:3 is refused instead of cropping text or subjects.
    resize: { mode: 'exact', width: 1000, height: 1500, fit: 'cover', maxAspectDeviation: 0.01 },
    ...jpeg,
    quality: 88,
    minQuality: 76,
    maxBytes: 2 * MB,
    transparency: { mode: 'flatten', background: WHITE },
    storageChannel: 'pinterest',
  },
  'wordpress-article': {
    id: 'wordpress-article',
    platform: 'wordpress',
    purpose: 'Article featured / internal image',
    status: 'active',
    resize: { mode: 'max', maxWidth: 1600, maxHeight: 1600, fit: 'inside' },
    // WebP uploads are accepted by WordPress core since 5.8.
    ...webp,
    quality: 85,
    minQuality: 70,
    maxBytes: 1.5 * MB,
    transparency: { mode: 'preserve' },
    fallbackProfileId: 'wordpress-article-jpeg',
    storageChannel: 'wordpress',
  },
  'wordpress-article-jpeg': {
    id: 'wordpress-article-jpeg',
    platform: 'wordpress',
    purpose: 'Explicit JPEG fallback of wordpress-article',
    status: 'active',
    resize: { mode: 'max', maxWidth: 1600, maxHeight: 1600, fit: 'inside' },
    ...jpeg,
    quality: 85,
    minQuality: 70,
    maxBytes: 1.5 * MB,
    transparency: { mode: 'flatten', background: WHITE },
    storageChannel: 'wordpress',
  },

  // --------------------------------------------- planned (configuration only)
  'facebook-feed-portrait': planned('facebook-feed-portrait', 'facebook', 'Feed, vertical', 1080, 1359, 'facebookImage'),
  'facebook-feed-square': planned('facebook-feed-square', 'facebook', 'Feed, square', 1080, 1080, 'facebookImage'),
  'facebook-story': planned('facebook-story', 'facebook', 'Story', 1080, 1920, 'facebookImage'),
  'facebook-cover': planned('facebook-cover', 'facebook', 'Page cover', 851, 315, 'facebookImage'),
  'instagram-post-portrait': planned('instagram-post-portrait', 'instagram', 'Post, vertical', 1080, 1350, 'instagramImage'),
  'instagram-post-square': planned('instagram-post-square', 'instagram', 'Post, square', 1080, 1080, 'instagramImage'),
  'instagram-story-reel': planned('instagram-story-reel', 'instagram', 'Story / Reel cover', 1080, 1920, 'instagramImage'),
  'tiktok-vertical': planned('tiktok-vertical', 'tiktok', 'Vertical cover', 1080, 1920, 'tiktok'),
  'reels-vertical': planned('reels-vertical', 'reels', 'Vertical cover', 1080, 1920, 'reels'),
};

export function getMediaProfile(id: MediaProfileId): MediaProfile {
  return MEDIA_PROFILES[id];
}

export function listMediaProfiles(status?: MediaProfileStatus): MediaProfile[] {
  return MEDIA_PROFILE_IDS.map((id) => MEDIA_PROFILES[id]).filter((p) => !status || p.status === status);
}
