import { z } from 'zod';

export const contentStreamStatusSchema = z.enum(['active', 'planned', 'warming', 'paused', 'archived']);

const nonNegativeInt = z.number().int('Must be a whole number').min(0, 'Must be zero or greater');

export const MAX_STREAM_DESTINATIONS = 50;
export const DESTINATION_WEIGHT_MIN = 1;
export const DESTINATION_WEIGHT_MAX = 100;

/**
 * TASK-091: one Pinterest destination of a Content Stream (a
 * content_stream_boards row) — a board, optionally one of its sections.
 */
export const streamDestinationSchema = z.object({
  boardId: z.string().uuid('Invalid board ID'),
  sectionId: z.string().uuid('Invalid section ID').nullable().optional(),
  isPrimary: z.boolean().default(false),
  isActive: z.boolean().default(true),
  weight: z
    .number()
    .int('Weight must be a whole number')
    .min(DESTINATION_WEIGHT_MIN, `Weight must be between ${DESTINATION_WEIGHT_MIN} and ${DESTINATION_WEIGHT_MAX}`)
    .max(DESTINATION_WEIGHT_MAX, `Weight must be between ${DESTINATION_WEIGHT_MIN} and ${DESTINATION_WEIGHT_MAX}`)
    .default(1),
});

/**
 * The full destination list of a stream (replaces the stored one). Same
 * rules as the database (migration 047): no duplicate board + section, at
 * most one primary, a primary is active. A list with active destinations but
 * no primary is completed by normalizeStreamDestinations() (first active).
 */
export const streamDestinationsSchema = z
  .array(streamDestinationSchema)
  .max(MAX_STREAM_DESTINATIONS, `A Content Stream can have at most ${MAX_STREAM_DESTINATIONS} destinations`)
  .superRefine((destinations, ctx) => {
    const seen = new Set<string>();
    destinations.forEach((destination, index) => {
      const key = `${destination.boardId}:${destination.sectionId ?? ''}`;
      if (seen.has(key)) {
        ctx.addIssue({ code: 'custom', path: [index], message: 'The same board and section is listed twice.' });
      }
      seen.add(key);
      if (destination.isPrimary && !destination.isActive) {
        ctx.addIssue({ code: 'custom', path: [index], message: 'The primary destination must be active.' });
      }
    });
    if (destinations.filter((destination) => destination.isPrimary).length > 1) {
      ctx.addIssue({ code: 'custom', path: [], message: 'Only one destination can be primary.' });
    }
  });

export type StreamDestinationInput = z.infer<typeof streamDestinationSchema>;

/** First active destination becomes primary when none is; order is kept. */
export function normalizeStreamDestinations(destinations: StreamDestinationInput[]): StreamDestinationInput[] {
  const normalized = destinations.map((destination) => ({ ...destination, sectionId: destination.sectionId ?? null }));
  if (normalized.some((destination) => destination.isPrimary)) return normalized;
  const firstActive = normalized.findIndex((destination) => destination.isActive);
  if (firstActive >= 0) normalized[firstActive] = { ...normalized[firstActive], isPrimary: true };
  return normalized;
}

export const createContentStreamSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  wordpressCategoryId: z.string().uuid('Invalid category ID').nullable().optional(),
  targetPinsPerDay: nonNegativeInt.nullable().optional(),
  targetArticlesPerWeek: nonNegativeInt.nullable().optional(),
  targetBufferDays: nonNegativeInt.nullable().optional(),
  status: contentStreamStatusSchema.optional(),
  // TASK-091: null / absent = legacy stream, not linked to a Pinterest account.
  pinterestAccountId: z.string().uuid('Invalid Pinterest account ID').nullable().optional(),
  destinations: streamDestinationsSchema.optional(),
});

export const updateContentStreamSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or less').optional(),
  wordpressCategoryId: z.string().uuid('Invalid category ID').nullable().optional(),
  targetPinsPerDay: nonNegativeInt.nullable().optional(),
  targetArticlesPerWeek: nonNegativeInt.nullable().optional(),
  targetBufferDays: nonNegativeInt.nullable().optional(),
  status: contentStreamStatusSchema.optional(),
  pinterestAccountId: z.string().uuid('Invalid Pinterest account ID').nullable().optional(),
  // Provided = replaces every destination of the stream; absent = unchanged.
  destinations: streamDestinationsSchema.optional(),
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
    // UTC calendar arithmetic: a pure date check, independent of any zone / DST.
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
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
