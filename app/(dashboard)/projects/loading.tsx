import { Skeleton } from '@/components/ui/skeleton';
import { PageSkeleton } from '@/components/skeletons/page-skeleton';

/** Mirrors /projects: header card, "Your content projects" heading, 3-column project cards. */
export default function ProjectsLoading() {
  return (
    <PageSkeleton label="Loading projects">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card px-5 py-6 sm:px-7 sm:py-8">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-8.5 w-40" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-11 w-36 rounded-md" />
      </div>

      <div className="space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-7 w-56" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-start gap-3.5">
                <Skeleton className="size-11 rounded-xl" />
                <div className="flex-1 space-y-2 pt-1">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
              </div>
              <div className="mt-5 flex gap-3 border-t border-border pt-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageSkeleton>
  );
}
