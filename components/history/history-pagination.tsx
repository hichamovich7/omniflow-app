import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface HistoryPaginationProps {
  currentPage: number;
  totalPages: number;
  searchParams: Record<string, string | undefined>;
}

function buildHref(searchParams: Record<string, string | undefined>, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key !== 'page' && value) params.set(key, value);
  }
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/history?${query}` : '/history';
}

export function HistoryPagination({ currentPage, totalPages, searchParams }: HistoryPaginationProps) {
  if (totalPages <= 1) return null;

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <div className="flex items-center justify-between pt-2">
      <p className="text-xs text-muted-foreground">
        Page {currentPage} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={buildHref(searchParams, currentPage - 1)}
          aria-disabled={!hasPrev}
          tabIndex={hasPrev ? undefined : -1}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            !hasPrev && 'pointer-events-none opacity-40'
          )}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Previous
        </Link>
        <Link
          href={buildHref(searchParams, currentPage + 1)}
          aria-disabled={!hasNext}
          tabIndex={hasNext ? undefined : -1}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            !hasNext && 'pointer-events-none opacity-40'
          )}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
