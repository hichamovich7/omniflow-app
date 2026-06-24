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

interface DeleteGenerationDialogProps {
  generationId: string;
  keyword: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteGenerationDialog({
  generationId,
  keyword,
  open,
  onOpenChange,
}: DeleteGenerationDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);

    const res = await fetch(`/api/generations/${generationId}`, { method: 'DELETE' });
    const json = await res.json();

    if (!res.ok || json.error) {
      toast.error(json.error?.message ?? 'Failed to delete generation');
      setLoading(false);
      return;
    }

    toast.success('Generation deleted');
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Generation</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the generation for &quot;{keyword}&quot;? This will
            permanently delete all generated pins. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
