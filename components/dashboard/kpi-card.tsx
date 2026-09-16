import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { formatMetricValue } from '@/lib/dashboard/format-metric';
import type { CommandCenterKpi } from '@/types/dashboard';

interface KpiCardProps {
  kpi: CommandCenterKpi;
}

export function KpiCard({ kpi }: KpiCardProps) {
  const percent = kpi.target ? Math.min(100, Math.round((kpi.current / kpi.target) * 100)) : null;
  const isClickable = Boolean(kpi.href);

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-label">{kpi.label}</p>
        {kpi.source === 'mock' ? (
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
            Preview
          </span>
        ) : isClickable ? (
          <ArrowUpRight
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        ) : null}
      </div>
      <p className="text-lg font-semibold tracking-tight">
        {formatMetricValue(kpi.current, kpi.unit)}
        {kpi.target !== null && (
          <span className="text-sm font-normal text-muted-foreground"> / {formatMetricValue(kpi.target, kpi.unit)}</span>
        )}
      </p>
      {percent !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
      )}
    </>
  );

  if (kpi.href) {
    return (
      <Link
        href={kpi.href}
        className="group block cursor-pointer space-y-2 rounded-xl border border-border/60 bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {content}
      </Link>
    );
  }

  return <div className="space-y-2 rounded-xl border border-border/60 bg-surface p-4">{content}</div>;
}
