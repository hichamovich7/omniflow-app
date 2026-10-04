import { z } from 'zod';

// POST /api/wordpress/[id]/rewrite. `confirm: true` is the explicit
// confirmation given in the "Rewrite article" dialog — a request without it
// never reaches the AI.
export const REWRITE_CONFIRM_REQUIRED_MESSAGE = 'Confirm the rewrite before starting it.';

export const rewriteArticleSchema = z
  .object({
    confirm: z.literal(true, { error: REWRITE_CONFIRM_REQUIRED_MESSAGE }),
  })
  .strict();

export type RewriteArticleRequest = z.infer<typeof rewriteArticleSchema>;
