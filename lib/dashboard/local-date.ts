/**
 * Calendar-day helpers for the Command Center.
 *
 * Timezone convention: `toLocalDayKey()` uses the runtime's *local*
 * calendar (getFullYear/getMonth/getDate). `pins.publish_date` is the real
 * UTC instant since TASK-048 (typed wall time + IANA zone, converted once in
 * lib/scheduling/timezone.ts), so pins are bucketed with
 * `toDayKeyInTimeZone()` in PROJECT_TIME_ZONE — the same calendar as the
 * grid's "today". Never slice `toISOString()` for a day key: that silently
 * switches to UTC and shifts every pin planned between 00:00 and the UTC
 * offset onto the previous day.
 */

/** YYYY-MM-DD of `date` in the runtime's local calendar. */
export function toLocalDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Project calendar (TASK-FIX-054). "Today" of the Publishing coverage grid
 * and of the publishing-activity API is the calendar day in this zone,
 * whatever the server runtime's zone is (UTC on most hosts).
 */
export const PROJECT_TIME_ZONE = 'Europe/Madrid';

/** YYYY-MM-DD of `date` in `timeZone` (defaults to the project zone). */
export function toDayKeyInTimeZone(date: Date, timeZone: string = PROJECT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Local midnight of a YYYY-MM-DD key. */
export function parseLocalDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Calendar-day arithmetic (DST-safe: works on the date parts, not on milliseconds). */
export function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function addDaysToKey(key: string, days: number): string {
  return toLocalDayKey(addLocalDays(parseLocalDayKey(key), days));
}

/** Whole calendar days from `fromKey` to `toKey` (negative when `toKey` is earlier). */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  // Noon-to-noon avoids a 23 h / 25 h DST day rounding to the wrong integer.
  const from = parseLocalDayKey(fromKey);
  const to = parseLocalDayKey(toKey);
  from.setHours(12);
  to.setHours(12);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** Monday of the local week containing `date` (ISO week, Monday first). */
export function startOfLocalWeek(date: Date): Date {
  const mondayOffset = (date.getDay() + 6) % 7;
  return addLocalDays(date, -mondayOffset);
}

export function startOfLocalMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** "Oct 5" */
export function formatDayKeyShort(key: string): string {
  return parseLocalDayKey(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "October 5" */
export function formatDayKeyLong(key: string): string {
  return parseLocalDayKey(key).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

/** "Mon" */
export function formatDayKeyWeekday(key: string): string {
  return parseLocalDayKey(key).toLocaleDateString('en-US', { weekday: 'short' });
}
