import { PageSkeleton } from '@/components/skeletons/page-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/skeletons/table-skeleton';

export default function WordPressHistoryLoading() {
  return (
    <PageSkeleton label="Loading WordPress history">
      <div className="space-y-1">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Same layout as FilterBar: search row + 2-column grid below `sm`. */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Skeleton className="col-span-2 h-11 sm:w-72 md:h-10" />
        <Skeleton className="h-11 w-full sm:w-40 md:h-10" />
        <Skeleton className="h-11 w-full sm:w-40 md:h-10" />
        <Skeleton className="h-11 w-full sm:w-40 md:h-10" />
        <Skeleton className="h-11 w-full sm:w-40 md:h-10" />
      </div>

      <TableSkeleton rows={6} />
    </PageSkeleton>
  );
}
