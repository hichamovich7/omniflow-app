import { PageSkeleton } from '@/components/skeletons/page-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

export default function WordPressLoading() {
  return (
    <PageSkeleton label="Loading WordPress generator">
      <div className="flex flex-col items-center pt-8 sm:pt-16">
        <Skeleton className="h-14 w-14 rounded-2xl" />
        <Skeleton className="mt-5 h-7 w-56" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>

      <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2 mt-10">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    </PageSkeleton>
  );
}
