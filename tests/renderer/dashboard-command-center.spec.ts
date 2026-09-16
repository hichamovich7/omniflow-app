import { expect, test } from 'playwright/test';
import { buildCommandCenterKpis, resolveActiveProjects, resolvePriorityProjectName } from '@/lib/dashboard/build-command-center';
import { MOCK_ACTIVE_PROJECTS } from '@/lib/dashboard/command-center-mock';
import { MAX_PRIORITIES } from '@/components/dashboard/today-priorities';

/**
 * Data-contract tests for the Command Center Phase 1.1 Hotfix. These run
 * offline (no browser, no Supabase, no auth) and exercise the exact
 * functions that determine what each component renders — buildCommandCenterKpis()
 * decides which KpiCard becomes a <Link>, resolveActiveProjects() decides
 * which ProjectProgressCard becomes a <Link>. See
 * docs/tasks/TASK-COMMAND-CENTER-MVP.md ("Phase 1.1 Hotfix").
 */
test.describe('Command Center KPI links (TASK-FIX-038 Phase 1.1 Hotfix)', () => {
  test('KPIs with an existing destination route get an href; others do not', () => {
    const kpis = buildCommandCenterKpis({ pinsCreated: 10, articlesGenerated: 5, projects: 2, generations: 7 });
    const byId = Object.fromEntries(kpis.map((kpi) => [kpi.id, kpi]));

    expect(byId['pins-created'].href).toBe('/history');
    expect(byId['articles-generated'].href).toBe('/wordpress/history');
    expect(byId.projects.href).toBe('/projects');

    // No combined Pinterest + WordPress history route exists yet — must not invent one.
    expect(byId.generations.href).toBeUndefined();

    for (const id of ['monthly-revenue', 'tasks-completed', 'digital-products']) {
      expect(byId[id].source).toBe('mock');
      expect(byId[id].href).toBeUndefined();
    }
  });

  test('every real KPI carries the current count it was built from', () => {
    const kpis = buildCommandCenterKpis({ pinsCreated: 10, articlesGenerated: 5, projects: 2, generations: 7 });
    const byId = Object.fromEntries(kpis.map((kpi) => [kpi.id, kpi]));

    expect(byId['pins-created'].current).toBe(10);
    expect(byId['articles-generated'].current).toBe(5);
    expect(byId.projects.current).toBe(2);
    expect(byId.generations.current).toBe(7);
  });
});

test.describe('Active Projects data (TASK-FIX-038 Phase 1.1 Hotfix)', () => {
  test('POD is no longer part of the mocked Active Projects', () => {
    expect(MOCK_ACTIVE_PROJECTS).toHaveLength(2);
    expect(MOCK_ACTIVE_PROJECTS.map((project) => project.name)).toEqual(['CrochetSal', 'Home Decor DE']);
    expect(MOCK_ACTIVE_PROJECTS.some((project) => project.name === 'POD')).toBe(false);
  });

  test('an unmatched project keeps its status, progress and next action — only the href is withheld', () => {
    const resolved = resolveActiveProjects([]);

    expect(resolved).toHaveLength(2);
    for (const project of resolved) {
      expect(project.href).toBeUndefined();
      expect(project.nextAction).toBeTruthy();
      expect(project.status).toBeTruthy();
      expect(typeof project.progressPercent).toBe('number');
    }
  });

  test('a matched project gains an href without losing next action or any other field', () => {
    const resolved = resolveActiveProjects([{ id: 'real-1', name: 'crochetsal' }]);
    const crochetsal = resolved.find((project) => project.name === 'CrochetSal');
    const homeDecor = resolved.find((project) => project.name === 'Home Decor DE');

    expect(crochetsal?.href).toBe('/projects/real-1');
    expect(crochetsal?.nextAction).toBeTruthy();
    expect(crochetsal?.status).toBeTruthy();

    // The unmatched sibling must not be affected by the other one's match.
    expect(homeDecor?.href).toBeUndefined();
    expect(homeDecor?.nextAction).toBeTruthy();
  });

  test('never fabricates a link for a name that does not match any real project', () => {
    const resolved = resolveActiveProjects([{ id: 'real-1', name: 'Some Other Project' }]);
    for (const project of resolved) {
      expect(project.href).toBeUndefined();
    }
  });
});

/**
 * Data-contract tests for the Today's Priorities Edit/project-picker
 * prototype (TASK-FIX-038 follow-up). resolvePriorityProjectName() is the
 * exact function the project badge/selector renders from — it must resolve
 * by real project id only, and never throw when a priority points at a
 * project that no longer exists. See components/dashboard/today-priorities.tsx.
 */
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

  test('the pinned-priorities limit is 3', () => {
    expect(MAX_PRIORITIES).toBe(3);
  });
});
