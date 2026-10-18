'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { requestFacebookPost } from '@/components/social/facebook-requests';
import type { SavedFacebookPost } from '@/lib/social/facebook-post';
import { FACEBOOK_LINK_PLACEMENT_LABELS } from '@/lib/social/social-content';
import type { MediumSummaryRequest } from '@/lib/validations/medium-summary';
import { cn } from '@/lib/utils';

interface FacebookPostPanelProps {
  /** Exactly the POST /api/social/facebook-post body (same sources as Medium). */
  source: MediumSummaryRequest;
  onGenerated?: (result: SavedFacebookPost) => void;
}

/**
 * Facebook post generation (TASK-068): generate on demand, then review,
 * edit and publish on the post's own page (/facebook/<id>). Nothing is
 * published here and the WordPress article is never modified.
 */
export function FacebookPostPanel({ source, onGenerated }: FacebookPostPanelProps) {
  const [result, setResult] = useState<SavedFacebookPost | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (loading) return;
    setLoading(true);
    setError(null);
    const response = await requestFacebookPost<SavedFacebookPost>(source);
    if (response.data) {
      setResult(response.data);
      onGenerated?.(response.data);
    } else {
      setError(response.error?.message ?? 'The Facebook post could not be generated.');
    }
    setLoading(false);
  }

  return (
    <div className="space-y-3" data-testid="facebook-post-panel">
      <Button type="button" size="sm" onClick={generate} disabled={loading}>
        {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
        {loading ? 'Generating Facebook post…' : result ? 'Generate another Facebook post' : 'Generate Facebook post'}
      </Button>

      {error && <Alert variant="danger">{error}</Alert>}

      {result && (
        <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4" data-testid="facebook-post-result">
          {result.warnings.map((warning) => (
            <Alert key={warning} variant="warning" role="status">
              {warning}
            </Alert>
          ))}
          <p className="whitespace-pre-line text-sm">{result.post}</p>
          {result.callToAction && <p className="text-sm font-medium">{result.callToAction}</p>}
          <p className="text-xs text-muted-foreground">
            Link: {FACEBOOK_LINK_PLACEMENT_LABELS[result.linkPlacement]} · {result.wordCount} words · Not published
          </p>
          {result.id ? (
            <Link href={`/facebook/${result.id}`} className={cn(buttonVariants({ size: 'sm' }))}>
              Review, edit and publish
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}
