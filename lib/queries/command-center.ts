import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContentStreamStatus } from '@/types/content-streams';
import type { Task, TaskOccurrenceStatus } from '@/types/tasks';
import type { PlannedPinInput, StreamInput } from '@/lib/dashboard/build-content-coverage';
import { addLocalDays, startOfLocalDay, startOfLocalMonth, startOfLocalWeek, toLocalDayKey } from '@/lib/dashboard/local-date';

/**
 * Read-only Supabase queries behind the Command Center (TASK-FIX-042).
 * Every query runs under the caller's session, so RLS scopes it to their own
 * rows. Nothing here writes. Pure computations live in lib/dashboard/build-*.ts.
 */

const PAGE_SIZE = 1000;
/** Safety bound on paged pin reads (50k rows). */
const MAX_PAGES = 50;

type StreamRow = {
  id: string;
  name: string;
  project_id: string;
  status: ContentStreamStatus;
  target_pins_per_day: number | null;
  target_articles_per_week: number | null;
  target_buffer_days: number | null;
  projects: { name: string } | { name: string }[] | null;
  content_stream_boards: { board_id: string; boards: { name: string } | { name: string }[] | null }[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export interface CommandCenterStream extends StreamInput {
  targetArticlesPerWeek: number | null;
}

export async function listCommandCenterStreams(supabase: SupabaseClient): Promise<CommandCenterStream[]> {
  const { data, error } = await supabase
    .from('content_streams')
    .select(
      'id, name, project_id, status, target_pins_per_day, target_articles_per_week, target_buffer_days, projects(name), content_stream_boards(board_id, boards(name))'
    )
    .neq('status', 'archived')
    .order('name');

  if (error) console.error('Command Center — content_streams read failed:', error);

  return ((data ?? []) as unknown as StreamRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    projectId: row.project_id,
    projectName: one(row.projects)?.name ?? 'Unknown project',
    status: row.status,
    targetPinsPerDay: row.target_pins_per_day,
    targetBufferDays: row.target_buffer_days,
    targetArticlesPerWeek: row.target_articles_per_week,
    boards: (row.content_stream_boards ?? []).map((link) => ({ id: link.board_id, name: one(link.boards)?.name ?? 'Board' })),
  }));
}

