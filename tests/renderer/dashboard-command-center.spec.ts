import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'playwright/test';
import {
  buildCommandCenterKpis,
  buildDaySummary,
  buildWeeklyProgress,
  countActiveProjects,
  resolvePriorityProjectName,
  selectTodayPriorities,
} from '@/lib/dashboard/build-command-center';
import { MAX_PRIORITIES } from '@/components/dashboard/today-priorities';
import type { Task } from '@/types/tasks';

const REAL = { pinsCreated: 10, articlesGenerated: 5, projects: 2, generations: 7, tasksCompletedThisMonth: 4 };

/**
 * Command Center data contracts (TASK-FIX-042). Offline: no browser, no
 * Supabase, no auth. These exercise the exact functions the dashboard
 * renders from.
 */
test.describe('Command Center KPIs — every current metric kept', () => {
  test('the seven KPIs are all still present, in order', () => {
    const labels = buildCommandCenterKpis(REAL).map((kpi) => kpi.label);
    expect(labels).toEqual([
      'Monthly Revenue',
      'Tasks Completed',
      'Digital Products',
      'Pins Created',
      'Articles Generated',
      'Projects',
      'Generations',
    ]);
  });

  test('KPIs with an existing destination route get an href; others do not', () => {
    const byId = Object.fromEntries(buildCommandCenterKpis(REAL).map((kpi) => [kpi.id, kpi]));

    expect(byId['pins-created'].href).toBe('/history');
    expect(byId['articles-generated'].href).toBe('/wordpress/history');
    expect(byId.projects.href).toBe('/projects');
    // No combined Pinterest + WordPress history route exists yet — must not invent one.
    expect(byId.generations.href).toBeUndefined();
    for (const id of ['monthly-revenue', 'tasks-completed', 'digital-products']) {
      expect(byId[id].href).toBeUndefined();
    }
  });

  test('every real KPI carries the count it was built from — Tasks Completed is now real', () => {
    const byId = Object.fromEntries(buildCommandCenterKpis(REAL).map((kpi) => [kpi.id, kpi]));

    expect(byId['pins-created'].current).toBe(10);
    expect(byId['articles-generated'].current).toBe(5);
    expect(byId.projects.current).toBe(2);
    expect(byId.generations.current).toBe(7);
    expect(byId['tasks-completed']).toMatchObject({ current: 4, source: 'real' });
  });

  test('metrics without a Supabase source show no number at all (never a mock value)', () => {
    const byId = Object.fromEntries(buildCommandCenterKpis(REAL).map((kpi) => [kpi.id, kpi]));
    for (const id of ['monthly-revenue', 'digital-products']) {
      expect(byId[id].source).toBe('untracked');
      expect(byId[id].current).toBeNull();
      expect(byId[id].target).toBeNull();
    }
    expect(buildCommandCenterKpis(REAL).some((kpi) => (kpi.source as string) === 'mock')).toBe(false);
  });
});

test.describe('Weekly Progress — four metrics kept, real where a source exists', () => {
  test('keeps Articles Published, Pins Created, Products Launched and Revenue', () => {
    const stats = buildWeeklyProgress({ articlesPublished: 2, pinsCreated: 30, streams: [] });
    expect([stats.articlesPublished, stats.pinsCreated, stats.productsLaunched, stats.revenue].map((m) => m.label)).toEqual([
      'Articles Published',
      'Pins Created',
      'Products Launched',
      'Revenue',
    ]);
    expect(stats.articlesPublished.current).toBe(2);
    expect(stats.pinsCreated.current).toBe(30);
    expect(stats.productsLaunched.current).toBeNull();
    expect(stats.revenue.current).toBeNull();
  });

  test('targets come from active/warming content streams only', () => {
    const stats = buildWeeklyProgress({
      articlesPublished: 1,
      pinsCreated: 3,
      streams: [
        { status: 'active', targetPinsPerDay: 5, targetArticlesPerWeek: 2 },
        { status: 'warming', targetPinsPerDay: 2, targetArticlesPerWeek: null },
        { status: 'paused', targetPinsPerDay: 10, targetArticlesPerWeek: 10 },
      ],
    });
    expect(stats.pinsCreated.target).toBe((5 + 2) * 7);
    expect(stats.articlesPublished.target).toBe(2);
  });

  test('no target is invented when no stream sets one', () => {
    const stats = buildWeeklyProgress({ articlesPublished: 0, pinsCreated: 0, streams: [] });
    expect(stats.pinsCreated.target).toBeNull();
    expect(stats.articlesPublished.target).toBeNull();
  });
});

