import type {
  CommandCenterKpi,
  PriorityItem,
  ProjectProgress,
  WeeklyProgressStats,
} from '@/types/dashboard';

/**
 * Single source of truth for Command Center mock data (TASK-FIX-038).
 * Only goals with no Supabase table yet stay mocked here — real usage stats
 * (Pins Created, Articles Generated, Projects, Generations) are merged in
 * from the Dashboard page's existing Supabase queries, via
 * lib/dashboard/build-command-center.ts. See docs/tasks/TASK-COMMAND-CENTER-MVP.md
 * ("Phase 1.1 — UI Consolidation") for the reasoning.
 */

export const MOCK_DAY_SUMMARY = 'You have 3 priorities today and 2 active projects to keep moving.';

export const MOCK_KPIS: CommandCenterKpi[] = [
  { id: 'monthly-revenue', label: 'Monthly Revenue', current: 240, target: 1000, unit: 'currency', source: 'mock' },
  { id: 'tasks-completed', label: 'Tasks Completed', current: 18, target: 25, unit: 'count', source: 'mock' },
  { id: 'digital-products', label: 'Digital Products', current: 1, target: 4, unit: 'count', source: 'mock' },
];

export const MOCK_TODAY_PRIORITIES: PriorityItem[] = [
  { id: 'priority-1', label: 'Finish "Free Crochet Cat Patterns"', done: false },
  { id: 'priority-2', label: 'Create 7 Crochet Sweater pins', done: false },
  { id: 'priority-3', label: 'Validate the first POD niche', done: false },
];

export const MOCK_ACTIVE_PROJECTS: ProjectProgress[] = [
  {
    id: 'crochetsal',
    name: 'CrochetSal',
    status: 'on-track',
    progressPercent: 65,
    mainKpiLabel: 'Pins created',
    mainKpiValue: '142',
    nextAction: 'Publish "Free Crochet Cat Patterns"',
  },
  {
    id: 'home-decor-de',
    name: 'Home Decor DE',
    status: 'at-risk',
    progressPercent: 30,
    mainKpiLabel: 'Articles published',
    mainKpiValue: '4',
    nextAction: 'Finish keyword research for next batch',
  },
  // POD intentionally removed (Phase 1.1 Hotfix): no real POD project exists
  // yet for this account. It was a fabricated "active project" — the future
  // digital product may resurface later under Goals/Future Projects, but
  // never here without real progress data. Do not re-add a placeholder.
];

export const MOCK_WEEKLY_PROGRESS: WeeklyProgressStats = {
  articlesPublished: { label: 'Articles Published', current: 3, target: 4, unit: 'count' },
  pinsCreated: { label: 'Pins Created', current: 21, target: 49, unit: 'count' },
  productsLaunched: { label: 'Products Launched', current: 0, target: 1, unit: 'count' },
  revenue: { label: 'Revenue', current: 240, target: 1000, unit: 'currency' },
};
