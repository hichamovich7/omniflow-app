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
      <p className="text-[13px] font-medium text-muted-foreground">
        {selectedCount > 0
          ? `${selectedCount} selected of ${total} ${total === 1 ? 'pin' : 'pins'}`
          : `${total} generated ${total === 1 ? 'pin' : 'pins'}`}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => selectAll(allIds)}
          disabled={selectedCount === total}
        >
          Select All
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={selectNone}
          disabled={selectedCount === 0}
        >
          Select None
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => invertSelection(allIds)}
        >
          Invert
        </Button>
      </div>
    </div>
  );
}
