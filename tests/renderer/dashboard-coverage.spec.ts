import { expect, test } from 'playwright/test';
import {
  buildContentCoverage,
  buildWeekPlan,
  computeMissingPins,
  computeRequiredBuffer,
  type PlannedPinInput,
  type StreamInput,
} from '@/lib/dashboard/build-content-coverage';
import {
  buildRecommendations,
  buildStreamRecommendations,
  pickFocusRecommendation,
} from '@/lib/dashboard/build-recommendations';
import { buildSundayReviewStatus, SUNDAY_REVIEW_CHECKLIST } from '@/lib/dashboard/build-sunday-review';
import { addLocalDays, toLocalDayKey } from '@/lib/dashboard/local-date';
import { coverageMessage } from '@/components/dashboard/publishing-coverage';
import { streamCoverageLabel, streamTargetLabel } from '@/components/dashboard/content-streams-overview';

/**
 * Command Center planning logic (TASK-FIX-042). Offline and deterministic:
 * every date is built with the *local* Date constructor, the same way
 * lib/validations/schedule.ts writes pins.publish_date, so these pass in any
 * runtime timezone.
 *
 * "Today" = Friday 25 September 2026, 10:00 local.
 */
const NOW = new Date(2026, 8, 25, 10, 0);

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

/** `perDay` pins at 09:00 local on each of `days` consecutive days starting `startOffset` days from NOW. */
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

test.describe('Buffer maths', () => {
  test('required_buffer = target_pins_per_day × target_buffer_days', () => {
    expect(computeRequiredBuffer(5, 5)).toBe(25);
    expect(computeRequiredBuffer(3, 7)).toBe(21);
    expect(computeRequiredBuffer(null, 5)).toBeNull();
    expect(computeRequiredBuffer(5, null)).toBeNull();
    expect(computeRequiredBuffer(0, 5)).toBeNull();
  });

  test('missing_pins = max(0, required_buffer − planned_pins)', () => {
    expect(computeMissingPins(25, 5)).toBe(20);
    expect(computeMissingPins(25, 25)).toBe(0);
    expect(computeMissingPins(25, 55)).toBe(0);
    expect(computeMissingPins(null, 3)).toBeNull();
  });
});

test.describe('Coverage date', () => {
  test('a board covered until October 5 is On track, with no recommendation', () => {
    const bathroom = stream({ id: 'bath', name: 'Bathroom Ideas', boards: [{ id: 'badezimmer', name: 'Badezimmer Ideen' }] });
    // Sep 25 → Oct 5 inclusive = 11 days × 5 Pins.
    const [coverage] = buildContentCoverage({
      streams: [bathroom],
      plannedPins: pinsFor('badezimmer', 0, 11, 5),
      unscheduledByBoard: {},
      now: NOW,
    });

    expect(coverage.plannedPins).toBe(55);
    expect(coverage.requiredBuffer).toBe(25);
    expect(coverage.missingPins).toBe(0);
    expect(coverage.coveredThrough).toBe('2026-10-05');
    expect(coverage.lastPlannedDate).toBe('2026-10-05');
    expect(coverage.daysCovered).toBe(11);
    expect(coverage.health).toBe('on-track');
    expect(buildStreamRecommendations(coverage)).toEqual([]);
    expect(pickFocusRecommendation(buildRecommendations([coverage], buildSundayReviewStatus({ now: NOW, routine: null, occurrences: [] })))).toBeNull();

    expect(coverageMessage(coverage)).toBe('No urgent work for Bathroom Ideas. You are covered through October 5.');
    expect(streamCoverageLabel(coverage)).toBe('Covered until Oct 5');
    expect(streamTargetLabel(coverage)).toBe('5 Pins/day · 5-day buffer');
  });

  test('coverage stops at the first day with nothing planned', () => {
    const s = stream({ id: 'gap', name: 'Gap' });
    const [coverage] = buildContentCoverage({
      streams: [s],
      // Today + tomorrow, then a hole, then two more days.
      plannedPins: [...pinsFor('board-gap', 0, 2, 5), ...pinsFor('board-gap', 3, 2, 5)],
      unscheduledByBoard: {},
      now: NOW,
    });
    expect(coverage.coveredThrough).toBe('2026-09-26');
    expect(coverage.daysCovered).toBe(2);
    expect(coverage.lastPlannedDate).toBe('2026-09-29');
    expect(coverage.days[2]).toMatchObject({ date: '2026-09-27', planned: 0, level: 'empty', inBuffer: true });
  });

  test('nothing planned today means zero days covered', () => {
    const [coverage] = buildContentCoverage({
      streams: [stream({ id: 'late', name: 'Late' })],
      plannedPins: pinsFor('board-late', 1, 5, 5),
      unscheduledByBoard: {},
      now: NOW,
    });
    expect(coverage.coveredThrough).toBeNull();
    expect(coverage.daysCovered).toBe(0);
  });

  test('a day below the pins/day target is partial', () => {
    const [coverage] = buildContentCoverage({
      streams: [stream({ id: 'thin', name: 'Thin' })],
      plannedPins: pinsFor('board-thin', 0, 1, 2),
      unscheduledByBoard: {},
      now: NOW,
    });
    expect(coverage.days[0]).toMatchObject({ planned: 2, level: 'partial' });
  });

  test('day keys use the local calendar — a 00:30 pin stays on its own day (no UTC shift)', () => {
    const justAfterMidnight = new Date(2026, 8, 26, 0, 30);
    expect(toLocalDayKey(justAfterMidnight)).toBe('2026-09-26');
    const [coverage] = buildContentCoverage({
      streams: [stream({ id: 'tz', name: 'TZ' })],
      plannedPins: [{ boardId: 'board-tz', publishDate: justAfterMidnight.toISOString() }],
      unscheduledByBoard: {},
      now: NOW,
    });
    expect(coverage.days[1]).toMatchObject({ date: '2026-09-26', planned: 1 });
    expect(coverage.days[0].planned).toBe(0);
  });
});

