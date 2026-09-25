import { CalendarDays, FolderKanban, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ResourceHeader } from '@/components/shared/resource-header';

interface DashboardHeaderProps {
  greeting: string;
  userName?: string;
  date: string;
  summary: string;
  credits: number;
  /** Open priorities pinned to today (real tasks). */
  prioritiesToday: number;
  /** Projects with at least one active or warming content stream. */
  activeProjects: number;
}

/**
 * Credits is intentionally shown only here — the old Metrics strip's Credits
 * card was retired as part of the Command Center consolidation (TASK-FIX-038,
 * Phase 1.1) to avoid showing it twice.
 */
export function DashboardHeader({ greeting, userName, date, summary, credits, prioritiesToday, activeProjects }: DashboardHeaderProps) {
  const facts = [
    { icon: CalendarDays, label: date },
    { icon: ListChecks, label: `${prioritiesToday} ${prioritiesToday === 1 ? 'priority' : 'priorities'} today` },
    { icon: FolderKanban, label: `${activeProjects} active ${activeProjects === 1 ? 'project' : 'projects'}` },
  ];

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-surface px-5 py-6 shadow-sm sm:px-7 sm:py-8">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
      <ResourceHeader
        title={`${greeting}${userName ? `, ${userName}` : ''}`}
        size="page"
        status={<Badge variant="outline">{credits.toLocaleString()} credits</Badge>}
        metadata={
          <div className="space-y-2">
            <p className="text-foreground/80">{summary}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Today at a glance">
              {facts.map(({ icon: Icon, label }) => (
                <li key={label} className="inline-flex items-center gap-1.5">
                  <Icon className="size-3.5 text-primary" aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        }
      />
    </section>
  );
}
