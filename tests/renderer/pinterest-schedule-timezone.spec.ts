import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import {
  ScheduleTimeError,
  formatScheduledTime,
  getWallTime,
  isValidTimeZone,
  zonedWallTimeToUtc,
} from '@/lib/scheduling/timezone';
import { calculateDaySchedule, calculateHourSchedule, scheduleSchema } from '@/lib/validations/schedule';
import { formatPinterestPublishDate, generatePinterestCsv } from '@/lib/csv/pinterest';
import { buildContentCoverage, buildWeekPlan, countPinsByDay } from '@/lib/dashboard/build-content-coverage';
import type { Pin } from '@/types/database';

/**
 * Pinterest scheduling time zone (TASK-048). Reported case: 13:00 chosen →
 * 15:00 shown → CSV 15:00:00 → 17:00 on Pinterest. Offline: no AI, no
 * network; the schedule route runs against a recording Supabase fake.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const MADRID = 'Europe/Madrid';
const GENERATION_ID = '11111111-1111-4111-8111-111111111111';
const PIN_IDS = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'];

/** Runs `fn` with the process (= "server machine") in another zone. */
function inRuntimeZone<T>(zone: string, fn: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

test.describe('Wall time + IANA zone → UTC (converted once)', () => {
  test('13:00 Europe/Madrid in summer → 11:00 UTC', () => {
    expect(zonedWallTimeToUtc('2026-09-22', '13:00', MADRID).toISOString()).toBe('2026-09-22T11:00:00.000Z');
  });

  test('13:00 Europe/Madrid in winter → 12:00 UTC', () => {
    expect(zonedWallTimeToUtc('2026-01-15', '13:00', MADRID).toISOString()).toBe('2026-01-15T12:00:00.000Z');
  });

  test('never depends on the server machine zone, never assumes the time is UTC', () => {
    for (const zone of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'Europe/Madrid']) {
      expect(inRuntimeZone(zone, () => zonedWallTimeToUtc('2026-09-22', '13:00', MADRID).toISOString()), zone).toBe('2026-09-22T11:00:00.000Z');
    }
    expect(zonedWallTimeToUtc('2026-09-22', '13:00', MADRID).toISOString()).not.toBe('2026-09-22T13:00:00.000Z');
  });

  test('day change after conversion to UTC', () => {
    expect(zonedWallTimeToUtc('2026-09-22', '00:30', MADRID).toISOString()).toBe('2026-09-21T22:30:00.000Z');
    expect(zonedWallTimeToUtc('2026-09-22', '20:00', 'America/New_York').toISOString()).toBe('2026-09-23T00:00:00.000Z');
    expect(zonedWallTimeToUtc('2026-12-31', '23:30', 'America/Los_Angeles').toISOString()).toBe('2027-01-01T07:30:00.000Z');
  });

  test('summer / winter time change', () => {
    // Spring forward (29 March 2026): 01:30 is CET, 03:30 is CEST, 02:30 does not exist.
    expect(zonedWallTimeToUtc('2026-03-29', '01:30', MADRID).toISOString()).toBe('2026-03-29T00:30:00.000Z');
    expect(zonedWallTimeToUtc('2026-03-29', '03:30', MADRID).toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(() => zonedWallTimeToUtc('2026-03-29', '02:30', MADRID)).toThrow(ScheduleTimeError);
    // Fall back (25 October 2026): 02:30 happens twice → first occurrence (CEST).
    expect(zonedWallTimeToUtc('2026-10-25', '02:30', MADRID).toISOString()).toBe('2026-10-25T00:30:00.000Z');
    // Daily at 13:00 across the change: the wall time stays 13:00, UTC moves.
    const daily = calculateDaySchedule(3, '2026-10-24', '13:00', 'daily', MADRID).map((d) => d.toISOString());
    expect(daily).toEqual(['2026-10-24T11:00:00.000Z', '2026-10-25T12:00:00.000Z', '2026-10-26T12:00:00.000Z']);
    expect(daily.map((iso) => formatScheduledTime(iso, MADRID))).toEqual(['Oct 24, 13:00', 'Oct 25, 13:00', 'Oct 26, 13:00']);
  });

  test('other time zones', () => {
    expect(zonedWallTimeToUtc('2026-09-22', '13:00', 'Asia/Kolkata').toISOString()).toBe('2026-09-22T07:30:00.000Z');
    expect(zonedWallTimeToUtc('2026-09-22', '13:00', 'America/New_York').toISOString()).toBe('2026-09-22T17:00:00.000Z');
    expect(zonedWallTimeToUtc('2026-09-22', '13:00', 'UTC').toISOString()).toBe('2026-09-22T13:00:00.000Z');
    expect(zonedWallTimeToUtc('2026-09-22', '13:00', 'Australia/Sydney').toISOString()).toBe('2026-09-22T03:00:00.000Z');
  });

  test('invalid or missing time zones are refused', () => {
    for (const zone of ['', 'Mars/Base', 'CEST', '+02:00', 'GMT+2', 'Europe', null, undefined, 42]) {
      expect(isValidTimeZone(zone), String(zone)).toBe(false);
    }
    expect(isValidTimeZone(MADRID)).toBe(true);
    expect(() => zonedWallTimeToUtc('2026-09-22', '13:00', 'Mars/Base')).toThrow(ScheduleTimeError);
    const base = { generationId: GENERATION_ID, mode: 'days', startDate: '2026-09-22', startTime: '13:00', frequency: 'daily' };
    expect(scheduleSchema.safeParse(base).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...base, timeZone: 'Mars/Base' }).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...base, timeZone: MADRID }).success).toBe(true);
  });

  test('minutes and seconds are kept', () => {
    expect(zonedWallTimeToUtc('2026-09-22', '13:07', MADRID).toISOString()).toBe('2026-09-22T11:07:00.000Z');
    expect(zonedWallTimeToUtc('2026-09-22', '13:07:45', MADRID).toISOString()).toBe('2026-09-22T11:07:45.000Z');
    const base = { generationId: GENERATION_ID, mode: 'hours', startDate: '2026-09-22', intervalMinutes: 30, timeZone: MADRID };
    expect(scheduleSchema.safeParse({ ...base, startTime: '13:07:45' }).success).toBe(true);
    expect(scheduleSchema.safeParse({ ...base, startTime: '13:7' }).success).toBe(false);
    expect(calculateHourSchedule(3, '2026-09-22', '13:07:45', 30, MADRID).map((d) => d.toISOString())).toEqual([
      '2026-09-22T11:07:45.000Z', '2026-09-22T11:37:45.000Z', '2026-09-22T12:07:45.000Z',
    ]);
  });

  test('every weekday skips the weekend in the chosen calendar', () => {
    // 25 Sep 2026 is a Friday.
    const dates = calculateDaySchedule(3, '2026-09-25', '13:00', 'every_weekday', MADRID);
    expect(dates.map((d) => formatScheduledTime(d.toISOString(), MADRID))).toEqual(['Sep 25, 13:00', 'Sep 28, 13:00', 'Sep 29, 13:00']);
  });
});

