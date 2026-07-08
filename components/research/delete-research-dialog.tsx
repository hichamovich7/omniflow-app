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

interface DeleteResearchDialogProps {
  researchId: string;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteResearchDialog({
  researchId,
  label,
  open,
  onOpenChange,
}: DeleteResearchDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);

    const res = await fetch(`/api/research/${researchId}`, { method: 'DELETE' });
    const json = await res.json();

    if (!res.ok || json.error) {
      toast.error(json.error?.message ?? 'Failed to delete research result');
      setLoading(false);
      return;
    }

    toast.success('Research result deleted');
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Research Result</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &quot;{label}&quot;? This action cannot be undone.
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
