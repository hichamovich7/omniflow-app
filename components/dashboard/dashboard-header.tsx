import { Badge } from '@/components/ui/badge';
import { ResourceHeader } from '@/components/shared/resource-header';

interface DashboardHeaderProps {
  greeting: string;
  userName?: string;
  date: string;
  summary: string;
  credits: number;
}

/**
 * Credits is intentionally shown only here — the old Metrics strip's Credits
 * card was retired as part of the Command Center consolidation (TASK-FIX-038,
 * Phase 1.1) to avoid showing it twice.
 */
export function DashboardHeader({ greeting, userName, date, summary, credits }: DashboardHeaderProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-surface px-5 py-6 shadow-sm sm:px-7 sm:py-8">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
      <ResourceHeader
        title={`${greeting}${userName ? `, ${userName}` : ''}`}
        size="page"
        status={<Badge variant="outline">{credits.toLocaleString()} credits</Badge>}
        metadata={
          <div className="space-y-0.5">
            <p>{date}</p>
            <p className="text-foreground/80">{summary}</p>
          </div>
        }
      />
    </section>
  );
}
