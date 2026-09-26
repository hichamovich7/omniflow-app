import type { CoverageDay } from '@/types/dashboard';
import type { PublishingActivityStatus } from '@/types/content-streams';
import { parseLocalDayKey } from '@/lib/dashboard/local-date';

/**
 * Pure helpers behind the "Publishing activity" modal (TASK-FIX-043,
 * expected activity TASK-FIX-053). Offline-testable; the modal itself only
 * wires them to the API.
 */

/** "Mark target met" fills the count with the stream's target_pins_per_day; null when no target is set. */
export function markTargetMetCount(targetPinsPerDay: number | null): number | null {
  return targetPinsPerDay != null && targetPinsPerDay > 0 ? targetPinsPerDay : null;
}

/** "September 25, 2026" */
export function formatActivityDate(dayKey: string): string {
  return parseLocalDayKey(dayKey).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** "Published externally: 5" — the grid's marker text, never mixed with OmniFlow's planned count. */
export function externalActivityLabel(count: number): string {
  return `Published externally: ${count}`;
}

/** "Expected externally: 5" — planned in another tool, never shown as a confirmed publication. */
export function expectedActivityLabel(count: number): string {
  return `Expected externally: ${count}`;
}

/**
 * What the modal records for a cell:
 * - expected = a future day: Pins planned in another tool (never "published").
 * - confirm  = today / a past day holding an expected entry: confirm it as
 *              published, keep it expected, or delete it.
 * - published = today / a past day otherwise (the TASK-FIX-043 behavior).
 */
export type ActivityDialogMode = 'expected' | 'confirm' | 'published';

export function activityDialogMode(isFuture: boolean, savedStatus: PublishingActivityStatus | null): ActivityDialogMode {
  if (isFuture) return 'expected';
  return savedStatus === 'expected' ? 'confirm' : 'published';
}

const ACTIVITY_ACTION_LABELS: Record<ActivityDialogMode, string> = {
  published: 'Record publishing activity',
  expected: 'Plan external publishing',
  confirm: 'Confirm expected publishing',
};

/** Accessible name of a clickable coverage cell: its description + what clicking does. */
export function activityCellLabel(description: string, isFuture: boolean, savedStatus: PublishingActivityStatus | null): string {
  return `${description}. ${ACTIVITY_ACTION_LABELS[activityDialogMode(isFuture, savedStatus)]}`;
}

/** Accessible / hover description of one coverage cell, keeping each source separate. */
export function coverageDayDescription(
  day: Pick<CoverageDay, 'planned' | 'external' | 'expected' | 'externalNote' | 'level' | 'inBuffer'>,
  dateLabel: string,
  target: number | null
): string {
  const parts = [`${dateLabel}: ${day.planned} planned in OmniFlow${target ? ` of ${target}` : ''}`];
  if (day.external > 0) parts.push(externalActivityLabel(day.external));
  if (day.expected > 0) parts.push(`${expectedActivityLabel(day.expected)} (not confirmed)`);
  if (target && day.level === 'full') parts.push(day.expected > 0 ? 'Target met (forecast)' : 'Target met');
  if (day.inBuffer && day.level !== 'full') parts.push('needs new Pins');
  if (day.externalNote) parts.push(`Note: ${day.externalNote}`);
  return parts.join(' — ');
}
