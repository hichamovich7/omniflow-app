import { Skeleton } from '@/components/ui/skeleton';

export function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 md:px-8 md:py-8">
      <div className="space-y-1">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/60 p-4 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-10" />
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border/60 p-4">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <div className="rounded-xl border border-border/60 divide-y divide-border/60">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-2 w-2 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-52" />
              </div>
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
