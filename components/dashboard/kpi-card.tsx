import { Badge } from '@/components/ui/badge';
import { MetricCard } from '@/components/shared/metric-card';
import { formatMetricValue } from '@/lib/dashboard/format-metric';
import type { CommandCenterKpi } from '@/types/dashboard';

interface KpiCardProps {
  kpi: CommandCenterKpi;
}

export function KpiCard({ kpi }: KpiCardProps) {
  const current = formatMetricValue(kpi.current, kpi.unit);
  const target = kpi.target !== null ? formatMetricValue(kpi.target, kpi.unit) : null;

  return (
    <MetricCard
      label={kpi.label}
      value={current}
      secondaryValue={target !== null ? `/ ${target}` : undefined}
      badge={kpi.source === 'mock' ? <Badge variant="neutral">Preview</Badge> : undefined}
      progress={
        kpi.target
          ? { value: kpi.current, max: kpi.target, valueText: `${current} of ${target}` }
          : undefined
      }
      href={kpi.href}
    />
  );
}
