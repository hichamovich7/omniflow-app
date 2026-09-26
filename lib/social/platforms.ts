/**
 * Social Content Studio platforms (TASK-044). Single source of truth for
 * which platforms exist on the article review page and which one can
 * actually generate. Only `available` platforms are accepted by
 * POST /api/wordpress/[id]/social — the others are display-only: no API
 * call, no AI call, no database write.
 */
export const SOCIAL_PLATFORM_IDS = ['pinterest', 'facebook', 'instagram', 'reels', 'tiktok', 'medium'] as const;
export type SocialPlatformId = (typeof SOCIAL_PLATFORM_IDS)[number];

export type SocialPlatformStatus = 'available' | 'coming_soon' | 'planned';

export interface SocialPlatform {
  id: SocialPlatformId;
  label: string;
  status: SocialPlatformStatus;
  description: string;
}

export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  {
    id: 'pinterest',
    label: 'Pinterest',
    status: 'available',
    description: 'Pin titles, descriptions, keywords and board ideas from this article.',
  },
  { id: 'facebook', label: 'Facebook', status: 'coming_soon', description: 'Post text with a hook and a call to action.' },
  { id: 'instagram', label: 'Instagram', status: 'planned', description: 'Caption, hashtags and alt text.' },
  { id: 'reels', label: 'Reels', status: 'planned', description: 'Short video script: hook, scenes, voice-over.' },
  { id: 'tiktok', label: 'TikTok', status: 'planned', description: 'Short video script: hook, scenes, caption.' },
  { id: 'medium', label: 'Medium', status: 'planned', description: 'Adapted article with a canonical link.' },
];

export const SOCIAL_PLATFORM_STATUS_LABELS: Record<SocialPlatformStatus, string> = {
  available: 'Available',
  coming_soon: 'Coming soon',
  planned: 'Planned',
};

export function isSocialPlatformAvailable(id: SocialPlatformId): boolean {
  return SOCIAL_PLATFORMS.some((platform) => platform.id === id && platform.status === 'available');
}

/** Accessible explanation shown for a platform that cannot generate yet. */
export function unavailablePlatformMessage(platform: Pick<SocialPlatform, 'label' | 'status'>): string {
  return platform.status === 'coming_soon'
    ? `${platform.label} content generation is coming soon.`
    : `${platform.label} content generation is planned and will be available in a later release.`;
}
