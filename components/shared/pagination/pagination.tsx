import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PaginationProps {
  /** Route the pages link to, e.g. `/history`. */
  basePath: string;
  currentPage: number;
  totalPages: number;
  /** Current filters, carried over to every page link (`page` is replaced). */
  searchParams: Record<string, string | undefined>;
}

export function buildPageHref(
  basePath: string,
  searchParams: Record<string, string | undefined>,
  page: number
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key !== 'page' && value) params.set(key, value);
  }
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

const stepClass = cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1');

// Previous / Next pagination for server-paginated lists (docs/DESIGN.md,
// Pagination). The ends render as disabled buttons, not dead links.
export function Pagination({ basePath, currentPage, totalPages, searchParams }: PaginationProps) {
  if (totalPages <= 1) return null;

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground tabular-nums">
        Page {currentPage} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        {hasPrev ? (
          <Link
            href={buildPageHref(basePath, searchParams, currentPage - 1)}
            rel="prev"
            className={stepClass}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Previous
          </Link>
        ) : (
          <span aria-disabled="true" className={stepClass}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            Previous
          </span>
        )}
        {hasNext ? (
          <Link
            href={buildPageHref(basePath, searchParams, currentPage + 1)}
            rel="next"
            className={stepClass}
          >
            Next
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <span aria-disabled="true" className={stepClass}>
            Next
            <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        )}
      </div>
    </nav>
  );
}
