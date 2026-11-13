import type { ScheduleStore, PublicationStore } from '@/lib/queries/social-publications';
import {
  publicationContent,
  PublishConflictError,
  runClaimedScheduledPost,
  type FacebookGraph,
  type PublishInput,
  type PublishOutcome,
} from '@/lib/social/facebook-publish';
import type { MetaApiError } from '@/lib/social/meta/errors';
import type { SocialConnection, SocialPublication } from '@/lib/social/facebook-publication';
import { scheduleInstantError } from '@/lib/social/schedule-time';

/**
 * Facebook scheduling (TASK-100) — OmniFlow's own queue, not Meta's native
 * scheduled posts (see DECISIONS.md 2026-11-13): nothing is sent to Facebook
 * before the chosen time, so a cancel or a disconnected Page can always stop
 * it, and the first comment is only added after the post really exists.
 *
 * - schedule: a `scheduled` row with the exact text / image / link of
 *   "Publish now" (same composition), the UTC instant and the chosen zone.
 * - reschedule / cancel: conditional updates while the row is still
 *   `scheduled` — once the cron claimed it, they are refused.
 * - cron: claims due rows one by one (scheduled → publishing), re-checks the
 *   Page connection, then runs the same post → comment step as "Publish now".
 */

const noError = { error_code: null, error_message: null, fbtrace_id: null };

export interface ScheduleInput {
  generation: PublishInput['generation'];
  connection: PublishInput['connection'];
  scheduledAt: Date;
  timeZone: string;
}

export async function scheduleFacebookContent(input: ScheduleInput, deps: { store: ScheduleStore; now?: () => Date }): Promise<SocialPublication> {
  const now = (deps.now ?? (() => new Date()))();
  const tooSoon = scheduleInstantError(input.scheduledAt, now);
  if (tooSoon) throw new ScheduleValidationError(tooSoon);

  const content = publicationContent(input.generation, input.connection);
  const when = { scheduled_at: input.scheduledAt.toISOString(), scheduled_timezone: input.timeZone };
  const existing = await deps.store.findForGeneration(input.generation.id, input.connection.external_account_id);

  if (!existing) {
    const { row, conflict } = await deps.store.insert({
      user_id: input.generation.user_id,
      project_id: input.generation.project_id,
      social_content_generation_id: input.generation.id,
      platform: 'facebook',
      external_account_id: input.connection.external_account_id,
      status: 'scheduled',
      external_post_id: null,
      external_post_url: null,
      published_at: null,
      external_comment_id: null,
      comment_published_at: null,
      ...noError,
      attempt_count: 0,
      comment_attempt_count: 0,
      locked_at: null,
      ...content,
      ...when,
    });
    if (!row) {
      throw new PublishConflictError(
        conflict ? 'already_scheduled' : 'post_not_retryable',
        conflict ? 'This content already has a publication on this Page. Reload the page.' : 'The schedule could not be saved. Try again.'
      );
    }
    return row;
  }

  if (existing.status === 'scheduled') {
    throw new PublishConflictError('already_scheduled', 'This post is already scheduled. Use "Reschedule" to change the time.');
  }
  if (existing.external_post_id || !(existing.status === 'cancelled' || existing.status === 'failed')) {
    throw new PublishConflictError(
      'post_not_retryable',
      existing.external_post_id ? 'This content is already published on this Page.' : 'This content cannot be scheduled while its last publication is unresolved.'
    );
  }
  // A cancelled schedule or a failure that left no post: schedule again with the current text.
  const row = await deps.store.transition(existing.id, ['cancelled', 'failed'], { ...content, ...when, status: 'scheduled', locked_at: null, ...noError });
  if (!row) throw new PublishConflictError('in_progress', 'This publication changed in the meantime. Reload the page.');
  return row;
}

export async function rescheduleFacebookPublication(
  publication: SocialPublication,
  input: { scheduledAt: Date; timeZone: string },
  deps: { store: ScheduleStore; now?: () => Date }
): Promise<SocialPublication> {
  const now = (deps.now ?? (() => new Date()))();
  if (publication.status !== 'scheduled') {
    throw new PublishConflictError('not_scheduled', 'This post is no longer scheduled: it is being published, was published or was cancelled.');
  }
  const tooSoon = scheduleInstantError(input.scheduledAt, now);
  if (tooSoon) throw new ScheduleValidationError(tooSoon);
  const row = await deps.store.transition(publication.id, ['scheduled'], {
    scheduled_at: input.scheduledAt.toISOString(),
    scheduled_timezone: input.timeZone,
  });
  if (!row) throw new PublishConflictError('not_scheduled', 'This post is no longer scheduled: it may already be publishing. Reload the page.');
  return row;
}

export async function cancelFacebookSchedule(publication: SocialPublication, deps: { store: ScheduleStore }): Promise<SocialPublication> {
  if (publication.status !== 'scheduled') {
    throw new PublishConflictError('not_scheduled', 'This post is no longer scheduled: it is being published, was published or was cancelled.');
  }
  const row = await deps.store.transition(publication.id, ['scheduled'], { status: 'cancelled', locked_at: null });
  if (!row) throw new PublishConflictError('not_scheduled', 'Too late to cancel: the post is already being published. Reload the page.');
  return row;
}

