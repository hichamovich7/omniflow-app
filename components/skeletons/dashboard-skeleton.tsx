import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MetricGrid } from '@/components/shared/metric-card';
import { PageSkeleton, SkeletonCard } from '@/components/skeletons/page-skeleton';

/** Mirrors the dashboard: header card, 7 KPI cards, priorities + active projects, weekly progress, quick actions, activity. */
export function DashboardSkeleton() {
  return (
    <PageSkeleton label="Loading dashboard">
      <div className="space-y-3 rounded-2xl border border-border bg-card px-5 py-6 sm:px-7 sm:py-8">
        <Skeleton className="h-8.5 w-72 max-w-full" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-7 w-48" />
        </div>
        <MetricGrid>
          {Array.from({ length: 7 }).map((_, i) => (
            <Card key={i} className="h-full gap-3 p-4">
              <Skeleton className="h-4.5 w-28" />
              <Skeleton className="h-8.5 w-16" />
            </Card>
          ))}
        </MetricGrid>

        <div className="grid gap-6 lg:grid-cols-3">
          <SkeletonCard>
            <Skeleton className="h-7 w-44" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </SkeletonCard>
          <div className="space-y-3 lg:col-span-2">
            <Skeleton className="h-7 w-40" />
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <SkeletonCard key={i}>
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-1.5 w-full rounded-full" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-3/4" />
                </SkeletonCard>
              ))}
            </div>
          </div>
        </div>

        <SkeletonCard>
          <Skeleton className="h-7 w-40" />
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4.5 w-32" />
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        </SkeletonCard>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i}>
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-32" />
          </SkeletonCard>
        ))}
      </div>

      <div className="space-y-3">
        <Skeleton className="h-7 w-44" />
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="size-2 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    </PageSkeleton>
  );
}
