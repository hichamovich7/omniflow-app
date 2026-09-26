// Type-only: this module is bundled in the client (copy-export-buttons.tsx).
import type { InternalLinksReport } from '@/lib/wordpress/internal-links';

/** Messages of the Copy Markdown / Copy HTML flow (TASK-FIX-052). */

export const PREPARING_EXPORT_MESSAGE = 'Preparing export with internal links…';
export const NO_PUBLISHED_POSTS_MESSAGE =
  'No published articles available for internal linking. The export was copied without internal links.';
export const NO_RELEVANT_POSTS_MESSAGE =
  'No relevant published articles found for internal linking. The export was copied without internal links.';
export const INTERNAL_LINKS_EXPORT_FAILED_MESSAGE = 'Internal links could not be loaded. The original export was copied.';

export type CopyFormatLabel = 'HTML' | 'Markdown';

/**
 * What the copy produced: `off` = option disabled (or no WordPress site),
 * `failed` = WordPress or the export request failed (original copied).
 */
export type ExportCopyOutcome =
  | { kind: 'off' }
  | { kind: 'failed' }
  | { kind: 'linked'; report: InternalLinksReport; availablePosts: number };

export interface ExportCopyFeedback {
  success: string;
  info: string | null;
  warnings: string[];
}

export function exportCopyFeedback(label: CopyFormatLabel, outcome: ExportCopyOutcome): ExportCopyFeedback {
  const without = `${label} copied without internal links.`;

  if (outcome.kind === 'off') return { success: without, info: null, warnings: [] };
  if (outcome.kind === 'failed') {
    return { success: without, info: null, warnings: [INTERNAL_LINKS_EXPORT_FAILED_MESSAGE] };
  }

  const { report, availablePosts } = outcome;
  if (report.status === 'failed') {
    return { success: without, info: null, warnings: [INTERNAL_LINKS_EXPORT_FAILED_MESSAGE] };
  }
  // Partial-load / ignored-URL notes stay visible (the publish-worded
  // failure warning only comes with status `failed`, handled above).
  const warnings = report.warnings;

  if (report.status === 'inserted' && report.insertedCount > 0) {
    const n = report.insertedCount;
    return { success: `${label} copied with ${n} internal link${n === 1 ? '' : 's'}.`, info: null, warnings };
  }
  if (report.status === 'skipped') return { success: without, info: null, warnings };
  return {
    success: without,
    info: availablePosts === 0 ? NO_PUBLISHED_POSTS_MESSAGE : NO_RELEVANT_POSTS_MESSAGE,
    warnings,
  };
}
