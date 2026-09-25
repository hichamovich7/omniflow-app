import { Badge } from '@/components/ui/badge';
import { MetricCard } from '@/components/shared/metric-card';
import { formatMetricValue } from '@/lib/dashboard/format-metric';
import type { CommandCenterKpi } from '@/types/dashboard';

interface KpiCardProps {
  kpi: CommandCenterKpi;
}

export function KpiCard({ kpi }: KpiCardProps) {
  if (kpi.source === 'untracked' || kpi.current === null) {
    // No Supabase source yet: never show an invented number.
    return <MetricCard label={kpi.label} value="—" badge={<Badge variant="neutral">Not tracked yet</Badge>} />;
  }

  const current = formatMetricValue(kpi.current, kpi.unit);
  const target = kpi.target !== null ? formatMetricValue(kpi.target, kpi.unit) : null;

  return (
    <MetricCard
      label={kpi.label}
      value={current}
      secondaryValue={target !== null ? `/ ${target}` : undefined}
      progress={
        kpi.target
          ? { value: kpi.current, max: kpi.target, valueText: `${current} of ${target}` }
          : undefined
      }
      href={kpi.href}
    />
  );
}
