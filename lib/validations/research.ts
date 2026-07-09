import { z } from 'zod';

// 'pinterest' is intentionally excluded: Firecrawl does not support scraping
// pinterest.com ("we do not support this site", 403, confirmed via live testing) —
// every Pinterest URL research submitted was guaranteed to fail. Historical
// 'pinterest' rows still exist and are still readable/displayable; only new
// submissions are blocked here.
const RESEARCH_SOURCE_TYPES = ['keyword', 'website', 'blog'] as const;
const URL_SOURCE_TYPES = new Set(['website', 'blog']);

export const createResearchSchema = z
  .object({
    projectId: z.string().uuid('Invalid project ID'),
    sourceType: z.enum(RESEARCH_SOURCE_TYPES, { message: 'Invalid source type' }),
    input: z.string().trim().min(1, 'Input is required').max(500, 'Input is too long'),
  })
  .refine(
    (data) => !URL_SOURCE_TYPES.has(data.sourceType) || z.string().url().safeParse(data.input).success,
    { message: 'A valid URL is required for this source type', path: ['input'] }
  );

export type CreateResearchInput = z.infer<typeof createResearchSchema>;
