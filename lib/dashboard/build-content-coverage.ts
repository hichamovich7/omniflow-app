import type { ContentStreamStatus } from '@/types/content-streams';
import type { ContentStreamCoverage, CoverageDay, StreamBoardRef, StreamHealth, WeekDayPlan } from '@/types/dashboard';
import { addDaysToKey, addLocalDays, daysBetweenKeys, startOfLocalWeek, toLocalDayKey } from '@/lib/dashboard/local-date';

/**
 * Planned coverage per content stream (Command Center Phase 2d,
 * docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md §1.3). Pure — no Supabase call,
 * `now` injected — so every rule below is unit-tested offline.
 *
 * Vocabulary (never mixed up):
 * - created   = a `pins` row exists (pins.created_at).
 * - planned   = pins.publish_date is set and falls today or later (local day).
 * - past date = pins.publish_date is set and already passed. OmniFlow never
 *               talks to the Pinterest API, so this is *not* confirmation that
 *               the pin was published (§1.3).
 */

export const COVERAGE_HORIZON_DAYS = 14;

export interface StreamInput {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  status: ContentStreamStatus;
  targetPinsPerDay: number | null;
  targetBufferDays: number | null;
  boards: StreamBoardRef[];
}

export interface PlannedPinInput {
  boardId: string | null;
  /** pins.publish_date (ISO timestamptz). */
  publishDate: string;
}

export interface CoverageInput {
  streams: StreamInput[];
  /** Every pin with a publish_date on or after the start of the current week. */
  plannedPins: PlannedPinInput[];
  /** board_id → count of pins with publish_date IS NULL. */
  unscheduledByBoard: Record<string, number>;
  now: Date;
}

export function computeRequiredBuffer(targetPinsPerDay: number | null, targetBufferDays: number | null): number | null {
  if (targetPinsPerDay == null || targetBufferDays == null || targetPinsPerDay <= 0) return null;
  return targetPinsPerDay * targetBufferDays;
}

/** missing_pins = max(0, required_buffer − planned_pins) — §11 §1. */
export function computeMissingPins(requiredBuffer: number | null, plannedPins: number): number | null {
  if (requiredBuffer == null) return null;
  return Math.max(0, requiredBuffer - plannedPins);
}

/** Pins per local day key. */
export function countPinsByDay(publishDates: string[]): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const iso of publishDates) {
    const key = toLocalDayKey(new Date(iso));
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  return byDay;
}

/**
 * Walks forward from today while each day has at least one planned pin.
 * Returns the last covered day and how many consecutive days that is.
 */
export function computeCoveredThrough(byDay: Map<string, number>, todayKey: string): { coveredThrough: string | null; daysCovered: number } {
  let daysCovered = 0;
  let cursor = todayKey;
  // Bounded: a stream can't be planned further out than its latest pin.
  const lastKey = [...byDay.keys()].sort().at(-1);
  if (!lastKey) return { coveredThrough: null, daysCovered: 0 };
  while (cursor <= lastKey && (byDay.get(cursor) ?? 0) > 0) {
    daysCovered += 1;
    cursor = addDaysToKey(cursor, 1);
  }
  return { coveredThrough: daysCovered > 0 ? addDaysToKey(todayKey, daysCovered - 1) : null, daysCovered };
}

export function computeStreamHealth(input: {
  status: ContentStreamStatus;
  configured: boolean;
  missingPins: number | null;
  daysCovered: number;
}): StreamHealth {
  if (input.status === 'paused') return 'paused';
  if (input.status === 'warming') return 'warming';
  if (!input.configured || input.missingPins == null) return 'needs-setup';
  if (input.missingPins === 0) return 'on-track';
  // Buffer is short: urgent only when coverage ends today (or nothing is planned today).
  return input.daysCovered <= 1 ? 'create-now' : 'needs-content';
}

