import type { SupabaseClient } from '@supabase/supabase-js';
import type { Task, TaskOccurrence } from '@/types/tasks';
import { WEEKLY_REVIEW_RECURRENCE_RULE } from '@/types/tasks';
import type { CreateTaskInput, UpdateTaskInput } from '@/lib/validations/tasks';
import { OPEN_TASK_STATUSES } from '@/lib/dashboard/build-command-center';

/** Max pinned priorities (§8) — enforced here, never by silently evicting one. */
export const MAX_PINNED_TASKS = 3;

export type TaskErrorCode = 'project_forbidden' | 'content_stream_forbidden' | 'board_forbidden' | 'not_found' | 'priorities_full';

export class TaskError extends Error {
  constructor(
    public code: TaskErrorCode,
    message: string
  ) {
    super(message);
  }
}

/** Status code for each TaskError — `priorities_full` is a conflict, not a bad request. */
export function taskErrorStatus(error: TaskError): number {
  if (error.code === 'priorities_full') return 409;
  if (error.code === 'not_found') return 404;
  return 400;
}

/** Pure: a referenced row is usable only when it exists and belongs to the caller. */
export function isOwnedBy(row: { user_id: string } | null | undefined, userId: string): boolean {
  return !!row && row.user_id === userId;
}

/** Pure: pinning is allowed below the limit, or when the user explicitly frees a slot. */
export function canPinAnother(openPinnedCount: number, replacing: boolean): boolean {
  return openPinnedCount - (replacing ? 1 : 0) < MAX_PINNED_TASKS;
}

async function assertReferencesOwned(
  supabase: SupabaseClient,
  userId: string,
  refs: { projectId?: string | null; contentStreamId?: string | null; boardId?: string | null }
): Promise<void> {
  if (refs.projectId) {
    const { data } = await supabase.from('projects').select('id, user_id').eq('id', refs.projectId).maybeSingle();
    if (!isOwnedBy(data, userId)) throw new TaskError('project_forbidden', 'Project not found or not owned by this user');
  }
  if (refs.contentStreamId) {
    const { data } = await supabase.from('content_streams').select('id, user_id').eq('id', refs.contentStreamId).maybeSingle();
    if (!isOwnedBy(data, userId)) throw new TaskError('content_stream_forbidden', 'Content stream not found or not owned by this user');
  }
  if (refs.boardId) {
    const { data } = await supabase.from('boards').select('id, user_id').eq('id', refs.boardId).maybeSingle();
    if (!isOwnedBy(data, userId)) throw new TaskError('board_forbidden', 'Board not found or not owned by this user');
  }
}

async function countOpenPinned(supabase: SupabaseClient, userId: string, excludeId?: string): Promise<number> {
  let query = supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('pinned_to_today', true)
    .in('status', OPEN_TASK_STATUSES);
  if (excludeId) query = query.neq('id', excludeId);
  const { count } = await query;
  return count ?? 0;
}

async function getOwnedTask(supabase: SupabaseClient, userId: string, taskId: string): Promise<Task> {
  const { data } = await supabase.from('tasks').select('*').eq('id', taskId).maybeSingle();
  if (!data || data.user_id !== userId) throw new TaskError('not_found', 'Task not found');
  return data as Task;
}

export async function listTasks(supabase: SupabaseClient, userId: string): Promise<Task[]> {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true });
  return (data ?? []) as Task[];
}

