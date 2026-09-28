'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StreamHealthBadge } from '@/components/dashboard/stream-health-badge';
import { boardNames, streamAction, streamCoverageLabel, streamTargetLabel } from '@/components/dashboard/content-stream-labels';
import { formatDayKeyShort } from '@/lib/dashboard/local-date';
import {
  nextStreamStatusSort,
  readStreamStatusSort,
  sortStreamsByStatus,
  writeStreamStatusSort,
  type StreamStatusSort,
  type StreamStatusSortStorage,
} from '@/lib/dashboard/stream-status-sort';
import { cn } from '@/lib/utils';
import type { ContentStreamCoverage } from '@/types/dashboard';

// Same approach as the WordPress Categories cards (categories-manager.tsx):
// localStorage is an external store read through useSyncExternalStore, so the
// server / first client render keeps the original order.
const listeners = new Set<() => void>();
// In-memory copy so sorting keeps working for this page view when
// localStorage is unavailable (private mode, blocked site data).
const memorySort: { value: StreamStatusSort | null } = { value: null };

function getStorage(): StreamStatusSortStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

function setStatusSort(sort: StreamStatusSort) {
  writeStreamStatusSort(sort, memorySort, getStorage);
  listeners.forEach((listener) => listener());
}

const SORT_PRESENTATION: Record<StreamStatusSort, { icon: typeof ArrowUpDown; label: string; ariaSort?: 'ascending' | 'descending' }> = {
  none: { icon: ArrowUpDown, label: 'Sort by status: most urgent first' },
  urgency: { icon: ArrowDown, label: 'Sorted by status, most urgent first. Sort least urgent first', ariaSort: 'ascending' },
  reverse: { icon: ArrowUp, label: 'Sorted by status, least urgent first. Restore original order', ariaSort: 'descending' },
};

/** Live (non-planned) streams: desktop table + mobile cards, sortable by Status. */
export function ContentStreamsTable({ coverage }: { coverage: ContentStreamCoverage[] }) {
  const sort = useSyncExternalStore(
    subscribe,
    () => readStreamStatusSort(memorySort, getStorage),
    () => 'none' as const
  );
  const streams = sortStreamsByStatus(coverage, sort);
  const { icon: SortIcon, label: sortLabel, ariaSort } = SORT_PRESENTATION[sort];
  const toggleSort = () => setStatusSort(nextStreamStatusSort(sort));

  if (coverage.length === 0) return null;

  return (
    <>
      {/* Desktop */}
      <div className="hidden overflow-hidden rounded-xl border border-border/60 bg-surface md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Stream</TableHead>
              <TableHead>Pinterest board</TableHead>
              <TableHead>Targets</TableHead>
              <TableHead className="text-right">Planned</TableHead>
              <TableHead>Last planned</TableHead>
              <TableHead className="text-right">Days covered</TableHead>
              <TableHead aria-sort={ariaSort}>
                <button
                  type="button"
                  onClick={toggleSort}
                  aria-label={sortLabel}
                  title={sortLabel}
                  className="-mx-1 inline-flex items-center gap-1 rounded px-1 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  Status
                  <SortIcon className={cn('size-3.5', sort === 'none' && 'opacity-60')} aria-hidden="true" />
                </button>
              </TableHead>
              <TableHead className="sr-only">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {streams.map((stream) => {
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
      <div className="space-y-3 md:hidden">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={toggleSort}
            aria-label={sortLabel}
            className="inline-flex items-center gap-1 rounded px-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Status
            <SortIcon className={cn('size-3.5', sort === 'none' && 'opacity-60')} aria-hidden="true" />
          </button>
        </div>
        <ul className="space-y-3">
          {streams.map((stream) => {
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
      </div>
    </>
  );
}
