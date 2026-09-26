'use client';

import { useState } from 'react';
import { Copy, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  exportCopyFeedback,
  PREPARING_EXPORT_MESSAGE,
  type CopyFormatLabel,
  type ExportCopyOutcome,
} from '@/lib/wordpress/export-copy-feedback';
import type { InternalLinksReport } from '@/lib/wordpress/internal-links';

interface CopyExportButtonsProps {
  markdown: string;
  html: string;
  filename: string;
  /** Needed to build the export with internal links on demand. */
  generationId: string;
  /** True when the project has a connected WordPress site. */
  internalLinksAvailable: boolean;
}

type Format = 'html' | 'markdown';

const LABELS: Record<Format, CopyFormatLabel> = { html: 'HTML', markdown: 'Markdown' };

interface PreparedCopy {
  content: string;
  outcome: ExportCopyOutcome;
}

/**
 * Asks the server for the export with internal links. Never rejects: any
 * failure (network, 4xx/5xx) falls back to the original export.
 */
async function prepareWithLinks(generationId: string, format: Format, original: string): Promise<PreparedCopy> {
  try {
    const res = await fetch(`/api/wordpress/${generationId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format, includeInternalLinks: true }),
    });
    const json = (await res.json()) as {
      data: { content: string; internalLinks: InternalLinksReport; availablePosts: number } | null;
    };
    if (!res.ok || !json.data || typeof json.data.content !== 'string') {
      return { content: original, outcome: { kind: 'failed' } };
    }
    return {
      content: json.data.content,
      outcome: { kind: 'linked', report: json.data.internalLinks, availablePosts: json.data.availablePosts },
    };
  } catch {
    return { content: original, outcome: { kind: 'failed' } };
  }
}

/**
 * Writes text that is still being prepared. ClipboardItem with a promise
 * keeps the click's user activation across the fetch (Safari); otherwise,
 * or if that write is refused, falls back to writeText once ready.
 */
async function writeToClipboard(prepared: Promise<PreparedCopy>): Promise<PreparedCopy> {
  if (typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function') {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': prepared.then((p) => new Blob([p.content], { type: 'text/plain' })),
        }),
      ]);
      return prepared;
    } catch {
      // fall through to writeText
    }
  }
  const result = await prepared;
  await navigator.clipboard.writeText(result.content);
  return result;
}

export function CopyExportButtons({
  markdown,
  html,
  filename,
  generationId,
  internalLinksAvailable,
}: CopyExportButtonsProps) {
  const [includeInternalLinks, setIncludeInternalLinks] = useState(true);
  const [preparing, setPreparing] = useState<Format | null>(null);
  const withLinks = internalLinksAvailable && includeInternalLinks;

  async function copy(format: Format) {
    const label = LABELS[format];
    const original = format === 'html' ? html : markdown;

    if (!withLinks) {
      try {
        await navigator.clipboard.writeText(original);
        toast.success(internalLinksAvailable ? `${label} copied without internal links.` : `${label} copied to clipboard`);
      } catch {
        toast.error(`Failed to copy ${label.toLowerCase()}`);
      }
      return;
    }

    setPreparing(format);
    const toastId = toast.loading(PREPARING_EXPORT_MESSAGE);
    try {
      const result = await writeToClipboard(prepareWithLinks(generationId, format, original));
      const feedback = exportCopyFeedback(label, result.outcome);
      toast.success(feedback.success, { id: toastId });
      if (feedback.info) toast.info(feedback.info);
      for (const warning of feedback.warnings) toast.warning(warning);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`, { id: toastId });
    } finally {
      setPreparing(null);
    }
  }

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {(['markdown', 'html'] as const).map((format) => (
          <Button
            key={format}
            variant="outline"
            size="sm"
            onClick={() => copy(format)}
            disabled={preparing !== null}
            aria-busy={preparing === format}
          >
            {preparing === format ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Copy className="mr-1.5 h-3.5 w-3.5" />
            )}
            {preparing === format ? PREPARING_EXPORT_MESSAGE : `Copy ${LABELS[format]}`}
          </Button>
        ))}
        <Button variant="outline" size="sm" onClick={downloadMarkdown}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Download .md
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="include-internal-links"
          checked={withLinks}
          onCheckedChange={(checked) => setIncludeInternalLinks(checked === true)}
          disabled={!internalLinksAvailable || preparing !== null}
        />
        <Label htmlFor="include-internal-links" className="text-sm font-normal">
          Include internal links
        </Label>
        <span className="text-xs text-muted-foreground">
          {internalLinksAvailable
            ? 'Copy Markdown / Copy HTML add links to your published WordPress posts.'
            : 'Connect a WordPress site to this project to add internal links.'}
        </span>
      </div>
    </div>
  );
}
