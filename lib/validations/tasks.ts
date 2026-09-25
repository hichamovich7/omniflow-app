import { z } from 'zod';
import { TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } from '@/types/tasks';

const title = z.string().trim().min(1, 'Title is required').max(200, 'Title must be 200 characters or less');
const optionalUuid = (label: string) => z.string().uuid(`Invalid ${label} ID`).nullable().optional();
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format');

/**
 * Client-created tasks are only ever `manual` (typed by the user) or
 * `automatic` (a dashboard recommendation the user explicitly clicked "Add
 * to priorities" on — that click *is* the acceptance, so it lands as
 * `pending`, never `suggested`). `recurring` routines are created
 * server-side only (weekly review route).
 */
export const createTaskSchema = z.object({
  title,
  description: z.string().trim().max(1000, 'Description must be 1000 characters or less').nullable().optional(),
  source: z.enum(['manual', 'automatic']).default('manual'),
  type: z.enum(TASK_TYPES).exclude(['weekly_review']).default('custom'),
  projectId: optionalUuid('project'),
  contentStreamId: optionalUuid('content stream'),
  boardId: optionalUuid('board'),
  dueDate: dayKey.nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  pinnedToToday: z.boolean().default(false),
  /** Explicit, user-chosen priority to unpin when today's list is full — never automatic eviction (§8). */
  replaceTaskId: z.string().uuid('Invalid task ID').optional(),
});

/** Statuses a user can move a task to directly. `suggested` is never set by a client. */
const userSettableTaskStatus = z.enum(TASK_STATUSES).exclude(['suggested']);

export const updateTaskSchema = z
  .object({
    title: title.optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    projectId: optionalUuid('project'),
    dueDate: dayKey.nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    status: userSettableTaskStatus.optional(),
    pinnedToToday: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

export const weeklyReviewActionSchema = z.object({
  action: z.enum(['start', 'complete', 'reopen']),
  /** The Sunday this action applies to (local calendar day, YYYY-MM-DD). Required for complete/reopen. */
  occurrenceDate: dayKey.optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type WeeklyReviewActionInput = z.infer<typeof weeklyReviewActionSchema>;
