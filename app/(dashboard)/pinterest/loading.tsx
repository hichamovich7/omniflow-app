import { PageContainer } from '@/components/ui/page-container';
import { Skeleton } from '@/components/ui/skeleton';

export default function PinterestLoading() {
  return (
    <PageContainer>
      <div className="flex flex-col items-center pt-8 sm:pt-16">
        <Skeleton className="h-14 w-14 rounded-2xl" />
        <Skeleton className="mt-5 h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>

      <div className="mx-auto w-full max-w-xl space-y-4 mt-10">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
        <Skeleton className="h-12 w-full" />
      </div>
    </PageContainer>
  );
}
