import { z } from 'zod';
import {
  INVALID_TIME_ZONE_MESSAGE,
  addDaysToDateKey,
  dayOfWeekOfDateKey,
  isValidTimeZone,
  zonedWallTimeToUtc,
} from '@/lib/scheduling/timezone';

export const SCHEDULE_MODES = ['days', 'hours'] as const;
export type ScheduleMode = (typeof SCHEDULE_MODES)[number];

export const SCHEDULE_MODE_LABELS: Record<ScheduleMode, string> = {
  days: 'Spread by Days',
  hours: 'Spread by Hours',
};

export const DAY_FREQUENCY_OPTIONS = [
  'daily',
  'every_2_days',
  'every_3_days',
  'weekly',
  'every_weekday',
] as const;

export type DayFrequency = (typeof DAY_FREQUENCY_OPTIONS)[number];

export const DAY_FREQUENCY_LABELS: Record<DayFrequency, string> = {
  daily: 'Daily',
  every_2_days: 'Every 2 Days',
  every_3_days: 'Every 3 Days',
  weekly: 'Weekly',
  every_weekday: 'Every Weekday (Mon–Fri)',
};

export const HOUR_INTERVAL_OPTIONS = [30, 60, 120, 240] as const;
export type HourInterval = (typeof HOUR_INTERVAL_OPTIONS)[number];

export const HOUR_INTERVAL_LABELS: Record<HourInterval, string> = {
  30: '30 minutes',
  60: '1 hour',
  120: '2 hours',
  240: '4 hours',
};

// Wall-clock time typed by the user; seconds optional (HH:mm or HH:mm:ss).
const startTimeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Invalid time format');
// IANA zone the time was typed in (the browser's zone) — required: the
// server never falls back to its own zone or to UTC (TASK-048).
const timeZoneSchema = z.string({ error: INVALID_TIME_ZONE_MESSAGE }).refine(isValidTimeZone, { message: INVALID_TIME_ZONE_MESSAGE });

export const scheduleDaysSchema = z.object({
  generationId: z.string().uuid(),
  mode: z.literal('days'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  startTime: startTimeSchema,
  timeZone: timeZoneSchema,
  frequency: z.enum(DAY_FREQUENCY_OPTIONS),
  pinIds: z.array(z.string().uuid()).optional(),
});

export const scheduleHoursSchema = z.object({
  generationId: z.string().uuid(),
  mode: z.literal('hours'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  startTime: startTimeSchema,
  timeZone: timeZoneSchema,
  intervalMinutes: z.coerce.number().refine(
    (v): v is HourInterval => (HOUR_INTERVAL_OPTIONS as readonly number[]).includes(v),
    { message: 'Invalid interval' }
  ),
  pinIds: z.array(z.string().uuid()).optional(),
});

export const scheduleSchema = z.discriminatedUnion('mode', [
  scheduleDaysSchema,
  scheduleHoursSchema,
]);

export const clearScheduleSchema = z.object({
  generationId: z.string().uuid(),
  clear: z.literal(true),
  pinIds: z.array(z.string().uuid()).optional(),
});

export type ScheduleInput = z.infer<typeof scheduleSchema>;

function nextWeekdayKey(dateKey: string): string {
  let next = addDaysToDateKey(dateKey, 1);
  while (dayOfWeekOfDateKey(next) === 0 || dayOfWeekOfDateKey(next) === 6) next = addDaysToDateKey(next, 1);
  return next;
}

const DAY_STEP: Record<Exclude<DayFrequency, 'every_weekday'>, number> = {
  daily: 1,
  every_2_days: 2,
  every_3_days: 3,
  weekly: 7,
};

/**
 * One publish instant (UTC) per Pin, every Pin at the same wall-clock time
 * in `timeZone` on successive calendar days — 13:00 stays 13:00 across a
 * summer / winter time change. Each day is converted to UTC exactly once.
 */
export function calculateDaySchedule(
  count: number,
  startDate: string,
  startTime: string,
  frequency: DayFrequency,
  timeZone: string
): Date[] {
  const dateKeys: string[] = [startDate];
  for (let i = 1; i < count; i++) {
    const prev = dateKeys[i - 1];
    dateKeys.push(frequency === 'every_weekday' ? nextWeekdayKey(prev) : addDaysToDateKey(prev, DAY_STEP[frequency]));
  }
  return dateKeys.map((dateKey) => zonedWallTimeToUtc(dateKey, startTime, timeZone));
}

/**
 * First Pin at the wall-clock time in `timeZone` (converted to UTC once),
 * then a real elapsed interval between Pins.
 */
export function calculateHourSchedule(
  count: number,
  startDate: string,
  startTime: string,
  intervalMinutes: number,
  timeZone: string
): Date[] {
  const first = zonedWallTimeToUtc(startDate, startTime, timeZone);
  return Array.from({ length: count }, (_, i) => new Date(first.getTime() + i * intervalMinutes * 60000));
}