test.describe('Created vs planned vs past planned date', () => {
  test('only pins dated today or later count as planned; past dates and other boards are ignored', () => {
    const [coverage] = buildContentCoverage({
      streams: [stream({ id: 'split', name: 'Split' })],
      plannedPins: [
        ...pinsFor('board-split', -3, 2, 5), // already passed — not "planned" any more
        ...pinsFor('board-split', 0, 1, 5), // today
        ...pinsFor('another-board', 0, 3, 5), // someone else's board
      ],
      unscheduledByBoard: { 'board-split': 8 }, // created, no date
      now: NOW,
    });
    expect(coverage.plannedPins).toBe(5);
    expect(coverage.unscheduledPins).toBe(8);
  });

  test("a pin earlier today still counts for today's coverage", () => {
    const [coverage] = buildContentCoverage({
      streams: [stream({ id: 'early', name: 'Early' })],
      plannedPins: [{ boardId: 'board-early', publishDate: new Date(2026, 8, 25, 7, 0).toISOString() }],
      unscheduledByBoard: {},
      now: NOW,
    });
    expect(coverage.plannedPins).toBe(1);
    expect(coverage.daysCovered).toBe(1);
  });
});

test.describe('Stream status', () => {
  test('a stream under its buffer with ≤ 1 day covered is "Create now"', () => {
    const sweater = stream({ id: 'sweater', name: 'Crochet Sweaters', boards: [{ id: 'csp', name: 'Crochet Sweater Pattern' }] });
    const [coverage] = buildContentCoverage({ streams: [sweater], plannedPins: pinsFor('csp', 0, 1, 5), unscheduledByBoard: {}, now: NOW });
    expect(coverage.missingPins).toBe(20);
    expect(coverage.daysCovered).toBe(1);
    expect(coverage.health).toBe('create-now');
  });

  test('a stream under its buffer with several days covered is "Needs content"', () => {
    const [coverage] = buildContentCoverage({
      streams: [stream({ id: 'kitchen', name: 'Kitchen' })],
      plannedPins: pinsFor('board-kitchen', 0, 3, 5),
      unscheduledByBoard: {},
      now: NOW,
    });
    expect(coverage.missingPins).toBe(10);
    expect(coverage.health).toBe('needs-content');
  });

  test('warming, paused, unconfigured and archived streams', () => {
    const coverage = buildContentCoverage({
      streams: [
        stream({ id: 'w', name: 'Warm', status: 'warming' }),
        stream({ id: 'p', name: 'Pause', status: 'paused' }),
        stream({ id: 'n', name: 'NoTargets', targetPinsPerDay: null }),
        stream({ id: 'b', name: 'NoBoard', boards: [] }),
        stream({ id: 'a', name: 'Archived', status: 'archived' }),
      ],
      plannedPins: [],
      unscheduledByBoard: {},
      now: NOW,
    });
    const byName = Object.fromEntries(coverage.map((c) => [c.streamName, c.health]));
    expect(byName).toEqual({ Warm: 'warming', Pause: 'paused', NoTargets: 'needs-setup', NoBoard: 'needs-setup' });
  });

  test('a board shared by two live streams is flagged ambiguous and never gets a Create Pins recommendation', () => {
    const coverage = buildContentCoverage({
      streams: [
        stream({ id: 's1', name: 'One', boards: [{ id: 'shared', name: 'Shared' }] }),
        stream({ id: 's2', name: 'Two', boards: [{ id: 'shared', name: 'Shared' }] }),
      ],
      plannedPins: [],
      unscheduledByBoard: {},
      now: NOW,
    });
    expect(coverage.every((c) => c.sharedBoard)).toBe(true);
    const kinds = coverage.flatMap(buildStreamRecommendations).map((r) => r.kind);
    expect(kinds).toEqual(['review-stream', 'review-stream']);
  });
});

