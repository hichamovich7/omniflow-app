import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// Disabled buttons get a muted, full-opacity look instead of a faded copy of
// their variant, so the label stays readable and the control reads as inert.
// `disabled:` / `aria-disabled:` are emitted after `hover:` / `active:`, so
// they also win over hover colors (the pointer is no longer blocked, which
// lets the not-allowed cursor show).
const filledDisabled =
  'disabled:border-border disabled:bg-muted disabled:text-muted-foreground aria-disabled:border-border aria-disabled:bg-muted aria-disabled:text-muted-foreground';

const buttonVariants = cva(
  // Touch target: at least 44 × 44 px below `md` (the same breakpoint as Input/Select), then the size's own height.
  'group/button inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap outline-none select-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:scale-[0.98] disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100 aria-disabled:cursor-not-allowed aria-disabled:shadow-none aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:min-h-0 md:min-w-0 dark:aria-invalid:ring-destructive/30 motion-reduce:transition-none motion-reduce:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: cn(
          'bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover',
          filledDisabled
        ),
        outline: cn(
          'border-border bg-card text-foreground shadow-xs hover:border-input hover:bg-muted aria-expanded:border-input aria-expanded:bg-muted',
          'disabled:border-border disabled:bg-card disabled:text-muted-foreground aria-disabled:border-border aria-disabled:bg-card aria-disabled:text-muted-foreground'
        ),
        secondary: cn(
          'border-border bg-secondary text-secondary-foreground hover:border-input hover:bg-muted aria-expanded:border-input aria-expanded:bg-muted',
          filledDisabled
        ),
        ghost: cn(
          'text-foreground hover:bg-muted aria-expanded:bg-muted',
          'disabled:bg-transparent disabled:text-muted-foreground aria-disabled:bg-transparent aria-disabled:text-muted-foreground'
        ),
        destructive: cn(
          'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive-hover focus-visible:ring-destructive',
          filledDisabled
        ),
        // `--primary-hover` keeps link text >= 4.5:1 on the page canvas as well as on cards.
        link: 'text-primary-hover underline-offset-4 hover:underline focus-visible:underline disabled:text-muted-foreground disabled:no-underline aria-disabled:text-muted-foreground aria-disabled:no-underline',
      },
      size: {
        // Each size owns its default icon size (a shared base rule would tie with, and beat, the smaller ones).
        default:
          "h-10 gap-2 px-4 has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5 [&_svg:not([class*='size-'])]:size-4",
        // Compact exception (bulk bars, selection toolbars): 28 px, 12 px text, 8 px radius.
        xs: "h-7 gap-1 rounded-sm px-2 text-xs in-data-[slot=button-group]:rounded-sm has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-3 text-[0.8125rem] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-5 text-[0.9375rem] max-md:h-12 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4 [&_svg:not([class*='size-'])]:size-4.5",
        icon: "size-10 [&_svg:not([class*='size-'])]:size-4",
        'icon-xs':
          "size-7 rounded-sm in-data-[slot=button-group]:rounded-sm [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': "size-9 [&_svg:not([class*='size-'])]:size-3.5",
        'icon-lg': "size-11 [&_svg:not([class*='size-'])]:size-4.5",
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
