import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDayKeyLong, formatDayKeyShort, formatDayKeyWeekday } from '@/lib/dashboard/local-date';
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
    default:
      return 'Set a board, pins per day and buffer days to measure coverage.';
  }
}

const LEVEL_CLASS: Record<CoverageDay['level'], string> = {
  full: 'bg-primary',
  partial: 'bg-primary/40',
  empty: 'bg-muted',
};

function dayTitle(day: CoverageDay, target: number | null): string {
  const needs = day.inBuffer && day.level !== 'full' ? ' — needs new Pins' : '';
  return `${formatDayKeyShort(day.date)}: ${day.planned} planned${target ? ` of ${target}` : ''}${needs}`;
}

/**
 * Day-by-day planned coverage for the next 14 days. A cell is filled when
 * the day meets the stream's pins/day target, half-filled when some Pins are
 * planned, empty when none are. Days inside the buffer window that are not
 * full are outlined as "needs new Pins".
 */
export function PublishingCoverage({ coverage, lifecycle }: PublishingCoverageProps) {
  const streams = coverage.filter((stream) => stream.health !== 'paused');
  const firstDays = streams[0]?.days ?? [];

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Publishing coverage</CardTitle>
        <CardDescription>
          Planned dates set in OmniFlow (the CSV &ldquo;Publish date&rdquo;). OmniFlow does not connect to Pinterest, so a past date
          is not confirmation that a Pin went live.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Created', value: lifecycle.created, hint: 'All Pins generated' },
            { label: 'Planned', value: lifecycle.planned, hint: 'Planned date still ahead' },
            { label: 'Planned date passed', value: lifecycle.pastPlannedDate, hint: 'Not verified on Pinterest' },
            { label: 'Unscheduled', value: lifecycle.unscheduled, hint: 'No planned date yet' },
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
                      {stream.days.map((day) => (
                        <li
                          key={day.date}
                          title={dayTitle(day, stream.targetPinsPerDay)}
                          className={cn(
                            'h-6 flex-1 rounded-sm',
                            LEVEL_CLASS[day.level],
                            day.inBuffer && day.level !== 'full' && 'ring-2 ring-warning ring-inset'
                          )}
                        >
                          <span className="sr-only">{dayTitle(day, stream.targetPinsPerDay)}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
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
