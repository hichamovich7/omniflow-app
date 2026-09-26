import type { ArticleQualityReport, QualityStatus } from '@/lib/wordpress/quality-check';

/**
 * Display model of the Quality Report V1 card on /wordpress/[id]
 * (TASK-FIX-046) — every label and count the card shows, kept out of the
 * component so it can be tested without rendering.
 */

// Human-readable names for the Quality Gate V1 check keys (lib/wordpress/quality-check.ts).
// An unknown key (a check added later) falls back to the raw key.
const CHECK_LABELS: Record<string, string> = {
  word_count: 'Word count',
  title: 'Title (H1)',
  h2_sections: 'Planned H2 sections',
  h3: 'H3 subheadings',
  faq: 'FAQ',
  unresolved_markers: 'Unreplaced markers',
  first_sentence: 'First sentence',
  unauthorized_urls: 'Links',
  meta_title: 'Meta title',
  meta_description: 'Meta description',
  slug: 'Slug',
  truncation: 'Truncation',
  generic_phrases: 'Generic phrasing',
  repetition: 'Repetition',
  image_markers: 'Image placement',
  disabled_blocks: 'Disabled blocks',
  language: 'Language',
};

const REPORT_STATUS: Record<QualityStatus, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  passed: { label: 'Passed', tone: 'success' },
  warning: { label: 'Warnings', tone: 'warning' },
  failed: { label: 'Issues found', tone: 'danger' },
};

const CHECK_STATUS_LABELS: Record<QualityStatus, string> = { passed: 'Passed', warning: 'Warning', failed: 'Failed' };

export const QUALITY_REPORT_MISSING_MESSAGE =
  'No quality report for this article — it was generated before automatic quality checks were available.';

export const QUALITY_REPORT_INFORMATIONAL_NOTE =
  'Informational only — review before exporting; it never blocks export or publishing.';

export interface QualityReportView {
  statusLabel: string;
  tone: 'success' | 'warning' | 'danger';
  summary: string;
  issues: string[];
  warnings: string[];
  checks: { key: string; label: string; status: QualityStatus; statusLabel: string; message: string }[];
}

function plural(count: number, word: string): string {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

export function buildQualityReportView(report: ArticleQualityReport): QualityReportView {
  const passedCount = report.checks.filter((c) => c.status === 'passed').length;
  return {
    statusLabel: REPORT_STATUS[report.status].label,
    tone: REPORT_STATUS[report.status].tone,
    summary: `${passedCount} of ${report.checks.length} checks passed · ${plural(report.warnings.length, 'warning')} · ${plural(report.qualityIssues.length, 'issue')}.`,
    issues: report.qualityIssues,
    warnings: report.warnings,
    checks: report.checks.map((check) => ({
      key: check.key,
      label: CHECK_LABELS[check.key] ?? check.key,
      status: check.status,
      statusLabel: CHECK_STATUS_LABELS[check.status],
      message: check.message,
    })),
  };
}
