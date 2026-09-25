import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// Soft semantic badges (docs/DESIGN.md, Badges and status): 22 px tall, 12 px
// text, 6 px radius (`radius-xs`, compact tags), tinted surface + semantic text
// + subtle border. Text colors are the AA-safe (>= 4.5:1 at 12 px) shade of
// each role on its soft surface, in both themes.
const neutral = 'border-border bg-muted text-secondary-foreground [a]:hover:bg-secondary';
const primary = 'border-primary/20 bg-selected text-primary-hover [a]:hover:border-primary/40';
const danger =
  'border-destructive/20 bg-destructive-soft text-destructive-hover [a]:hover:border-destructive/40';

const badgeVariants = cva(
  'group/badge inline-flex h-5.5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-xs border px-2 text-xs leading-4 font-medium whitespace-nowrap transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        // Official roles.
        neutral,
        primary,
        success:
          'border-success/20 bg-success-soft text-[color-mix(in_oklab,var(--color-success),black_22%)] dark:text-success [a]:hover:border-success/40',
        warning: 'border-warning/25 bg-warning-soft text-warning [a]:hover:border-warning/45',
        danger,
        purple:
          'border-brand-accent/20 bg-brand-accent-soft text-brand-accent [a]:hover:border-brand-accent/40',
        // Neutral with no fill, for metadata (counts, categories, sources).
        outline: 'border-border bg-transparent text-secondary-foreground [a]:hover:bg-muted',
        // Kept for API compatibility: aliases of the official roles.
        default: primary,
        secondary: neutral,
        destructive: danger,
        // Non-status helpers, unchanged in role.
        ghost:
          'border-transparent hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'border-transparent text-primary underline-offset-4 hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Badge({
  className,
  variant = 'default',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: 'badge',
      variant,
    },
  });
}

export { Badge, badgeVariants };
