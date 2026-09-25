import { Skeleton } from '@/components/ui/skeleton';
import {
  CenteredHeaderSkeleton,
  PageSkeleton,
  SkeletonCard,
} from '@/components/skeletons/page-skeleton';

/** Mirrors /wordpress/blog-post: narrow container, centred generator header, stacked section cards. */
export default function WordPressBlogPostLoading() {
  return (
    <PageSkeleton label="Loading article generator" narrow>
      <CenteredHeaderSkeleton />

      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="rounded-2xl">
            <div className="flex items-start gap-3">
              <Skeleton className="size-9 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
            </div>
            <Skeleton className="h-11 w-full rounded-md md:h-10" />
          </SkeletonCard>
        ))}
      </div>
    </PageSkeleton>
  );
}
