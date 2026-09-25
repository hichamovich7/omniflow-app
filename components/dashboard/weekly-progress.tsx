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
            const current = formatMetricValue(metric.current, metric.unit);
            const target = formatMetricValue(metric.target, metric.unit);
            return (
              <ProgressMetric
                key={metric.label}
                label={metric.label}
                value={current}
                secondaryValue={`/ ${target}`}
                progress={{
                  value: metric.current,
                  max: metric.target,
                  valueText: `${current} of ${target}`,
                }}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
