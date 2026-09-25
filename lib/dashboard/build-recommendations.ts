import type {
  ContentStreamCoverage,
  Recommendation,
  RecommendationKind,
  RecommendationUrgency,
  SundayReviewStatus,
} from '@/types/dashboard';

/**
 * Ranked "Recommended next actions" (Command Center Phase 2e, read-only
 * slice of docs/tasks/TASK-COMMAND-CENTER-PHASE-2.md §10). Pure. It only
 * *suggests*: nothing is written to `tasks` until the user clicks "Add to
 * priorities", and the resulting priority stays fully editable.
 *
 * A stream whose planned buffer already covers its target
 * (missing_pins = 0, health `on-track`) never produces a recommendation,
 * however far away its coverage end date is.
 */

const URGENCY_RANK: Record<RecommendationUrgency, number> = { high: 0, medium: 1, low: 2 };
const KIND_RANK: Record<RecommendationKind, number> = {
  'sunday-review': 0,
  'schedule-pins': 1,
  'create-pins': 2,
  'review-buffer': 3,
  'review-stream': 4,
};

function base(stream: ContentStreamCoverage) {
  const board = stream.boards[0] ?? null;
  return {
    projectId: stream.projectId,
    projectName: stream.projectName,
    streamId: stream.streamId,
    streamName: stream.streamName,
    boardId: board?.id ?? null,
    boardName: board?.name ?? null,
    daysCovered: stream.daysCovered,
  };
}

function coveredPhrase(daysCovered: number): string {
  if (daysCovered === 0) return 'Nothing is planned for today';
  return `${daysCovered} ${daysCovered === 1 ? 'day' : 'days'} covered`;
}

export function buildStreamRecommendations(stream: ContentStreamCoverage): Recommendation[] {
  const common = base(stream);

  if (stream.health === 'paused' || stream.health === 'on-track') return [];

  if (stream.sharedBoard) {
    return [
      {
        ...common,
        id: `review-stream:${stream.streamId}`,
        kind: 'review-stream',
        actionLabel: 'Review stream',
        href: `/projects/${stream.projectId}`,
        reason: 'Its board is linked to another active stream, so coverage is ambiguous. Keep one active stream per board.',
        urgency: 'low',
        quantity: null,
        taskType: 'maintenance',
        taskTitle: `Review ${stream.streamName} board link`,
      },
    ];
  }

  if (stream.health === 'needs-setup') {
    const reason =
      stream.boards.length === 0
        ? 'No Pinterest board is linked yet, so coverage cannot be measured.'
        : 'Set pins per day and buffer days to measure coverage.';
    return [
      {
        ...common,
        id: `review-stream:${stream.streamId}`,
        kind: 'review-stream',
        actionLabel: 'Review stream',
        href: `/projects/${stream.projectId}`,
        reason,
        urgency: 'low',
        quantity: null,
        taskType: 'maintenance',
        taskTitle: `Set up ${stream.streamName} targets`,
      },
    ];
  }

  const missing = stream.missingPins ?? 0;

  if (stream.health === 'warming') {
    if (missing === 0) return [];
    return [
      {
        ...common,
        id: `review-buffer:${stream.streamId}`,
        kind: 'review-buffer',
        actionLabel: 'Review buffer',
        href: `/projects/${stream.projectId}`,
        reason: `Warming stream · ${coveredPhrase(stream.daysCovered)}. ${missing} Pins short of its ${stream.targetBufferDays}-day buffer.`,
        urgency: 'low',
        quantity: missing,
        taskType: 'account_warming',
        taskTitle: `Review ${stream.streamName} buffer`,
      },
    ];
  }

  // needs-content / create-now
  const urgency: RecommendationUrgency = stream.health === 'create-now' ? 'high' : 'medium';
  const result: Recommendation[] = [];
  const toSchedule = Math.min(stream.unscheduledPins, missing);
  const toCreate = missing - toSchedule;

  if (toSchedule > 0) {
    result.push({
      ...common,
      id: `schedule-pins:${stream.streamId}`,
      kind: 'schedule-pins',
      actionLabel: 'Schedule Pins',
      href: common.boardId ? `/boards/${common.boardId}` : `/projects/${stream.projectId}`,
      reason: `${coveredPhrase(stream.daysCovered)}. ${stream.unscheduledPins} Pins on this board have no planned date yet.`,
      urgency,
      quantity: toSchedule,
      taskType: 'pinterest_publishing',
      taskTitle: `Schedule ${toSchedule} ${stream.streamName} Pins`,
    });
  }

  if (toCreate > 0) {
    result.push({
      ...common,
      id: `create-pins:${stream.streamId}`,
      kind: 'create-pins',
      actionLabel: 'Create Pins',
      href: '/pinterest',
      reason: `${coveredPhrase(stream.daysCovered)}. ${missing} Pins short of the ${stream.targetBufferDays}-day buffer (${stream.requiredBuffer} needed, ${stream.plannedPins} planned).`,
      urgency,
      quantity: toCreate,
      taskType: 'content_creation',
      taskTitle: `Create ${toCreate} ${stream.streamName} Pins`,
    });
  }

  return result;
}

export function buildSundayReviewRecommendation(review: SundayReviewStatus): Recommendation | null {
  if (review.state !== 'overdue' && review.state !== 'due-soon') return null;
  return {
    id: `sunday-review:${review.occurrenceDate}`,
    kind: 'sunday-review',
    actionLabel: 'Start Sunday analytics review',
    href: '#sunday-review',
    reason:
      review.state === 'overdue'
        ? 'Last Sunday’s analytics review is not done yet.'
        : review.daysUntil === 0
          ? 'Your weekly analytics review is due today.'
          : 'Your weekly analytics review is due tomorrow.',
    urgency: review.state === 'overdue' ? 'high' : 'medium',
    quantity: null,
    projectId: null,
    projectName: null,
    streamId: null,
    streamName: null,
    boardId: null,
    boardName: null,
    daysCovered: null,
    taskType: 'weekly_review',
    taskTitle: 'Sunday analytics review',
  };
}

export function rankRecommendations(items: Recommendation[]): Recommendation[] {
  return [...items].sort(
    (a, b) =>
      URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] ||
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      (a.daysCovered ?? Infinity) - (b.daysCovered ?? Infinity) ||
      (b.quantity ?? 0) - (a.quantity ?? 0) ||
      (a.streamName ?? '').localeCompare(b.streamName ?? '')
  );
}

export function buildRecommendations(coverage: ContentStreamCoverage[], review: SundayReviewStatus): Recommendation[] {
  const sunday = buildSundayReviewRecommendation(review);
  return rankRecommendations([...coverage.flatMap(buildStreamRecommendations), ...(sunday ? [sunday] : [])]);
}

/**
 * "Recommended focus today": the most urgent stream action (create or
 * schedule Pins). null when every stream's buffer is covered.
 */
export function pickFocusRecommendation(recommendations: Recommendation[]): Recommendation | null {
  return recommendations.find((item) => item.kind === 'create-pins' || item.kind === 'schedule-pins') ?? null;
}
