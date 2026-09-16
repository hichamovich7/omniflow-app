import { formatMetricValue } from '@/lib/dashboard/format-metric';
import type { WeeklyProgressStats } from '@/types/dashboard';

interface WeeklyProgressProps {
  stats: WeeklyProgressStats;
}

export function WeeklyProgress({ stats }: WeeklyProgressProps) {
  const metrics = [stats.articlesPublished, stats.pinsCreated, stats.productsLaunched, stats.revenue];

  return (
    <div className="rounded-xl border border-border/60 bg-surface p-5">
      <h2 className="text-section-title">Weekly Progress</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map((metric) => {
          const percent = metric.target > 0 ? Math.min(100, Math.round((metric.current / metric.target) * 100)) : 0;
          return (
            <div key={metric.label} className="space-y-1.5 rounded-lg bg-muted/40 px-3 py-2.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">{metric.label}</p>
              <p className="text-base font-semibold tracking-tight">
                {formatMetricValue(metric.current, metric.unit)}
                <span className="text-xs font-normal text-muted-foreground"> / {formatMetricValue(metric.target, metric.unit)}</span>
              </p>
              <div className="h-1 w-full overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
