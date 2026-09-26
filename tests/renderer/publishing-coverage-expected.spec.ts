import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deletePublishingActivitySchema, upsertPublishingActivitySchema } from '@/lib/validations/content-streams';
import {
  PublishingActivityError,
  deletePublishingActivity,
  listPublishingActivityFrom,
  publishingActivityErrorStatus,
  resolveActivityStatus,
  upsertPublishingActivity,
} from '@/lib/queries/stream-publishing-activity';
import {
  buildContentCoverage,
  buildWeekPlan,
  type ExternalActivityInput,
  type PlannedPinInput,
  type StreamInput,
} from '@/lib/dashboard/build-content-coverage';
import { activityCellLabel, activityDialogMode, coverageDayDescription, expectedActivityLabel } from '@/lib/dashboard/publishing-activity';
import { addLocalDays, toLocalDayKey } from '@/lib/dashboard/local-date';
import { coverageCellProps, externalActivityTotals } from '@/components/dashboard/publishing-coverage';
import type { PublishingActivityStatus } from '@/types/content-streams';

/**
 * TASK-FIX-053 — expected (future) external publishing activity in
 * "Publishing coverage". Offline: validation, the query functions the route
 * calls (against an in-memory Supabase stub), the coverage maths, static
 * checks of migration 038 and the route, and the props every grid cell
 * (future ones included) passes to its clickable modal trigger. Live RLS
 * enforcement needs a real Postgres; the real browser click is covered by the
 * gated case in tests/playwright/dashboard.spec.ts.
 *
 * "Today" = Friday 25 September 2026, 10:00 local.
 */
const NOW = new Date(2026, 8, 25, 10, 0);
const TODAY = toLocalDayKey(NOW);
const YESTERDAY = toLocalDayKey(addLocalDays(NOW, -1));
const IN_3_DAYS = toLocalDayKey(addLocalDays(NOW, 3));
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STREAM_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_STREAM_ID = '44444444-4444-4444-8444-444444444444';

// ---------------------------------------------------------------------------
// In-memory Supabase stub: select/eq/gte, upsert(onConflict), delete, and
// single()/maybeSingle() or await for lists.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

function fakeSupabase(tables: Record<string, Row[]>) {
  let nextId = 1;

  class Query implements PromiseLike<{ data: Row[] | null; error: null }> {
    private filters: ((row: Row) => boolean)[] = [];
    private op: 'select' | 'upsert' | 'delete' = 'select';
    private payload: Row = {};
    private conflict: string[] = [];
    constructor(private table: string) {
      tables[table] ??= [];
    }
    select() {
      return this;
    }
    eq(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value);
      return this;
    }
    gte(column: string, value: string) {
      this.filters.push((row) => String(row[column]) >= value);
      return this;
    }
    upsert(row: Row, options?: { onConflict?: string }) {
      this.op = 'upsert';
      this.payload = row;
      this.conflict = (options?.onConflict ?? 'id').split(',');
      return this;
    }
    delete() {
      this.op = 'delete';
      return this;
    }
    private matches(row: Row) {
      return this.filters.every((filter) => filter(row));
    }
    private runList(): Row[] {
      const rows = tables[this.table];
      if (this.op === 'select') return rows.filter((row) => this.matches(row));
      if (this.op === 'delete') {
        const removed = rows.filter((row) => this.matches(row));
        tables[this.table] = rows.filter((row) => !this.matches(row));
        return removed;
      }
      const existing = rows.find((r) => this.conflict.every((column) => r[column] === this.payload[column]));
      if (existing) return [Object.assign(existing, this.payload)];
      const row = { id: `row-${nextId++}`, ...this.payload };
      rows.push(row);
      return [row];
    }
    single() {
      return Promise.resolve({ data: this.runList()[0] ?? null, error: null });
    }
    maybeSingle() {
      return this.single();
    }
    then<T1, T2>(
      onfulfilled?: ((value: { data: Row[] | null; error: null }) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
    ) {
      return Promise.resolve({ data: this.runList(), error: null as null }).then(onfulfilled, onrejected);
    }
  }

  return { client: { from: (table: string) => new Query(table) } as unknown as SupabaseClient, tables };
}

function setup(existing: Row[] = []) {
  return fakeSupabase({
    content_streams: [
      { id: STREAM_ID, user_id: USER_A },
      { id: OTHER_STREAM_ID, user_id: USER_B },
    ],
    content_stream_publishing_activity: existing,
  });
}

