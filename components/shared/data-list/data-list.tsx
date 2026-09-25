'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

// Data lists (docs/DESIGN.md, Tables): the card-free counterpart of `Table` for
// records that read as a title + metadata line rather than aligned columns.
// One bordered surface, horizontal separators, `surface-muted` hover and
// `selected` rows, always-visible row actions.
export function DataList({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="data-list"
      className={cn(
        'divide-y divide-border overflow-hidden rounded-xl border border-border bg-card',
        className
      )}
      {...props}
    />
  );
}

interface DataListRowProps extends React.ComponentProps<'li'> {
  selected?: boolean;
}

export function DataListRow({ selected, className, ...props }: DataListRowProps) {
  return (
    <li
      data-slot="data-list-row"
      data-selected={selected || undefined}
      className={cn(
        'group/row flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-muted data-selected:bg-selected motion-reduce:transition-none',
        className
      )}
      {...props}
    />
  );
}

interface DataListCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  /** Accessible name, e.g. "Select generation: crochet cat". */
  label: string;
}

/** 16 px checkbox inside a 44 px (32 px from `lg`) click target. */
export function DataListCheckbox({ checked, onToggle, label }: DataListCheckboxProps) {
  return (
    <label className="-m-2 flex size-11 shrink-0 cursor-pointer items-center justify-center lg:-m-1 lg:size-8">
      <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={label} />
    </label>
  );
}

/**
 * Metadata line color. `muted-foreground` falls under 4.5:1 on the light
 * `surface-muted` / `selected` row states, so those states use
 * `secondary-foreground`; dark keeps `muted-foreground` (5.5:1 or more).
 */
export const dataListMetaClass =
  'text-xs text-muted-foreground group-hover/row:text-secondary-foreground group-data-selected/row:text-secondary-foreground dark:group-hover/row:text-muted-foreground dark:group-data-selected/row:text-muted-foreground';

/** Dot between metadata items, hidden from assistive technology. */
export function MetaSeparator() {
  // Real spaces around the dot are the line-break opportunities between items.
  return (
    <>
      {' '}
      <span aria-hidden="true" className="mx-0.5">
        ·
      </span>{' '}
    </>
  );
}