test.describe('Display after reading the stored instant', () => {
  test('11:00 UTC read back is shown as 13:00 in the planning zone', () => {
    const stored = '2026-09-22T11:00:00+00:00'; // as returned by Postgres timestamptz
    expect(formatScheduledTime(stored, MADRID)).toBe('Sep 22, 13:00');
    expect(getWallTime(new Date(stored), MADRID)).toMatchObject({ hour: 13, minute: 0 });
    expect(formatScheduledTime('not a date', MADRID)).toBe('');
  });

  test('the schedule dialog reads, previews and sends the browser zone', () => {
    const dialog = read('components/pinterest/schedule-dialog.tsx');
    expect(dialog).toContain('useState(getBrowserTimeZone)');
    expect(dialog).toContain('startDate, startTime, timeZone, frequency: dayFrequency');
    expect(dialog).toContain('startDate, startTime, timeZone, intervalMinutes: hourInterval');
    expect(dialog).toContain('formatPreviewDate(date, timeZone)');
    expect(dialog).toContain('Times in {timeZone}');
    expect(dialog).not.toContain("toISOString().split('T')[0]");
  });

  test('history (pin table) shows the stored instant in the browser zone, not UTC', () => {
    const table = read('components/pinterest/pin-table.tsx');
    expect(table.startsWith("'use client';")).toBe(true);
    expect(table).toContain("d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })");
    expect(table).not.toMatch(/timeZone:\s*'UTC'/);
  });
});

function pin(publishDate: string | null): Pin {
  return {
    id: 'pin-1', generation_id: GENERATION_ID, title: 'Clay coasters', description: 'Desc', keywords: 'clay',
    board: 'Clay', board_id: null, board_section: null, image_prompt: '', media_url: 'https://cdn/x.png',
    link_url: null, publish_date: publishDate, language: 'en', created_at: '',
  } as unknown as Pin;
}

