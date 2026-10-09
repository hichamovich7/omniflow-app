import { PUBLISH_MAX_DURATION_SECONDS } from '@/lib/wordpress/publish-lock';
import { WORDPRESS_TIMEOUTS_MS, type TimeoutLimiter } from '@/lib/wordpress/rest-client';

/**
 * Global time budget of one WordPress publish (TASK-FIX-059).
 *
 * The route has `maxDuration` seconds before the platform kills it. Working
 * back from that limit:
 *
 *   end            = start + maxDuration − safety margin
 *   finishDeadline = end − finalize reserve     (save id, release lock, JSON)
 *   postDeadline   = finishDeadline − reconcile reserve
 *                    (one lookup after a lost post answer)
 *   prepareDeadline= postDeadline − post write  (the post always gets its slot)
 *
 * Optional preparation (media, tags, internal links) must end by
 * `prepareDeadline`; the post write by `postDeadline`; everything after the
 * post (reconciliation, FAQ re-send, Rank Math) by `finishDeadline`. No
 * optional call can eat the post's slot. With maxDuration 60 s:
 * prepare ≤ 25 s, post ≤ 45 s, finish ≤ 51 s, response by ~55 s.
 */

export const PUBLISH_SAFETY_MARGIN_MS = 5_000;
export const PUBLISH_FINALIZE_RESERVE_MS = 4_000;
export const PUBLISH_RECONCILE_RESERVE_MS = 6_000;
/** A call with less time than this is not started. */
export const PUBLISH_MIN_CALL_MS = 2_000;
/** A WordPress write with less time than this is not sent — a 2 s write would only end "uncertain". */
export const PUBLISH_MIN_WRITE_MS = 5_000;

export interface PublishBudgetOptions {
  startedAt?: number;
  maxDurationMs?: number;
  safetyMarginMs?: number;
  finalizeReserveMs?: number;
  reconcileReserveMs?: number;
  postWriteMs?: number;
  minCallMs?: number;
  minWriteMs?: number;
  now?: () => number;
}

export interface PublishBudget {
  prepareDeadline: number;
  postDeadline: number;
  finishDeadline: number;
  minCallMs: number;
  minWriteMs: number;
  now(): number;
  /** Milliseconds left until `until` (negative once passed). */
  remaining(until: number): number;
  /** Timeout limiter for calls that must end by `until`; 0 = not enough time (less than `minMs`). */
  limiter(until: number, minMs?: number): TimeoutLimiter;
}

export function createPublishBudget(options: PublishBudgetOptions = {}): PublishBudget {
  const now = options.now ?? Date.now;
  const startedAt = options.startedAt ?? now();
  const maxDurationMs = options.maxDurationMs ?? PUBLISH_MAX_DURATION_SECONDS * 1000;
  const end = startedAt + maxDurationMs - (options.safetyMarginMs ?? PUBLISH_SAFETY_MARGIN_MS);
  const finishDeadline = end - (options.finalizeReserveMs ?? PUBLISH_FINALIZE_RESERVE_MS);
  const postDeadline = finishDeadline - (options.reconcileReserveMs ?? PUBLISH_RECONCILE_RESERVE_MS);
  const prepareDeadline = postDeadline - (options.postWriteMs ?? WORDPRESS_TIMEOUTS_MS.postWrite);
  const minCallMs = options.minCallMs ?? PUBLISH_MIN_CALL_MS;
  const minWriteMs = options.minWriteMs ?? PUBLISH_MIN_WRITE_MS;

  return {
    prepareDeadline,
    postDeadline,
    finishDeadline,
    minCallMs,
    minWriteMs,
    now,
    remaining: (until) => until - now(),
    limiter: (until, minMs = minCallMs) => (capMs) => {
      const left = until - now();
      return left < minMs ? 0 : Math.min(capMs, left);
    },
  };
}

export type DeadlineResult<T> = { timedOut: false; value: T } | { timedOut: true };

/**
 * Waits for `promise` until `until` at most. The promise is not cancelled —
 * only used for calls that never throw and are safe to let finish (read-only
 * fetches, idempotent meta writes).
 */
export async function withDeadline<T>(
  promise: Promise<T>,
  until: number,
  now: () => number = Date.now
): Promise<DeadlineResult<T>> {
  const left = until - now();
  if (left <= 0) {
    promise.catch(() => {});
    return { timedOut: true };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<DeadlineResult<T>>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), left);
  });
  try {
    return await Promise.race([promise.then((value) => ({ timedOut: false as const, value })), expired]);
  } finally {
    clearTimeout(timer);
    promise.catch(() => {});
  }
}

/**
 * Runs `worker` over `items` with at most `limit` in flight, in item order.
 * Never rejects: each item's outcome is settled, results keep item order.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, lane));
  return results;
}
