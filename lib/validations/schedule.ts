import { z } from 'zod';

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

export const scheduleDaysSchema = z.object({
  generationId: z.string().uuid(),
  mode: z.literal('days'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  frequency: z.enum(DAY_FREQUENCY_OPTIONS),
});

export const scheduleHoursSchema = z.object({
  generationId: z.string().uuid(),
  mode: z.literal('hours'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  intervalMinutes: z.coerce.number().refine(
    (v): v is HourInterval => (HOUR_INTERVAL_OPTIONS as readonly number[]).includes(v),
    { message: 'Invalid interval' }
  ),
});

export const scheduleSchema = z.discriminatedUnion('mode', [
  scheduleDaysSchema,
  scheduleHoursSchema,
]);

export const clearScheduleSchema = z.object({
  generationId: z.string().uuid(),
  clear: z.literal(true),
});

export type ScheduleInput = z.infer<typeof scheduleSchema>;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

function nextWeekday(date: Date): Date {
  const result = addDays(date, 1);
  while (result.getDay() === 0 || result.getDay() === 6) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

function buildFirst(startDate: string, startTime: string): Date {
  const [year, month, day] = startDate.split('-').map(Number);
  const [hours, minutes] = startTime.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

export function calculateDaySchedule(
  count: number,
  startDate: string,
  startTime: string,
  frequency: DayFrequency
): Date[] {
  const first = buildFirst(startDate, startTime);
  const dates: Date[] = [first];

  for (let i = 1; i < count; i++) {
    const prev = dates[i - 1];
    let next: Date;

    switch (frequency) {
      case 'daily':
        next = addDays(prev, 1);
        break;
      case 'every_2_days':
        next = addDays(prev, 2);
        break;
      case 'every_3_days':
        next = addDays(prev, 3);
        break;
      case 'weekly':
        next = addDays(prev, 7);
        break;
      case 'every_weekday':
        next = nextWeekday(prev);
        break;
    }

    dates.push(next);
  }

  return dates;
}

export function calculateHourSchedule(
  count: number,
  startDate: string,
  startTime: string,
  intervalMinutes: number
): Date[] {
  const first = buildFirst(startDate, startTime);
  const dates: Date[] = [first];

  for (let i = 1; i < count; i++) {
    dates.push(addMinutes(dates[i - 1], intervalMinutes));
  }

  return dates;
}
