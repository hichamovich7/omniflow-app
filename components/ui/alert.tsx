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
        // TASK-095: one color + icon per role, borders at ≈ 40 % so the box is visible.
        danger: 'border-destructive/40 bg-destructive-soft text-destructive-hover dark:text-destructive',
        warning: 'border-warning/45 bg-warning-soft text-warning',
        info: 'border-info/40 bg-info-soft text-info-foreground [&>svg]:text-info',
        success:
          'border-success/40 bg-success-soft text-[color-mix(in_oklab,var(--color-success),black_22%)] dark:text-success [&>svg]:text-success',
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