test.describe('CSV — UTC, no double conversion', () => {
  test('the stored instant is written in UTC: 13:00 Madrid → 2026-09-22T11:00:00', () => {
    expect(formatPinterestPublishDate('2026-09-22T11:00:00.000Z')).toBe('2026-09-22T11:00:00');
    expect(formatPinterestPublishDate('2026-09-22T11:00:00+00:00')).toBe('2026-09-22T11:00:00');
    expect(formatPinterestPublishDate('2026-09-22T13:00:00+02:00')).toBe('2026-09-22T11:00:00');
    expect(formatPinterestPublishDate(null)).toBe('');
    expect(formatPinterestPublishDate('garbage')).toBe('');
  });

  test('same output whatever the browser zone (no local conversion)', () => {
    for (const zone of ['Europe/Madrid', 'UTC', 'Asia/Tokyo', 'America/New_York']) {
      expect(inRuntimeZone(zone, () => formatPinterestPublishDate('2026-09-22T11:00:00.000Z')), zone).toBe('2026-09-22T11:00:00');
    }
  });

  test('end to end: typed 13:00 → stored → CSV, converted exactly once', () => {
    const stored = zonedWallTimeToUtc('2026-09-22', '13:00', MADRID).toISOString();
    const csv = inRuntimeZone('Europe/Madrid', () => generatePinterestCsv([pin(stored)]));
    expect(csv).toContain(',2026-09-22T11:00:00,');
    expect(csv).not.toContain('T15:00:00');
    expect(csv).not.toContain('T13:00:00');
    // Seconds kept; a day change stays a day change.
    expect(formatPinterestPublishDate(zonedWallTimeToUtc('2026-09-22', '00:30:15', MADRID).toISOString())).toBe('2026-09-21T22:30:15');
  });
});

test.describe('Dashboard calendar and Content Streams', () => {
  const NOW = new Date('2026-09-25T08:00:00Z'); // Friday 10:00 in Madrid

  test('pins are counted on their project-zone day, not the UTC day', () => {
    const late = zonedWallTimeToUtc('2026-09-26', '00:30', MADRID).toISOString(); // 2026-09-25T22:30Z
    const byDay = inRuntimeZone('UTC', () => countPinsByDay([late]));
    expect([...byDay.entries()]).toEqual([['2026-09-26', 1]]);
  });

  test('coverage and the week plan put a 00:30 / 13:00 Madrid Pin on the right day, any runtime zone', () => {
    const board = { id: 'board-1', name: 'Clay board' };
    const stream = { id: 's1', name: 'Clay', projectId: 'p1', projectName: 'Clay', status: 'active' as const, targetPinsPerDay: 1, targetBufferDays: 2, boards: [board] };
    const plannedPins = [
      { boardId: 'board-1', publishDate: zonedWallTimeToUtc('2026-09-25', '13:00', MADRID).toISOString() },
      { boardId: 'board-1', publishDate: zonedWallTimeToUtc('2026-09-26', '00:30', MADRID).toISOString() },
    ];
    for (const zone of ['UTC', 'Europe/Madrid', 'America/Los_Angeles']) {
      const coverage = inRuntimeZone(zone, () => buildContentCoverage({ streams: [stream], plannedPins, unscheduledByBoard: new Map(), now: NOW } as never));
      expect(coverage[0].plannedPins, zone).toBe(2);
      expect(coverage[0].lastPlannedDate, zone).toBe('2026-09-26');
      const week = inRuntimeZone(zone, () => buildWeekPlan({ coverage, plannedPins, dueTasks: [], now: NOW } as never));
      const planned = Object.fromEntries(week.map((day) => [day.date, day.plannedPins]));
      expect(planned['2026-09-25'], zone).toBe(1);
      expect(planned['2026-09-26'], zone).toBe(1);
    }
  });

  test('the dashboard query keeps one day of margin before the week start', () => {
    expect(read('app/(dashboard)/dashboard/page.tsx')).toContain('listPlannedPinsFrom(supabase, addLocalDays(startOfLocalWeek(now), -1).toISOString())');
  });
});

// ------------------------------------------------------------ route

interface Recorded { table: string; op: string; row?: unknown; filter: Record<string, unknown> }

