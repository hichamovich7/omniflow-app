/**
 * Scheduled Facebook publications (TASK-100) — date, time and time zone.
 * Client-safe and dependency-free (Intl only): the browser uses it for the
 * live preview, the server for the authoritative conversion and checks.
 *
 * The person picks a wall-clock date + time in an explicit IANA time zone;
 * the server converts it to one UTC instant (stored in
 * social_publications.scheduled_at). The zone is kept for display only.
 */

/** A scheduled time must leave the queue at least this much margin. */
export const SCHEDULE_MIN_LEAD_MS = 5 * 60 * 1000;
/** No schedule further than this (keeps the queue and the stored token fresh). */
export const SCHEDULE_MAX_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;

export const SCHEDULE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const SCHEDULE_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function wallClockAt(utcMs: number, timeZone: string): WallClock & { second: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? NaN);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute'), second: get('second') };
}

/** Offset of the zone at an instant, in ms (local wall clock − UTC). */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const w = wallClockAt(utcMs, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

export type ZonedToUtcResult = { ok: true; instant: Date } | { ok: false; reason: 'invalid' | 'invalid_time_zone' | 'nonexistent' };

/**
 * "2026-11-20" + "18:30" in "Europe/Paris" → the UTC instant. A wall-clock
 * time skipped by a clock change (spring forward) is refused; a repeated one
 * (fall back) resolves to one of its two instants, shown back in the preview.
 */
export function zonedDateTimeToUtc(date: string, time: string, timeZone: string): ZonedToUtcResult {
  if (!SCHEDULE_DATE_PATTERN.test(date) || !SCHEDULE_TIME_PATTERN.test(time)) return { ok: false, reason: 'invalid' };
  if (!isValidTimeZone(timeZone)) return { ok: false, reason: 'invalid_time_zone' };
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const local = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(local);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return { ok: false, reason: 'invalid' };
  }
  const firstGuess = local - zoneOffsetMs(local, timeZone);
  const utc = local - zoneOffsetMs(firstGuess, timeZone);
  const back = wallClockAt(utc, timeZone);
  if (back.year !== year || back.month !== month || back.day !== day || back.hour !== hour || back.minute !== minute) {
    return { ok: false, reason: 'nonexistent' };
  }
  return { ok: true, instant: new Date(utc) };
}

/** Plain-language refusal for a scheduled instant, or null when it is acceptable. */
export function scheduleInstantError(instant: Date, now: Date = new Date()): string | null {
  const delta = instant.getTime() - now.getTime();
  if (Number.isNaN(delta)) return 'Choose a valid date and time.';
  if (delta <= 0) return 'This date and time are in the past. Choose a time in the future.';
  if (delta < SCHEDULE_MIN_LEAD_MS) return 'Choose a time at least 5 minutes from now.';
  if (delta > SCHEDULE_MAX_AHEAD_MS) return 'Choose a time within the next 90 days.';
  return null;
}

/** Converts and checks the person's choice in one step (server and preview share it). */
export function resolveScheduleChoice(
  input: { date: string; time: string; timeZone: string },
  now: Date = new Date()
): { ok: true; instant: Date } | { ok: false; message: string } {
  const converted = zonedDateTimeToUtc(input.date, input.time, input.timeZone);
  if (!converted.ok) {
    return {
      ok: false,
      message:
        converted.reason === 'invalid_time_zone'
          ? 'Choose a valid time zone.'
          : converted.reason === 'nonexistent'
            ? 'This time does not exist in this time zone (clock change). Choose another time.'
            : 'Choose a valid date and time.',
    };
  }
  const error = scheduleInstantError(converted.instant, now);
  return error ? { ok: false, message: error } : { ok: true, instant: converted.instant };
}

/** "Fri, Nov 20, 2026, 18:30 (Europe/Paris)" — the instant as the person chose to see it. */
export function formatScheduledTime(instant: string | Date, timeZone: string | null | undefined): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  const zone = timeZone && isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const text = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return `${text} (${zone})`;
}

/** Wall-clock date and time of an instant in a zone — to prefill "Reschedule". */
export function utcToZonedParts(instant: string | Date, timeZone: string): { date: string; time: string } {
  const w = wallClockAt((typeof instant === 'string' ? new Date(instant) : instant).getTime(), timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');
  return { date: `${w.year}-${pad(w.month)}-${pad(w.day)}`, time: `${pad(w.hour)}:${pad(w.minute)}` };
}

/** The browser's own zone (fallback UTC) — the default of the time zone field. */
export function browserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isValidTimeZone(zone) ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Time zones offered in the picker (the runtime's list when available). */
export function availableTimeZones(current: string): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  let zones: string[] = [];
  try {
    zones = intl.supportedValuesOf ? intl.supportedValuesOf('timeZone') : [];
  } catch {
    zones = [];
  }
  const list = zones.length > 0 ? [...zones] : ['UTC', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney'];
  if (!list.includes('UTC')) list.unshift('UTC');
  if (current && !list.includes(current)) list.unshift(current);
  return list;
}
