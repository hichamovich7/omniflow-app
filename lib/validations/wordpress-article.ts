import { z } from 'zod';

export const updateArticleCategorySchema = z.object({
  categoryId: z.string().uuid().nullable(),
});

export type UpdateArticleCategoryInput = z.infer<typeof updateArticleCategorySchema>;
