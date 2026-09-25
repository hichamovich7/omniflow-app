import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface MetricProgress {
  value: number;
  max: number;
  /** Accessible name of the bar when the visible label is ambiguous. Defaults to the label. */
  label?: string;
  /** Read instead of the raw number, e.g. "240 € of 1000 €". */
  valueText?: string;
}

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  /** Muted text after the value, e.g. "/ 25". */
  secondaryValue?: React.ReactNode;
  /** Top-right slot, e.g. a `Badge`. Takes precedence over `icon`. */
  badge?: React.ReactNode;
  icon?: LucideIcon;
  progress?: MetricProgress;
  /** Makes the whole card a link; shows an arrow when there is no badge or icon. */
  href?: string;
  className?: string;
}

// KPI card: `Card` surface with 16 px padding, a 13 px / 500 muted label, a
// `text-kpi` value (30 px / 700, tabular figures) and an optional bar pinned to
// the bottom so cards in the same grid row line up.
function MetricCard({
  label,
  value,
  secondaryValue,
  badge,
  icon: Icon,
  progress,
  href,
  className,
}: MetricCardProps) {
  const adornment =
    badge ??
    (Icon ? (
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    ) : href ? (
      <ArrowUpRight
        className="size-4 shrink-0 text-subtle-foreground transition-colors group-hover/metric:text-primary"
        aria-hidden="true"
      />
    ) : null);

  const card = (
    <Card
      data-slot="metric-card"
      className={cn(
        'h-full gap-3 p-4',
        href &&
          'transition-[border-color,box-shadow] duration-150 group-hover/metric:border-primary/40 group-hover/metric:shadow-sm',
        !href && className
      )}
    >
      {/* Only a badge may drop under the label; a 16 px icon stays beside it. */}
      <div
        className={cn(
          'flex items-start justify-between gap-x-2 gap-y-1',
          badge != null && 'flex-wrap'
        )}
      >
        <p className="text-label min-w-0 wrap-break-word">{label}</p>
        {adornment}
      </div>
      <p className="flex flex-wrap items-baseline gap-x-1.5 text-foreground">
        <span className="text-kpi">{value}</span>
        {secondaryValue != null && (
          <span className="text-sm text-muted-foreground tabular-nums">{secondaryValue}</span>
        )}
      </p>
      {progress && (
        <Progress
          className="mt-auto"
          value={progress.value}
          max={progress.max}
          aria-label={progress.label ?? label}
          aria-valuetext={progress.valueText}
        />
      )}
    </Card>
  );

  if (!href) return card;

  return (
    <Link
      href={href}
      className={cn(
        'group/metric block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className
      )}
    >
      {card}
    </Link>
  );
}

// Equal columns sized by the grid's own width: 2 columns, 3 from a 576 px
// container, 4 from 896 px. A last row that would leave empty slots is filled
// instead; spans are computed from the item count, so the order never changes.
const THREE_COLUMN_SPAN = {
  default: '@xl:col-span-4',
  1: '@xl:col-span-12',
  2: '@xl:col-span-6',
} as const;
const FOUR_COLUMN_SPAN = {
  default: '@4xl:col-span-3',
  1: '@4xl:col-span-12',
  2: '@4xl:col-span-6',
  3: '@4xl:col-span-4',
} as const;

function lastRowSpan<T extends Record<'default' | number, string>>(
  spans: T,
  index: number,
  count: number,
  columns: number
) {
  const remainder = count % columns;
  return remainder > 0 && index >= count - remainder ? spans[remainder] : spans.default;
}

function MetricGrid({ className, children, ...props }: React.ComponentProps<'div'>) {
  const items = React.Children.toArray(children);
  const count = items.length;

  return (
    <div className="@container">
      <div
        data-slot="metric-grid"
        className={cn('grid grid-cols-2 gap-3 @xl:grid-cols-12 @xl:gap-4', className)}
        {...props}
      >
        {items.map((item, index) => (
          <div
            key={React.isValidElement(item) && item.key != null ? item.key : index}
            className={cn(
              'min-w-0',
              count % 2 === 1 && index === count - 1 && 'col-span-2',
              lastRowSpan(THREE_COLUMN_SPAN, index, count, 3),
              lastRowSpan(FOUR_COLUMN_SPAN, index, count, 4)
            )}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

interface ProgressMetricProps {
  label: string;
  value: React.ReactNode;
  /** Muted text after the value, e.g. "/ 4". */
  secondaryValue?: React.ReactNode;
  /** Omit when there is no target to measure against (the bar is then not rendered). */
  progress?: MetricProgress;
  className?: string;
}

// Label and value on one line, bar underneath. The bar is named by the label.
function ProgressMetric({
  label,
  value,
  secondaryValue,
  progress,
  className,
}: ProgressMetricProps) {
  return (
    <div data-slot="progress-metric" className={cn('min-w-0 space-y-2', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-label min-w-0">{label}</p>
        <p className="text-label text-foreground tabular-nums">
          {value}
          {secondaryValue != null && (
            <span className="font-normal text-muted-foreground"> {secondaryValue}</span>
          )}
        </p>
      </div>
      {progress && (
        <Progress
          value={progress.value}
          max={progress.max}
          aria-label={progress.label ?? label}
          aria-valuetext={progress.valueText}
        />
      )}
    </div>
  );
}

export { MetricCard, MetricGrid, ProgressMetric };
export type { MetricCardProps, MetricProgress, ProgressMetricProps };
