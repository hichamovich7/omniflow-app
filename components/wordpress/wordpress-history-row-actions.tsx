'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { DeleteArticlesDialog } from './delete-articles-dialog';

interface WordPressHistoryRowActionsProps {
  generationId: string;
  articleTitle: string;
}

export function WordPressHistoryRowActions({ generationId, articleTitle }: WordPressHistoryRowActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setDeleteOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        aria-label={`Delete article: ${articleTitle}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <DeleteArticlesDialog
        articles={[{ generationId, title: articleTitle }]}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