async function withScheduleRoute(run: (post: (body: unknown) => Promise<Response>, events: Recorded[]) => Promise<void>) {
  const events: Recorded[] = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from(table: string) {
      const filter: Record<string, unknown> = {};
      let op = 'select';
      let row: unknown;
      const query = {
        select: () => query,
        order: () => query,
        eq: (c: string, v: unknown) => { filter[c] = v; return query; },
        in: (c: string, v: unknown) => { filter[c] = v; return query; },
        update: (r: unknown) => { op = 'update'; row = r; return query; },
        single: async () => ({ data: table === 'generations' ? { id: GENERATION_ID, user_id: 'user-1' } : null, error: null }),
        then: (resolve: (v: unknown) => unknown) => {
          if (op === 'update') {
            events.push({ table, op, row, filter: { ...filter } });
            return resolve({ data: null, error: null });
          }
          const ids = (filter.id as string[] | undefined) ?? PIN_IDS;
          return resolve({ data: ids.map((id) => ({ id })), error: null });
        },
      };
      return query;
    },
  };
  const fakeKey = require.resolve('@/lib/supabase/server');
  const routeKey = require.resolve('@/app/api/pinterest/schedule/route');
  const originals = new Map([[fakeKey, require.cache[fakeKey]], [routeKey, require.cache[routeKey]]]);
  try {
    require.cache[fakeKey] = { id: fakeKey, filename: fakeKey, loaded: true, exports: { createClient: async () => supabase }, children: [], paths: [], path: '', parent: null, isPreloading: false, require } as unknown as NodeJS.Module;
    delete require.cache[routeKey];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const route = require('@/app/api/pinterest/schedule/route') as { PATCH: (r: Request) => Promise<Response> };
    await run((body) => route.PATCH(new Request('http://localhost/api/pinterest/schedule', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })), events);
  } finally {
    for (const [key, original] of originals) {
      if (original) require.cache[key] = original;
      else delete require.cache[key];
    }
  }
}

test.describe('PATCH /api/pinterest/schedule', () => {
  const future = '2030-09-22';

  test('stores the UTC instant of the typed Madrid time, on a UTC server', async () => {
    await withScheduleRoute(async (post, events) => {
      const res = await inRuntimeZone('UTC', () => post({ generationId: GENERATION_ID, mode: 'days', startDate: future, startTime: '13:00', frequency: 'daily', timeZone: MADRID }));
      expect(res.status).toBe(200);
      expect(events.map((e) => (e.row as { publish_date: string }).publish_date)).toEqual([
        '2030-09-22T11:00:00.000Z', '2030-09-23T11:00:00.000Z', '2030-09-24T11:00:00.000Z',
      ]);
    });
  });

  test('a request without a valid time zone writes nothing', async () => {
    await withScheduleRoute(async (post, events) => {
      for (const timeZone of [undefined, '', 'Mars/Base', '+02:00']) {
        const res = await post({ generationId: GENERATION_ID, mode: 'days', startDate: future, startTime: '13:00', frequency: 'daily', timeZone });
        expect(res.status).toBe(400);
      }
      expect(events).toEqual([]);
    });
  });

  test('a time skipped by the daylight-saving change is refused with a clear message', async () => {
    await withScheduleRoute(async (post, events) => {
      const res = await post({ generationId: GENERATION_ID, mode: 'days', startDate: '2030-03-31', startTime: '02:30', frequency: 'daily', timeZone: MADRID });
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toContain('daylight saving');
      expect(events).toEqual([]);
    });
  });

  test('"in the future" is judged in the chosen zone', async () => {
    await withScheduleRoute(async (post) => {
      const res = await post({ generationId: GENERATION_ID, mode: 'days', startDate: '2020-01-01', startTime: '13:00', frequency: 'daily', timeZone: MADRID });
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toBe('Start date must be in the future');
    });
  });

  test('only the Pins being scheduled are written; older Pins are never changed automatically', async () => {
    await withScheduleRoute(async (post, events) => {
      await post({ generationId: GENERATION_ID, mode: 'hours', startDate: future, startTime: '13:00', intervalMinutes: 60, timeZone: MADRID, pinIds: [PIN_IDS[1]] });
      expect(events).toHaveLength(1);
      expect(events[0].filter).toEqual({ id: PIN_IDS[1] });
    });
    // No migration, no backfill, no code path rewriting stored publish_date values.
    const sources = ['app/api/pinterest/schedule/route.ts', 'lib/validations/schedule.ts', 'lib/scheduling/timezone.ts', 'lib/csv/pinterest.ts'].map(read).join('\n');
    expect(sources).not.toMatch(/backfill|migrat/i);
  });
});

test.describe('Already stored dates (before the fix)', () => {
  test('are read as the instant they are, without any rewrite', () => {
    // A Pin scheduled before the fix for "13:00" was stored as 13:00 UTC.
    const legacy = '2026-09-22T13:00:00+00:00';
    expect(formatScheduledTime(legacy, MADRID)).toBe('Sep 22, 15:00');
    expect(formatPinterestPublishDate(legacy)).toBe('2026-09-22T13:00:00');
  });
});
