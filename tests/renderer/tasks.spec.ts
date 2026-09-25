import { expect, test } from 'playwright/test';
import { createTaskSchema, updateTaskSchema, weeklyReviewActionSchema } from '@/lib/validations/tasks';
import { MAX_PINNED_TASKS, TaskError, canPinAnother, isOwnedBy, taskErrorStatus } from '@/lib/queries/tasks';

/**
 * API contract for /api/tasks and /api/tasks/weekly-review (TASK-FIX-042).
 * Offline: the Zod layer every route parses with, and the pure checks that
 * gate every write. RLS / CHECK constraints need a live Postgres (see
 * docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md §15).
 */
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

test.describe('createTaskSchema', () => {
  test('a manual priority needs only a title', () => {
    const parsed = createTaskSchema.parse({ title: '  Write the Sunday post  ' });
    expect(parsed).toMatchObject({ title: 'Write the Sunday post', source: 'manual', type: 'custom', priority: 'medium', pinnedToToday: false });
  });

  test('accepts an accepted recommendation (source automatic) with references', () => {
    const parsed = createTaskSchema.safeParse({
      title: 'Create 20 Crochet Sweaters Pins',
      source: 'automatic',
      type: 'content_creation',
      projectId: PROJECT_ID,
      contentStreamId: PROJECT_ID,
      boardId: PROJECT_ID,
      pinnedToToday: true,
    });
    expect(parsed.success).toBe(true);
  });

  test('rejects empty titles, recurring source, weekly_review type and bad ids', () => {
    expect(createTaskSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'x', source: 'recurring' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'x', type: 'weekly_review' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'x', projectId: 'not-a-uuid' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'x', dueDate: '25/09/2026' }).success).toBe(false);
  });
});

test.describe('updateTaskSchema', () => {
  test('a client can never set a task back to suggested', () => {
    expect(updateTaskSchema.safeParse({ status: 'suggested' }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ status: 'completed' }).success).toBe(true);
    expect(updateTaskSchema.safeParse({ status: 'cancelled' }).success).toBe(true); // soft delete
  });

  test('an empty patch is rejected', () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
  });
});

test.describe('weekly review actions', () => {
  test('accepts start / complete / reopen only', () => {
    expect(weeklyReviewActionSchema.safeParse({ action: 'start' }).success).toBe(true);
    expect(weeklyReviewActionSchema.safeParse({ action: 'complete', occurrenceDate: '2026-09-27' }).success).toBe(true);
    expect(weeklyReviewActionSchema.safeParse({ action: 'delete' }).success).toBe(false);
  });
});

test.describe('ownership and pin-limit guards', () => {
  test('a referenced row must exist and belong to the caller', () => {
    expect(isOwnedBy({ user_id: 'u1' }, 'u1')).toBe(true);
    expect(isOwnedBy({ user_id: 'u2' }, 'u1')).toBe(false);
    expect(isOwnedBy(null, 'u1')).toBe(false);
  });

  test('at most three open pinned priorities, unless one is explicitly replaced', () => {
    expect(MAX_PINNED_TASKS).toBe(3);
    expect(canPinAnother(2, false)).toBe(true);
    expect(canPinAnother(3, false)).toBe(false);
    expect(canPinAnother(3, true)).toBe(true);
  });

  test('error codes map to HTTP statuses', () => {
    expect(taskErrorStatus(new TaskError('priorities_full', ''))).toBe(409);
    expect(taskErrorStatus(new TaskError('not_found', ''))).toBe(404);
    expect(taskErrorStatus(new TaskError('project_forbidden', ''))).toBe(400);
  });
});
