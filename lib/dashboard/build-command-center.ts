import type { CommandCenterKpi, PriorityItem, ProjectOption, WeeklyProgressStats } from '@/types/dashboard';
import type { ContentStreamStatus } from '@/types/content-streams';
import type { Task, TaskStatus } from '@/types/tasks';
import { toLocalDayKey } from '@/lib/dashboard/local-date';

export interface RealCommandCenterStats {
  pinsCreated: number;
  articlesGenerated: number;
  projects: number;
  generations: number;
  /** tasks + routine occurrences completed since the start of the current local month. */
  tasksCompletedThisMonth: number;
}

/**
 * The seven Command Center KPIs. Every value is real or explicitly
 * `untracked` (rendered "—" with a "Not tracked yet" badge) — Monthly
 * Revenue and Digital Products have no Supabase source, so no number is
 * ever invented for them (TASK-FIX-042 replaced the Phase 1 mock values).
 */
export function buildCommandCenterKpis(real: RealCommandCenterStats): CommandCenterKpi[] {
  return [
    { id: 'monthly-revenue', label: 'Monthly Revenue', current: null, target: null, unit: 'currency', source: 'untracked' },
    { id: 'tasks-completed', label: 'Tasks Completed', current: real.tasksCompletedThisMonth, target: null, unit: 'count', source: 'real' },
    { id: 'digital-products', label: 'Digital Products', current: null, target: null, unit: 'count', source: 'untracked' },
    // Pinterest generation history already exists at /history ("Pinterest History" in Quick Actions).
    { id: 'pins-created', label: 'Pins Created', current: real.pinsCreated, target: null, unit: 'count', source: 'real', href: '/history' },
    // WordPress article history already exists at /wordpress/history.
    { id: 'articles-generated', label: 'Articles Generated', current: real.articlesGenerated, target: null, unit: 'count', source: 'real', href: '/wordpress/history' },
    { id: 'projects', label: 'Projects', current: real.projects, target: null, unit: 'count', source: 'real', href: '/projects' },
    // Intentionally no href: "Generations" would need a history route spanning
    // both Pinterest and WordPress, and no such combined route exists yet.
    // Only /history (Pinterest-only) and /wordpress/history (WordPress-only)
    // exist — linking either one here would misrepresent this count. Do not
    // invent a route; revisit once a real cross-platform history page exists.
    { id: 'generations', label: 'Generations', current: real.generations, target: null, unit: 'count', source: 'real' },
  ];
}

export interface WeeklyProgressInput {
  /** wordpress_articles published (published_at) this local week. */
  articlesPublished: number;
  /** pins created (created_at) this local week. */
  pinsCreated: number;
  /** Non-archived, non-paused streams' targets. */
  streams: { status: ContentStreamStatus; targetPinsPerDay: number | null; targetArticlesPerWeek: number | null }[];
}

/**
 * Weekly Progress. Targets come from the content streams' own targets;
 * Products Launched and Revenue have no source yet and stay untracked.
 */
export function buildWeeklyProgress({ articlesPublished, pinsCreated, streams }: WeeklyProgressInput): WeeklyProgressStats {
  const counted = streams.filter((stream) => stream.status === 'active' || stream.status === 'warming');
  const articleTarget = counted.reduce((sum, stream) => sum + (stream.targetArticlesPerWeek ?? 0), 0);
  const pinsPerDay = counted.reduce((sum, stream) => sum + (stream.targetPinsPerDay ?? 0), 0);

  return {
    articlesPublished: {
      label: 'Articles Published',
      current: articlesPublished,
      target: articleTarget > 0 ? articleTarget : null,
      unit: 'count',
      hint: articleTarget > 0 ? 'Target: sum of content stream articles/week' : 'No articles/week target set',
    },
    pinsCreated: {
      label: 'Pins Created',
      current: pinsCreated,
      target: pinsPerDay > 0 ? pinsPerDay * 7 : null,
      unit: 'count',
      hint: pinsPerDay > 0 ? 'Target: content stream pins/day × 7' : 'No pins/day target set',
    },
    productsLaunched: { label: 'Products Launched', current: null, target: null, unit: 'count' },
    revenue: { label: 'Revenue', current: null, target: null, unit: 'currency' },
  };
}

/** Statuses that keep a pinned task on Today's Priorities as still to do. */
export const OPEN_TASK_STATUSES: TaskStatus[] = ['pending', 'scheduled', 'postponed'];

/**
 * Today's Priorities: tasks pinned to today that are still open, plus the
 * ones completed today (so a ticked priority doesn't vanish until tomorrow).
 * Cancelled (soft-deleted) tasks never show.
 */
export function selectTodayPriorities(
  tasks: Pick<Task, 'id' | 'title' | 'status' | 'pinned_to_today' | 'project_id' | 'completed_at' | 'created_at'>[],
  now: Date
): PriorityItem[] {
  const todayKey = toLocalDayKey(now);
  return tasks
    .filter(
      (task) =>
        task.pinned_to_today &&
        (OPEN_TASK_STATUSES.includes(task.status) ||
          (task.status === 'completed' && !!task.completed_at && toLocalDayKey(new Date(task.completed_at)) === todayKey))
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((task) => ({ id: task.id, label: task.title, done: task.status === 'completed', projectId: task.project_id }));
}

/** Projects with at least one active or warming content stream. */
export function countActiveProjects(streams: { projectId: string; status: ContentStreamStatus }[]): number {
  return new Set(streams.filter((s) => s.status === 'active' || s.status === 'warming').map((s) => s.projectId)).size;
}

export function buildDaySummary(openPriorities: number, activeProjects: number): string {
  const priorities = `${openPriorities} ${openPriorities === 1 ? 'priority' : 'priorities'} today`;
  const projects = `${activeProjects} active ${activeProjects === 1 ? 'project' : 'projects'}`;
  return `You have ${priorities} and ${projects} to keep moving.`;
}

/**
 * Resolves a Today's Priorities item's project badge label by real id only
 * (never by name — TASK-FIX-038 project-selector prototype). Falls back to
 * "No project" both when `projectId` is unset and when it points at a
 * project that no longer exists (e.g. deleted since the priority was
 * created) — never throws, never fabricates a name.
 */
export function resolvePriorityProjectName(item: Pick<PriorityItem, 'projectId'>, projects: ProjectOption[]): string {
  if (!item.projectId) return 'No project';
  const match = projects.find((project) => project.id === item.projectId);
  return match ? match.name : 'No project';
}
