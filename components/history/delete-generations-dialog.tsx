'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
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
import type { WordPressUsageArticle } from '@/lib/queries/wordpress-usage';

const DELETE_CONFIRMATION_KEYWORD = 'SUPPRIMER';

export interface GenerationToDelete {
  id: string;
  keyword: string;
  wordpressArticles?: WordPressUsageArticle[];
}

interface DeleteGenerationsDialogProps {
  generations: GenerationToDelete[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteGenerationsDialog({
  generations,
  open,
  onOpenChange,
}: DeleteGenerationsDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const isMatch = confirmText.trim() === DELETE_CONFIRMATION_KEYWORD;
  const isBulk = generations.length > 1;

  const affectedArticles = Array.from(
    new Map(
      generations.flatMap((g) => g.wordpressArticles ?? []).map((article) => [article.generationId, article])
    ).values()
  );

  async function handleDelete() {
    if (!isMatch) return;
    setLoading(true);

    const results = await Promise.allSettled(
      generations.map((g) => fetch(`/api/generations/${g.id}`, { method: 'DELETE' }))
    );
    const failedCount = results.filter((r) => r.status === 'rejected' || !r.value.ok).length;
    const succeededCount = generations.length - failedCount;

    if (failedCount === 0) {
      toast.success(isBulk ? `${succeededCount} generations deleted` : 'Generation deleted');
    } else if (succeededCount > 0) {
      toast.error(`${succeededCount} deleted, ${failedCount} failed — try again for the rest`);
    } else {
      toast.error(isBulk ? 'Failed to delete generations' : 'Failed to delete generation');
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
            {isBulk ? `Delete ${generations.length} Generations Permanently` : 'Delete Generation Permanently'}
          </DialogTitle>
          <DialogDescription>
            {isBulk ? (
              <>This will permanently delete {generations.length} generations, including every pin and generated image in them.</>
            ) : (
              <>This will permanently delete &quot;{generations[0]?.keyword}&quot;, including every pin and generated image in it.</>
            )}{' '}
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {affectedArticles.length > 0 && (
          <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p>
                Some of the pins {isBulk ? 'in this selection were' : 'in this generation were'} used to create{' '}
                {affectedArticles.length === 1 ? 'a WordPress article' : `${affectedArticles.length} WordPress articles`}:
              </p>
              <ul className="list-inside list-disc">
                {affectedArticles.map((article) => (
                  <li key={article.generationId}>
                    <Link href={`/wordpress/${article.generationId}`} target="_blank" className="underline">
                      {article.title}
                    </Link>
                  </li>
                ))}
              </ul>
              <p>Deleting will remove those pins&apos; images — the article(s) above will keep broken image links.</p>
            </div>
          </div>
        )}

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
            {loading ? 'Deleting...' : isBulk ? `Delete ${generations.length} Permanently` : 'Delete Permanently'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
