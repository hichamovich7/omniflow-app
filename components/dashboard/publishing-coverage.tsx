import { Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PublishingActivityCell, type PublishingActivityCellProps } from '@/components/dashboard/publishing-activity-dialog';
import { formatDayKeyLong, formatDayKeyShort, formatDayKeyWeekday } from '@/lib/dashboard/local-date';
import { coverageDayDescription, expectedActivityLabel, externalActivityLabel } from '@/lib/dashboard/publishing-activity';
import { cn } from '@/lib/utils';
import type { PinLifecycleCounts } from '@/lib/queries/command-center';
import type { ContentStreamCoverage, CoverageDay } from '@/types/dashboard';

interface PublishingCoverageProps {
  coverage: ContentStreamCoverage[];
  lifecycle: PinLifecycleCounts;
}

/** One-line verdict per stream, from real planned dates only. */
export function coverageMessage(stream: ContentStreamCoverage): string {
  const through = stream.coveredThrough ? formatDayKeyLong(stream.coveredThrough) : null;
  switch (stream.health) {
    case 'on-track':
      return through
        ? `No urgent work for ${stream.streamName}. You are covered through ${through}.`
        : `No urgent work for ${stream.streamName}.`;
    case 'create-now':
      return `${stream.streamName} runs out ${stream.daysCovered === 0 ? 'today' : 'after today'}: ${stream.missingPins} Pins missing from its ${stream.targetBufferDays}-day buffer.`;
    case 'needs-content':
      return `${stream.streamName} is covered through ${through ?? '—'}, but ${stream.missingPins} Pins are missing from its ${stream.targetBufferDays}-day buffer.`;
    case 'warming':
      return through ? `Warming — covered through ${through}.` : 'Warming — nothing planned yet.';
    case 'paused':
      return 'Paused — no coverage expected.';
    case 'planned':
      return 'Planned — not started yet, no coverage expected.';
    default:
      return 'Set a board, pins per day and buffer days to measure coverage.';
  }
}

/** Hollow dashed dot: expected, never the filled "published" dot. */
const EXPECTED_MARKER_CLASS = 'size-2 rounded-full border border-dashed border-foreground/70 bg-surface';

const LEVEL_CLASS: Record<CoverageDay['level'], string> = {
  full: 'bg-primary',
  partial: 'bg-primary/40',
  empty: 'bg-muted',
};

function dayTitle(day: CoverageDay, target: number | null): string {
  return coverageDayDescription(day, formatDayKeyShort(day.date), target);
}

/**
 * Dashboard counters for manual activity, never mixed: confirmed = published
 * externally today; expected = planned in another tool, today or later, not
 * confirmed yet (a forecast, never counted as published).
 */
export function externalActivityTotals(streams: ContentStreamCoverage[]): { confirmed: number; expected: number } {
  return streams.reduce(
    (totals, stream) => ({ confirmed: totals.confirmed + stream.externalToday, expected: totals.expected + stream.expectedExternal }),
    { confirmed: 0, expected: 0 }
  );
}

/**
 * Props of the clickable cell for one day: every day opens the modal, today
 * (and earlier) records published Pins, a later day only expected ones.
 */
export function coverageCellProps(
  stream: ContentStreamCoverage,
  day: CoverageDay,
  todayKey: string
): Omit<PublishingActivityCellProps, 'className' | 'children'> {
  return {
    streamId: stream.streamId,
    streamName: stream.streamName,
    date: day.date,
    isFuture: day.date > todayKey,
    targetPinsPerDay: stream.targetPinsPerDay,
    external: day.external,
    expected: day.expected,
    status: day.externalStatus,
    note: day.externalNote,
    source: day.externalSource,
    description: dayTitle(day, stream.targetPinsPerDay),
  };
}

/** Paused and planned streams expect no publishing, so they get no row. */
export function selectCoverageRows(coverage: ContentStreamCoverage[]): ContentStreamCoverage[] {
  return coverage.filter((stream) => stream.health !== 'paused' && stream.health !== 'planned');
}

/**
 * Day-by-day coverage for the next 14 days. A cell is filled when the day
 * meets the stream's pins/day target, half-filled when some Pins are
 * planned, empty when none are. Days inside the buffer window that are not
 * full are outlined as "needs new Pins".
 *
 * Every cell opens the "Publishing activity" modal. Today: Pins published
 * outside OmniFlow count toward today's target (filled dot + "Published
 * externally"). A future day: Pins expected from another tool (hollow dashed
 * dot + "Expected externally") improve that day's forecast but are never
 * shown or counted as published. Neither changes the Created / Planned
 * counters or any Pin.
 */
