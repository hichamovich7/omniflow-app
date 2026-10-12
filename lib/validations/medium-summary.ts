import { z } from 'zod';
import { wordpressPostSourceSchema } from '@/lib/validations/wordpress-post-source';

/**
 * POST /api/social/medium-summary body (TASK-062, TASK-063): exactly one
 * source — an OmniFlow article (wordpress_generations.id), an existing post
 * of a connected WordPress site, or a Pinterest generation made from one of
 * those (generations.id).
 */
export const mediumSummaryRequestSchema = z.union([
  z.object({ wordpressArticleId: z.string().uuid('Invalid article ID') }).strict(),
  z.object({ wordpressPost: wordpressPostSourceSchema }).strict(),
  z.object({ pinterestGenerationId: z.string().uuid('Invalid Pinterest generation ID') }).strict(),
]);

export type MediumSummaryRequest = z.infer<typeof mediumSummaryRequestSchema>;
