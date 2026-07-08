import { PageContainer } from '@/components/ui/page-container';
import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/skeletons/table-skeleton';

export default function HistoryLoading() {
  return (
    <PageContainer>
      <div className="space-y-1">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-56" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>

      <TableSkeleton rows={6} />
    </PageContainer>
  );
}
