import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ProgressMetric } from '@/components/shared/metric-card';
import { formatMetricValue } from '@/lib/dashboard/format-metric';
import type { WeeklyProgressStats } from '@/types/dashboard';

interface WeeklyProgressProps {
  stats: WeeklyProgressStats;
}

export function WeeklyProgress({ stats }: WeeklyProgressProps) {
  const metrics = [
    stats.articlesPublished,
    stats.pinsCreated,
    stats.productsLaunched,
    stats.revenue,
  ];

  return (
    <Card size="sm">
      <CardHeader>
        <h2 className="text-section-title">Weekly Progress</h2>
      </CardHeader>
      <CardContent className="@container">
        <div className="grid gap-x-6 gap-y-4 @xl:grid-cols-2 @4xl:grid-cols-4">
          {metrics.map((metric) => {
            if (metric.current === null) {
              return (
                <ProgressMetric key={metric.label} label={metric.label} value="—" secondaryValue="Not tracked yet" />
              );
            }
            const current = formatMetricValue(metric.current, metric.unit);
            const target = metric.target !== null ? formatMetricValue(metric.target, metric.unit) : null;
            return (
              <div key={metric.label} className="space-y-1">
                <ProgressMetric
                  label={metric.label}
                  value={current}
                  secondaryValue={target !== null ? `/ ${target}` : undefined}
                  progress={
                    metric.target !== null && target !== null
                      ? { value: metric.current, max: metric.target, valueText: `${current} of ${target}` }
                      : undefined
                  }
                />
                {metric.hint && <p className="text-xs text-muted-foreground">{metric.hint}</p>}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
