import { ClipboardCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDayKeyShort, formatDayKeyWeekday } from '@/lib/dashboard/local-date';
import { cn } from '@/lib/utils';
import type { SundayReviewStatus, WeekDayPlan } from '@/types/dashboard';

interface WeekViewProps {
  days: WeekDayPlan[];
  review: SundayReviewStatus;
}

/**
 * Mon → Sun. Planned = real pins.publish_date. "To schedule" / "To create"
 * are the gaps to the active streams' pins/day targets, filled first from
 * Pins that already exist without a date. Sunday carries the analytics review.
 */
export function WeekView({ days, review }: WeekViewProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>This week</CardTitle>
        <CardDescription>Planned Pins, gaps to your daily targets, and review tasks.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid grid-cols-1 gap-2 lg:grid-cols-7">
          {days.map((day) => {
            const reviewDone = day.isSunday && review.state === 'completed' && review.occurrenceDate === day.date;
            return (
              <li
                key={day.date}
                aria-current={day.isToday ? 'date' : undefined}
                className={cn(
                  'flex flex-row flex-wrap items-start gap-x-3 gap-y-1.5 rounded-lg border p-2.5 text-xs lg:flex-col lg:gap-1.5',
                  day.isSunday ? 'border-brand-accent/30 bg-brand-accent-soft/60' : 'border-border/60 bg-surface',
                  day.isToday && 'ring-2 ring-primary/40',
                  day.isPast && 'opacity-70'
                )}
              >
                <div className="w-14 shrink-0 lg:w-auto">
                  <p className="font-semibold text-foreground">{formatDayKeyWeekday(day.date)}</p>
                  <p className="text-muted-foreground">{day.isToday ? 'Today' : formatDayKeyShort(day.date)}</p>
                </div>
                <dl className="grid flex-1 grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 lg:w-full">
                  <dt className="text-muted-foreground">Planned</dt>
                  <dd className="text-right tabular-nums">{day.plannedPins}</dd>
                  {!day.isPast && (
                    <>
                      <dt className="text-muted-foreground">To schedule</dt>
                      <dd className="text-right tabular-nums">{day.pinsToSchedule}</dd>
                      <dt className="text-muted-foreground">To create</dt>
                      <dd className={cn('text-right tabular-nums', day.pinsToCreate > 0 && 'font-semibold text-warning')}>
                        {day.pinsToCreate}
                      </dd>
                    </>
                  )}
                </dl>
                {(day.reviewTasks.length > 0 || day.isSunday) && (
                  <ul className="basis-full space-y-0.5 lg:basis-auto lg:w-full">
                    {day.isSunday && (
                      <li className="inline-flex items-center gap-1 font-medium text-brand-accent">
                        <ClipboardCheck className="size-3" aria-hidden="true" />
                        {reviewDone ? 'Review done' : 'Analytics review'}
                      </li>
                    )}
                    {day.reviewTasks.map((title) => (
                      <li key={title} className="truncate text-muted-foreground" title={title}>
                        {title}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
