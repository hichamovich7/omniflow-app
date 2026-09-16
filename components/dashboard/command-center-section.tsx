import Link from 'next/link';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { TodayPriorities } from '@/components/dashboard/today-priorities';
import { ProjectProgressCard } from '@/components/dashboard/project-progress-card';
import { WeeklyProgress } from '@/components/dashboard/weekly-progress';
import { MOCK_TODAY_PRIORITIES, MOCK_WEEKLY_PROGRESS } from '@/lib/dashboard/command-center-mock';
import type { CommandCenterKpi, ProjectProgress } from '@/types/dashboard';

interface CommandCenterSectionProps {
  /** Mock goal KPIs merged with the Dashboard page's real Supabase counts — see lib/dashboard/build-command-center.ts */
  kpis: CommandCenterKpi[];
  /** Mock Active Projects, linked to a real project href when the name matches — see lib/dashboard/build-command-center.ts */
  activeProjects: ProjectProgress[];
}

/**
 * Visual Command Center (TASK-FIX-038, Phase 1.1 — UI Consolidation). Today's
 * Priorities and Weekly Progress stay fully mocked (no Supabase equivalent
 * yet); KPIs and Active Projects are partly real, resolved by the caller.
 * See docs/tasks/TASK-COMMAND-CENTER-MVP.md.
 */
export function CommandCenterSection({ kpis, activeProjects }: CommandCenterSectionProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <TodayPriorities priorities={MOCK_TODAY_PRIORITIES} />
        </div>
        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-section-title">Active Projects</h2>
            <Link href="/projects" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
              View all projects
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {activeProjects.map((project) => (
              <ProjectProgressCard key={project.id} project={project} />
            ))}
          </div>
        </div>
      </div>

      <WeeklyProgress stats={MOCK_WEEKLY_PROGRESS} />
    </div>
  );
}
