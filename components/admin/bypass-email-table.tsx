'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/empty-state';
import { Trash2, ShieldCheck } from 'lucide-react';
import { timeAgo } from '@/lib/utils/format-date';
import type { RateLimitBypassEntry } from '@/types/database';

interface BypassEmailTableProps {
  emails: RateLimitBypassEntry[];
}

export function BypassEmailTable({ emails }: BypassEmailTableProps) {
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState<RateLimitBypassEntry | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!pendingDelete) return;
    setLoading(true);

    const res = await fetch(`/api/admin/bypass-emails?id=${pendingDelete.id}`, {
      method: 'DELETE',
    });
    const json = await res.json();

    if (!res.ok || json.error) {
      toast.error(json.error?.message ?? 'Failed to remove email');
      setLoading(false);
      return;
    }

    toast.success('Email removed from bypass list');
    setPendingDelete(null);
    setLoading(false);
    router.refresh();
  }

  if (emails.length === 0) {
    return (
      <EmptyState
        title="No bypass emails yet"
        description="Add an email above to exempt it from generation, research, and analyze rate limits."
        icon={ShieldCheck}
      />
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Added</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {emails.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="font-medium">{entry.email}</TableCell>
              <TableCell className="text-muted-foreground">{timeAgo(entry.added_at)}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${entry.email}`}
                  onClick={() => setPendingDelete(entry)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Bypass Email</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove &quot;{pendingDelete?.email}&quot; from the rate
              limit bypass list? This account will go back to normal rate limits immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? 'Removing...' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