test.describe('Recommended focus and next actions', () => {
  const noReview = buildSundayReviewStatus({ now: NOW, routine: null, occurrences: [] });

  test('recommends the stream that runs out first, with the missing quantity', () => {
    const coverage = buildContentCoverage({
      streams: [
        stream({ id: 'bath', name: 'Bathroom Ideas', boards: [{ id: 'badezimmer', name: 'Badezimmer Ideen' }] }),
        stream({ id: 'kitchen', name: 'Kitchen', boards: [{ id: 'kuche', name: 'Küchen Inspiration' }] }),
        stream({ id: 'sweater', name: 'Crochet Sweaters', projectName: 'CrochetSal', boards: [{ id: 'csp', name: 'Crochet Sweater Pattern' }] }),
      ],
      plannedPins: [...pinsFor('badezimmer', 0, 11, 5), ...pinsFor('kuche', 0, 3, 5), ...pinsFor('csp', 0, 1, 5)],
      unscheduledByBoard: {},
      now: NOW,
    });
    const recommendations = buildRecommendations(coverage, noReview);
    const focus = pickFocusRecommendation(recommendations);

    expect(focus).toMatchObject({
      kind: 'create-pins',
      streamName: 'Crochet Sweaters',
      boardName: 'Crochet Sweater Pattern',
      quantity: 20,
      daysCovered: 1,
      urgency: 'high',
      href: '/pinterest',
    });
    // Bathroom (covered until Oct 5) is not recommended at all.
    expect(recommendations.some((r) => r.streamName === 'Bathroom Ideas')).toBe(false);
    expect(recommendations.map((r) => r.streamName)).toEqual(['Crochet Sweaters', 'Kitchen']);
  });

  test('existing unscheduled Pins are scheduled before new ones are created', () => {
    const [coverage] = buildContentCoverage({
      streams: [stream({ id: 'sched', name: 'Sched' })],
      plannedPins: pinsFor('board-sched', 0, 1, 5),
      unscheduledByBoard: { 'board-sched': 12 },
      now: NOW,
    });
    const recs = buildStreamRecommendations(coverage);
    expect(recs.map((r) => [r.kind, r.quantity])).toEqual([
      ['schedule-pins', 12],
      ['create-pins', 8],
    ]);
    expect(recs[0].href).toBe('/boards/board-sched');
  });

  test('every recommendation carries project, stream, reason and an editable task title', () => {
    const [coverage] = buildContentCoverage({ streams: [stream({ id: 'r', name: 'R' })], plannedPins: [], unscheduledByBoard: {}, now: NOW });
    const [rec] = buildStreamRecommendations(coverage);
    expect(rec.projectName).toBe('Home Decor Germany');
    expect(rec.streamName).toBe('R');
    expect(rec.reason.length).toBeGreaterThan(10);
    expect(rec.taskTitle).toBe('Create 25 R Pins');
    expect(rec.taskType).toBe('content_creation');
  });

  test('unconfigured streams get a low-urgency Review stream action', () => {
    const [coverage] = buildContentCoverage({
      streams: [stream({ id: 'u', name: 'U', targetBufferDays: null })],
      plannedPins: [],
      unscheduledByBoard: {},
      now: NOW,
    });
    expect(buildStreamRecommendations(coverage)).toMatchObject([{ kind: 'review-stream', urgency: 'low', href: '/projects/project-1' }]);
  });
});

