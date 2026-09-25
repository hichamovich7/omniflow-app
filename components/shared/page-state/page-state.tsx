import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Ban, Clock, FileQuestion, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PageStateVariant = 'loading' | 'empty' | 'error' | 'permission-denied' | 'unavailable';

interface PageStateProps {
  variant: PageStateVariant;
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** An existing `Button` / link styled with `buttonVariants`. Never invent one. */
  action?: React.ReactNode;
  /** Heading level of the title: 2 inside a page, 3 inside a titled section, 1 when it replaces the page. */
  headingLevel?: 1 | 2 | 3;
  className?: string;
}

const defaults: Record<
  PageStateVariant,
  { icon: LucideIcon; role?: 'alert'; tileClassName: string; iconClassName: string }
> = {
  loading: {
    icon: LoaderCircle,
    tileClassName: 'bg-muted',
    iconClassName: 'animate-spin text-muted-foreground',
  },
  empty: { icon: FileQuestion, tileClassName: 'bg-muted', iconClassName: 'text-muted-foreground' },
  error: {
    icon: AlertTriangle,
    role: 'alert',
    tileClassName: 'bg-destructive-soft',
    iconClassName: 'text-destructive',
  },
  'permission-denied': {
    icon: Ban,
    role: 'alert',
    tileClassName: 'bg-warning-soft',
    iconClassName: 'text-warning',
  },
  unavailable: { icon: Clock, tileClassName: 'bg-muted', iconClassName: 'text-muted-foreground' },
};

// Canonical page- and section-level state (empty, no results, error, unavailable,
// loading): a compact centred block inside a dashed `--border` outline with no
// fill, a 40 px tile holding a 20 px icon, an 18 px / 600 title, a 14 px muted
// description and at most one existing action. Tone lives only in the icon tile.
export function PageState({
  variant,
  title,
  description,
  icon,
  action,
  headingLevel = 2,
  className,
}: PageStateProps) {
  const defaultState = defaults[variant];
  const Icon = icon ?? defaultState.icon;
  const Heading = `h${headingLevel}` as const;

  return (
    <section
      data-slot="page-state"
      data-variant={variant}
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-10 text-center',
        className
      )}
      role={defaultState.role}
      aria-live={variant === 'loading' ? 'polite' : undefined}
      aria-busy={variant === 'loading' || undefined}
    >
      <div
        className={cn(
          'mb-4 flex size-10 items-center justify-center rounded-lg',
          defaultState.tileClassName
        )}
      >
        <Icon className={cn('size-5', defaultState.iconClassName)} aria-hidden="true" />
      </div>
      <Heading className="text-card-title text-balance">{title}</Heading>
      {description && (
        <p className="text-body-secondary mt-1.5 max-w-md text-balance">{description}</p>
      )}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </section>
  );
}
