import type { ContentStreamStatus, PublishingActivitySource, PublishingActivityStatus } from '@/types/content-streams';
import type { TaskType } from '@/types/tasks';

/**
 * Command Center types. Every value is either read from Supabase or
 * explicitly marked untracked — no mock numbers (TASK-FIX-042).
 */

/** 'real' = read from an existing query. 'untracked' = no Supabase source exists yet; shown as "—", never a fake number. */
export type KpiSource = 'real' | 'untracked';

export interface CommandCenterKpi {
  id: string;
  label: string;
  /** null only when `source === 'untracked'`. */
  current: number | null;
  target: number | null;
  unit: 'currency' | 'count';
  source: KpiSource;
  /** Only set when the KPI itself should be clickable (e.g. Projects → /projects). */
  href?: string;
}

export interface PriorityItem {
  id: string;
  label: string;
  done: boolean;
  /** Optional link to a real project by id — never by name. Missing/null = no project. */
  projectId?: string | null;
}

/** Minimal shape needed to populate a project picker — never the full Project row. */
export interface ProjectOption {
  id: string;
  name: string;
}

export interface WeeklyProgressMetric {
  label: string;
  /** null = no Supabase source yet ("Not tracked yet"). */
  current: number | null;
  /** null = no target defined (e.g. no content stream sets one). */
  target: number | null;
  unit: 'currency' | 'count';
  /** Short note on where the number or its target comes from. */
  hint?: string;
}

export interface WeeklyProgressStats {
  articlesPublished: WeeklyProgressMetric;
  pinsCreated: WeeklyProgressMetric;
  productsLaunched: WeeklyProgressMetric;
  revenue: WeeklyProgressMetric;
}

// ---------------------------------------------------------------------------
// Content stream coverage (Phase 2d) — computed from real pins.publish_date.
// ---------------------------------------------------------------------------

export type StreamHealth = 'on-track' | 'needs-content' | 'create-now' | 'warming' | 'paused' | 'planned' | 'needs-setup';

export interface StreamBoardRef {
  id: string;
  name: string;
}

export interface CoverageDay {
  /** Local YYYY-MM-DD. */
  date: string;
  /** Pins planned in OmniFlow (pins.publish_date) — never includes external activity. */
  planned: number;
  /**
   * Pins the user confirmed as published manually / with another tool
   * (content_stream_publishing_activity, status `published`). Only counted
   * for today, so this is 0 after today.
   */
  external: number;
  /**
   * Pins the user expects another tool to publish that day (status
   * `expected`, migration 038). Forecast only — never counted as published.
   */
  expected: number;
  /** Status of the day's manual entry; null when there is none. */
  externalStatus: PublishingActivityStatus | null;
  /** Note saved with the external activity, if any. */
  externalNote: string | null;
  /** How the external count was reported; null when there is none. */
  externalSource: PublishingActivitySource | null;
  /** planned + external + expected — what the level below is measured on. */
  effective: number;
  /** full = meets target pins/day, partial = some but below target, empty = nothing. Measured on `effective`. */
  level: 'full' | 'partial' | 'empty';
  /** Inside the stream's target buffer window (today … today + buffer − 1). */
  inBuffer: boolean;
}

export interface ContentStreamCoverage {
  streamId: string;
  streamName: string;
  projectId: string;
  projectName: string;
  streamStatus: Exclude<ContentStreamStatus, 'archived'>;
  boards: StreamBoardRef[];
  targetPinsPerDay: number | null;
  targetBufferDays: number | null;
  /** target_pins_per_day × target_buffer_days, null when targets are not set. */
  requiredBuffer: number | null;
  /** Pins on the stream's boards with publish_date on or after today (local). */
  plannedPins: number;
  /** max(0, requiredBuffer − plannedPins), null when targets are not set. */
  missingPins: number | null;
  /** Local day key of the latest planned pin, or null. */
  lastPlannedDate: string | null;
  /** Last day of the unbroken run of days (from today) that each have ≥ 1 planned pin. */
  coveredThrough: string | null;
  daysCovered: number;
  /** Pins recorded as published outside OmniFlow today (manual / external), never part of plannedPins. */
  externalToday: number;
  /** Pins expected from another tool today or later (not confirmed), never part of plannedPins or externalToday. */
  expectedExternal: number;
  /** Pins on the stream's boards that have no publish_date yet. */
  unscheduledPins: number;
  /** A board of this stream is also linked to another non-archived stream (§11 §8) — coverage is ambiguous. */
  sharedBoard: boolean;
  health: StreamHealth;
  /** Day-by-day grid for the coverage horizon. */
  days: CoverageDay[];
}

// ---------------------------------------------------------------------------
// Recommended next actions (read-only suggestions — never auto-pinned).
// ---------------------------------------------------------------------------

export type RecommendationKind = 'create-pins' | 'schedule-pins' | 'review-stream' | 'review-buffer' | 'sunday-review';
export type RecommendationUrgency = 'high' | 'medium' | 'low';

export interface Recommendation {
  id: string;
  kind: RecommendationKind;
  actionLabel: string;
  href: string;
  reason: string;
  urgency: RecommendationUrgency;
  quantity: number | null;
  projectId: string | null;
  projectName: string | null;
  streamId: string | null;
  streamName: string | null;
  boardId: string | null;
  boardName: string | null;
  daysCovered: number | null;
  /** tasks.type used when the user turns this into a priority. */
  taskType: TaskType;
  /** Pre-filled, editable priority title. */
  taskTitle: string;
}

// ---------------------------------------------------------------------------
// Sunday analytics review routine.
// ---------------------------------------------------------------------------

export type SundayReviewState = 'due-sunday' | 'due-soon' | 'overdue' | 'completed';

export interface SundayReviewStatus {
  state: SundayReviewState;
  /** The Sunday (local YYYY-MM-DD) this status refers to. */
  occurrenceDate: string;
  /** Calendar days from today to `occurrenceDate` (negative when overdue). */
  daysUntil: number;
  /** tasks.id of the routine, null until the user starts it the first time. */
  routineId: string | null;
}

// ---------------------------------------------------------------------------
// This week (Mon → Sun).
// ---------------------------------------------------------------------------

export interface WeekDayPlan {
  date: string;
  isToday: boolean;
  isPast: boolean;
  isSunday: boolean;
  /** Pins with publish_date on this day, any board. */
  plannedPins: number;
  /** Gap to the active streams' daily targets that existing unscheduled pins can fill. */
  pinsToSchedule: number;
  /** Remaining gap once unscheduled pins are used — new pins to create. */
  pinsToCreate: number;
  /** Open tasks whose due_date is this day. */
  reviewTasks: string[];
}
