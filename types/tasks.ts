/**
 * Command Center tasks (migrations 033/034). Shapes mirror the columns in
 * docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md §5.3 / §5.4 exactly.
 */

export const TASK_SOURCES = ['manual', 'automatic', 'recurring'] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

/** §11 §7 — 11 initial values, expected to grow (Zod-validated, no DB CHECK). */
export const TASK_TYPES = [
  'content_creation',
  'pinterest_publishing',
  'wordpress_article',
  'account_warming',
  'keyword_research',
  'account_analysis',
  'digital_product',
  'niche_research',
  'maintenance',
  'custom',
  'weekly_review',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

/** §5.3 status mapping — `cancelled` is the soft delete (§11 §5). */
export const TASK_STATUSES = ['suggested', 'pending', 'scheduled', 'completed', 'skipped', 'postponed', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface Task {
  id: string;
  user_id: string;
  project_id: string | null;
  content_stream_id: string | null;
  board_id: string | null;
  title: string;
  description: string | null;
  source: TaskSource;
  type: TaskType;
  due_date: string | null;
  scheduled_at: string | null;
  estimated_minutes: number | null;
  priority: TaskPriority;
  status: TaskStatus;
  recurrence_rule: string | null;
  pinned_to_today: boolean;
  created_by_user: boolean;
  completed_at: string | null;
  skipped_at: string | null;
  created_at: string;
  updated_at: string;
}

export const TASK_OCCURRENCE_STATUSES = ['pending', 'scheduled', 'completed', 'skipped'] as const;
export type TaskOccurrenceStatus = (typeof TASK_OCCURRENCE_STATUSES)[number];

export interface TaskOccurrence {
  id: string;
  task_id: string;
  user_id: string;
  occurrence_date: string;
  status: TaskOccurrenceStatus;
  scheduled_at: string | null;
  pinned_to_today: boolean;
  completed_at: string | null;
  skipped_at: string | null;
  created_at: string;
}

/** Recurrence rule of the Sunday analytics review routine (RRULE-like string, §5.3). */
export const WEEKLY_REVIEW_RECURRENCE_RULE = 'FREQ=WEEKLY;BYDAY=SU';
