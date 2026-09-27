import Link from 'next/link';
import { FileText } from 'lucide-react';
import { describeWordPressSource, type GenerationWordPressSource } from '@/lib/queries/wordpress-source';

interface WordPressSourceBadgeProps {
  source: GenerationWordPressSource;
}

/**
 * Shown only on Pinterest generations created from a WordPress article
 * (TASK-044 phase 2). Keyword generations never receive a `source`.
 */
export function WordPressSourceBadge({ source }: WordPressSourceBadgeProps) {
  const display = describeWordPressSource(source);

  if (display.kind === 'unavailable') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        <FileText className="h-3 w-3" aria-hidden="true" />
        {display.label}
      </span>
    );
  }

  return (
    <Link
      href={display.href}
      title={display.title}
      className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:max-w-64"
    >
      <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="shrink-0">{display.label}</span>
      <span aria-hidden="true" className="shrink-0">
        ·
      </span>
      <span className="sr-only">, source article:</span>
      <span className="min-w-0 truncate">{display.title}</span>
    </Link>
  );
}
