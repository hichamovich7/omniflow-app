import { cn } from '@/lib/utils';

interface FilterBarProps {
  children: React.ReactNode;
  actions?: React.ReactNode;
  resultsLabel?: string;
  className?: string;
}

export function FilterBar({ children, actions, resultsLabel, className }: FilterBarProps) {
  return <div className={cn('flex flex-col gap-3 rounded-xl border border-border/60 bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between', className)} aria-label="Filters"><div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>{(actions || resultsLabel) && <div className="flex items-center gap-2 sm:shrink-0">{resultsLabel && <span className="text-metadata" aria-live="polite">{resultsLabel}</span>}{actions}</div>}</div>;
}
