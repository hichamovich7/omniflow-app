import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  contentStreamStatusSchema,
  createContentStreamSchema,
  updateContentStreamSchema,
  upsertPublishingActivitySchema,
} from '@/lib/validations/content-streams';
import { createContentStream, updateContentStream } from '@/lib/queries/content-streams';
import {
  PUBLISHING_ACTIVITY_CONFLICT_TARGET,
  PublishingActivityError,
  isRecordableActivityDate,
  publishingActivityErrorStatus,
  upsertPublishingActivity,
} from '@/lib/queries/stream-publishing-activity';
import {
  buildContentCoverage,
  buildWeekPlan,
  computeExternalBufferCredit,
  type ExternalActivityInput,
  type PlannedPinInput,
  type StreamInput,
} from '@/lib/dashboard/build-content-coverage';
import { buildRecommendations, buildStreamRecommendations, pickFocusRecommendation } from '@/lib/dashboard/build-recommendations';
import { buildWeeklyProgress, countActiveProjects } from '@/lib/dashboard/build-command-center';
import { buildSundayReviewStatus } from '@/lib/dashboard/build-sunday-review';
import { coverageDayDescription, externalActivityLabel, formatActivityDate, markTargetMetCount } from '@/lib/dashboard/publishing-activity';
import { addLocalDays, toLocalDayKey } from '@/lib/dashboard/local-date';
import { getStatusPresentation } from '@/lib/utils/status';
import { STREAM_HEALTH_PRESENTATION } from '@/components/dashboard/stream-health-badge';
import { STATUS_OPTIONS } from '@/components/projects/content-stream-form-dialog';
import { coverageMessage, selectCoverageRows } from '@/components/dashboard/publishing-coverage';
import { splitPlannedStreams } from '@/components/dashboard/content-streams-overview';

/**
 * TASK-FIX-043 — `planned` content stream status + manual / external
 * publishing activity in "Publishing coverage". Offline: pure logic, the Zod
 * layer the routes parse with, the query functions the routes call (against
 * a tiny in-memory Supabase stub), and static checks of migrations 035/036
 * (live RLS enforcement needs a real Postgres).
 *
 * "Today" = Friday 25 September 2026, 10:00 local.
 */
const NOW = new Date(2026, 8, 25, 10, 0);
const TODAY = toLocalDayKey(NOW);
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const STREAM_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_STREAM_ID = '44444444-4444-4444-8444-444444444444';

// ---------------------------------------------------------------------------
// Minimal in-memory Supabase stub: from().select().eq().single()/maybeSingle(),
// insert / update / upsert(onConflict). Enough for the query functions above.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

