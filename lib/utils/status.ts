// Single source for how a workflow status is displayed: label and semantic tone.
// Visual only — the stored values, and the rules that decide them, live with
// each feature. Blue (primary) = in progress or planned, amber (warning) =
// needs attention, and `tone` is always a `Badge` variant.
export type StatusTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'outline';

const STATUS_PRESENTATION = {
  // Generation and article lifecycle.
  pending: { label: 'Pending', tone: 'neutral' },
  queued: { label: 'Queued', tone: 'neutral' },
  generating: { label: 'Generating', tone: 'primary' },
  processing: { label: 'Processing', tone: 'primary' },
  reviewing: { label: 'Reviewing', tone: 'neutral' },
  ready: { label: 'Ready', tone: 'success' },
  completed: { label: 'Completed', tone: 'success' },
  partial: { label: 'Partial', tone: 'warning' },
  failed: { label: 'Failed', tone: 'danger' },
  // WordPress publishing.
  draft: { label: 'Draft', tone: 'neutral' },
  scheduled: { label: 'Scheduled', tone: 'primary' },
  published: { label: 'Published', tone: 'success' },
  // Content streams.
  active: { label: 'Active', tone: 'success' },
  planned: { label: 'Planned', tone: 'primary' },
  warming: { label: 'Warming', tone: 'warning' },
  paused: { label: 'Paused', tone: 'neutral' },
  archived: { label: 'Archived', tone: 'outline' },
  // Dashboard projects.
  'on-track': { label: 'On track', tone: 'success' },
  'at-risk': { label: 'At risk', tone: 'warning' },
} as const satisfies Record<string, { label: string; tone: StatusTone }>;

export type WorkflowStatus = keyof typeof STATUS_PRESENTATION;

/** "on_hold" → "On hold". Sentence case, used for statuses without an entry. */
export function formatStatusLabel(status: string): string {
  const words = status.replace(/[-_]+/g, ' ').trim().toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Unknown';
}

/** Unknown or missing values fall back to a readable label with a neutral tone. */
export function getStatusPresentation(status: string | null | undefined): {
  label: string;
  tone: StatusTone;
} {
  const value = status ?? '';
  return Object.hasOwn(STATUS_PRESENTATION, value)
    ? STATUS_PRESENTATION[value as WorkflowStatus]
    : { label: formatStatusLabel(value), tone: 'neutral' };
}

const DOT_VARIANTS = {
  neutral: 'neutral',
  outline: 'neutral',
  primary: 'processing',
  success: 'success',
  warning: 'warning',
  danger: 'error',
} as const satisfies Record<StatusTone, string>;

/** `StatusDot` variant for a status, from the same tone. */
export function statusToVariant(status: string | null | undefined) {
  return DOT_VARIANTS[getStatusPresentation(status).tone];
}
