import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Short overline above the title (13 px, 500, muted). */
  eyebrow?: React.ReactNode;
  /** Optional icon beside the title; muted and title-sized, never on a decorative tile. */
  icon?: LucideIcon;
  /** Page actions, wrapped under the title when there is not enough room. */
  children?: React.ReactNode;
  className?: string;
}

// Main-page header: a typographic block (no card, background, or shadow).
// Title 28 / 34 px 700, description 14 px muted. The page container supplies
// the 32 px spacing below it.
export function PageHeader({
  title,
  description,
  eyebrow,
  icon: Icon,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div
      data-slot="page-header"
      className={cn('flex flex-wrap items-start justify-between gap-x-6 gap-y-4', className)}
    >
      <div className="flex min-w-0 flex-[1_1_20rem] flex-col gap-1.5">
        {eyebrow && (
          <p data-slot="page-header-eyebrow" className="text-label">
            {eyebrow}
          </p>
        )}
        <h1 className="flex items-start gap-2.5 text-page-title text-balance wrap-break-word">
          {Icon && (
            <Icon
              data-slot="page-header-icon"
              aria-hidden="true"
              className="mt-1.5 size-6 shrink-0 text-muted-foreground"
            />
          )}
          <span className="min-w-0">{title}</span>
        </h1>
        {description && (
          <p data-slot="page-header-description" className="max-w-2xl text-body-secondary">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div
          data-slot="page-header-actions"
          className="flex max-w-full flex-wrap items-center gap-2"
        >
          {children}
        </div>
      )}
    </div>
  );
}
