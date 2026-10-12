'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PenSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MediumSummaryResultView } from '@/components/social/medium-summary-result';
import { requestMediumSummary } from '@/components/social/medium-export';
import { NO_ARTICLE_FOR_MEDIUM_MESSAGE } from '@/lib/social/social-content';
import type { SavedMediumSummary } from '@/lib/social/medium-summary';

interface GenerateMediumButtonProps {
  generationId: string;
  /** False for Pins created from a keyword: no article to summarize, the button is disabled. */
  hasArticle: boolean;
}

/**
 * "Generate Medium summary" on a Pinterest generation (TASK-064). The
 * summary is written from the WordPress article the Pins were made from —
 * the article stays the source of truth (TASK-062 rules), whatever Pins are
 * selected. Saved → opens it in /medium; not saved → shown in a dialog so
 * nothing is lost. Never publishes anything.
 */
export function GenerateMediumButton({ generationId, hasArticle }: GenerateMediumButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [unsaved, setUnsaved] = useState<SavedMediumSummary | null>(null);
  const messageId = `medium-unavailable-${generationId}`;

  async function generate() {
    if (!hasArticle || loading) return;
    setLoading(true);
    const toastId = toast.loading('Generating the Medium summary of the source article…');
    const response = await requestMediumSummary<SavedMediumSummary>({ pinterestGenerationId: generationId });
    setLoading(false);
    if (!response.data) {
      toast.error(response.error ?? 'The Medium summary could not be generated.', { id: toastId });
      return;
    }
    if (response.data.id) {
      toast.success('Medium summary saved.', { id: toastId });
      router.push(`/medium/${response.data.id}`);
      return;
    }
    toast.warning('Medium summary generated but not saved.', { id: toastId });
    setUnsaved(response.data);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={generate}
        disabled={!hasArticle || loading}
        title={hasArticle ? undefined : NO_ARTICLE_FOR_MEDIUM_MESSAGE}
        aria-describedby={hasArticle ? undefined : messageId}
        data-testid="generate-medium-button"
      >
        {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PenSquare className="mr-1.5 h-3.5 w-3.5" />}
        {loading ? 'Generating Medium summary…' : 'Generate Medium summary'}
      </Button>
      {!hasArticle && (
        <span id={messageId} className="sr-only">
          {NO_ARTICLE_FOR_MEDIUM_MESSAGE}
        </span>
      )}

      <Dialog open={unsaved !== null} onOpenChange={(open) => !open && setUnsaved(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Medium summary</DialogTitle>
          </DialogHeader>
          {unsaved && <MediumSummaryResultView result={unsaved} onRegenerate={generate} regenerating={loading} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
