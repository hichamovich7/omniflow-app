'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SelectionActionBar } from '@/components/editorial/selection-action-bar';
import { useSelection } from '@/components/editorial/selection-provider';
import { DeleteBoardsDialog, type BoardToDelete } from './delete-boards-dialog';

interface BoardsBulkBarProps {
  boards: BoardToDelete[];
}

export function BoardsBulkBar({ boards }: BoardsBulkBarProps) {
  const { selectedIds } = useSelection();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const selected = boards.filter((b) => selectedIds.has(b.id));

  return (
    <>
      <SelectionActionBar>
        <Button variant="destructive" size="xs" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="mr-1 h-3 w-3" />
          Delete ({selected.length})
        </Button>
      </SelectionActionBar>
      {deleteOpen && (
        <DeleteBoardsDialog boards={selected} open={deleteOpen} onOpenChange={setDeleteOpen} />
      )}
    </>
  );
}
