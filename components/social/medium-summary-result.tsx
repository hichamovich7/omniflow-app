'use client';

import Link from 'next/link';
import { Copy, Download, Loader2, RefreshCw } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ArticleContent } from '@/components/wordpress/article-content';
import { copyMediumContent, downloadMediumMarkdown } from '@/components/social/medium-export';
import type { SavedMediumSummary } from '@/lib/social/medium-summary';

interface MediumSummaryResultViewProps {
  result: SavedMediumSummary;
  onRegenerate: () => void;
  regenerating: boolean;
}

/**
 * A freshly generated Medium summary (TASK-062): meta, warnings, preview and
 * the copy / download / regenerate actions. Saved summaries link to their
 * history page (TASK-063); an unsaved one says so in a warning.
 */
export function MediumSummaryResultView({ result, onRegenerate, regenerating }: MediumSummaryResultViewProps) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-4" data-testid="medium-summary-result">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span data-testid="medium-summary-word-count">{result.wordCount} words</span>
        <span aria-hidden="true" className="text-border">·</span>
        <span className="min-w-0 break-all" data-testid="medium-summary-cta-url">
          CTA link: {result.ctaUrl ?? 'none'}
        </span>
        <span aria-hidden="true" className="text-border">·</span>
        <span className="min-w-0 break-all" data-testid="medium-summary-image-url">
          Image: {result.imageUrl ?? 'none'}
        </span>
      </div>

      {result.warnings.map((warning) => (
        <Alert key={warning} variant="warning" role="status">
          {warning}
        </Alert>
      ))}

      <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-border/60 bg-card p-4 [&_em]:italic [&_hr]:my-4 [&_hr]:border-border">
        <ArticleContent html={result.html} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => copyMediumContent('Markdown', result.markdown)}>
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          Copy Markdown
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => copyMediumContent('HTML', result.html)}>
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          Copy HTML
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => downloadMediumMarkdown(result.title, result.markdown)}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Download Markdown
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onRegenerate} disabled={regenerating}>
          {regenerating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
          Regenerate summary
        </Button>
      </div>
      <p className="text-xs text-muted-foreground" data-testid="medium-summary-saved">
        {result.id ? (
          <>
            Saved to your{' '}
            <Link href={`/medium/${result.id}`} className="font-medium underline underline-offset-2">
              Medium history
            </Link>
            . Never published: paste it into Medium yourself. The WordPress article is not modified.
          </>
        ) : (
          'Not saved and never published: copy it now and paste it into Medium yourself. The WordPress article is not modified.'
        )}
      </p>
    </div>
  );
}
