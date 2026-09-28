import Link from 'next/link';
import { Layers } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { PageState } from '@/components/shared/page-state';
import { StreamHealthBadge } from '@/components/dashboard/stream-health-badge';
import { ContentStreamsTable } from '@/components/dashboard/content-streams-table';
import { streamTargetLabel } from '@/components/dashboard/content-stream-labels';
import type { ContentStreamCoverage } from '@/types/dashboard';

export { streamCoverageLabel, streamTargetLabel } from '@/components/dashboard/content-stream-labels';

interface ContentStreamsOverviewProps {
  coverage: ContentStreamCoverage[];
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
          <ContentStreamsTable coverage={coverage} />

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
