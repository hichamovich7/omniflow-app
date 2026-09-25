import Link from 'next/link';
import { ArrowRight, CalendarCheck2, Target } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDayKeyLong } from '@/lib/dashboard/local-date';
import { cn } from '@/lib/utils';
import type { ContentStreamCoverage, Recommendation } from '@/types/dashboard';

interface TodayWorkspaceProps {
  focus: Recommendation | null;
  coverage: ContentStreamCoverage[];
}

function daysCoveredLabel(days: number): string {
  if (days === 0) return 'Nothing planned today';
  return `${days} ${days === 1 ? 'day' : 'days'} covered`;
}

/**
 * "Recommended focus today": the single most urgent stream action, taken
 * from the ranked recommendations (never generated arbitrarily). When every
 * buffer is covered, says so and shows the earliest coverage end date.
 */
export function TodayWorkspace({ focus, coverage }: TodayWorkspaceProps) {
  return (
    <section
      aria-labelledby="today-workspace-title"
      className="relative flex h-full flex-col gap-5 overflow-hidden rounded-2xl border border-primary/20 bg-selected/60 p-5 shadow-xs sm:p-6"
    >
      <div className="pointer-events-none absolute -bottom-24 -right-10 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-label">Today&apos;s workspace</p>
          <h2 id="today-workspace-title" className="text-section-title mt-1">
            Recommended focus today
          </h2>
        </div>
        <Target className="size-5 text-primary" aria-hidden="true" />
      </div>

      {focus ? <FocusBody focus={focus} /> : <CoveredBody coverage={coverage} />}
    </section>
  );
}

function FocusBody({ focus }: { focus: Recommendation }) {
  const actionText =
    focus.quantity != null ? `${focus.kind === 'schedule-pins' ? 'Schedule' : 'Create'} ${focus.quantity} Pins` : focus.actionLabel;

  return (
    <div className="relative flex flex-1 flex-col gap-4">
      <div className="space-y-1.5">
        <p className="font-heading text-2xl font-semibold tracking-tight text-foreground">{focus.boardName ?? focus.streamName}</p>
        <p className="text-sm text-muted-foreground">
          {focus.projectName} · {focus.streamName}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={focus.urgency === 'high' ? 'danger' : 'warning'}>
          {focus.urgency === 'high' ? 'Create now' : 'Needs content'}
        </Badge>
        <span className="text-sm font-medium text-foreground">
          {daysCoveredLabel(focus.daysCovered ?? 0)} · {actionText}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{focus.reason}</p>
      <div className="mt-auto">
        <Link href={focus.href} className={cn(buttonVariants({ size: 'lg' }), 'w-full sm:w-auto')}>
          {focus.actionLabel}
          <ArrowRight data-icon="inline-end" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function CoveredBody({ coverage }: { coverage: ContentStreamCoverage[] }) {
  const tracked = coverage.filter((stream) => stream.health === 'on-track' && stream.coveredThrough);
  const earliest = [...tracked].sort((a, b) => (a.coveredThrough ?? '').localeCompare(b.coveredThrough ?? ''))[0];

  if (coverage.length === 0) {
    return (
      <div className="relative flex flex-1 flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          No content streams yet. Add one from a project page (board, pins per day, buffer days) to get a daily focus.
        </p>
        <div className="mt-auto">
          <Link href="/projects" className={buttonVariants({ variant: 'outline' })}>
            Open projects
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <CalendarCheck2 className="size-5 text-success" aria-hidden="true" />
        <p className="font-heading text-xl font-semibold tracking-tight">No urgent Pin work today</p>
      </div>
      <p className="text-sm text-muted-foreground">
        {earliest
          ? `Every buffer is covered. The first stream to run out is ${earliest.streamName}, covered through ${formatDayKeyLong(earliest.coveredThrough as string)}.`
          : 'No stream is short of its buffer. Check the recommendations below for setup or review work.'}
      </p>
    </div>
  );
}
