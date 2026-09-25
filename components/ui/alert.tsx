import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// Inline, in-flow message (docs/DESIGN.md, Loading, empty, error, and success
// states): soft semantic surface, subtle same-hue border, 14 px text in the
// AA-safe shade of the role, optional leading 16 px icon. Page-level states
// use `PageState`; transient confirmations use toasts.
const alertVariants = cva(
  'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        danger: 'border-destructive/20 bg-destructive-soft text-destructive-hover',
        warning: 'border-warning/25 bg-warning-soft text-warning',
        info: 'border-primary/20 bg-selected text-secondary-foreground [&>svg]:text-primary-hover',
      },
    },
    defaultVariants: {
      variant: 'danger',
    },
  }
);

/** `danger` is announced (`role="alert"`) unless the caller sets its own role. */
function Alert({
  className,
  variant = 'danger',
  role,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      data-variant={variant}
      role={role ?? (variant === 'danger' ? 'alert' : undefined)}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Alert, alertVariants };
