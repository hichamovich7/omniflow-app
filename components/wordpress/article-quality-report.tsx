import { ChevronDown, CircleCheck, CircleX, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ArticleQualityReport, QualityStatus } from '@/lib/wordpress/quality-check';
import {
  buildQualityReportView,
  QUALITY_REPORT_INFORMATIONAL_NOTE,
  QUALITY_REPORT_MISSING_MESSAGE,
} from '@/lib/wordpress/quality-report-view';

function StatusIcon({ status, className }: { status: QualityStatus; className?: string }) {
  if (status === 'passed') return <CircleCheck aria-hidden="true" className={cn('text-success', className)} />;
  if (status === 'warning') return <TriangleAlert aria-hidden="true" className={cn('text-warning', className)} />;
  return <CircleX aria-hidden="true" className={cn('text-destructive', className)} />;
}

function MessageList({ title, messages, status }: { title: string; messages: string[]; status: QualityStatus }) {
  if (messages.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {messages.map((message, i) => (
          <li key={`${status}-${i}`} className="flex gap-2 text-sm">
            <StatusIcon status={status} className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 wrap-break-word">{message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CardTitle() {
  return (
    <h2 id="quality-report-title" className="flex items-center gap-2 text-sm font-medium">
      <ShieldCheck aria-hidden="true" className="size-4 text-muted-foreground" />
      Quality report
    </h2>
  );
}

interface ArticleQualityReportProps {
  /** Null for articles generated before the Quality Gate (or whose report was not saved). */
  report: ArticleQualityReport | null;
}

/**
 * Read-only Quality Report V1 on /wordpress/[id] (TASK-FIX-046). Purely
 * informational: no action here, nothing blocks export or publishing.
 */
export function ArticleQualityReportCard({ report }: ArticleQualityReportProps) {
  if (!report) {
    return (
      <section aria-labelledby="quality-report-title" className="rounded-2xl border border-dashed border-border/60 px-5 py-4">
        <CardTitle />
        <p className="mt-1 text-sm text-muted-foreground">{QUALITY_REPORT_MISSING_MESSAGE}</p>
      </section>
    );
  }

  const view = buildQualityReportView(report);

  return (
    <section aria-labelledby="quality-report-title" className="rounded-2xl border border-border/60 bg-card px-5 py-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle />
        <Badge variant={view.tone}>{view.statusLabel}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {view.summary} {QUALITY_REPORT_INFORMATIONAL_NOTE}
      </p>

      <MessageList title="Issues" messages={view.issues} status="failed" />
      <MessageList title="Warnings" messages={view.warnings} status="warning" />

      <details className="group mt-4">
        <summary className="flex cursor-pointer list-none items-center gap-1 rounded-sm text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/20 [&::-webkit-details-marker]:hidden">
          <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
          All checks ({view.checks.length})
        </summary>
        <ul className="mt-3 divide-y divide-border/60">
          {view.checks.map((check) => (
            <li key={check.key} className="flex gap-2 py-2 text-sm">
              <StatusIcon status={check.status} className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">
                  {check.label}
                  <span className="sr-only"> — {check.statusLabel}</span>
                </p>
                <p className="wrap-break-word text-muted-foreground">{check.message}</p>
              </div>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
