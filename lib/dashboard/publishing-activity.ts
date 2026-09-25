import type { CoverageDay } from '@/types/dashboard';
import { parseLocalDayKey } from '@/lib/dashboard/local-date';

/**
 * Pure helpers behind the "Publishing activity" modal (TASK-FIX-043).
 * Offline-testable; the modal itself only wires them to the API.
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

/** Accessible / hover description of one coverage cell, keeping each source separate. */
export function coverageDayDescription(day: Pick<CoverageDay, 'planned' | 'external' | 'externalNote' | 'level' | 'inBuffer'>, dateLabel: string, target: number | null): string {
  const parts = [`${dateLabel}: ${day.planned} planned in OmniFlow${target ? ` of ${target}` : ''}`];
  if (day.external > 0) parts.push(externalActivityLabel(day.external));
  if (target && day.level === 'full') parts.push('Target met');
  if (day.inBuffer && day.level !== 'full') parts.push('needs new Pins');
  if (day.externalNote) parts.push(`Note: ${day.externalNote}`);
  return parts.join(' — ');
}
