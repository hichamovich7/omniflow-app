import { z } from 'zod';

export const EXPORT_FORMATS = ['html', 'markdown'] as const;

export const exportArticleSchema = z.object({
  format: z.enum(EXPORT_FORMATS),
  includeInternalLinks: z.boolean(),
});

export type ExportArticleInput = z.infer<typeof exportArticleSchema>;
