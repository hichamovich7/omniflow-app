import { z } from 'zod';
import { wordpressPostSourceSchema } from '@/lib/validations/wordpress-post-source';

/**
 * POST /api/social/medium-summary body (TASK-062): exactly one source — an
 * OmniFlow article (wordpress_generations.id) or an existing post of a
 * connected WordPress site.
 */
export const mediumSummaryRequestSchema = z.union([
  z.object({ wordpressArticleId: z.string().uuid('Invalid article ID') }).strict(),
  z.object({ wordpressPost: wordpressPostSourceSchema }).strict(),
]);

export type MediumSummaryRequest = z.infer<typeof mediumSummaryRequestSchema>;
