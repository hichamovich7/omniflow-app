import { Skeleton } from '@/components/ui/skeleton';

interface TableSkeletonProps {
  rows?: number;
}

/** Placeholder with the geometry of `DataList` rows (checkbox, badge, title + metadata, action). */
export function TableSkeleton({ rows = 5 }: TableSkeletonProps) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
          <Skeleton className="size-4 rounded-xs" />
          <Skeleton className="hidden h-5.5 w-20 rounded-xs md:block" />
          <div className="flex-1 space-y-1.5 py-0.5">
            <Skeleton className="h-4 w-3/5 max-w-80" />
            <Skeleton className="h-3 w-2/5 max-w-60" />
          </div>
          <Skeleton className="size-8 rounded-md" />
        </div>
      ))}
    </div>
  );
}