export function buildContentCoverage({ streams, plannedPins, unscheduledByBoard, now }: CoverageInput): ContentStreamCoverage[] {
  const todayKey = toLocalDayKey(now);
  const liveStreams = streams.filter((stream) => stream.status !== 'archived');

  // §11 §8: a board linked to more than one non-archived stream makes its
  // coverage ambiguous — pins are never split or double-attributed.
  const boardStreamCount = new Map<string, number>();
  for (const stream of liveStreams) {
    for (const board of stream.boards) boardStreamCount.set(board.id, (boardStreamCount.get(board.id) ?? 0) + 1);
  }

  return liveStreams.map((stream) => {
    const boardIds = new Set(stream.boards.map((board) => board.id));
    const upcoming = plannedPins
      .filter((pin) => pin.boardId && boardIds.has(pin.boardId))
      .map((pin) => pin.publishDate)
      .filter((iso) => toLocalDayKey(new Date(iso)) >= todayKey);

    const byDay = countPinsByDay(upcoming);
    const { coveredThrough, daysCovered } = computeCoveredThrough(byDay, todayKey);
    const lastPlannedDate = [...byDay.keys()].sort().at(-1) ?? null;
    const requiredBuffer = computeRequiredBuffer(stream.targetPinsPerDay, stream.targetBufferDays);
    const plannedCount = upcoming.length;
    const missingPins = computeMissingPins(requiredBuffer, plannedCount);
    const configured = requiredBuffer != null && stream.boards.length > 0;
    const unscheduledPins = stream.boards.reduce((sum, board) => sum + (unscheduledByBoard[board.id] ?? 0), 0);

    const target = stream.targetPinsPerDay ?? 0;
    const bufferDays = stream.targetBufferDays ?? 0;
    const days: CoverageDay[] = Array.from({ length: COVERAGE_HORIZON_DAYS }, (_, offset) => {
      const date = addDaysToKey(todayKey, offset);
      const planned = byDay.get(date) ?? 0;
      const level: CoverageDay['level'] = planned === 0 ? 'empty' : target > 0 && planned < target ? 'partial' : 'full';
      return { date, planned, level, inBuffer: offset < bufferDays };
    });

    return {
      streamId: stream.id,
      streamName: stream.name,
      projectId: stream.projectId,
      projectName: stream.projectName,
      streamStatus: stream.status as Exclude<ContentStreamStatus, 'archived'>,
      boards: stream.boards,
      targetPinsPerDay: stream.targetPinsPerDay,
      targetBufferDays: stream.targetBufferDays,
      requiredBuffer,
      plannedPins: plannedCount,
      missingPins,
      lastPlannedDate,
      coveredThrough,
      daysCovered,
      unscheduledPins,
      sharedBoard: stream.boards.some((board) => (boardStreamCount.get(board.id) ?? 0) > 1),
      health: computeStreamHealth({ status: stream.status, configured, missingPins, daysCovered }),
      days,
    };
  });
}

export interface WeekPlanInput {
  coverage: ContentStreamCoverage[];
  plannedPins: PlannedPinInput[];
  /** Open tasks with a due_date (local YYYY-MM-DD). */
  dueTasks: { title: string; dueDate: string }[];
  now: Date;
}

/**
 * Mon → Sun of the current local week. For today and later days, each
 * active, configured, unambiguous stream's gap to its daily target is filled
 * first from that stream's unscheduled pins ("to schedule"), then counted as
 * "to create". Past days only report what was planned.
 */
export function buildWeekPlan({ coverage, plannedPins, dueTasks, now }: WeekPlanInput): WeekDayPlan[] {
  const todayKey = toLocalDayKey(now);
  const monday = startOfLocalWeek(now);
  const weekKeys = Array.from({ length: 7 }, (_, i) => toLocalDayKey(addLocalDays(monday, i)));
  const plannedByDay = countPinsByDay(plannedPins.map((pin) => pin.publishDate));

  const toSchedule = new Map<string, number>();
  const toCreate = new Map<string, number>();
  for (const stream of coverage) {
    if (stream.health === 'paused' || stream.health === 'warming' || stream.health === 'needs-setup' || stream.sharedBoard) continue;
    const target = stream.targetPinsPerDay ?? 0;
    if (target <= 0) continue;
    let pool = stream.unscheduledPins;
    for (const key of weekKeys) {
      if (key < todayKey) continue;
      const offset = daysBetweenKeys(todayKey, key);
      const planned = offset < stream.days.length ? stream.days[offset].planned : 0;
      const gap = Math.max(0, target - planned);
      const fromPool = Math.min(pool, gap);
      pool -= fromPool;
      toSchedule.set(key, (toSchedule.get(key) ?? 0) + fromPool);
      toCreate.set(key, (toCreate.get(key) ?? 0) + gap - fromPool);
    }
  }

  return weekKeys.map((key) => ({
    date: key,
    isToday: key === todayKey,
    isPast: key < todayKey,
    isSunday: key === weekKeys[6],
    plannedPins: plannedByDay.get(key) ?? 0,
    pinsToSchedule: toSchedule.get(key) ?? 0,
    pinsToCreate: toCreate.get(key) ?? 0,
    reviewTasks: dueTasks.filter((task) => task.dueDate === key).map((task) => task.title),
  }));
}
