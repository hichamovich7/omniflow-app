/**
 * Calendar-day helpers for the Command Center.
 *
 * Timezone convention: every day key is derived from the runtime's *local*
 * calendar (getFullYear/getMonth/getDate) — the exact convention already
 * used to write and read `pins.publish_date` (lib/validations/schedule.ts
 * builds the planned Date with the local `new Date(y, m, d, h, min)`
 * constructor, and lib/csv/pinterest.ts formats it back with local
 * getters). Never slice `toISOString()` for a day key: that silently
 * switches to UTC and shifts every pin planned between 00:00 and the UTC
 * offset onto the previous day (the UTC / Europe-Paris mismatch).
 */

/** YYYY-MM-DD of `date` in the runtime's local calendar. */
export function toLocalDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
