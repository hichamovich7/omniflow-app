import type { SundayReviewStatus } from '@/types/dashboard';
import type { TaskOccurrenceStatus } from '@/types/tasks';
import { addDaysToKey, daysBetweenKeys, toLocalDayKey } from '@/lib/dashboard/local-date';

export interface SundayReviewInput {
  now: Date;
  /** The recurring `weekly_review` task, or null if the user never started it. */
  routine: { id: string; createdAt: string } | null;
  /** Recent occurrences of that routine. */
  occurrences: { occurrenceDate: string; status: TaskOccurrenceStatus }[];
}

export const SUNDAY_REVIEW_CHECKLIST = [
  'Pinterest impressions',
  'Outbound clicks',
  'Saves',
  'Compare boards',
  'Review traffic',
  'Choose Continue / Scale / Test / Fix / Stop',
] as const;

/**
 * Status of the Sunday analytics review routine. It never disappears: an
 * unfinished review stays `overdue` until the user completes it. Overdue
 * only applies to a Sunday on or after the day the routine was started —
 * a review the user never set up can't be "missed".
 */
export function buildSundayReviewStatus({ now, routine, occurrences }: SundayReviewInput): SundayReviewStatus {
  const todayKey = toLocalDayKey(now);
  const dow = now.getDay(); // 0 = Sunday, local
  const upcomingSunday = addDaysToKey(todayKey, (7 - dow) % 7);
  const previousSunday = addDaysToKey(todayKey, dow === 0 ? -7 : -dow);

  const isDone = (key: string) =>
    occurrences.some((o) => o.occurrenceDate === key && (o.status === 'completed' || o.status === 'skipped'));

  const routineId = routine?.id ?? null;

  if (routine && toLocalDayKey(new Date(routine.createdAt)) <= previousSunday && !isDone(previousSunday)) {
    return { state: 'overdue', occurrenceDate: previousSunday, daysUntil: daysBetweenKeys(todayKey, previousSunday), routineId };
  }

  const daysUntil = daysBetweenKeys(todayKey, upcomingSunday);
  if (isDone(upcomingSunday)) return { state: 'completed', occurrenceDate: upcomingSunday, daysUntil, routineId };
  return { state: daysUntil <= 1 ? 'due-soon' : 'due-sunday', occurrenceDate: upcomingSunday, daysUntil, routineId };
}