test.describe("Today's Priorities — real tasks", () => {
  const now = new Date(2026, 8, 25, 10, 0);
  const task = (overrides: Partial<Task>): Pick<Task, 'id' | 'title' | 'status' | 'pinned_to_today' | 'project_id' | 'completed_at' | 'created_at'> => ({
    id: 't',
    title: 'Task',
    status: 'pending',
    pinned_to_today: true,
    project_id: null,
    completed_at: null,
    created_at: new Date(2026, 8, 24).toISOString(),
    ...overrides,
  });

  test('shows open pinned tasks and the ones completed today, in creation order', () => {
    const items = selectTodayPriorities(
      [
        task({ id: 'b', title: 'Second', created_at: new Date(2026, 8, 25, 9).toISOString() }),
        task({ id: 'a', title: 'First', created_at: new Date(2026, 8, 25, 8).toISOString() }),
        task({ id: 'c', title: 'Done today', status: 'completed', completed_at: new Date(2026, 8, 25, 9, 30).toISOString() }),
      ],
      now
    );
    expect(items.map((item) => item.label)).toEqual(['Done today', 'First', 'Second']);
    expect(items.find((item) => item.id === 'c')?.done).toBe(true);
  });

  test('hides unpinned, cancelled, and previously completed tasks', () => {
    const items = selectTodayPriorities(
      [
        task({ id: 'unpinned', pinned_to_today: false }),
        task({ id: 'cancelled', status: 'cancelled' }),
        task({ id: 'old', status: 'completed', completed_at: new Date(2026, 8, 24, 18).toISOString() }),
      ],
      now
    );
    expect(items).toEqual([]);
  });

  test('keeps the project link by id', () => {
    const [item] = selectTodayPriorities([task({ id: 'x', project_id: 'real-1' })], now);
    expect(item.projectId).toBe('real-1');
  });

  test('the pinned-priorities limit is 3', () => {
    expect(MAX_PRIORITIES).toBe(3);
  });
});

test.describe("Today's Priorities project picker", () => {
  const projects = [
    { id: 'real-1', name: 'CrochetSal' },
    { id: 'real-2', name: 'Home Decor DE' },
  ];

  test('resolves a project by id, not by name or position', () => {
    expect(resolvePriorityProjectName({ projectId: 'real-2' }, projects)).toBe('Home Decor DE');
    expect(resolvePriorityProjectName({ projectId: 'real-1' }, projects)).toBe('CrochetSal');
  });

  test('shows "No project" when projectId is undefined, null, or empty', () => {
    expect(resolvePriorityProjectName({}, projects)).toBe('No project');
    expect(resolvePriorityProjectName({ projectId: null }, projects)).toBe('No project');
  });

  test('shows "No project" (never crashes) when the linked project no longer exists', () => {
    expect(() => resolvePriorityProjectName({ projectId: 'deleted-project' }, projects)).not.toThrow();
    expect(resolvePriorityProjectName({ projectId: 'deleted-project' }, projects)).toBe('No project');
  });

  test('shows "No project" when the projects list itself is empty', () => {
    expect(resolvePriorityProjectName({ projectId: 'real-1' }, [])).toBe('No project');
  });
});

test.describe('Header facts', () => {
  test('active projects = projects with an active or warming stream', () => {
    expect(
      countActiveProjects([
        { projectId: 'p1', status: 'active' },
        { projectId: 'p1', status: 'warming' },
        { projectId: 'p2', status: 'paused' },
        { projectId: 'p3', status: 'warming' },
      ])
    ).toBe(2);
  });

  test('day summary is built from real counts', () => {
    expect(buildDaySummary(1, 2)).toBe('You have 1 priority today and 2 active projects to keep moving.');
    expect(buildDaySummary(0, 1)).toBe('You have 0 priorities today and 1 active project to keep moving.');
  });
});

test.describe('No mock data in the dashboard', () => {
  const root = process.cwd();

  test('the Command Center mock module is gone', () => {
    expect(existsSync(path.join(root, 'lib/dashboard/command-center-mock.ts'))).toBe(false);
  });

  test('no dashboard source file references MOCK_ data', () => {
    const files = [
      'app/(dashboard)/dashboard/page.tsx',
      ...readdirSync(path.join(root, 'components/dashboard')).map((file) => `components/dashboard/${file}`),
      ...readdirSync(path.join(root, 'lib/dashboard')).map((file) => `lib/dashboard/${file}`),
    ];
    for (const file of files) {
      expect(readFileSync(path.join(root, file), 'utf8'), file).not.toMatch(/MOCK_|command-center-mock/);
    }
  });

  test('Recent Activity and Quick Actions are still rendered by the page', () => {
    const page = readFileSync(path.join(root, 'app/(dashboard)/dashboard/page.tsx'), 'utf8');
    expect(page).toContain('Recent activity');
    for (const label of ['New Project', 'Generate Pinterest Pins', 'Generate WordPress Article', 'Pinterest History', 'WordPress History']) {
      expect(page).toContain(label);
    }
    expect(page).toContain('<TodayPriorities');
    expect(page).toContain('<WeeklyProgress');
    expect(page).toContain('credits={credits}');
  });
});
