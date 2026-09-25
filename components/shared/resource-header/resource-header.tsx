import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ResourceHeaderProps {
  title: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  /** A `Badge` / `StatusBadge`, shown beside the title. */
  status?: React.ReactNode;
  /** Resource description (14 px muted). */
  description?: React.ReactNode;
  /** Secondary facts such as dates or counts (12 px, 500, muted). */
  metadata?: React.ReactNode;
  actions?: React.ReactNode;
  /** Renders a ghost icon back link before the title. */
  backHref?: string;
  /** Accessible name of the back link. */
  backLabel?: string;
  /**
   * `default`: resource title, 22 / 28 px 600. `page`: 28 / 34 px 700, for the
   * pages that still use this header as their main page header.
   */
  size?: 'default' | 'page';
  className?: string;
}

// Detail / resource header: more compact than PageHeader, same typographic
// block (no card). Actions wrap under the title when there is not enough room.
export function ResourceHeader({
  title,
  breadcrumbs,
  status,
  description,
  metadata,
  actions,
  backHref,
  backLabel = 'Back',
  size = 'default',
  className,
}: ResourceHeaderProps) {
  return (
    <header data-slot="resource-header" className={cn('flex flex-col gap-2', className)}>
      {breadcrumbs && <div className="text-metadata">{breadcrumbs}</div>}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-[1_1_20rem] items-start gap-2">
          {backHref && (
            <Link
              href={backHref}
              aria-label={backLabel}
              data-slot="resource-header-back"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
                // Centre the 36 px (44 px touch) target on the first title line.
                '-ml-2 shrink-0 text-muted-foreground hover:text-foreground',
                size === 'page' ? '-my-px max-md:-my-1.25' : '-my-1 max-md:-my-2'
              )}
            >
              <ArrowLeft aria-hidden="true" className="size-4.5" />
            </Link>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1
                className={cn(
                  'min-w-0 wrap-break-word',
                  size === 'page' ? 'text-page-title' : 'text-section-title'
                )}
              >
                {title}
              </h1>
              {status}
            </div>
            {description && (
              <div
                data-slot="resource-header-description"
                className="max-w-2xl text-body-secondary"
              >
                {description}
              </div>
            )}
            {metadata && (
              <div
                data-slot="resource-header-metadata"
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-metadata font-medium"
              >
                {metadata}
              </div>
            )}
          </div>
        </div>
        {actions && (
          <div
            data-slot="resource-header-actions"
            className="flex max-w-full flex-wrap items-center gap-2"
          >
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