function save(client: SupabaseClient, body: Record<string, unknown>, streamId = STREAM_ID, userId = USER_A) {
  return upsertPublishingActivity(client, userId, streamId, upsertPublishingActivitySchema.parse(body), NOW);
}

function stream(overrides: Partial<StreamInput> & Pick<StreamInput, 'id' | 'name'>): StreamInput {
  return {
    projectId: 'project-1',
    projectName: 'Home Decor Germany',
    status: 'active',
    targetPinsPerDay: 5,
    targetBufferDays: 5,
    boards: [{ id: `board-${overrides.id}`, name: `${overrides.name} board` }],
    ...overrides,
  };
}

function pinsFor(boardId: string, startOffset: number, days: number, perDay: number): PlannedPinInput[] {
  const pins: PlannedPinInput[] = [];
  for (let d = 0; d < days; d++) {
    const date = addLocalDays(NOW, startOffset + d);
    for (let i = 0; i < perDay; i++) {
      pins.push({ boardId, publishDate: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, i).toISOString() });
    }
  }
  return pins;
}

function activity(streamId: string, activityDate: string, publishedCount: number, status: PublishingActivityStatus): ExternalActivityInput {
  return { streamId, activityDate, publishedCount, note: null, source: 'external', status };
}

// ===========================================================================
// 1. Status per date
// ===========================================================================
test.describe('Expected activity — status per date', () => {
  test('omitted status is derived from the date: past / today = published, future = expected', () => {
    expect(resolveActivityStatus(YESTERDAY, undefined, NOW)).toBe('published');
    expect(resolveActivityStatus(TODAY, undefined, NOW)).toBe('published');
    expect(resolveActivityStatus(IN_3_DAYS, undefined, NOW)).toBe('expected');
  });

  test('"published" on a future day is refused; "expected" on today / past stays allowed (unconfirmed entry)', () => {
    const err = (() => {
      try {
        resolveActivityStatus(IN_3_DAYS, 'published', NOW);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(PublishingActivityError);
    expect((err as PublishingActivityError).code).toBe('future_date');
    expect(publishingActivityErrorStatus(err as PublishingActivityError)).toBe(400);
    expect(resolveActivityStatus(TODAY, 'expected', NOW)).toBe('expected');
    expect(resolveActivityStatus(YESTERDAY, 'expected', NOW)).toBe('expected');
    expect(resolveActivityStatus(TODAY, 'published', NOW)).toBe('published');
  });

  test('the status field accepts only published / expected', () => {
    expect(upsertPublishingActivitySchema.safeParse({ activityDate: TODAY, publishedCount: 1, status: 'expected' }).success).toBe(true);
    expect(upsertPublishingActivitySchema.safeParse({ activityDate: TODAY, publishedCount: 1, status: 'planned' }).success).toBe(false);
    expect(upsertPublishingActivitySchema.parse({ activityDate: TODAY, publishedCount: 1 }).status).toBeUndefined();
  });

  test('the dialog mode follows the date and the saved status', () => {
    expect(activityDialogMode(true, null)).toBe('expected');
    expect(activityDialogMode(true, 'expected')).toBe('expected');
    expect(activityDialogMode(false, null)).toBe('published');
    expect(activityDialogMode(false, 'published')).toBe('published');
    expect(activityDialogMode(false, 'expected')).toBe('confirm');
  });
});

// ===========================================================================
// 2. Create, edit, confirm, delete
// ===========================================================================
test.describe('Expected activity — create, edit, confirm, delete', () => {
  test('creates a past-day activity as published', async () => {
    const { client, tables } = setup();
    const saved = await save(client, { activityDate: YESTERDAY, publishedCount: 4, note: 'Tailwind' });
    expect(saved).toMatchObject({ user_id: USER_A, activity_date: YESTERDAY, published_count: 4, status: 'published' });
    expect(tables.content_stream_publishing_activity).toHaveLength(1);
  });

  test("creates today's activity as published", async () => {
    const { client } = setup();
    const saved = await save(client, { activityDate: TODAY, publishedCount: 5 });
    expect(saved).toMatchObject({ activity_date: TODAY, status: 'published' });
  });

  test('creates a future-day activity as expected, never as published', async () => {
    const { client, tables } = setup();
    const saved = await save(client, { activityDate: IN_3_DAYS, publishedCount: 6, note: 'Scheduled in Tailwind' });
    expect(saved).toMatchObject({ activity_date: IN_3_DAYS, published_count: 6, status: 'expected', note: 'Scheduled in Tailwind' });
    const refused = await save(client, { activityDate: IN_3_DAYS, publishedCount: 6, status: 'published' }).catch((e) => e);
    expect(refused.code).toBe('future_date');
    expect(tables.content_stream_publishing_activity).toHaveLength(1);
    expect(tables.content_stream_publishing_activity[0].status).toBe('expected');
  });

  test('editing a future entry updates the same row (unique stream + day)', async () => {
    const { client, tables } = setup();
    await save(client, { activityDate: IN_3_DAYS, publishedCount: 6 });
    await save(client, { activityDate: IN_3_DAYS, publishedCount: 8, note: 'Two more' });
    expect(tables.content_stream_publishing_activity).toHaveLength(1);
    expect(tables.content_stream_publishing_activity[0]).toMatchObject({ published_count: 8, note: 'Two more', status: 'expected' });
  });

  test('once the day has come, an expected entry is confirmed as published on the same row', async () => {
    const { client, tables } = setup([
      { id: 'e1', user_id: USER_A, content_stream_id: STREAM_ID, activity_date: TODAY, published_count: 5, note: null, source: 'external', status: 'expected' },
    ]);
    const confirmed = await save(client, { activityDate: TODAY, publishedCount: 5, source: 'external', status: 'published' });
    expect(confirmed).toMatchObject({ id: 'e1', status: 'published' });
    expect(tables.content_stream_publishing_activity).toHaveLength(1);
  });

  test('deletes an entry (expected or published) of one stream and day only', async () => {
    const { client, tables } = setup([
      { id: 'e1', user_id: USER_A, content_stream_id: STREAM_ID, activity_date: IN_3_DAYS, published_count: 5, status: 'expected' },
      { id: 'p1', user_id: USER_A, content_stream_id: STREAM_ID, activity_date: TODAY, published_count: 5, status: 'published' },
    ]);
    await deletePublishingActivity(client, USER_A, STREAM_ID, deletePublishingActivitySchema.parse({ activityDate: IN_3_DAYS }));
    expect(tables.content_stream_publishing_activity.map((row) => row.id)).toEqual(['p1']);
    await deletePublishingActivity(client, USER_A, STREAM_ID, { activityDate: TODAY });
    expect(tables.content_stream_publishing_activity).toHaveLength(0);
  });

  test('deleting a day with no entry is a 404; a bad date is rejected', async () => {
    const { client } = setup();
    const err = await deletePublishingActivity(client, USER_A, STREAM_ID, { activityDate: IN_3_DAYS }).catch((e) => e);
    expect(publishingActivityErrorStatus(err)).toBe(404);
    expect(deletePublishingActivitySchema.safeParse({ activityDate: '2026-02-30' }).success).toBe(false);
    expect(deletePublishingActivitySchema.safeParse({ activityDate: '' }).success).toBe(false);
  });

  test("permissions: another user's stream is refused for create and delete — nothing written or removed", async () => {
    const other = { id: 'b1', user_id: USER_B, content_stream_id: OTHER_STREAM_ID, activity_date: IN_3_DAYS, published_count: 3, status: 'expected' };
    const { client, tables } = setup([other]);
    const create = await save(client, { activityDate: IN_3_DAYS, publishedCount: 2 }, OTHER_STREAM_ID).catch((e) => e);
    expect(publishingActivityErrorStatus(create)).toBe(403);
    const remove = await deletePublishingActivity(client, USER_A, OTHER_STREAM_ID, { activityDate: IN_3_DAYS }).catch((e) => e);
    expect(publishingActivityErrorStatus(remove)).toBe(403);
    expect(tables.content_stream_publishing_activity).toEqual([other]);
  });

  test('the list read returns the status of each entry', async () => {
    const { client } = setup([
      { user_id: USER_A, content_stream_id: STREAM_ID, activity_date: IN_3_DAYS, published_count: 5, note: null, source: 'external', status: 'expected' },
    ]);
    const rows = await listPublishingActivityFrom(client, TODAY);
    expect(rows).toEqual([{ streamId: STREAM_ID, activityDate: IN_3_DAYS, publishedCount: 5, note: null, source: 'external', status: 'expected' }]);
  });
});

// ===========================================================================
// 3. Coverage maths — confirmed and expected never mixed
// ===========================================================================
test.describe('Expected activity — coverage and counters', () => {
  const cat = stream({ id: 'cat', name: 'Crochet Cat', targetPinsPerDay: 5, targetBufferDays: 5 });

  test('confirmed (today) and expected (future) counters stay separate', () => {
    const coverage = buildContentCoverage({
      streams: [cat],
      plannedPins: [],
      unscheduledByBoard: {},
      externalActivity: [activity('cat', TODAY, 4, 'published'), activity('cat', IN_3_DAYS, 5, 'expected')],
      now: NOW,
    });
    const [row] = coverage;
    expect(row.externalToday).toBe(4);
    expect(row.expectedExternal).toBe(5);
    expect(row.days[0]).toMatchObject({ external: 4, expected: 0, externalStatus: 'published' });
    expect(row.days[3]).toMatchObject({ external: 0, expected: 5, externalStatus: 'expected', level: 'full' });
    expect(externalActivityTotals(coverage)).toEqual({ confirmed: 4, expected: 5 });
  });

  test('an unconfirmed entry for today is expected, not published', () => {
    const [row] = buildContentCoverage({
      streams: [cat],
      plannedPins: [],
      unscheduledByBoard: {},
      externalActivity: [activity('cat', TODAY, 5, 'expected')],
      now: NOW,
    });
    expect(row.externalToday).toBe(0);
    expect(row.expectedExternal).toBe(5);
    expect(row.days[0]).toMatchObject({ external: 0, expected: 5, externalStatus: 'expected' });
    expect(coverageDayDescription(row.days[0], 'Sep 25', 5)).toContain('Expected externally: 5 (not confirmed)');
    expect(coverageDayDescription(row.days[0], 'Sep 25', 5)).toContain('Target met (forecast)');
    expect(coverageDayDescription(row.days[0], 'Sep 25', 5)).not.toContain('Published externally');
  });

  test('a past expected entry and a future published entry are ignored', () => {
    const [row] = buildContentCoverage({
      streams: [cat],
      plannedPins: [],
      unscheduledByBoard: {},
      externalActivity: [activity('cat', YESTERDAY, 5, 'expected'), activity('cat', IN_3_DAYS, 5, 'published')],
      now: NOW,
    });
    expect(row.expectedExternal).toBe(0);
    expect(row.externalToday).toBe(0);
    expect(row.days.every((day) => day.external === 0 && day.expected === 0)).toBe(true);
  });

  test('no double counting with OmniFlow dates: planned stays OmniFlow-only, expected only fills the gap', () => {
    // 3 Pins planned in OmniFlow on day +3, 5 expected externally the same day.
    const planned = pinsFor('board-cat', 3, 1, 3);
    const [without] = buildContentCoverage({ streams: [cat], plannedPins: planned, unscheduledByBoard: {}, now: NOW });
    const [withExpected] = buildContentCoverage({
      streams: [cat],
      plannedPins: planned,
      unscheduledByBoard: {},
      externalActivity: [activity('cat', IN_3_DAYS, 5, 'expected')],
      now: NOW,
    });
    expect(withExpected.plannedPins).toBe(3);
    expect(withExpected.plannedPins).toBe(without.plannedPins);
    expect(withExpected.days[3]).toMatchObject({ planned: 3, expected: 5, effective: 8 });
    // Buffer credit is capped at the day's gap (5 − 3 = 2), never the full 5.
    expect(without.missingPins).toBe(22);
    expect(withExpected.missingPins).toBe(20);
  });

  test('expected days improve the forecast (coverage run, This week to-create) without being published', () => {
    const tomorrow = toLocalDayKey(addLocalDays(NOW, 1));
    const coverage = buildContentCoverage({
      streams: [cat],
      plannedPins: pinsFor('board-cat', 0, 1, 5),
      unscheduledByBoard: {},
      externalActivity: [activity('cat', tomorrow, 5, 'expected')],
      now: NOW,
    });
    expect(coverage[0].daysCovered).toBe(2);
    expect(coverage[0].coveredThrough).toBe(tomorrow);
    expect(coverage[0].externalToday).toBe(0);
    const week = buildWeekPlan({ coverage, plannedPins: pinsFor('board-cat', 0, 1, 5), dueTasks: [], now: NOW });
    expect(week.find((day) => day.date === tomorrow)?.pinsToCreate).toBe(0);
    expect(week.find((day) => day.date === tomorrow)?.plannedPins).toBe(0);
  });

  test('labels keep both states apart', () => {
    expect(expectedActivityLabel(5)).toBe('Expected externally: 5');
  });
});

// ===========================================================================
// 4. Migration 038, 035 untouched, route
// ===========================================================================
test.describe('Expected activity — migration 038 and route', () => {
  const sql038 = readFileSync(path.join('supabase/migrations/038_add_publishing_activity_status.sql'), 'utf8');
  const sql035 = readFileSync(path.join('supabase/migrations/035_add_stream_publishing_activity.sql'), 'utf8');

  test('038 adds a closed status column defaulting to published (existing rows stay confirmed)', () => {
    expect(sql038).toContain('ALTER TABLE content_stream_publishing_activity');
    expect(sql038).toMatch(/ADD COLUMN status text NOT NULL DEFAULT 'published'/);
    expect(sql038).toContain("CHECK (status IN ('published', 'expected'))");
  });

  test('038 keeps RLS, grants, the unique stream/day constraint and never touches pins', () => {
    const code = sql038.replace(/--.*$/gm, '');
    expect(code).not.toMatch(/POLICY|ROW LEVEL SECURITY|GRANT|REVOKE|DROP|UNIQUE/i);
    expect(code).not.toMatch(/\bpins\b/);
    expect(sql035).toContain('UNIQUE (user_id, content_stream_id, activity_date)');
    expect(sql035).toContain('ALTER TABLE content_stream_publishing_activity ENABLE ROW LEVEL SECURITY');
    expect(sql035).not.toMatch(/\bstatus\s+text\b/);
  });

  test('the DELETE route checks auth, the stream ID and the date; writes never touch pins', () => {
    const route = readFileSync(path.join('app/api/content-streams/[id]/publishing-activity/route.ts'), 'utf8');
    const del = route.slice(route.indexOf('export async function DELETE'));
    expect(del).toContain('supabase.auth.getUser()');
    expect(del).toContain('isValidUuid(id)');
    expect(del).toContain('deletePublishingActivitySchema.safeParse');
    const queries = readFileSync(path.join('lib/queries/stream-publishing-activity.ts'), 'utf8');
    expect(queries).not.toMatch(/from\(\s*'pins'\s*\)/);
    expect(queries).toMatch(/\.delete\(\)\s*\.eq\('user_id', userId\)/);
  });
});

// ===========================================================================
// 5. UI — every cell (future ones included) opens the modal
// ===========================================================================
test.describe('Expected activity — coverage grid UI', () => {
  const cat = stream({ id: 'cat', name: 'Crochet Cat', targetPinsPerDay: 5, targetBufferDays: 3 });

  function cells(externalActivity: ExternalActivityInput[] = []) {
    const [row] = buildContentCoverage({ streams: [cat], plannedPins: [], unscheduledByBoard: {}, externalActivity, now: NOW });
    return row.days.map((day) => {
      const props = coverageCellProps(row, day, TODAY);
      return { ...props, label: activityCellLabel(props.description, props.isFuture, props.status) };
    });
  }

  test('all 14 cells are clickable: today records publishing, every future day plans external publishing', () => {
    const all = cells();
    expect(all).toHaveLength(14);
    expect(all[0]).toMatchObject({ date: TODAY, isFuture: false });
    expect(all[0].label).toMatch(/Record publishing activity$/);
    for (const cell of all.slice(1)) {
      expect(cell.isFuture).toBe(true);
      expect(cell.label).toMatch(/Plan external publishing$/);
      expect(activityDialogMode(cell.isFuture, cell.status)).toBe('expected');
    }
  });

  test('a future expected cell carries its saved count and status to the modal (edit / delete)', () => {
    const cell = cells([activity('cat', IN_3_DAYS, 5, 'expected')])[3];
    expect(cell).toMatchObject({ date: IN_3_DAYS, isFuture: true, expected: 5, external: 0, status: 'expected' });
    expect(cell.label).toContain('Expected externally: 5 (not confirmed)');
    expect(cell.label).not.toContain('Published externally');
  });

  test("today's unconfirmed expected entry opens the confirm flow; a confirmed one keeps the current flow", () => {
    expect(cells([activity('cat', TODAY, 5, 'expected')])[0].label).toMatch(/Confirm expected publishing$/);
    const confirmed = cells([activity('cat', TODAY, 5, 'published')])[0];
    expect(confirmed).toMatchObject({ external: 5, expected: 0, status: 'published' });
    expect(confirmed.label).toMatch(/Published externally: 5.*Record publishing activity$/);
  });

  test('the grid uses a distinct hollow marker for expected and separate counters', () => {
    const source = readFileSync(path.join('components/dashboard/publishing-coverage.tsx'), 'utf8');
    expect(source).toMatch(/EXPECTED_MARKER_CLASS = '[^']*border-dashed/);
    expect(source).toContain("label: 'Confirmed externally'");
    expect(source).toContain("label: 'Expected externally'");
    expect(source).toContain('coverageCellProps(stream, day, todayKey)');
  });
});
