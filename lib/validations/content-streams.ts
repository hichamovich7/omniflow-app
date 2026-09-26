import { z } from 'zod';

export const contentStreamStatusSchema = z.enum(['active', 'planned', 'warming', 'paused', 'archived']);

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

export const publishingActivitySourceSchema = z.enum(['manual', 'external']);
export const publishingActivityStatusSchema = z.enum(['published', 'expected']);

/** Local calendar day, YYYY-MM-DD, that actually exists (rejects 2026-02-30). */
const dayKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  }, 'Invalid date');

export const MAX_PUBLISHING_ACTIVITY_NOTE = 500;

export const upsertPublishingActivitySchema = z.object({
  activityDate: dayKeySchema,
  publishedCount: z.number().int('Must be a whole number').min(0, 'Must be zero or greater').max(1000, 'Must be 1000 or less'),
  // Empty / whitespace-only note is stored as null.
  note: z
    .string()
    .trim()
    .max(MAX_PUBLISHING_ACTIVITY_NOTE, `Note must be ${MAX_PUBLISHING_ACTIVITY_NOTE} characters or less`)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
  source: publishingActivitySourceSchema.default('manual'),
  // Omitted → derived from the date (future = expected, today or earlier = published).
  status: publishingActivityStatusSchema.optional(),
});

export const deletePublishingActivitySchema = z.object({
  activityDate: dayKeySchema,
});

export type CreateContentStreamInput = z.infer<typeof createContentStreamSchema>;
export type UpdateContentStreamInput = z.infer<typeof updateContentStreamSchema>;
export type LinkContentStreamBoardInput = z.infer<typeof linkContentStreamBoardSchema>;
export type UpsertPublishingActivityInput = z.infer<typeof upsertPublishingActivitySchema>;
export type DeletePublishingActivityInput = z.infer<typeof deletePublishingActivitySchema>;
