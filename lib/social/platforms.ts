/**
 * Social Content Studio platforms (TASK-044). Single source of truth for
 * which platforms exist on the article review page and which one can
 * actually generate. Only `available` platforms get an action (Pinterest
 * opens /pinterest/create?source=wordpress; Medium generates a summary on
 * the page, TASK-062; Facebook generates a Page post, TASK-068) — the
 * others are display-only: no API call, no AI call, no database write.
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
    description: 'Saved Pins (title, description, keywords, board, image prompt) written from this article.',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    status: 'available',
    description: 'A Facebook Page post (text, call to action, article image), to review, edit and publish to your connected Page.',
  },
  { id: 'instagram', label: 'Instagram', status: 'coming_soon', description: 'Caption, hashtags and alt text.' },
  { id: 'reels', label: 'Reels', status: 'coming_soon', description: 'Short video script: hook, scenes, voice-over.' },
  { id: 'tiktok', label: 'TikTok', status: 'coming_soon', description: 'Short video script: hook, scenes, caption.' },
  {
    id: 'medium',
    label: 'Medium',
    status: 'available',
    description: 'A 300-600-word summary with a link to the published article, to copy or download (never published).',
  },
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
