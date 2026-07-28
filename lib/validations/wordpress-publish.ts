import { z } from 'zod';

export const PUBLISH_MODES = ['draft', 'now', 'schedule'] as const;
export type PublishMode = (typeof PUBLISH_MODES)[number];

export const publishArticleSchema = z
  .object({
    mode: z.enum(PUBLISH_MODES),
    scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format').optional(),
    scheduledTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format').optional(),
  })
  .refine(
    (data) => {
      if (data.mode !== 'schedule') return true;
      if (!data.scheduledDate || !data.scheduledTime) return false;
      const [year, month, day] = data.scheduledDate.split('-').map(Number);
      const [hours, minutes] = data.scheduledTime.split(':').map(Number);
      const scheduledAt = new Date(year, month - 1, day, hours, minutes);
      return scheduledAt.getTime() > Date.now();
    },
    { message: 'Choose a date and time in the future to schedule this post' }
  );

export type PublishArticleInput = z.infer<typeof publishArticleSchema>;
