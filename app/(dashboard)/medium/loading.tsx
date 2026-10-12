import { PageSkeleton } from '@/components/skeletons/page-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

export default function MediumHistoryLoading() {
  return (
    <PageSkeleton label="Loading Medium history">
      <div className="space-y-1">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Skeleton className="h-11 w-full sm:w-40 md:h-10" />
        <Skeleton className="h-11 w-full sm:w-40 md:h-10" />
        <Skeleton className="h-11 w-full sm:w-40 md:h-10" />
        <Skeleton className="h-11 w-full sm:w-40 md:h-10" />
      </div>
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </PageSkeleton>
  );
}
