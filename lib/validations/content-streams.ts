import { z } from 'zod';

export const contentStreamStatusSchema = z.enum(['active', 'warming', 'paused', 'archived']);

const nonNegativeInt = z.number().int('Must be a whole number').min(0, 'Must be zero or greater');

export const createContentStreamSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  wordpressCategoryId: z.string().uuid('Invalid category ID').nullable().optional(),
  targetPinsPerDay: nonNegativeInt.nullable().optional(),
  targetArticlesPerWeek: nonNegativeInt.nullable().optional(),
  targetBufferDays: nonNegativeInt.nullable().optional(),
  status: contentStreamStatusSchema.optional(),
});

export const updateContentStreamSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or less').optional(),
  wordpressCategoryId: z.string().uuid('Invalid category ID').nullable().optional(),
  targetPinsPerDay: nonNegativeInt.nullable().optional(),
  targetArticlesPerWeek: nonNegativeInt.nullable().optional(),
  targetBufferDays: nonNegativeInt.nullable().optional(),
  status: contentStreamStatusSchema.optional(),
});

export const linkContentStreamBoardSchema = z.object({
  contentStreamId: z.string().uuid('Invalid content stream ID'),
  boardId: z.string().uuid('Invalid board ID'),
});

export type CreateContentStreamInput = z.infer<typeof createContentStreamSchema>;
export type UpdateContentStreamInput = z.infer<typeof updateContentStreamSchema>;
export type LinkContentStreamBoardInput = z.infer<typeof linkContentStreamBoardSchema>;
