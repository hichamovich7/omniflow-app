'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Recommendation } from '@/types/dashboard';

interface AddToPrioritiesButtonProps {
  recommendation: Pick<Recommendation, 'taskTitle' | 'taskType' | 'projectId' | 'streamId' | 'boardId' | 'reason'>;
  /** A matching open priority already exists. */
  alreadyAdded: boolean;
}

/**
 * Turns a recommendation into a real priority — only on explicit click,
 * with an editable title. The click is the acceptance (source 'automatic',
 * status 'pending'); nothing is pinned without it.
 */
export function AddToPrioritiesButton({ recommendation, alreadyAdded }: AddToPrioritiesButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(recommendation.taskTitle);
  const [saving, setSaving] = useState(false);

  if (alreadyAdded) {
    return (
      <Button type="button" variant="ghost" size="sm" disabled>
        <Check data-icon="inline-start" aria-hidden="true" />
        In priorities
      </Button>
    );
  }

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: trimmed,
        source: 'automatic',
        type: recommendation.taskType === 'weekly_review' ? 'account_analysis' : recommendation.taskType,
        projectId: recommendation.projectId,
        contentStreamId: recommendation.streamId,
        boardId: recommendation.boardId,
        pinnedToToday: true,
      }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      toast.error(json?.error?.message ?? 'Could not add this priority');
      return;
    }
    toast.success('Added to Today’s Priorities');
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" aria-hidden="true" />
        Add to priorities
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Today&apos;s Priorities</DialogTitle>
            <DialogDescription>{recommendation.reason}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="recommendation-title">Priority</Label>
            <Input
              id="recommendation-title"
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit();
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={saving || !title.trim()}>
              {saving ? 'Adding…' : 'Add priority'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
