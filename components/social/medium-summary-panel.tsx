'use client';

import { useState } from 'react';
import { Copy, Download, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ArticleContent } from '@/components/wordpress/article-content';
import type { MediumSummaryResult } from '@/lib/social/medium-summary';
import type { MediumSummaryRequest } from '@/lib/validations/medium-summary';
import { mediumSummaryFilename } from '@/lib/social/medium-summary-filename';

interface MediumSummaryPanelProps {
  /** Exactly the POST /api/social/medium-summary body: an OmniFlow article or an existing WordPress post. */
  source: MediumSummaryRequest;
}

/**
 * Medium summary (TASK-062): generate on demand, preview, copy or download.
 * Nothing is saved or published — the result lives in this component only,
 * and the WordPress article is never modified.
 */
export function MediumSummaryPanel({ source }: MediumSummaryPanelProps) {
  const [result, setResult] = useState<MediumSummaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/social/medium-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(source),
      });
      const json = (await res.json().catch(() => null)) as
        | { data: MediumSummaryResult | null; error: { message: string } | null }
        | null;
      if (!res.ok || !json?.data) {
        setError(json?.error?.message ?? 'The Medium summary could not be generated. Please try again.');
        return;
      }
      setResult(json.data);
    } catch {
      setError('Could not reach OmniFlow. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function copy(label: 'Markdown' | 'HTML', content: string) {
    try {
      await navigator.clipboard.writeText(content);
      toast.success(`${label} copied to clipboard`);
    } catch {
      toast.error(`Failed to copy ${label}`);
    }
  }

  function download(summary: MediumSummaryResult) {
    const blob = new Blob([summary.markdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = mediumSummaryFilename(summary.title);
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3" data-testid="medium-summary-panel">
      {!result && (
        <Button type="button" size="sm" onClick={generate} disabled={loading}>
          {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
          {loading ? 'Generating Medium summary…' : 'Generate Medium summary'}
        </Button>
      )}

      {error && <Alert variant="danger">{error}</Alert>}

      {result && (
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
            <Button type="button" variant="outline" size="sm" onClick={() => copy('Markdown', result.markdown)}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy Markdown
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => copy('HTML', result.html)}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy HTML
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => download(result)}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download Markdown
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={generate} disabled={loading}>
              {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              Regenerate summary
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Not saved and never published: paste it into Medium yourself. The WordPress article is not modified.
          </p>
        </div>
      )}
    </div>
  );
}