export function PublishingCoverage({ coverage, lifecycle }: PublishingCoverageProps) {
  const streams = selectCoverageRows(coverage);
  const firstDays = streams[0]?.days ?? [];
  const totals = externalActivityTotals(streams);
  const todayKey = firstDays[0]?.date ?? '';

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Publishing coverage</CardTitle>
        <CardDescription>
          Planned dates set in OmniFlow (the CSV &ldquo;Publish date&rdquo;). OmniFlow does not connect to Pinterest, so a past date
          is not confirmation that a Pin went live. Click today&apos;s cell to record Pins published with another tool, or a future
          cell to note Pins expected from another tool.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Created', value: lifecycle.created, hint: 'All Pins generated' },
            { label: 'Planned', value: lifecycle.planned, hint: 'Planned date still ahead' },
            { label: 'Planned date passed', value: lifecycle.pastPlannedDate, hint: 'Not verified on Pinterest' },
            { label: 'Unscheduled', value: lifecycle.unscheduled, hint: 'No planned date yet' },
            { label: 'Confirmed externally', value: totals.confirmed, hint: 'Today · entered manually' },
            { label: 'Expected externally', value: totals.expected, hint: 'Next 14 days · not confirmed' },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-border/60 bg-surface-muted/60 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{item.value.toLocaleString()}</dd>
              <dd className="text-[11px] text-muted-foreground">{item.hint}</dd>
            </div>
          ))}
        </dl>

        {streams.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active content stream to chart yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden="true">
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary" /> Target met</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary/40" /> Below target</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-muted" /> No Pins</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm ring-2 ring-warning ring-inset" /> Needs new Pins</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-success" /> Published externally</span>
              <span className="inline-flex items-center gap-1.5"><span className={EXPECTED_MARKER_CLASS} /> Expected externally</span>
            </div>

            {firstDays.length > 0 && (
              <div className="hidden gap-1 pl-0 sm:flex sm:pl-44" aria-hidden="true">
                {firstDays.map((day, index) => (
                  <span key={day.date} className="flex-1 text-center text-[10px] text-muted-foreground">
                    {index === 0 ? 'Today' : formatDayKeyWeekday(day.date).slice(0, 2)}
                  </span>
                ))}
              </div>
            )}

            <ul className="space-y-4">
              {streams.map((stream) => (
                <li key={stream.streamId} className="space-y-1.5">
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 sm:w-40 sm:shrink-0">
                      <p className="truncate text-sm font-medium">{stream.streamName}</p>
                      <p className="truncate text-xs text-muted-foreground">{stream.boards[0]?.name ?? 'No board linked'}</p>
                    </div>
                    <ol className="flex flex-1 gap-1" aria-label={`${stream.streamName} coverage, next 14 days`}>
                      {stream.days.map((day) => {
                        const cellClass = cn(
                          'relative h-6 flex-1 rounded-sm',
                          LEVEL_CLASS[day.level],
                          day.inBuffer && day.level !== 'full' && 'ring-2 ring-warning ring-inset'
                        );
                        const marker =
                          day.external > 0 ? (
                            <span
                              className="absolute right-0.5 top-0.5 size-2 rounded-full bg-success ring-1 ring-surface"
                              aria-hidden="true"
                            />
                          ) : day.expected > 0 ? (
                            <span className={cn('absolute right-0.5 top-0.5', EXPECTED_MARKER_CLASS)} aria-hidden="true" />
                          ) : null;
                        // Every day is recordable: today as published, a future day as expected only.
                        return (
                          <li key={day.date} className={cellClass}>
                            <PublishingActivityCell
                              {...coverageCellProps(stream, day, todayKey)}
                              className="hover:ring-2 hover:ring-primary/60 hover:ring-inset"
                            >
                              {marker}
                            </PublishingActivityCell>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                  {stream.externalToday > 0 && (
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-success sm:pl-44">
                      <span className="size-2 rounded-full bg-success" aria-hidden="true" />
                      {externalActivityLabel(stream.externalToday)}
                      <span className="text-muted-foreground">· today, entered manually</span>
                      {stream.days[0]?.externalNote && (
                        <span
                          role="img"
                          className="inline-flex text-muted-foreground"
                          title={stream.days[0].externalNote}
                          aria-label={`Note: ${stream.days[0].externalNote}`}
                        >
                          <Info className="size-3.5" aria-hidden="true" />
                        </span>
                      )}
                    </p>
                  )}
                  {stream.expectedExternal > 0 && (
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground sm:pl-44">
                      <span className={EXPECTED_MARKER_CLASS} aria-hidden="true" />
                      {expectedActivityLabel(stream.expectedExternal)}
                      <span>· planned in another tool, not confirmed yet</span>
                    </p>
                  )}
                  <p
                    className={cn(
                      'text-xs sm:pl-44',
                      stream.health === 'create-now'
                        ? 'text-destructive-hover'
                        : stream.health === 'needs-content'
                          ? 'text-warning'
                          : 'text-muted-foreground'
                    )}
                  >
                    {coverageMessage(stream)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
