import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deletePublishingActivitySchema, upsertPublishingActivitySchema } from '@/lib/validations/content-streams';
import {
  PublishingActivityError,
  SCHEMA_OUTDATED_MESSAGE,
  deletePublishingActivity,
  isMissingStatusColumnError,
  isRecordableActivityDate,
  publishingActivityErrorStatus,
  upsertPublishingActivity,
} from '@/lib/queries/stream-publishing-activity';
import { buildContentCoverage, buildWeekPlan, type ExternalActivityInput, type PlannedPinInput, type StreamInput } from '@/lib/dashboard/build-content-coverage';
import { PROJECT_TIME_ZONE, toDayKeyInTimeZone } from '@/lib/dashboard/local-date';
import { coverageCellProps, externalActivityTotals } from '@/components/dashboard/publishing-coverage';
import type { PublishingActivityStatus } from '@/types/content-streams';

/**
 * TASK-FIX-054 — manual external activity for a past day, today and a future
 * day, with "today" = the Europe/Madrid calendar day whatever the runtime
 * zone (run under TZ=UTC too). Offline: validation, the query functions the
 * route calls (in-memory Supabase stub), the coverage maths and cell props.
 *
 * "Now" = Friday 25 September 2026, 10:00 Madrid (08:00 UTC).
 */
const NOW = new Date('2026-09-25T08:00:00Z');
const YESTERDAY = '2026-09-24';
const TODAY = '2026-09-25';
const TOMORROW = '2026-09-26';
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STREAM_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_STREAM_ID = '44444444-4444-4444-8444-444444444444';

type Row = Record<string, unknown>;
type StubError = { code: string; message: string } | null;

/** In-memory Supabase: select/eq/gte, upsert(onConflict), delete, single()/maybeSingle() or await. */
function fakeSupabase(tables: Record<string, Row[]>, writeError: StubError = null) {
  let nextId = 1;

  class Query implements PromiseLike<{ data: Row[] | null; error: StubError }> {
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
    private run(): { data: Row[] | null; error: StubError } {
      const rows = tables[this.table];
      if (this.op === 'select') return { data: rows.filter((row) => this.matches(row)), error: null };
      if (writeError) return { data: null, error: writeError };
      if (this.op === 'delete') {
        const removed = rows.filter((row) => this.matches(row));
        tables[this.table] = rows.filter((row) => !this.matches(row));
        return { data: removed, error: null };
      }
      const existing = rows.find((r) => this.conflict.every((column) => r[column] === this.payload[column]));
      if (existing) return { data: [Object.assign(existing, this.payload)], error: null };
      const row = { id: `row-${nextId++}`, ...this.payload };
      rows.push(row);
      return { data: [row], error: null };
    }
    single() {
      const { data, error } = this.run();
      return Promise.resolve({ data: data?.[0] ?? null, error });
    }
    maybeSingle() {
      return this.single();
    }
    then<T1, T2>(
      onfulfilled?: ((value: { data: Row[] | null; error: StubError }) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
    ) {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected);
    }
  }

  return { client: { from: (table: string) => new Query(table) } as unknown as SupabaseClient, tables };
}

function setup(writeError: StubError = null) {
  return fakeSupabase(
    {
      content_streams: [
        { id: STREAM_ID, user_id: USER_A },
        { id: OTHER_STREAM_ID, user_id: USER_B },
      ],
      content_stream_publishing_activity: [],
    },
    writeError
  );
}

function save(client: SupabaseClient, body: Record<string, unknown>, now = NOW, streamId = STREAM_ID, userId = USER_A) {
  return upsertPublishingActivity(client, userId, streamId, upsertPublishingActivitySchema.parse(body), now);
}

async function errorOf(promise: Promise<unknown>): Promise<PublishingActivityError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(PublishingActivityError);
    return e as PublishingActivityError;
  }
  throw new Error('expected a PublishingActivityError');
}

