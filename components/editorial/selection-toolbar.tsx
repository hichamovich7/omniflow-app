'use client';

import { Button } from '@/components/ui/button';
import { useSelection } from './selection-provider';

interface SelectionToolbarProps {
  allIds: string[];
}

export function SelectionToolbar({ allIds }: SelectionToolbarProps) {
  const { selectedCount, selectAll, selectNone, invertSelection } = useSelection();
  const total = allIds.length;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[0.8125rem] font-medium text-muted-foreground tabular-nums">
        {selectedCount > 0
          ? `${selectedCount} selected of ${total} ${total === 1 ? 'pin' : 'pins'}`
          : `${total} generated ${total === 1 ? 'pin' : 'pins'}`}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => selectAll(allIds)}
          disabled={selectedCount === total}
        >
          Select All
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={selectNone}
          disabled={selectedCount === 0}
        >
          Select None
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => invertSelection(allIds)}
        >
          Invert
        </Button>
      </div>
    </div>
  );
}
