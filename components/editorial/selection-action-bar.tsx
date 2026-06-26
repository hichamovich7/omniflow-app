'use client';

import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useSelection } from './selection-provider';

interface SelectionActionBarProps {
  children: React.ReactNode;
}

export function SelectionActionBar({ children }: SelectionActionBarProps) {
  const { selectedCount, selectNone } = useSelection();

  if (selectedCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/3 px-4 py-2.5">
      <span className="text-[13px] font-medium text-primary">
        {selectedCount} Selected
      </span>
      <div className="mx-1 h-4 w-px bg-border" />
      {children}
      <Button
        variant="ghost"
        size="xs"
        onClick={selectNone}
        className="ml-auto"
        aria-label="Clear selection"
      >
        <X className="mr-1 h-3 w-3" />
        Clear
      </Button>
    </div>
  );
}