const STREAM: StreamInput = {
  id: STREAM_ID,
  name: 'Cats',
  projectId: 'project-1',
  projectName: 'Home Decor Germany',
  status: 'active',
  targetPinsPerDay: 5,
  targetBufferDays: 5,
  boards: [{ id: 'board-cats', name: 'Cats board' }],
};

function activity(activityDate: string, publishedCount: number, status: PublishingActivityStatus): ExternalActivityInput {
  return { streamId: STREAM_ID, activityDate, publishedCount, note: null, source: 'external', status };
}

// ===========================================================================
test.describe('Publishing activity — create for yesterday, today, tomorrow', () => {
  test('yesterday is saved as Published externally', async () => {
    const { client, tables } = setup();
    const saved = await save(client, { activityDate: YESTERDAY, publishedCount: 4, source: 'external', status: 'published' });
    expect(saved.status).toBe('published');
    expect(tables.content_stream_publishing_activity).toHaveLength(1);
  });

  test("today is saved as Published externally — the cell that was blocked", async () => {
    const { client } = setup();
    const saved = await save(client, { activityDate: TODAY, publishedCount: 5, source: 'external', status: 'published' });
    expect(saved).toMatchObject({ activity_date: TODAY, published_count: 5, status: 'published', user_id: USER_A });
  });

  test('tomorrow is saved as Expected externally; confirming it as published is refused', async () => {
    const { client } = setup();
    const saved = await save(client, { activityDate: TOMORROW, publishedCount: 3, source: 'external', status: 'expected' });
    expect(saved.status).toBe('expected');
    // Status omitted → derived from the date.
    expect((await save(client, { activityDate: TOMORROW, publishedCount: 3 })).status).toBe('expected');
    const err = await errorOf(save(client, { activityDate: TOMORROW, publishedCount: 3, status: 'published' }));
    expect(err.code).toBe('future_date');
    expect(publishingActivityErrorStatus(err)).toBe(400);
  });
});

// ===========================================================================
test.describe('Publishing activity — Europe/Madrid calendar', () => {
  test('the project zone is Europe/Madrid and day keys follow it, not UTC', () => {
    expect(PROJECT_TIME_ZONE).toBe('Europe/Madrid');
    // 00:30 Madrid on Sep 27 is still Sep 26 in UTC.
    const afterMidnight = new Date('2026-09-26T22:30:00Z');
    expect(afterMidnight.toISOString().slice(0, 10)).toBe('2026-09-26');
    expect(toDayKeyInTimeZone(afterMidnight)).toBe('2026-09-27');
    // Winter time (UTC+1): 00:30 Madrid on Jan 1 is Dec 31 in UTC.
    expect(toDayKeyInTimeZone(new Date('2025-12-31T23:30:00Z'))).toBe('2026-01-01');
  });

  test('around midnight in Madrid: 23:59:59 → Sep 27 is future; 00:00 → Sep 27 is today', async () => {
    const before = new Date('2026-09-26T21:59:59Z'); // 23:59:59 Madrid, Sep 26
    const after = new Date('2026-09-26T22:00:00Z'); // 00:00:00 Madrid, Sep 27
    expect(isRecordableActivityDate('2026-09-27', before)).toBe(false);
    expect(isRecordableActivityDate('2026-09-27', after)).toBe(true);

    const { client } = setup();
    const err = await errorOf(save(client, { activityDate: '2026-09-27', publishedCount: 2, status: 'published' }, before));
    expect(err.code).toBe('future_date');
    const saved = await save(client, { activityDate: '2026-09-27', publishedCount: 2, status: 'published' }, after);
    expect(saved.status).toBe('published');
  });

  test("the grid's first cell is Madrid's today and is recordable as published (not disabled)", () => {
    const afterMidnight = new Date('2026-09-26T22:30:00Z');
    const [coverage] = buildContentCoverage({ streams: [STREAM], plannedPins: [], unscheduledByBoard: {}, now: afterMidnight });
    expect(coverage.days[0].date).toBe('2026-09-27');
    const todayKey = coverage.days[0].date;
    const todayCell = coverageCellProps(coverage, coverage.days[0], todayKey);
    expect(todayCell.isFuture).toBe(false);
    expect(coverageCellProps(coverage, coverage.days[1], todayKey).isFuture).toBe(true);
    // Every one of the 14 cells gets clickable props.
    expect(coverage.days.map((day) => coverageCellProps(coverage, day, todayKey).date)).toHaveLength(14);
  });

  test('the week plan uses the same Madrid today as the grid', () => {
    const afterMidnight = new Date('2026-09-26T22:30:00Z'); // Sunday Sep 27 in Madrid
    const coverage = buildContentCoverage({ streams: [STREAM], plannedPins: [], unscheduledByBoard: {}, now: afterMidnight });
    const week = buildWeekPlan({ coverage, plannedPins: [], dueTasks: [], now: afterMidnight });
    expect(week.find((day) => day.isToday)?.date).toBe('2026-09-27');
  });
});

