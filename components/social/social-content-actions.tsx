'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Download, ExternalLink, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MediumSummaryResultView } from '@/components/social/medium-summary-result';
import { copyMediumContent, downloadMediumMarkdown, requestMediumSummary } from '@/components/social/medium-export';
import type { SavedMediumSummary } from '@/lib/social/medium-summary';
import type { MediumSummaryRequest } from '@/lib/validations/medium-summary';
import { cn } from '@/lib/utils';

interface SocialContentActionsProps {
  id: string;
  title: string;
  markdown: string;
  html: string;
  /** Same source again — null when the source was deleted (Regenerate disabled). */
  regenerateSource: MediumSummaryRequest | null;
  /** Show "Open" (history list); hidden on the detail page itself. */
  showOpen?: boolean;
  /** Where to go after a delete from the detail page (the list refreshes in place). */
  afterDeleteHref?: string;
}

/**
 * Actions on a saved Medium summary (TASK-063): open, copy, download,
 * regenerate (a new history entry — the current one is kept) and delete
 * (confirmation dialog; only this saved content, never its source).
 */
export function SocialContentActions({
  id,
  title,
  markdown,
  html,
  regenerateSource,
  showOpen = false,
  afterDeleteHref,
}: SocialContentActionsProps) {
  const router = useRouter();
  const [regenerating, setRegenerating] = useState(false);
  const [unsaved, setUnsaved] = useState<SavedMediumSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function regenerate() {
    if (!regenerateSource || regenerating) return;
    setRegenerating(true);
    setError(null);
    const response = await requestMediumSummary<SavedMediumSummary>(regenerateSource);
    setRegenerating(false);
    if (!response.data) {
      setError(response.error);
      return;
    }
    if (response.data.id) {
      toast.success('New version saved to your Medium history.');
      router.push(`/medium/${response.data.id}`);
      router.refresh();
      return;
    }
    // Not saved: keep the generated text on screen instead of losing it.
    setUnsaved(response.data);
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/social/generations/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      toast.success('Medium summary deleted');
      setConfirmOpen(false);
      if (afterDeleteHref) router.push(afterDeleteHref);
      router.refresh();
    } catch {
      toast.error('The summary could not be deleted. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" data-testid="social-content-actions">
        {showOpen && (
          <Link href={`/medium/${id}`} className={cn(buttonVariants({ size: 'sm' }))}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Open
          </Link>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => copyMediumContent('Markdown', markdown)}>
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          Copy Markdown
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => copyMediumContent('HTML', html)}>
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          Copy HTML
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => downloadMediumMarkdown(title, markdown)}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Download Markdown
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={regenerate}
          disabled={!regenerateSource || regenerating}
          title={regenerateSource ? undefined : 'The source of this summary no longer exists.'}
        >
          {regenerating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
          {regenerating ? 'Regenerating…' : 'Regenerate'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {unsaved && <MediumSummaryResultView result={unsaved} onRegenerate={regenerate} regenerating={regenerating} />}

      <Dialog open={confirmOpen} onOpenChange={(open) => !deleting && setConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this Medium summary?</DialogTitle>
            <DialogDescription>
              &quot;{title}&quot; will be removed from your Medium history. This cannot be undone. The source article, the
              WordPress post and any Pins are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
