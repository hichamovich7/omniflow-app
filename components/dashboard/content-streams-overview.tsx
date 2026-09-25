import Link from 'next/link';
import { Layers } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageState } from '@/components/shared/page-state';
import { StreamHealthBadge } from '@/components/dashboard/stream-health-badge';
import { formatDayKeyShort } from '@/lib/dashboard/local-date';
import { cn } from '@/lib/utils';
import type { ContentStreamCoverage } from '@/types/dashboard';

interface ContentStreamsOverviewProps {
  coverage: ContentStreamCoverage[];
}

export function streamTargetLabel(stream: Pick<ContentStreamCoverage, 'targetPinsPerDay' | 'targetBufferDays'>): string {
  if (!stream.targetPinsPerDay || stream.targetBufferDays == null) return 'No targets set';
  return `${stream.targetPinsPerDay} Pins/day · ${stream.targetBufferDays}-day buffer`;
}

export function streamCoverageLabel(stream: Pick<ContentStreamCoverage, 'coveredThrough'>): string {
  return stream.coveredThrough ? `Covered until ${formatDayKeyShort(stream.coveredThrough)}` : 'Not covered today';
}

function streamAction(stream: ContentStreamCoverage): { label: string; href: string } {
  const board = stream.boards[0];
  switch (stream.health) {
    case 'create-now':
    case 'needs-content':
      return stream.unscheduledPins > 0 && board
        ? { label: 'Schedule Pins', href: `/boards/${board.id}` }
        : { label: 'Create Pins', href: '/pinterest' };
    case 'on-track':
      return board ? { label: 'View board', href: `/boards/${board.id}` } : { label: 'Review', href: `/projects/${stream.projectId}` };
    default:
      return { label: 'Review stream', href: `/projects/${stream.projectId}` };
  }
}

function boardNames(stream: ContentStreamCoverage): string {
  return stream.boards.length > 0 ? stream.boards.map((board) => board.name).join(', ') : 'No board linked';
}

/**
 * Splits live streams from `planned` ones (prepared for later, not started).
 * Planned streams keep their own section: no coverage numbers, no action.
 */
export function splitPlannedStreams(coverage: ContentStreamCoverage[]): { live: ContentStreamCoverage[]; planned: ContentStreamCoverage[] } {
  return {
    live: coverage.filter((stream) => stream.health !== 'planned'),
    planned: coverage.filter((stream) => stream.health === 'planned'),
  };
}

/** Every non-archived content stream with its real planning numbers; planned streams listed apart. */
export function ContentStreamsOverview({ coverage: allStreams }: ContentStreamsOverviewProps) {
  const { live: coverage, planned } = splitPlannedStreams(allStreams);
  return (
    <section aria-labelledby="content-streams-title" className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-label">Pinterest planning</p>
          <h2 id="content-streams-title" className="text-section-title mt-1">
            Content streams
          </h2>
        </div>
        <Link href="/projects" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
          Manage in projects
        </Link>
      </div>

      {allStreams.length === 0 ? (
        <PageState
          variant="empty"
          title="No content streams yet"
          description="Create a content stream inside a project, link its Pinterest board and set pins per day and buffer days."
          icon={Layers}
          action={
            <Link href="/projects" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Open projects
            </Link>
          }
        />
      ) : (
        <>
          {coverage.length === 0 && (
            <p className="text-sm text-muted-foreground">No active stream yet — only planned ones.</p>
          )}
          {/* Desktop */}
          <div className={cn('hidden overflow-hidden rounded-xl border border-border/60 bg-surface', coverage.length > 0 && 'md:block')}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stream</TableHead>
                  <TableHead>Pinterest board</TableHead>
                  <TableHead>Targets</TableHead>
                  <TableHead className="text-right">Planned</TableHead>
                  <TableHead>Last planned</TableHead>
                  <TableHead className="text-right">Days covered</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="sr-only">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coverage.map((stream) => {
                  const action = streamAction(stream);
                  return (
                    <TableRow key={stream.streamId}>
                      <TableCell>
                        <p className="font-medium text-foreground">{stream.streamName}</p>
                        <p className="text-xs text-muted-foreground">{stream.projectName}</p>
                      </TableCell>
                      <TableCell className="max-w-48 truncate">{boardNames(stream)}</TableCell>
                      <TableCell className="text-muted-foreground">{streamTargetLabel(stream)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {stream.plannedPins}
                        {stream.requiredBuffer != null && <span className="text-muted-foreground"> / {stream.requiredBuffer}</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {stream.lastPlannedDate ? formatDayKeyShort(stream.lastPlannedDate) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{stream.daysCovered}</TableCell>
                      <TableCell>
                        <StreamHealthBadge health={stream.health} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={action.href} className={buttonVariants({ variant: 'outline', size: 'xs' })}>
                          {action.label}
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile */}
          <ul className="space-y-3 md:hidden">
            {coverage.map((stream) => {
              const action = streamAction(stream);
              return (
                <li key={stream.streamId} className="space-y-3 rounded-xl border border-border/60 bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{stream.streamName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {stream.projectName} · {boardNames(stream)}
                      </p>
                    </div>
                    <StreamHealthBadge health={stream.health} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Targets</dt>
                    <dd className="text-right">{streamTargetLabel(stream)}</dd>
                    <dt className="text-muted-foreground">Planned</dt>
                    <dd className="text-right tabular-nums">
                      {stream.plannedPins}
                      {stream.requiredBuffer != null && ` / ${stream.requiredBuffer}`}
                    </dd>
                    <dt className="text-muted-foreground">Coverage</dt>
                    <dd className="text-right">{streamCoverageLabel(stream)}</dd>
                  </dl>
                  <Link href={action.href} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-full' })}>
                    {action.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          {planned.length > 0 && (
            <div className="space-y-2 pt-1" aria-labelledby="planned-streams-title">
              <h3 id="planned-streams-title" className="text-sm font-medium">
                Planned <span className="text-muted-foreground">· not started yet</span>
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {planned.map((stream) => (
                  <li
                    key={stream.streamId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-surface px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{stream.streamName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {stream.projectName} · {streamTargetLabel(stream)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StreamHealthBadge health={stream.health} />
                      <Link href={`/projects/${stream.projectId}`} className={buttonVariants({ variant: 'ghost', size: 'xs' })}>
                        Start
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
