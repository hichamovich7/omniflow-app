'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeleteArticlesDialog } from './delete-articles-dialog';

interface WordPressHistoryRowActionsProps {
  generationId: string;
  articleTitle: string;
}

export function WordPressHistoryRowActions({
  generationId,
  articleTitle,
}: WordPressHistoryRowActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setDeleteOpen(true)}
        className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
        aria-label={`Delete article: ${articleTitle}`}
      >
        <Trash2 />
      </Button>
      <DeleteArticlesDialog
        articles={[{ generationId, title: articleTitle }]}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
