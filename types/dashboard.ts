/**
 * Command Center types. Shapes mirror what will eventually come from Supabase
 * (ids, status enums, numeric progress) so the mock data in
 * lib/dashboard/command-center-mock.ts can later be swapped for real queries
 * without changing these components' props.
 */

export interface DaySummary {
  greetingName: string;
  date: string;
  summary: string;
}

/** 'mock' = no Supabase table backs this yet. 'real' = read from an existing query. */
export type KpiSource = 'mock' | 'real';

export interface CommandCenterKpi {
  id: string;
  label: string;
  current: number;
  target: number | null;
  unit: 'currency' | 'count';
  source: KpiSource;
  /** Only set when the KPI itself should be clickable (e.g. Projects → /projects). */
  href?: string;
}

export interface PriorityItem {
  id: string;
  label: string;
  done: boolean;
}

export type ProjectStatus = 'on-track' | 'at-risk' | 'paused';

export interface ProjectProgress {
  id: string;
  name: string;
  status: ProjectStatus;
  progressPercent: number;
  mainKpiLabel: string;
  mainKpiValue: string;
  nextAction: string;
  /** Set only when a real Supabase project matches this mock project's name — never fabricated. */
  href?: string;
}

export interface WeeklyProgressMetric {
  label: string;
  current: number;
  target: number;
  unit: 'currency' | 'count';
}

export interface WeeklyProgressStats {
  articlesPublished: WeeklyProgressMetric;
  pinsCreated: WeeklyProgressMetric;
  productsLaunched: WeeklyProgressMetric;
  revenue: WeeklyProgressMetric;
}