test.describe('Sunday analytics review', () => {
  const routine = { id: 'routine-1', createdAt: new Date(2026, 8, 10, 12).toISOString() };

  test('is always shown: due Sunday from Monday to Friday', () => {
    expect(buildSundayReviewStatus({ now: NOW, routine: null, occurrences: [] })).toEqual({
      state: 'due-sunday',
      occurrenceDate: '2026-09-27',
      daysUntil: 2,
      routineId: null,
    });
  });

  test('due soon on Saturday and on Sunday itself', () => {
    expect(buildSundayReviewStatus({ now: new Date(2026, 8, 26, 9), routine: null, occurrences: [] })).toMatchObject({
      state: 'due-soon',
      daysUntil: 1,
    });
    expect(buildSundayReviewStatus({ now: new Date(2026, 8, 27, 9), routine: null, occurrences: [] })).toMatchObject({
      state: 'due-soon',
      occurrenceDate: '2026-09-27',
      daysUntil: 0,
    });
  });

  test('overdue when last Sunday was not completed — and it stays until completed', () => {
    for (const now of [NOW, new Date(2026, 8, 26, 20), new Date(2026, 8, 27, 8)]) {
      const status = buildSundayReviewStatus({ now, routine, occurrences: [] });
      expect(status.state).toBe('overdue');
      expect(status.routineId).toBe('routine-1');
    }
    expect(buildSundayReviewStatus({ now: NOW, routine, occurrences: [] }).occurrenceDate).toBe('2026-09-20');
  });

  test('completing last Sunday clears the overdue state', () => {
    const status = buildSundayReviewStatus({ now: NOW, routine, occurrences: [{ occurrenceDate: '2026-09-20', status: 'completed' }] });
    expect(status.state).toBe('due-sunday');
    expect(status.occurrenceDate).toBe('2026-09-27');
  });

  test('a routine started after last Sunday is not overdue', () => {
    const fresh = { id: 'routine-2', createdAt: new Date(2026, 8, 23, 12).toISOString() };
    expect(buildSundayReviewStatus({ now: NOW, routine: fresh, occurrences: [] }).state).toBe('due-sunday');
  });

  test('completed on the day shows as completed, then rolls over to next week', () => {
    const occurrences = [{ occurrenceDate: '2026-09-27', status: 'completed' as const }];
    expect(buildSundayReviewStatus({ now: new Date(2026, 8, 27, 18), routine, occurrences: [{ occurrenceDate: '2026-09-20', status: 'completed' }, ...occurrences] }).state).toBe('completed');
    expect(buildSundayReviewStatus({ now: new Date(2026, 8, 28, 9), routine, occurrences }).state).toBe('due-sunday');
  });

  test('overdue review is the top recommendation', () => {
    const review = buildSundayReviewStatus({ now: NOW, routine, occurrences: [] });
    const [coverage] = buildContentCoverage({ streams: [stream({ id: 'x', name: 'X' })], plannedPins: [], unscheduledByBoard: {}, now: NOW });
    const [first] = buildRecommendations([coverage], review);
    expect(first).toMatchObject({ kind: 'sunday-review', urgency: 'high', actionLabel: 'Start Sunday analytics review' });
  });

  test('checklist has the six review steps', () => {
    expect(SUNDAY_REVIEW_CHECKLIST).toEqual([
      'Pinterest impressions',
      'Outbound clicks',
      'Saves',
      'Compare boards',
      'Review traffic',
      'Choose Continue / Scale / Test / Fix / Stop',
    ]);
  });
});

test.describe('This week', () => {
  test('Mon → Sun, Sunday highlighted, gaps split into to-schedule then to-create', () => {
    const coverage = buildContentCoverage({
      streams: [stream({ id: 'wk', name: 'Week' })],
      plannedPins: pinsFor('board-wk', 0, 1, 5), // today (Friday) full
      unscheduledByBoard: { 'board-wk': 7 },
      now: NOW,
    });
    const days = buildWeekPlan({
      coverage,
      plannedPins: pinsFor('board-wk', 0, 1, 5),
      dueTasks: [{ title: 'Keyword research', dueDate: '2026-09-26' }],
      now: NOW,
    });

    expect(days.map((d) => d.date)).toEqual([
      '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27',
    ]);
    expect(days[6].isSunday).toBe(true);
    expect(days[4]).toMatchObject({ isToday: true, plannedPins: 5, pinsToSchedule: 0, pinsToCreate: 0 });
    expect(days[5]).toMatchObject({ pinsToSchedule: 5, pinsToCreate: 0, reviewTasks: ['Keyword research'] });
    expect(days[6]).toMatchObject({ pinsToSchedule: 2, pinsToCreate: 3 });
    // Past days only report what was planned.
    expect(days[0]).toMatchObject({ isPast: true, pinsToSchedule: 0, pinsToCreate: 0 });
  });
});
