import { z } from 'zod';

export const createWordPressCategorySchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  name: z.string().trim().min(1, 'Name is required').max(60, 'Name must be 60 characters or less'),
});

export const updateWordPressCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60, 'Name must be 60 characters or less').optional(),
  wpCategoryId: z.number().int().nullable().optional(),
});

export type CreateWordPressCategoryInput = z.infer<typeof createWordPressCategorySchema>;
export type UpdateWordPressCategoryInput = z.infer<typeof updateWordPressCategorySchema>;
