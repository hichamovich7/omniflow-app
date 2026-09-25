'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, ClipboardCheck, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SUNDAY_REVIEW_CHECKLIST } from '@/lib/dashboard/build-sunday-review';
import { formatDayKeyLong } from '@/lib/dashboard/local-date';
import { cn } from '@/lib/utils';
import type { SundayReviewState, SundayReviewStatus } from '@/types/dashboard';

const STATE_BADGE: Record<SundayReviewState, { label: string; variant: 'danger' | 'warning' | 'purple' | 'success' }> = {
  overdue: { label: 'Overdue', variant: 'danger' },
  'due-soon': { label: 'Due soon', variant: 'warning' },
  'due-sunday': { label: 'Due Sunday', variant: 'purple' },
  completed: { label: 'Done this week', variant: 'success' },
};

export function sundayReviewDueText(review: SundayReviewStatus): string {
  const date = formatDayKeyLong(review.occurrenceDate);
  if (review.state === 'overdue') return `Missed on Sunday, ${date}. It stays here until you complete it.`;
  if (review.state === 'completed') return `Completed for Sunday, ${date}.`;
  if (review.daysUntil === 0) return `Due today, Sunday ${date}.`;
  if (review.daysUntil === 1) return `Due tomorrow, Sunday ${date}.`;
  return `Due Sunday, ${date} — in ${review.daysUntil} days.`;
}

/**
 * Recurring weekly routine (tasks.type = 'weekly_review'). "Start review"
 * creates the routine the first time; completing marks only that Sunday's
 * occurrence (task_occurrences) — the routine itself keeps recurring.
 * The checklist ticks are a local guide for this visit and are not saved.
 */
export function SundayReviewCard({ review }: { review: SundayReviewStatus }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(review.state === 'overdue');
  const [checked, setChecked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const badge = STATE_BADGE[review.state];

  async function send(action: 'start' | 'complete' | 'reopen') {
    setBusy(true);
    const res = await fetch('/api/tasks/weekly-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, occurrenceDate: review.occurrenceDate }),
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      toast.error(json?.error?.message ?? 'Could not update the weekly review');
      return false;
    }
    return true;
  }

  async function start() {
    setExpanded(true);
    if (!review.routineId && (await send('start'))) router.refresh();
  }

  async function complete() {
    if (await send('complete')) {
      toast.success('Weekly review completed');
      setChecked([]);
      router.refresh();
    }
  }

  async function reopen() {
    if (await send('reopen')) router.refresh();
  }

  return (
    <section
      id="sunday-review"
      aria-labelledby="sunday-review-title"
      className={cn(
        'flex h-full scroll-mt-6 flex-col gap-4 rounded-xl border bg-surface p-5 shadow-xs',
        review.state === 'overdue' ? 'border-destructive/30' : 'border-border/60'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-accent-soft">
            <ClipboardCheck className="size-4 text-brand-accent" aria-hidden="true" />
          </span>
          <div>
            <p className="text-label">Weekly routine</p>
            <h2 id="sunday-review-title" className="text-section-title">
              Sunday analytics review
            </h2>
          </div>
        </div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      <p className="text-sm text-muted-foreground">{sundayReviewDueText(review)}</p>

      {review.state === 'completed' ? (
        <div className="mt-auto flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="size-4" aria-hidden="true" /> Review done
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={() => void reopen()} disabled={busy}>
            <RotateCcw data-icon="inline-start" aria-hidden="true" />
            Reopen
          </Button>
        </div>
      ) : expanded ? (
        <>
          <ul className="space-y-2" aria-label="Review checklist">
            {SUNDAY_REVIEW_CHECKLIST.map((item) => {
              const id = `sunday-${item.replace(/\W+/g, '-').toLowerCase()}`;
              const isChecked = checked.includes(item);
              return (
                <li key={item} className="flex items-center gap-2.5">
                  <Checkbox
                    id={id}
                    checked={isChecked}
                    onCheckedChange={(value) =>
                      setChecked((prev) => (value ? [...prev, item] : prev.filter((entry) => entry !== item)))
                    }
                  />
                  <label htmlFor={id} className={cn('text-sm', isChecked && 'text-muted-foreground line-through')}>
                    {item}
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">Checklist ticks are a guide for this visit and are not saved.</p>
          <Button type="button" className="mt-auto" onClick={() => void complete()} disabled={busy}>
            {busy ? 'Saving…' : 'Mark review complete'}
          </Button>
        </>
      ) : (
        <Button type="button" className="mt-auto" onClick={() => void start()} disabled={busy}>
          Start review
        </Button>
      )}
    </section>
  );
}
