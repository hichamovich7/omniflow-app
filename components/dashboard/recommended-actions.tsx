import Link from 'next/link';
import { ArrowRight, CalendarClock, ClipboardCheck, PenLine, Settings2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { AddToPrioritiesButton } from '@/components/dashboard/add-to-priorities-button';
import type { Recommendation, RecommendationKind, RecommendationUrgency } from '@/types/dashboard';

interface RecommendedActionsProps {
  recommendations: Recommendation[];
  /** `${contentStreamId}:${taskType}` of every open priority — hides duplicate "Add" buttons. */
  pinnedKeys: string[];
}

const KIND_ICON: Record<RecommendationKind, typeof Sparkles> = {
  'create-pins': Sparkles,
  'schedule-pins': CalendarClock,
  'review-stream': Settings2,
  'review-buffer': PenLine,
  'sunday-review': ClipboardCheck,
};

const URGENCY: Record<RecommendationUrgency, { label: string; variant: 'danger' | 'warning' | 'neutral' }> = {
  high: { label: 'Urgent', variant: 'danger' },
  medium: { label: 'Soon', variant: 'warning' },
  low: { label: 'When you can', variant: 'neutral' },
};

export const MAX_RECOMMENDATIONS = 6;

export function recommendationPinnedKey(item: Pick<Recommendation, 'streamId' | 'taskType'>): string {
  return `${item.streamId ?? 'none'}:${item.taskType}`;
}

/** Ranked by urgency, computed from real coverage and the Sunday routine. */
export function RecommendedActions({ recommendations, pinnedKeys }: RecommendedActionsProps) {
  const visible = recommendations.slice(0, MAX_RECOMMENDATIONS);

  return (
    <section aria-labelledby="recommended-actions-title" className="space-y-3">
      <div>
        <p className="text-label">Next up</p>
        <h2 id="recommended-actions-title" className="text-section-title mt-1">
          Recommended next actions
        </h2>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-surface px-4 py-6 text-sm text-muted-foreground">
          Nothing to recommend right now — every content stream is covered and the weekly review isn&apos;t due yet.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visible.map((item) => {
            const Icon = KIND_ICON[item.kind];
            const urgency = URGENCY[item.urgency];
            return (
              <li key={item.id} className="flex flex-col gap-3 rounded-xl border border-border/60 bg-surface p-4 shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-selected">
                      <Icon className="size-4 text-primary" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {item.actionLabel}
                        {item.quantity != null && <span className="text-muted-foreground"> · {item.quantity} Pins</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.projectName ? `${item.projectName} · ${item.streamName}` : 'Weekly routine'}
                      </p>
                    </div>
                  </div>
                  <Badge variant={urgency.variant}>{urgency.label}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{item.reason}</p>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                  <Link href={item.href} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    {item.actionLabel}
                    <ArrowRight data-icon="inline-end" aria-hidden="true" />
                  </Link>
                  {item.kind !== 'sunday-review' && (
                    <AddToPrioritiesButton
                      recommendation={item}
                      alreadyAdded={pinnedKeys.includes(recommendationPinnedKey(item))}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
