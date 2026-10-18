import Link from 'next/link';
import { cn } from '@/lib/utils';
import { legalRoutes } from '@/lib/legal/routes';

/** Public footer with the legal pages (TASK-069): auth and legal layouts. */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn('border-t border-border/60', className)}>
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-6">
        <p>© {new Date().getFullYear()} OmniFlow</p>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-2">
          {legalRoutes.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {route.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
