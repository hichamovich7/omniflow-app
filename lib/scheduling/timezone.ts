/**
 * Pinterest scheduling time zones (TASK-048).
 *
 * A planned time is a wall-clock date + time in an explicit IANA zone (the
 * browser's zone at input — projects have no zone setting). It is converted
 * to UTC exactly once, here, and stored as that instant in
 * `pins.publish_date` (timestamptz). The server runtime's own zone is never
 * used, and the typed time is never assumed to be UTC.
 */

const IANA_ZONE_PATTERN = /^(UTC|[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+)$/;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export const INVALID_TIME_ZONE_MESSAGE = 'Invalid time zone. Reload the page and try again.';

/** True for a real IANA zone name ("Europe/Madrid", "America/New_York", "UTC") — never an offset or an abbreviation. */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || !IANA_ZONE_PATTERN.test(timeZone)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The wall-clock fields of `instant` in `timeZone`. */
export function getWallTime(instant: Date, timeZone: string): WallTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds (+02:00 → 7_200_000). */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const w = getWallTime(new Date(instant), timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

export class ScheduleTimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleTimeError';
  }
}

/**
 * Wall-clock `YYYY-MM-DD` + `HH:mm[:ss]` in `timeZone` → the UTC instant.
 * Summer / winter time handled by the zone database. A time skipped by a
 * daylight-saving change (e.g. 02:30 on the spring-forward night) is
 * refused; a repeated time (autumn) resolves to its first occurrence.
 */
export function zonedWallTimeToUtc(dateKey: string, time: string, timeZone: string): Date {
  if (!isValidTimeZone(timeZone)) throw new ScheduleTimeError(INVALID_TIME_ZONE_MESSAGE);
  const d = DATE_KEY_PATTERN.exec(dateKey);
  const t = TIME_PATTERN.exec(time);
  if (!d || !t) throw new ScheduleTimeError('Invalid date or time.');
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hour, minute, second] = [Number(t[1]), Number(t[2]), Number(t[3] ?? 0)];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    throw new ScheduleTimeError('Invalid date or time.');
  }
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  if (new Date(wallAsUtc).getUTCDate() !== day) throw new ScheduleTimeError('Invalid date or time.');

  // Every offset the zone uses around that day (before / after a possible
  // daylight-saving change) gives a candidate instant; keep those whose wall
  // time really is the requested one, and take the earliest (first
  // occurrence of a repeated autumn time). None → the time was skipped.
  const DAY_MS = 86_400_000;
  const offsets = new Set([wallAsUtc - DAY_MS, wallAsUtc, wallAsUtc + DAY_MS].map((at) => zoneOffsetMs(at, timeZone)));
  const matches = [...offsets]
    .map((offset) => wallAsUtc - offset)
    .filter((instant) => {
      const w = getWallTime(new Date(instant), timeZone);
      return w.year === year && w.month === month && w.day === day && w.hour === hour && w.minute === minute && w.second === second;
    })
    .sort((a, b) => a - b);
  if (matches.length > 0) return new Date(matches[0]);
  throw new ScheduleTimeError(`${time.slice(0, 5)} does not exist on ${dateKey} in ${timeZone} (daylight saving change). Choose another time.`);
}

/** `YYYY-MM-DD` + n calendar days (pure calendar arithmetic, no zone). */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Day of week of a calendar date key (0 = Sunday). */
export function dayOfWeekOfDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Display of a stored instant in `timeZone`, e.g. "Sep 22, 13:00". */
export function formatScheduledTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

/** The browser's IANA zone (client only); UTC when it cannot be read. */
export function getBrowserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(zone) ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}
