import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  children: React.ReactNode;
  actions?: React.ReactNode;
  resultsLabel?: string;
  className?: string;
}

/** Width for a Select inside `FilterBar`: a grid cell below `sm`, 160 px above. */
export const filterSelectClass = 'w-full sm:w-40';

// List filters (docs/DESIGN.md, Filters): no surrounding box. Below `sm` the
// controls form a two-column grid with the search on its own row; above, one
// wrapping row with 8 px gaps. Controls keep their standard 40 / 44 px height.
export function FilterBar({ children, actions, resultsLabel, className }: FilterBarProps) {
  return (
    <div
      role="group"
      aria-label="Filters"
      className={cn(
        'flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between',
        className
      )}
    >
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        {children}
      </div>
      {(actions || resultsLabel) && (
        <div className="flex items-center gap-2 md:shrink-0">
          {resultsLabel && (
            <span className="text-metadata" aria-live="polite">
              {resultsLabel}
            </span>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}

interface FilterBarSearchProps extends Omit<React.ComponentProps<typeof Input>, 'type'> {
  /** Accessible name; the placeholder alone is not a label. */
  label: string;
}

/** Search field for `FilterBar`: full row below `sm`, then up to 320 px. */
export function FilterBarSearch({ label, className, ...props }: FilterBarSearchProps) {
  return (
    <div className="relative col-span-2 sm:min-w-56 sm:flex-1 sm:basis-56 lg:max-w-xs">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input aria-label={label} className={cn('pl-9', className)} {...props} />
    </div>
  );
}
