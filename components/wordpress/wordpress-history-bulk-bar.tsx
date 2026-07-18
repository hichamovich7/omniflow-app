'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SelectionActionBar } from '@/components/editorial/selection-action-bar';
import { useSelection } from '@/components/editorial/selection-provider';
import { DeleteArticlesDialog, type ArticleToDelete } from './delete-articles-dialog';

interface WordPressHistoryBulkBarProps {
  articles: ArticleToDelete[];
}

export function WordPressHistoryBulkBar({ articles }: WordPressHistoryBulkBarProps) {
  const { selectedIds } = useSelection();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const selected = articles.filter((a) => selectedIds.has(a.generationId));

  return (
    <>
      <SelectionActionBar>
        <Button variant="destructive" size="xs" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="mr-1 h-3 w-3" />
          Delete ({selected.length})
        </Button>
      </SelectionActionBar>
      {deleteOpen && (
        <DeleteArticlesDialog articles={selected} open={deleteOpen} onOpenChange={setDeleteOpen} />
      )}
    </>
  );
}
