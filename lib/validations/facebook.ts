import { z } from 'zod';
import { containsFacebookUrl } from '@/lib/social/facebook-text';
import { FACEBOOK_LINK_PLACEMENTS } from '@/lib/social/social-content';
import { isValidTimeZone, SCHEDULE_DATE_PATTERN, SCHEDULE_TIME_PATTERN } from '@/lib/social/schedule-time';

/**
 * Facebook (TASK-068) request bodies. Sources are the same three as Medium
 * (lib/validations/medium-summary.ts). No field ever accepts a URL: the
 * only link is the validated WordPress permalink, added by OmniFlow.
 */

export { mediumSummaryRequestSchema as facebookPostRequestSchema } from '@/lib/validations/medium-summary';

export const FACEBOOK_EDIT_LIMITS = { post: 3000, callToAction: 160, firstCommentText: 160 } as const;

function textField(label: string, max: number, required: boolean) {
  const base = z.string().trim().max(max, `${label} is too long (max ${max} characters)`);
  return (required ? base.min(1, `${label} is required`) : base).refine((value) => !containsFacebookUrl(value), {
    message: `${label}: remove the link — OmniFlow adds the article link itself.`,
  });
}

/** PATCH /api/social/generations/[id] — edit a Facebook post before it is published. */
export const facebookPostUpdateSchema = z
  .object({
    post: textField('Post text', FACEBOOK_EDIT_LIMITS.post, true),
    callToAction: textField('Call to action', FACEBOOK_EDIT_LIMITS.callToAction, false),
    firstCommentText: textField('First comment text', FACEBOOK_EDIT_LIMITS.firstCommentText, false),
    linkPlacement: z.enum(FACEBOOK_LINK_PLACEMENTS, { message: 'Invalid link option' }),
  })
  .strict();

export type FacebookPostUpdate = z.infer<typeof facebookPostUpdateSchema>;

/** POST /api/social/generations/[id]/publish — explicit confirmation and the Page the user saw. */
export const facebookPublishSchema = z
  .object({
    connectionId: z.string().uuid('Choose a connected Facebook Page'),
    confirm: z.literal(true, { message: 'Confirm the publication first' }),
  })
  .strict();

/** POST /api/social/publications/[id]/retry and /retry-comment. */
export const facebookRetrySchema = z.object({ confirm: z.literal(true, { message: 'Confirm first' }) }).strict();

export const facebookProjectQuerySchema = z.object({ projectId: z.string().uuid('Invalid project ID') });

/** POST /api/social/connections/facebook/select. */
export const facebookSelectPageSchema = z
  .object({
    projectId: z.string().uuid('Invalid project ID'),
    pageId: z.string().regex(/^\d{1,32}$/, 'Invalid Facebook Page'),
  })
  .strict();

// TASK-100 — scheduling. The wall-clock date + time are converted to UTC on
// the server, in the explicit IANA zone (lib/social/schedule-time.ts).
const scheduleWhen = {
  date: z.string().regex(SCHEDULE_DATE_PATTERN, 'Choose a date'),
  time: z.string().regex(SCHEDULE_TIME_PATTERN, 'Choose a time (HH:MM)'),
  timeZone: z.string().trim().min(1, 'Choose a time zone').max(64, 'Choose a valid time zone').refine(isValidTimeZone, { message: 'Choose a valid time zone' }),
};

/** POST /api/social/generations/[id]/schedule — the Page the person saw, the time, and an explicit confirmation. */
export const facebookScheduleSchema = z
  .object({
    connectionId: z.string().uuid('Choose a connected Facebook Page'),
    ...scheduleWhen,
    confirm: z.literal(true, { message: 'Confirm the schedule first' }),
  })
  .strict();

/** PATCH /api/social/publications/[id]/schedule — new time for a post still scheduled. */
export const facebookRescheduleSchema = z
  .object({
    ...scheduleWhen,
    confirm: z.literal(true, { message: 'Confirm the new time first' }),
  })
  .strict();

/** POST /api/social/publications/[id]/cancel. */
export const facebookCancelScheduleSchema = facebookRetrySchema;
