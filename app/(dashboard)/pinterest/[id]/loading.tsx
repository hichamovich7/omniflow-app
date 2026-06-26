import { PageContainer } from '@/components/ui/page-container';
import { Skeleton } from '@/components/ui/skeleton';

export default function ResultsLoading() {
  return (
    <PageContainer>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-7 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3 w-72" />
          </div>
        </div>
        <div className="flex gap-2 pl-9">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/60 overflow-hidden">
              <Skeleton className="aspect-2/3 max-h-36 w-full" />
              <div className="p-4 space-y-2.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-5 w-24 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