// ===========================================================================
test.describe('Publishing activity — edit and delete on every date', () => {
  for (const [label, date, status] of [
    ['yesterday', YESTERDAY, 'published'],
    ['today', TODAY, 'published'],
    ['tomorrow', TOMORROW, 'expected'],
  ] as const) {
    test(`${label}: saving again edits the single entry, then delete removes it`, async () => {
      const { client, tables } = setup();
      await save(client, { activityDate: date, publishedCount: 2, status, note: 'first' });
      const edited = await save(client, { activityDate: date, publishedCount: 6, status, note: 'edited' });
      expect(edited).toMatchObject({ published_count: 6, note: 'edited', status });
      expect(tables.content_stream_publishing_activity).toHaveLength(1);

      await deletePublishingActivity(client, USER_A, STREAM_ID, deletePublishingActivitySchema.parse({ activityDate: date }));
      expect(tables.content_stream_publishing_activity).toHaveLength(0);
      const err = await errorOf(deletePublishingActivity(client, USER_A, STREAM_ID, { activityDate: date }));
      expect(err.code).toBe('not_found');
    });
  }

  test('an expected entry of today can be confirmed as published (edit)', async () => {
    const { client } = setup();
    await save(client, { activityDate: TODAY, publishedCount: 5, status: 'expected' });
    expect((await save(client, { activityDate: TODAY, publishedCount: 5, status: 'published' })).status).toBe('published');
  });
});