export async function createTask(supabase: SupabaseClient, userId: string, input: CreateTaskInput): Promise<Task> {
  await assertReferencesOwned(supabase, userId, input);

  if (input.pinnedToToday) {
    let replaceTarget: Task | null = null;
    if (input.replaceTaskId) replaceTarget = await getOwnedTask(supabase, userId, input.replaceTaskId);
    const open = await countOpenPinned(supabase, userId);
    const replacing = !!replaceTarget && replaceTarget.pinned_to_today && OPEN_TASK_STATUSES.includes(replaceTarget.status);
    if (!canPinAnother(open, replacing)) {
      throw new TaskError('priorities_full', `You already have ${MAX_PINNED_TASKS} priorities today. Pick one to replace.`);
    }
    // Explicit, user-chosen replacement: the old priority is only unpinned —
    // it stays a pending task, nothing is deleted (§8 "never silently replace").
    if (replaceTarget && replacing) {
      const { error } = await supabase.from('tasks').update({ pinned_to_today: false }).eq('id', replaceTarget.id);
      if (error) throw error;
    }
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      project_id: input.projectId ?? null,
      content_stream_id: input.contentStreamId ?? null,
      board_id: input.boardId ?? null,
      title: input.title,
      description: input.description ?? null,
      source: input.source,
      type: input.type,
      due_date: input.dueDate ?? null,
      priority: input.priority,
      // A client-created task is always already accepted (see createTaskSchema).
      status: 'pending',
      pinned_to_today: input.pinnedToToday,
      created_by_user: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Task;
}

export async function updateTask(supabase: SupabaseClient, userId: string, taskId: string, patch: UpdateTaskInput): Promise<Task> {
  const existing = await getOwnedTask(supabase, userId, taskId);
  await assertReferencesOwned(supabase, userId, { projectId: patch.projectId });

  const willBeOpenPinned =
    (patch.pinnedToToday ?? existing.pinned_to_today) && OPEN_TASK_STATUSES.includes(patch.status ?? existing.status);
  const isOpenPinned = existing.pinned_to_today && OPEN_TASK_STATUSES.includes(existing.status);
  if (willBeOpenPinned && !isOpenPinned) {
    const open = await countOpenPinned(supabase, userId, taskId);
    if (!canPinAnother(open, false)) {
      throw new TaskError('priorities_full', `You already have ${MAX_PINNED_TASKS} priorities today. Pick one to replace.`);
    }
  }

  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.projectId !== undefined) row.project_id = patch.projectId;
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.pinnedToToday !== undefined) row.pinned_to_today = patch.pinnedToToday;
  if (patch.status !== undefined) {
    row.status = patch.status;
    row.completed_at = patch.status === 'completed' ? new Date().toISOString() : null;
    row.skipped_at = patch.status === 'skipped' ? new Date().toISOString() : null;
  }

  const { data, error } = await supabase.from('tasks').update(row).eq('id', taskId).select().single();
  if (error) throw error;
  return data as Task;
}

// ---------------------------------------------------------------------------
// Sunday analytics review routine (tasks.type = 'weekly_review', §11 §7)
// ---------------------------------------------------------------------------

export async function getWeeklyReviewRoutine(supabase: SupabaseClient, userId: string): Promise<Task | null> {
  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('type', 'weekly_review')
    .eq('source', 'recurring')
    .neq('status', 'cancelled')
    .maybeSingle();
  return (data as Task | null) ?? null;
}

/** Idempotent: returns the existing routine or creates it (unique index 033 guards concurrent calls). */
export async function ensureWeeklyReviewRoutine(supabase: SupabaseClient, userId: string): Promise<Task> {
  const existing = await getWeeklyReviewRoutine(supabase, userId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      title: 'Sunday analytics review',
      description: 'Pinterest impressions, outbound clicks, saves, compare boards, review traffic, then choose Continue / Scale / Test / Fix / Stop.',
      source: 'recurring',
      type: 'weekly_review',
      recurrence_rule: WEEKLY_REVIEW_RECURRENCE_RULE,
      priority: 'high',
      status: 'pending',
      created_by_user: true,
    })
    .select()
    .single();

  if (error) {
    // Lost a race against a concurrent "Start review": read the winner.
    if ((error as { code?: string }).code === '23505') {
      const winner = await getWeeklyReviewRoutine(supabase, userId);
      if (winner) return winner;
    }
    throw error;
  }
  return data as Task;
}

/** Writes (or updates) the occurrence row for one Sunday — lazily, on user interaction only (§9). */
export async function setWeeklyReviewOccurrence(
  supabase: SupabaseClient,
  userId: string,
  routineId: string,
  occurrenceDate: string,
  status: 'completed' | 'pending'
): Promise<TaskOccurrence> {
  const { data, error } = await supabase
    .from('task_occurrences')
    .upsert(
      {
        task_id: routineId,
        user_id: userId,
        occurrence_date: occurrenceDate,
        status,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      },
      { onConflict: 'task_id,occurrence_date' }
    )
    .select()
    .single();

  if (error) throw error;
  return data as TaskOccurrence;
}
