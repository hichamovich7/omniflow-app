import { z } from 'zod';
import { SOCIAL_PLATFORMS } from '@/lib/social/platforms';

const AVAILABLE_PLATFORM_IDS = SOCIAL_PLATFORMS.filter((p) => p.status === 'available').map((p) => p.id);

/**
 * POST /api/wordpress/[id]/social (TASK-044). Only platforms whose status is
 * `available` in lib/social/platforms.ts are accepted; Coming soon / Planned
 * platforms are rejected before any database read or AI call.
 */
export const generateSocialContentSchema = z
  .object({
    platform: z.string().refine((value) => (AVAILABLE_PLATFORM_IDS as string[]).includes(value), {
      message: 'This platform is not available yet',
    }),
  })
  .strict();

export type GenerateSocialContentInput = z.infer<typeof generateSocialContentSchema>;