function fakeSupabase(tables: Record<string, Row[]>) {
  const upserts: { table: string; onConflict?: string }[] = [];
  let nextId = 1;

  class Query {
    private filters: [string, unknown][] = [];
    private op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
    private payload: Row = {};
    private conflict: string[] = [];
    constructor(private table: string) {
      tables[table] ??= [];
    }
    select() {
      return this;
    }
    eq(column: string, value: unknown) {
      this.filters.push([column, value]);
      return this;
    }
    insert(row: Row) {
      this.op = 'insert';
      this.payload = row;
      return this;
    }
    update(row: Row) {
      this.op = 'update';
      this.payload = row;
      return this;
    }
    upsert(row: Row, options?: { onConflict?: string }) {
      this.op = 'upsert';
      this.payload = row;
      this.conflict = (options?.onConflict ?? 'id').split(',');
      upserts.push({ table: this.table, onConflict: options?.onConflict });
      return this;
    }
    private matches(row: Row) {
      return this.filters.every(([column, value]) => row[column] === value);
    }
    private run(): Row | null {
      const rows = tables[this.table];
      if (this.op === 'select') return rows.find((row) => this.matches(row)) ?? null;
      if (this.op === 'insert') {
        const row = { id: `row-${nextId++}`, ...this.payload };
        rows.push(row);
        return row;
      }
      if (this.op === 'update') {
        const row = rows.find((r) => this.matches(r)) ?? null;
        if (row) Object.assign(row, this.payload);
        return row;
      }
      const existing = rows.find((r) => this.conflict.every((column) => r[column] === this.payload[column]));
      if (existing) return Object.assign(existing, this.payload);
      const row = { id: `row-${nextId++}`, ...this.payload };
      rows.push(row);
      return row;
    }
    single() {
      return Promise.resolve({ data: this.run(), error: null });
    }
    maybeSingle() {
      return this.single();
    }
  }

  return { client: { from: (table: string) => new Query(table) } as unknown as SupabaseClient, tables, upserts };
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

function external(streamId: string, activityDate: string, publishedCount: number, note: string | null = null): ExternalActivityInput {
  return { streamId, activityDate, publishedCount, note, source: 'external' };
}

const noReview = buildSundayReviewStatus({ now: NOW, routine: null, occurrences: [] });

// ===========================================================================
// 1. Planned status
// ===========================================================================
test.describe('Planned status — validation, create and update', () => {
  test('the five statuses are accepted; existing ones are all kept', () => {
    for (const status of ['active', 'planned', 'warming', 'paused', 'archived']) {
      expect(contentStreamStatusSchema.safeParse(status).success).toBe(true);
    }
    expect(STATUS_OPTIONS).toEqual(['active', 'planned', 'warming', 'paused', 'archived']);
  });

  test('creates a stream with the Planned status', async () => {
    const parsed = createContentStreamSchema.parse({ projectId: PROJECT_ID, name: 'Crochet Cat', status: 'planned' });
    const { client, tables } = fakeSupabase({ projects: [{ id: PROJECT_ID, user_id: USER_A }], content_streams: [] });
    const created = await createContentStream(client, USER_A, parsed);
    expect(created.status).toBe('planned');
    expect(tables.content_streams).toHaveLength(1);
  });

  for (const next of ['warming', 'active'] as const) {
    test(`updates Planned → ${next}`, async () => {
      const patch = updateContentStreamSchema.parse({ status: next });
      const { client, tables } = fakeSupabase({
        content_streams: [{ id: STREAM_ID, project_id: PROJECT_ID, user_id: USER_A, status: 'planned' }],
      });
      const updated = await updateContentStream(client, USER_A, STREAM_ID, patch);
      expect(updated.status).toBe(next);
      expect(tables.content_streams[0].status).toBe(next);
    });
  }

  test('migration 036 widens the CHECK without removing a status, and 030 is untouched', () => {
    const sql036 = readFileSync(path.join('supabase/migrations/036_add_content_stream_planned_status.sql'), 'utf8');
    expect(sql036).toContain("CHECK (status IN ('active', 'planned', 'warming', 'paused', 'archived'))");
    const sql030 = readFileSync(path.join('supabase/migrations/030_add_content_streams.sql'), 'utf8');
    expect(sql030).toContain("CHECK (status IN ('active', 'warming', 'paused', 'archived'))");
  });
});

test.describe('Planned status — dashboard', () => {
  const planned = stream({ id: 'cat', name: 'Crochet Cat', status: 'planned' });
  const active = stream({ id: 'kitchen', name: 'Kitchen' });

  test('a Planned stream gets the Planned health, never an urgency or a focus', () => {
    const coverage = buildContentCoverage({ streams: [planned], plannedPins: [], unscheduledByBoard: {}, now: NOW });
    expect(coverage[0].health).toBe('planned');
    expect(buildStreamRecommendations(coverage[0])).toEqual([]);
    const recommendations = buildRecommendations(coverage, noReview);
    expect(recommendations.filter((r) => r.streamId === 'cat')).toEqual([]);
    expect(pickFocusRecommendation(recommendations)).toBeNull();
    expect(coverageMessage(coverage[0])).toContain('not started');
  });

  test('an active stream short of its buffer is still recommended next to a Planned one', () => {
    const coverage = buildContentCoverage({ streams: [planned, active], plannedPins: [], unscheduledByBoard: {}, now: NOW });
    const focus = pickFocusRecommendation(buildRecommendations(coverage, noReview));
    expect(focus?.streamId).toBe('kitchen');
  });

  test('a Planned stream is not counted as an active project, nor in weekly targets', () => {
    expect(countActiveProjects([{ projectId: 'p1', status: 'planned' }])).toBe(0);
    expect(countActiveProjects([{ projectId: 'p1', status: 'planned' }, { projectId: 'p2', status: 'warming' }])).toBe(1);
    const progress = buildWeeklyProgress({
      articlesPublished: 0,
      pinsCreated: 0,
      streams: [{ status: 'planned', targetPinsPerDay: 5, targetArticlesPerWeek: 2 }],
    });
    expect(progress.pinsCreated.target).toBeNull();
    expect(progress.articlesPublished.target).toBeNull();
  });

  test('a Planned stream adds nothing to This week and gets no coverage row', () => {
    const coverage = buildContentCoverage({ streams: [planned], plannedPins: [], unscheduledByBoard: {}, now: NOW });
    const week = buildWeekPlan({ coverage, plannedPins: [], dueTasks: [], now: NOW });
    expect(week.every((day) => day.pinsToCreate === 0 && day.pinsToSchedule === 0)).toBe(true);
    expect(selectCoverageRows(coverage)).toEqual([]);
  });

  test('a Planned stream stays visible in its own Planned section', () => {
    const coverage = buildContentCoverage({ streams: [planned, active], plannedPins: [], unscheduledByBoard: {}, now: NOW });
    const { live, planned: plannedList } = splitPlannedStreams(coverage);
    expect(live.map((s) => s.streamName)).toEqual(['Kitchen']);
    expect(plannedList.map((s) => s.streamName)).toEqual(['Crochet Cat']);
  });

  test('the Planned badge is labelled "Planned" on the dashboard and on project pages', () => {
    expect(STREAM_HEALTH_PRESENTATION.planned.label).toBe('Planned');
    expect(getStatusPresentation('planned').label).toBe('Planned');
    // Existing badges are kept.
    expect(getStatusPresentation('warming').label).toBe('Warming');
    expect(STREAM_HEALTH_PRESENTATION.paused.label).toBe('Paused');
  });
});

// ===========================================================================
// 2. Manual / external publishing activity
// ===========================================================================
test.describe('Publishing activity — validation', () => {
  test('accepts a day count with a note; empty note becomes null; source defaults to manual', () => {
    expect(upsertPublishingActivitySchema.parse({ activityDate: TODAY, publishedCount: 5, note: 'Created and published with another tool' })).toEqual({
      activityDate: TODAY,
      publishedCount: 5,
      note: 'Created and published with another tool',
      source: 'manual',
    });
    expect(upsertPublishingActivitySchema.parse({ activityDate: TODAY, publishedCount: 0, note: '   ' }).note).toBeNull();
    expect(upsertPublishingActivitySchema.parse({ activityDate: TODAY, publishedCount: 1, source: 'external' }).source).toBe('external');
  });

  test('rejects negative / decimal counts, bad dates, unknown sources and long notes', () => {
    expect(upsertPublishingActivitySchema.safeParse({ activityDate: TODAY, publishedCount: -1 }).success).toBe(false);
    expect(upsertPublishingActivitySchema.safeParse({ activityDate: TODAY, publishedCount: 1.5 }).success).toBe(false);
    expect(upsertPublishingActivitySchema.safeParse({ activityDate: '2026-02-30', publishedCount: 1 }).success).toBe(false);
    expect(upsertPublishingActivitySchema.safeParse({ activityDate: '25/09/2026', publishedCount: 1 }).success).toBe(false);
    expect(upsertPublishingActivitySchema.safeParse({ activityDate: TODAY, publishedCount: 1, source: 'pinterest' }).success).toBe(false);
    expect(upsertPublishingActivitySchema.safeParse({ activityDate: TODAY, publishedCount: 1, note: 'x'.repeat(501) }).success).toBe(false);
  });
});

test.describe('Publishing activity — save, update, ownership', () => {
  function setup() {
    return fakeSupabase({
      content_streams: [
        { id: STREAM_ID, user_id: USER_A },
        { id: OTHER_STREAM_ID, user_id: USER_B },
      ],
      content_stream_publishing_activity: [],
    });
  }

  test('adds an activity for one day, with its note, owned by the session user', async () => {
    const { client, tables } = setup();
    const input = upsertPublishingActivitySchema.parse({ activityDate: TODAY, publishedCount: 5, note: 'Tailwind' });
    const saved = await upsertPublishingActivity(client, USER_A, STREAM_ID, input, NOW);
    expect(saved).toMatchObject({ user_id: USER_A, content_stream_id: STREAM_ID, activity_date: TODAY, published_count: 5, note: 'Tailwind', source: 'manual' });
    expect(tables.content_stream_publishing_activity).toHaveLength(1);
  });

  test('saving the same stream and day again updates it — never a duplicate', async () => {
    const { client, tables, upserts } = setup();
    await upsertPublishingActivity(client, USER_A, STREAM_ID, upsertPublishingActivitySchema.parse({ activityDate: TODAY, publishedCount: 3 }), NOW);
    await upsertPublishingActivity(
      client,
      USER_A,
      STREAM_ID,
      upsertPublishingActivitySchema.parse({ activityDate: TODAY, publishedCount: 6, note: 'Fixed count' }),
      NOW
    );
    expect(tables.content_stream_publishing_activity).toHaveLength(1);
    expect(tables.content_stream_publishing_activity[0]).toMatchObject({ published_count: 6, note: 'Fixed count' });
    expect(upserts.every((call) => call.onConflict === PUBLISHING_ACTIVITY_CONFLICT_TARGET)).toBe(true);
    expect(PUBLISHING_ACTIVITY_CONFLICT_TARGET).toBe('user_id,content_stream_id,activity_date');
  });

  test("another user's stream is refused (403) and a missing one is 404 — nothing written", async () => {
    const { client, tables } = setup();
    const input = upsertPublishingActivitySchema.parse({ activityDate: TODAY, publishedCount: 2 });
    const forbidden = await upsertPublishingActivity(client, USER_A, OTHER_STREAM_ID, input, NOW).catch((e) => e);
    expect(forbidden).toBeInstanceOf(PublishingActivityError);
    expect(publishingActivityErrorStatus(forbidden)).toBe(403);
    const missing = await upsertPublishingActivity(client, USER_A, '55555555-5555-4555-8555-555555555555', input, NOW).catch((e) => e);
    expect(publishingActivityErrorStatus(missing)).toBe(404);
    expect(tables.content_stream_publishing_activity).toHaveLength(0);
  });

  test('future days are refused: they stay measured on planned Pins', async () => {
    expect(isRecordableActivityDate(TODAY, NOW)).toBe(true);
    expect(isRecordableActivityDate(toLocalDayKey(addLocalDays(NOW, -3)), NOW)).toBe(true);
    expect(isRecordableActivityDate(toLocalDayKey(addLocalDays(NOW, 1)), NOW)).toBe(false);
    const { client, tables } = setup();
    const input = upsertPublishingActivitySchema.parse({ activityDate: toLocalDayKey(addLocalDays(NOW, 1)), publishedCount: 2 });
    const err = await upsertPublishingActivity(client, USER_A, STREAM_ID, input, NOW).catch((e) => e);
    expect(err.code).toBe('future_date');
    expect(tables.content_stream_publishing_activity).toHaveLength(0);
  });

  test('the write path never touches the pins table', () => {
    const source = readFileSync(path.join('lib/queries/stream-publishing-activity.ts'), 'utf8');
    expect(source).not.toMatch(/from\(\s*'pins'\s*\)/);
    const route = readFileSync(path.join('app/api/content-streams/[id]/publishing-activity/route.ts'), 'utf8');
    expect(route).toContain('supabase.auth.getUser()');
    expect(route).toContain('upsertPublishingActivitySchema.safeParse');
  });
});

test.describe('Publishing activity — migration 035 (RLS and constraints)', () => {
  const sql = readFileSync(path.join('supabase/migrations/035_add_stream_publishing_activity.sql'), 'utf8');

  test('one row per user + stream + day, non-negative count, closed source set', () => {
    expect(sql).toContain('UNIQUE (user_id, content_stream_id, activity_date)');
    expect(sql).toContain('CHECK (published_count >= 0)');
    expect(sql).toContain("CHECK (source IN ('manual', 'external'))");
  });

  test('RLS is enabled and WITH CHECK requires the stream to belong to the caller', () => {
    expect(sql).toContain('ALTER TABLE content_stream_publishing_activity ENABLE ROW LEVEL SECURITY');
    expect(sql).toMatch(/USING \(user_id = auth\.uid\(\)\)/);
    expect(sql).toMatch(/WITH CHECK \(\s*user_id = auth\.uid\(\)\s*AND EXISTS \(\s*SELECT 1 FROM content_streams cs\s*WHERE cs\.id = content_stream_id\s*AND cs\.user_id = auth\.uid\(\)/);
  });

  test('no pinterest_accounts table and no change to pins', () => {
    expect(sql).not.toMatch(/pinterest_accounts/i);
    expect(sql).not.toMatch(/ALTER TABLE pins/i);
  });
});

test.describe('Publishing activity — coverage maths', () => {
  const cat = stream({ id: 'cat', name: 'Crochet Cat', targetPinsPerDay: 5, targetBufferDays: 3 });

  test('"Mark target met" uses target_pins_per_day', () => {
    expect(markTargetMetCount(5)).toBe(5);
    expect(markTargetMetCount(12)).toBe(12);
    expect(markTargetMetCount(null)).toBeNull();
    expect(markTargetMetCount(0)).toBeNull();
  });

  test('external activity alone can bring today to "Target met"', () => {
    const [before] = buildContentCoverage({ streams: [cat], plannedPins: [], unscheduledByBoard: {}, now: NOW });
    expect(before.days[0].level).toBe('empty');
    const [after] = buildContentCoverage({
      streams: [cat],
      plannedPins: [],
      unscheduledByBoard: {},
      externalActivity: [external('cat', TODAY, markTargetMetCount(cat.targetPinsPerDay) ?? 0, 'Created and published with another tool')],
      now: NOW,
    });
    expect(after.days[0]).toMatchObject({ planned: 0, external: 5, effective: 5, level: 'full', externalNote: 'Created and published with another tool' });
    expect(after.daysCovered).toBe(1);
    expect(after.externalToday).toBe(5);
    expect(coverageDayDescription(after.days[0], 'Sep 25', 5)).toContain('Target met');
    expect(externalActivityLabel(5)).toBe('Published externally: 5');
  });

  test('planned + external add up for today', () => {
    const [coverage] = buildContentCoverage({
      streams: [cat],
      plannedPins: pinsFor('board-cat', 0, 1, 2),
      unscheduledByBoard: {},
      externalActivity: [external('cat', TODAY, 3)],
      now: NOW,
    });
    expect(coverage.days[0]).toMatchObject({ planned: 2, external: 3, effective: 5, level: 'full' });
  });

  test('Created / Planned counters stay unchanged; external only fills today’s gap in the buffer', () => {
    const planned = pinsFor('board-cat', 1, 2, 5); // tomorrow + after: 10 planned
    const [without] = buildContentCoverage({ streams: [cat], plannedPins: planned, unscheduledByBoard: {}, now: NOW });
    const [withExternal] = buildContentCoverage({
      streams: [cat],
      plannedPins: planned,
      unscheduledByBoard: {},
      externalActivity: [external('cat', TODAY, 50)],
      now: NOW,
    });
    expect(withExternal.plannedPins).toBe(without.plannedPins);
    expect(withExternal.plannedPins).toBe(10);
    expect(withExternal.unscheduledPins).toBe(without.unscheduledPins);
    expect(without.missingPins).toBe(5);
    // 50 external Pins only cover today's 5-Pin gap, never future days.
    expect(withExternal.missingPins).toBe(0);
    expect(computeExternalBufferCredit(5, 0, 50)).toBe(5);
    expect(computeExternalBufferCredit(5, 5, 50)).toBe(0);
    expect(computeExternalBufferCredit(null, 0, 50)).toBe(0);
  });

  test('future planned Pins are computed normally; a future external entry is ignored', () => {
    const planned = pinsFor('board-cat', 1, 2, 5);
    const [coverage] = buildContentCoverage({
      streams: [cat],
      plannedPins: planned,
      unscheduledByBoard: {},
      externalActivity: [external('cat', toLocalDayKey(addLocalDays(NOW, 3)), 9)],
      now: NOW,
    });
    expect(coverage.days[1]).toMatchObject({ planned: 5, external: 0, effective: 5, level: 'full' });
    expect(coverage.days[2]).toMatchObject({ planned: 5, level: 'full' });
    expect(coverage.days[3]).toMatchObject({ planned: 0, external: 0, level: 'empty' });
    expect(coverage.externalToday).toBe(0);
  });

  test("another stream's activity never leaks into this stream", () => {
    const [coverage] = buildContentCoverage({
      streams: [cat],
      plannedPins: [],
      unscheduledByBoard: {},
      externalActivity: [external('someone-else', TODAY, 5)],
      now: NOW,
    });
    expect(coverage.days[0].external).toBe(0);
  });

  test('This week counts today’s external Pins against today’s gap only', () => {
    const coverage = buildContentCoverage({
      streams: [cat],
      plannedPins: [],
      unscheduledByBoard: {},
      externalActivity: [external('cat', TODAY, 5)],
      now: NOW,
    });
    const week = buildWeekPlan({ coverage, plannedPins: [], dueTasks: [], now: NOW });
    const today = week.find((day) => day.isToday);
    expect(today?.pinsToCreate).toBe(0);
    expect(today?.plannedPins).toBe(0); // planned stays OmniFlow-only
    const tomorrow = week.find((day) => day.date === toLocalDayKey(addLocalDays(NOW, 1)));
    expect(tomorrow?.pinsToCreate).toBe(5);
  });

  test('the modal date reads like "September 25, 2026"', () => {
    expect(formatActivityDate(TODAY)).toBe('September 25, 2026');
  });
});