// ===========================================================================
test.describe('Publishing activity — API validation', () => {
  test('date format and calendar validity are enforced', () => {
    for (const activityDate of [TODAY, YESTERDAY, TOMORROW, '2028-02-29']) {
      expect(upsertPublishingActivitySchema.safeParse({ activityDate, publishedCount: 1 }).success).toBe(true);
    }
    for (const activityDate of ['2026-02-30', '2026-13-01', '25-09-2026', '2026-9-25', '', '2026-09-25T00:00:00Z']) {
      expect(upsertPublishingActivitySchema.safeParse({ activityDate, publishedCount: 1 }).success).toBe(false);
      expect(deletePublishingActivitySchema.safeParse({ activityDate }).success).toBe(false);
    }
    expect(upsertPublishingActivitySchema.safeParse({ activityDate: TODAY, publishedCount: -1 }).success).toBe(false);
    expect(upsertPublishingActivitySchema.safeParse({ activityDate: TODAY, publishedCount: 1.5 }).success).toBe(false);
    expect(upsertPublishingActivitySchema.safeParse({ activityDate: TODAY, publishedCount: 1, status: 'done' }).success).toBe(false);
  });

  test('ownership: another user stream is 403, an unknown stream 404 — on any date', async () => {
    const { client, tables } = setup();
    for (const date of [YESTERDAY, TODAY, TOMORROW]) {
      const forbidden = await errorOf(save(client, { activityDate: date, publishedCount: 1 }, NOW, OTHER_STREAM_ID));
      expect(publishingActivityErrorStatus(forbidden)).toBe(403);
      const missing = await errorOf(save(client, { activityDate: date, publishedCount: 1 }, NOW, '55555555-5555-4555-8555-555555555555'));
      expect(publishingActivityErrorStatus(missing)).toBe(404);
    }
    expect(tables.content_stream_publishing_activity).toHaveLength(0);
  });

  test('user_id always comes from the session, never from the body', async () => {
    const { client } = setup();
    const saved = await save(client, { activityDate: TODAY, publishedCount: 1, user_id: USER_B });
    expect(saved.user_id).toBe(USER_A);
  });

  test('missing migration 038 returns a useful 503, not a generic 500', async () => {
    for (const writeError of [
      { code: 'PGRST204', message: "Could not find the 'status' column of 'content_stream_publishing_activity' in the schema cache" },
      { code: '42703', message: 'column "status" of relation "content_stream_publishing_activity" does not exist' },
    ]) {
      expect(isMissingStatusColumnError(writeError)).toBe(true);
      const { client } = setup(writeError);
      const err = await errorOf(save(client, { activityDate: TODAY, publishedCount: 5, status: 'published' }));
      expect(err.code).toBe('schema_outdated');
      expect(err.message).toBe(SCHEMA_OUTDATED_MESSAGE);
      expect(publishingActivityErrorStatus(err)).toBe(503);
    }
    expect(isMissingStatusColumnError({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isMissingStatusColumnError(null)).toBe(false);
  });
});

// ===========================================================================
test.describe('Publishing activity — separate counters, no OmniFlow regression', () => {
  const plannedPins: PlannedPinInput[] = [TODAY, TOMORROW].flatMap((day) =>
    // 09:0x Madrid (07:0x UTC) each day: same local day in UTC and in Madrid.
    [0, 1].map((i) => ({ boardId: 'board-cats', publishDate: `${day}T07:0${i}:00Z` }))
  );

  test('Published externally and Expected externally are counted apart; OmniFlow planned counts are unchanged', () => {
    const [withActivity] = buildContentCoverage({
      streams: [STREAM],
      plannedPins,
      unscheduledByBoard: {},
      externalActivity: [activity(TODAY, 3, 'published'), activity(TOMORROW, 4, 'expected')],
      now: NOW,
    });
    const [without] = buildContentCoverage({ streams: [STREAM], plannedPins, unscheduledByBoard: {}, now: NOW });

    expect(withActivity.externalToday).toBe(3);
    expect(withActivity.expectedExternal).toBe(4);
    expect(withActivity.days[0]).toMatchObject({ date: TODAY, planned: 2, external: 3, expected: 0, externalStatus: 'published' });
    expect(withActivity.days[1]).toMatchObject({ date: TOMORROW, planned: 2, external: 0, expected: 4, externalStatus: 'expected' });
    expect(externalActivityTotals([withActivity])).toEqual({ confirmed: 3, expected: 4 });

    // OmniFlow data stays separate: identical planned counts with or without external activity.
    expect(withActivity.days.map((day) => day.planned)).toEqual(without.days.map((day) => day.planned));
    expect(without.days[0]).toMatchObject({ planned: 2, external: 0, expected: 0 });
  });

  test('a future entry is never counted as confirmed; a stale expected entry is ignored', () => {
    const [coverage] = buildContentCoverage({
      streams: [STREAM],
      plannedPins: [],
      unscheduledByBoard: {},
      externalActivity: [activity(TOMORROW, 9, 'published'), activity(YESTERDAY, 7, 'expected')],
      now: NOW,
    });
    expect(coverage.externalToday).toBe(0);
    expect(coverage.expectedExternal).toBe(0);
    expect(coverage.days.every((day) => day.external === 0)).toBe(true);
  });
});
