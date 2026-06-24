import { Skeleton } from '@/components/ui/skeleton';

interface TableSkeletonProps {
  columns?: number;
  rows?: number;
}

export function TableSkeleton({ columns = 5, rows = 5 }: TableSkeletonProps) {
  return (
    <div className="rounded-lg border">
      <div className="border-b px-4 py-3">
        <div className="flex gap-6">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-16" />
          ))}
        </div>
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 px-4 py-3">
            {Array.from({ length: columns }).map((_, j) => (
              <Skeleton
                key={j}
                className="h-3.5"
                style={{ width: j === 0 ? '40%' : `${60 / (columns - 1)}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
