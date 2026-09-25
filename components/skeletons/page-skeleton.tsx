import { PageContainer } from '@/components/ui/page-container';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface PageSkeletonProps {
  /** Short text for assistive tech, e.g. "Loading projects". */
  label: string;
  narrow?: boolean;
  children: React.ReactNode;
}

// Route-level loading wrapper: the page's own container, marked busy, with one
// status message instead of announcing every skeleton block (they are empty,
// decorative divs).
export function PageSkeleton({ label, narrow, children }: PageSkeletonProps) {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        {label}
      </p>
      <PageContainer narrow={narrow}>{children}</PageContainer>
    </div>
  );
}

/** Outline of a card (1 px border, 16 px radius) holding skeleton lines. */
export function SkeletonCard({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-3 rounded-xl border border-border bg-card p-5', className)}>
      {children}
    </div>
  );
}

/** Geometry of the centred generator headers (Pinterest, WordPress): icon tile, title, description. */
export function CenteredHeaderSkeleton() {
  return (
    <div className="flex flex-col items-center pt-2">
      <Skeleton className="size-11 rounded-xl" />
      <Skeleton className="mt-4 h-7 w-56 max-w-full" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full" />
    </div>
  );
}
