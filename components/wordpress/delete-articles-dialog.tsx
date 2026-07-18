'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const DELETE_CONFIRMATION_KEYWORD = 'SUPPRIMER';

export interface ArticleToDelete {
  generationId: string;
  title: string;
}

interface DeleteArticlesDialogProps {
  articles: ArticleToDelete[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteArticlesDialog({ articles, open, onOpenChange }: DeleteArticlesDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const isMatch = confirmText.trim() === DELETE_CONFIRMATION_KEYWORD;
  const isBulk = articles.length > 1;

  async function handleDelete() {
    if (!isMatch) return;
    setLoading(true);

    const results = await Promise.allSettled(
      articles.map((a) => fetch(`/api/wordpress/${a.generationId}`, { method: 'DELETE' }))
    );
    const failedCount = results.filter((r) => r.status === 'rejected' || !r.value.ok).length;
    const succeededCount = articles.length - failedCount;

    if (failedCount === 0) {
      toast.success(isBulk ? `${succeededCount} articles deleted permanently` : 'Article deleted permanently');
    } else if (succeededCount > 0) {
      toast.error(`${succeededCount} deleted, ${failedCount} failed — try again for the rest`);
    } else {
      toast.error(isBulk ? 'Failed to delete articles' : 'Failed to delete article');
    }

    setLoading(false);
    onOpenChange(false);
    router.refresh();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setConfirmText('');
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isBulk ? `Delete ${articles.length} Articles Permanently` : 'Delete Article Permanently'}
          </DialogTitle>
          <DialogDescription>
            {isBulk ? (
              <>This will permanently delete {articles.length} articles, including every featured and internal image generated for them.</>
            ) : (
              <>This will permanently delete &quot;{articles[0]?.title}&quot;, including its featured image and every internal image that was generated for it.</>
            )}{' '}
            This action cannot be undone — there is no way to recover {isBulk ? 'these articles' : 'this article'} afterward.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Type <span className="font-semibold text-foreground">{DELETE_CONFIRMATION_KEYWORD}</span> to confirm
          </label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Tapez SUPPRIMER pour confirmer"
            autoComplete="off"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={!isMatch || loading}>
            {loading ? 'Deleting...' : isBulk ? `Delete ${articles.length} Permanently` : 'Delete Permanently'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
