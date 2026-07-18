'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SelectionActionBar } from '@/components/editorial/selection-action-bar';
import { useSelection } from '@/components/editorial/selection-provider';
import { DeleteGenerationsDialog, type GenerationToDelete } from './delete-generations-dialog';

interface HistoryBulkBarProps {
  generations: GenerationToDelete[];
}

export function HistoryBulkBar({ generations }: HistoryBulkBarProps) {
  const { selectedIds } = useSelection();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const selected = generations.filter((g) => selectedIds.has(g.id));

  return (
    <>
      <SelectionActionBar>
        <Button variant="destructive" size="xs" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="mr-1 h-3 w-3" />
          Delete ({selected.length})
        </Button>
      </SelectionActionBar>
      {deleteOpen && (
        <DeleteGenerationsDialog generations={selected} open={deleteOpen} onOpenChange={setDeleteOpen} />
      )}
    </>
  );
}