/** Pins with a publish_date on or after `fromIso`, paged past PostgREST's 1000-row default. */
export async function listPlannedPinsFrom(supabase: SupabaseClient, fromIso: string): Promise<PlannedPinInput[]> {
  const rows: PlannedPinInput[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from('pins')
      .select('id, board_id, publish_date')
      .gte('publish_date', fromIso)
      .order('publish_date', { ascending: true })
      .order('id', { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) {
      console.error('Command Center — planned pins read failed:', error);
      break;
    }
    for (const pin of data ?? []) {
      if (pin.publish_date) rows.push({ boardId: pin.board_id, publishDate: pin.publish_date });
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

/** board_id → number of pins on that board with no publish_date. */
export async function countUnscheduledPinsByBoard(supabase: SupabaseClient, boardIds: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (boardIds.length === 0) return counts;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from('pins')
      .select('id, board_id')
      .is('publish_date', null)
      .in('board_id', boardIds)
      .order('id', { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) {
      console.error('Command Center — unscheduled pins read failed:', error);
      break;
    }
    for (const pin of data ?? []) {
      if (pin.board_id) counts[pin.board_id] = (counts[pin.board_id] ?? 0) + 1;
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return counts;
}

export interface PinLifecycleCounts {
  /** pins rows ever created. */
  created: number;
  /** publish_date set and not reached yet. */
  planned: number;
  /** publish_date set and already passed — not a Pinterest publication confirmation. */
  pastPlannedDate: number;
  /** publish_date not set. */
  unscheduled: number;
}

export async function countPinLifecycle(supabase: SupabaseClient, now: Date): Promise<PinLifecycleCounts> {
  const nowIso = now.toISOString();
  const [created, planned, past, unscheduled] = await Promise.all([
    supabase.from('pins').select('id', { count: 'exact', head: true }),
    supabase.from('pins').select('id', { count: 'exact', head: true }).gte('publish_date', nowIso),
    supabase.from('pins').select('id', { count: 'exact', head: true }).lt('publish_date', nowIso),
    supabase.from('pins').select('id', { count: 'exact', head: true }).is('publish_date', null),
  ]);
  return {
    created: created.count ?? 0,
    planned: planned.count ?? 0,
    pastPlannedDate: past.count ?? 0,
    unscheduled: unscheduled.count ?? 0,
  };
}

export async function countWeeklyActivity(supabase: SupabaseClient, now: Date): Promise<{ pinsCreated: number; articlesPublished: number }> {
  const weekStartIso = startOfLocalWeek(startOfLocalDay(now)).toISOString();
  const [pins, articles] = await Promise.all([
    supabase.from('pins').select('id', { count: 'exact', head: true }).gte('created_at', weekStartIso),
    supabase
      .from('wordpress_articles')
      .select('id', { count: 'exact', head: true })
      .eq('publish_status', 'published')
      .gte('published_at', weekStartIso),
  ]);
  return { pinsCreated: pins.count ?? 0, articlesPublished: articles.count ?? 0 };
}

export type DashboardTask = Pick<
  Task,
  'id' | 'title' | 'status' | 'type' | 'source' | 'pinned_to_today' | 'project_id' | 'content_stream_id' | 'due_date' | 'completed_at' | 'created_at'
>;

/** Tasks pinned to today, plus open tasks due this local week. Excludes the recurring routine template. */
export async function listDashboardTasks(supabase: SupabaseClient, userId: string, now: Date): Promise<DashboardTask[]> {
  const monday = startOfLocalWeek(now);
  const weekStart = toLocalDayKey(monday);
  const weekEnd = toLocalDayKey(addLocalDays(monday, 6));
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, status, type, source, pinned_to_today, project_id, content_stream_id, due_date, completed_at, created_at')
    .eq('user_id', userId)
    .neq('status', 'cancelled')
    .neq('source', 'recurring')
    .or(`pinned_to_today.eq.true,and(due_date.gte.${weekStart},due_date.lte.${weekEnd})`)
    .order('created_at', { ascending: true });
  if (error) console.error('Command Center — tasks read failed (is migration 033 applied?):', error);
  return (data ?? []) as DashboardTask[];
}

/** tasks + routine occurrences completed since the start of the local month. */
export async function countTasksCompletedThisMonth(supabase: SupabaseClient, userId: string, now: Date): Promise<number> {
  const monthStartIso = startOfLocalMonth(now).toISOString();
  const [tasks, occurrences] = await Promise.all([
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('completed_at', monthStartIso),
    supabase
      .from('task_occurrences')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('completed_at', monthStartIso),
  ]);
  return (tasks.count ?? 0) + (occurrences.count ?? 0);
}

export interface WeeklyReviewData {
  routine: { id: string; createdAt: string } | null;
  occurrences: { occurrenceDate: string; status: TaskOccurrenceStatus }[];
}

export async function loadWeeklyReview(supabase: SupabaseClient, userId: string, now: Date): Promise<WeeklyReviewData> {
  const { data: routine } = await supabase
    .from('tasks')
    .select('id, created_at')
    .eq('user_id', userId)
    .eq('type', 'weekly_review')
    .eq('source', 'recurring')
    .neq('status', 'cancelled')
    .maybeSingle();

  if (!routine) return { routine: null, occurrences: [] };

  const { data: occurrences } = await supabase
    .from('task_occurrences')
    .select('occurrence_date, status')
    .eq('task_id', routine.id)
    .gte('occurrence_date', toLocalDayKey(addLocalDays(now, -21)));

  return {
    routine: { id: routine.id, createdAt: routine.created_at },
    occurrences: (occurrences ?? []).map((o) => ({ occurrenceDate: o.occurrence_date, status: o.status as TaskOccurrenceStatus })),
  };
}
