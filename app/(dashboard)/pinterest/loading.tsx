import { Skeleton } from '@/components/ui/skeleton';
import {
  CenteredHeaderSkeleton,
  PageSkeleton,
  SkeletonCard,
} from '@/components/skeletons/page-skeleton';

/** Mirrors /pinterest: narrow container, centred generator header, form card with section cards. */
export default function PinterestLoading() {
  return (
    <PageSkeleton label="Loading Pinterest generator" narrow>
      <CenteredHeaderSkeleton />

      <SkeletonCard className="space-y-4 rounded-2xl p-5 sm:p-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border p-4">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="h-11 w-full rounded-md md:h-10" />
          </div>
        ))}
        <Skeleton className="h-11 w-full rounded-md" />
      </SkeletonCard>
    </PageSkeleton>
  );
}
