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

interface ArchiveContentStreamDialogProps {
  contentStreamId: string;
  contentStreamName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Light confirmation before archiving — never a physical delete. Mirrors
 * components/projects/delete-project-dialog.tsx's exact shape, but calls
 * the archive endpoint (status -> 'archived') instead of DELETE.
 */
export function ArchiveContentStreamDialog({
  contentStreamId,
  contentStreamName,
  open,
  onOpenChange,
}: ArchiveContentStreamDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleArchive() {
    setLoading(true);

    const res = await fetch(`/api/content-streams/${contentStreamId}/archive`, { method: 'POST' });
    const json = await res.json();

    if (!res.ok || json.error) {
      toast.error(json.error?.message ?? 'Failed to archive content stream');
      setLoading(false);
      return;
    }

    toast.success('Content stream archived');
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive Content Stream</DialogTitle>
          <DialogDescription>
            Archive &quot;{contentStreamName}&quot;? It stays in your history and its board becomes available again —
            nothing is deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleArchive} disabled={loading}>
            {loading ? 'Archiving...' : 'Archive'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
