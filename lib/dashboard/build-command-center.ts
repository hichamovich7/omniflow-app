import type { CommandCenterKpi, ProjectProgress } from '@/types/dashboard';
import { MOCK_ACTIVE_PROJECTS, MOCK_KPIS } from '@/lib/dashboard/command-center-mock';

export interface RealCommandCenterStats {
  pinsCreated: number;
  articlesGenerated: number;
  projects: number;
  generations: number;
}

/**
 * Combines the mock goal KPIs (Monthly Revenue, Tasks Completed, Digital
 * Products — no Supabase table yet) with the real usage stats the Dashboard
 * page already fetches, so the old duplicated Metrics strip (Pins Created,
 * Articles Generated, Projects, Generations) can be retired without losing
 * any real number.
 */
export function buildCommandCenterKpis(real: RealCommandCenterStats): CommandCenterKpi[] {
  return [
    ...MOCK_KPIS,
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

interface RealProjectRef {
  id: string;
  name: string;
}

/**
 * Links a mocked Active Project card to its real Supabase project only when
 * the name matches exactly (case-insensitive) — never fabricates a link for
 * a project that doesn't actually exist for this user.
 */
export function resolveActiveProjects(realProjects: RealProjectRef[]): ProjectProgress[] {
  return MOCK_ACTIVE_PROJECTS.map((project) => {
    const match = realProjects.find(
      (real) => real.name.trim().toLowerCase() === project.name.trim().toLowerCase()
    );
    return match ? { ...project, href: `/projects/${match.id}` } : project;
  });
}
