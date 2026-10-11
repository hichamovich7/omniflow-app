import { z } from 'zod';

/** An existing post of a connected WordPress site, used as a Pinterest source. */
export const wordpressPostSourceSchema = z
  .object({
    siteId: z.string().uuid('Invalid WordPress connection ID'),
    postId: z.coerce.number().int('Invalid post ID').positive('Invalid post ID').max(2_147_483_647, 'Invalid post ID'),
  })
  .strict();

export type WordPressPostSource = z.infer<typeof wordpressPostSourceSchema>;

/** GET /api/wordpress/sites/[id]/posts query string. */
export const wordpressPostSearchSchema = z.object({
  search: z.string().trim().max(100, 'Search is too long').default(''),
  status: z.enum(['publish', 'draft']).default('publish'),
  page: z.coerce.number().int().min(1).max(50).default(1),
});

export type WordPressPostSearch = z.infer<typeof wordpressPostSearchSchema>;

export const WORDPRESS_POST_SEARCH_PAGE_SIZE = 10;
