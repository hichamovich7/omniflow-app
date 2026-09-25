import * as React from 'react';

import { cn } from '@/lib/utils';

// Reference surface: card background, 1 px semantic border, 16 px radius and a
// very light `shadow-xs` lift. Sections share one spacing token (24 px, or 20 px
// with `size="sm"`): the card owns the vertical padding and the gap between
// sections, each section only pads horizontally, so padding never doubles.
function Card({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<'div'> & { size?: 'default' | 'sm' }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        'group/card flex min-w-0 flex-col gap-(--card-spacing) overflow-hidden rounded-xl border border-border bg-card py-(--card-spacing) text-sm text-card-foreground shadow-xs [--card-spacing:--spacing(6)] has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(5)] *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl',
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'group/card-header @container/card-header grid auto-rows-min items-start gap-x-4 gap-y-1.5 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)',
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        'font-heading text-lg leading-6 font-semibold tracking-[-0.01em] wrap-break-word text-card-foreground group-data-[size=sm]/card:text-base group-data-[size=sm]/card:leading-5',
        className
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn(
        'text-sm leading-5 font-normal wrap-break-word text-muted-foreground',
        className
      )}
      {...props}
    />
  );
}

// Top-right of the header, spanning title + description. The negative block
// margin centres a 36 px button (`sm` / `icon-sm`) on the 24 px title line
// instead of pushing the content down.
function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'col-start-2 row-span-2 row-start-1 -my-1.5 flex items-center gap-2 self-start justify-self-end',
        className
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('min-w-0 px-(--card-spacing)', className)}
      {...props}
    />
  );
}

// No divider or tinted band by default; add `border-t` for one (it then gets
// the section spacing above it, like `border-b` on the header).
function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-b-xl px-(--card-spacing) [.border-t]:pt-(--card-spacing)',
        className
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
