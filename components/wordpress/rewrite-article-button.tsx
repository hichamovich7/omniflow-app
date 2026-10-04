'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { rewrittenArticleHref } from '@/lib/wordpress/rewrite-view';

interface RewriteArticleButtonProps {
  generationId: string;
}

/**
 * "Rewrite article" (WordPress review page). Nothing happens before the
 * dialog is confirmed; the request then creates a new version (POST
 * /api/wordpress/[id]/rewrite) and opens it. The current version is kept,
 * and nothing is published to WordPress.
 */
export function RewriteArticleButton({ generationId }: RewriteArticleButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rewrite() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/wordpress/${generationId}/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.error) {
        throw new Error(json?.error?.message ?? 'Article rewrite failed. Your current version is unchanged.');
      }
      for (const warning of json.data.warnings ?? []) toast.warning(warning);
      toast.success('New version created. The previous version is kept in your history.');
      setOpen(false);
      router.push(rewrittenArticleHref(json.data.generationId, generationId));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Article rewrite failed.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      aria-labelledby="rewrite-article-title"
      className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
      data-testid="rewrite-article"
    >
      <div>
        <h2 id="rewrite-article-title" className="text-sm font-semibold">
          Rewrite article
        </h2>
        <p className="text-xs text-muted-foreground">
          Regenerate the full text with the same brief, settings, outline and images. Creates a new version.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={loading}
        className="self-start sm:self-auto"
        data-testid="rewrite-article-button"
      >
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
        {loading ? 'Rewriting…' : 'Rewrite article'}
      </Button>

      <Dialog open={open} onOpenChange={(next) => !loading && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rewrite this article?</DialogTitle>
            <DialogDescription>
              A new version is generated from the same brief, project settings, language, tone, keywords, size and
              outline. Images, slug and meta data are kept, the FAQ is regenerated and the Quality Gate runs again.
              This uses one AI generation. The current version stays in your history unchanged, and nothing is
              published to WordPress.
            </DialogDescription>
          </DialogHeader>
          {loading && (
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              Rewriting the article… this can take up to two minutes. Keep this page open.
            </p>
          )}
          {error && <Alert variant="danger">{error}</Alert>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={rewrite} loading={loading} disabled={loading} data-testid="rewrite-article-confirm">
              {loading ? 'Rewriting…' : 'Rewrite article'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
