import { cn } from '@/lib/utils';

// Decorative placeholder: `--muted` block with a slow pulse, static when the
// user prefers reduced motion. Round it like the content it stands in for.
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
      {...props}
    />
  );
}

export { Skeleton };
