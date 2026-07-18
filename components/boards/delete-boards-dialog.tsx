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

export interface BoardToDelete {
  id: string;
  name: string;
}

interface DeleteBoardsDialogProps {
  boards: BoardToDelete[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  redirectTo?: string;
}

export function DeleteBoardsDialog({ boards, open, onOpenChange, redirectTo }: DeleteBoardsDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const isMatch = confirmText.trim() === DELETE_CONFIRMATION_KEYWORD;
  const isBulk = boards.length > 1;

  async function handleDelete() {
    if (!isMatch) return;
    setLoading(true);

    const results = await Promise.allSettled(
      boards.map((b) => fetch(`/api/boards/${b.id}`, { method: 'DELETE' }))
    );
    const failedCount = results.filter((r) => r.status === 'rejected' || !r.value.ok).length;
    const succeededCount = boards.length - failedCount;

    if (failedCount === 0) {
      toast.success(isBulk ? `${succeededCount} boards deleted` : 'Board deleted');
    } else if (succeededCount > 0) {
      toast.error(`${succeededCount} deleted, ${failedCount} failed — try again for the rest`);
    } else {
      toast.error(isBulk ? 'Failed to delete boards' : 'Failed to delete board');
    }

    setLoading(false);
    onOpenChange(false);
    if (redirectTo && failedCount === 0) {
      router.push(redirectTo);
    }
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
          <DialogTitle>{isBulk ? `Delete ${boards.length} Boards` : 'Delete Board'}</DialogTitle>
          <DialogDescription>
            {isBulk ? (
              <>This will permanently delete {boards.length} boards.</>
            ) : (
              <>This will permanently delete &quot;{boards[0]?.name}&quot;.</>
            )}{' '}
            Pins previously assigned to {isBulk ? 'these boards are' : 'this board are'} not deleted — they
            just lose their board link. This action cannot be undone.
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
            {loading ? 'Deleting...' : isBulk ? `Delete ${boards.length}` : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