export class ScheduleValidationError extends Error {
  readonly status = 422;
  readonly code = 'invalid_schedule';
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleValidationError';
  }
}

// ---------------------------------------------------------------------------
// Cron run

export const SCHEDULE_ERROR_MESSAGES = {
  page_disconnected: 'The Facebook Page of this scheduled post is no longer connected to the project. Nothing was published. Reconnect the Page, then schedule the post again.',
  page_replaced:
    'Another Facebook Page is now connected to this project. Nothing was published: OmniFlow never sends a post to a different Page. Schedule it again for the connected Page.',
  connection_expired: 'The Facebook connection expired before the scheduled time. Nothing was published. Reconnect the Page, then schedule the post again.',
  connection_revoked: 'Access to the Facebook Page was removed before the scheduled time. Nothing was published. Reconnect the Page, then schedule the post again.',
  content_deleted: 'The saved content of this scheduled post was deleted. Nothing was published.',
  meta_not_configured: 'Facebook publishing is not configured on the server. Nothing was published. Schedule the post again once it is configured.',
} as const;

export type ScheduleErrorCode = keyof typeof SCHEDULE_ERROR_MESSAGES;

export interface DueRunDeps {
  listDue(now: Date, limit: number): Promise<SocialPublication[]>;
  /** Stores bound to the row's own user — every write filtered by id + user_id. */
  storesFor(userId: string): { publications: PublicationStore; schedules: ScheduleStore };
  /** The row's connection (by id, filtered by user_id) — null when deleted. Never selects the token. */
  loadConnection(publication: SocialPublication): Promise<SocialConnection | null>;
  loadPageToken(connection: SocialConnection): Promise<string | null>;
  graph: FacebookGraph | null;
  recordConnectionError?(connection: SocialConnection, err: MetaApiError | null): Promise<void>;
  now?: () => Date;
  limit?: number;
}

export type DueRunResult =
  | { id: string; result: 'skipped' }
  | { id: string; result: 'blocked'; code: ScheduleErrorCode }
  | { id: string; result: 'ran'; status: SocialPublication['status'] }
  | { id: string; result: 'error' };

/** Why a claimed scheduled row must not be sent, or null when its Page is still the one chosen. */
export function scheduledConnectionProblem(publication: SocialPublication, connection: SocialConnection | null): ScheduleErrorCode | null {
  if (!publication.social_content_generation_id) return 'content_deleted';
  if (!connection) return 'page_disconnected';
  if (connection.user_id !== publication.user_id || connection.project_id !== publication.project_id || connection.platform !== 'facebook') {
    return 'page_disconnected';
  }
  if (connection.external_account_id !== publication.external_account_id) return 'page_replaced';
  if (connection.status === 'expired') return 'connection_expired';
  if (connection.status === 'revoked') return 'connection_revoked';
  return null;
}

async function runOne(row: SocialPublication, deps: DueRunDeps, now: Date): Promise<DueRunResult> {
  const { publications, schedules } = deps.storesFor(row.user_id);
  // The only path from "scheduled" to Facebook: a conditional claim. A
  // cancelled, rescheduled or already-claimed row returns null here.
  const claimed = await schedules.claimScheduled(row.id, now, { attempt_count: row.attempt_count + 1 });
  if (!claimed) return { id: row.id, result: 'skipped' };

  const block = async (code: ScheduleErrorCode): Promise<DueRunResult> => {
    await publications.update(claimed.id, { status: 'failed', locked_at: null, error_code: code, error_message: SCHEDULE_ERROR_MESSAGES[code], fbtrace_id: null });
    return { id: row.id, result: 'blocked', code };
  };

  const connection = claimed.connection_id ? await deps.loadConnection(claimed) : null;
  const problem = scheduledConnectionProblem(claimed, connection);
  if (problem || !connection) return block(problem ?? 'page_disconnected');
  if (!deps.graph) return block('meta_not_configured');
  const pageToken = await deps.loadPageToken(connection);
  if (!pageToken) return block('connection_expired');

  const outcome: PublishOutcome = await runClaimedScheduledPost(claimed, pageToken, { graph: deps.graph, store: publications, now: deps.now });
  if (deps.recordConnectionError) await deps.recordConnectionError(connection, outcome.error);
  return { id: row.id, result: 'ran', status: outcome.publication.status };
}

/**
 * One cron run: the due rows (oldest first, at most `limit`), handled in
 * parallel — each row is claimed on its own, so two overlapping runs never
 * publish the same row. An unexpected error leaves the row `publishing`
 * with its lock: after the stale delay the person sees "Retry", which
 * checks the Page before any new post.
 */
export async function runDueFacebookSchedules(deps: DueRunDeps): Promise<DueRunResult[]> {
  const now = (deps.now ?? (() => new Date()))();
  const due = await deps.listDue(now, deps.limit ?? 5);
  return Promise.all(
    due.map(async (row) => {
      try {
        return await runOne(row, deps, now);
      } catch (err) {
        console.error('[facebook] scheduled publication failed:', err instanceof Error ? err.name : 'unknown error');
        return { id: row.id, result: 'error' } as const;
      }
    })
  );
}
