import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Ban, FileQuestion, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PageStateVariant = 'loading' | 'empty' | 'error' | 'permission-denied';

interface PageStateProps {
  variant: PageStateVariant;
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}

const defaults: Record<PageStateVariant, { icon: LucideIcon; role?: 'alert'; iconClassName: string }> = {
  loading: { icon: LoaderCircle, iconClassName: 'animate-spin text-muted-foreground' },
  empty: { icon: FileQuestion, iconClassName: 'text-muted-foreground' },
  error: { icon: AlertTriangle, role: 'alert', iconClassName: 'text-destructive' },
  'permission-denied': { icon: Ban, role: 'alert', iconClassName: 'text-warning' },
};

export function PageState({ variant, title, description, icon, action, className }: PageStateProps) {
  const defaultState = defaults[variant];
  const Icon = icon ?? defaultState.icon;

  return (
    <section
      className={cn('flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-surface px-6 py-12 text-center', className)}
      role={defaultState.role}
      aria-live={variant === 'loading' ? 'polite' : undefined}
      aria-busy={variant === 'loading' || undefined}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
        <Icon className={cn('h-5 w-5', defaultState.iconClassName)} aria-hidden="true" />
      </div>
      <h2 className="text-card-title">{title}</h2>
      {description && <p className="mt-1 max-w-md text-secondary">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </section>
  );
}
