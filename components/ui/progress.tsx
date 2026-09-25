import * as React from 'react';

import { cn } from '@/lib/utils';

// Determinate progress bar: 6 px, full radius, `--muted` track and primary fill.
// Always a `progressbar` with its range, so give it a name (`aria-label` or
// `aria-labelledby`) and, when the raw number reads poorly, `aria-valuetext`.
// The value is clamped to [0, max]; a non-positive or non-finite max, or a
// non-finite value, renders an empty track instead of invalid ARIA values.
function Progress({
  value,
  max = 100,
  className,
  ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & { value: number; max?: number }) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  const clamped = safeMax > 0 && Number.isFinite(value) ? Math.min(Math.max(value, 0), safeMax) : 0;
  const percent = safeMax > 0 ? (clamped / safeMax) * 100 : 0;

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={clamped}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out motion-reduce:transition-none"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export { Progress };
