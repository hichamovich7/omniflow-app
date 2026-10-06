import type { SupabaseClient } from '@supabase/supabase-js';
import type { WordPressArticle } from '@/types/wordpress';

/**
 * Per-article publish lock (TASK-FIX-058, migration 042).
 *
 * Taking the lock is one conditional UPDATE — `publish_status = 'publishing'`
 * and `publish_started_at = now()` only when no other publish is active or
 * the active one is stale — so two concurrent requests can never both get
 * it (Postgres re-checks the WHERE clause on the locked row). Every
 * controlled end of the publish releases it (`publish_started_at = null`
 * with the final status). A lock older than PUBLISH_LOCK_STALE_MS belongs to
 * a request that was killed (maxDuration) and can be taken over.
 *
 * Before migration 042 the column does not exist: the lock is reported
 * `unavailable` and the publish runs without it (reconciliation still
 * prevents duplicates from lost answers).
 */

/** The publish route's maxDuration, in seconds. */
export const PUBLISH_MAX_DURATION_SECONDS = 60;
export const PUBLISH_LOCK_MARGIN_SECONDS = 30;
export const PUBLISH_LOCK_STALE_MS = (PUBLISH_MAX_DURATION_SECONDS + PUBLISH_LOCK_MARGIN_SECONDS) * 1000;

export type PublishLockResult =
  | { status: 'acquired'; startedAt: string }
  | { status: 'busy' }
  | { status: 'unavailable'; reason: 'missing_column' | 'error' };

/** Postgres "undefined column" (42703) or PostgREST's schema-cache miss (PGRST204) on publish_started_at. */
export function isMissingPublishLockColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (error.code === '42703' || error.code === 'PGRST204') && /publish_started_at/.test(error.message ?? '');
}

export async function acquirePublishLock(
  supabase: SupabaseClient,
  articleId: string,
  now: Date = new Date()
): Promise<PublishLockResult> {
  const startedAt = now.toISOString();
  const staleBefore = new Date(now.getTime() - PUBLISH_LOCK_STALE_MS).toISOString();

  const { data, error } = await supabase
    .from('wordpress_articles')
    .update({ publish_status: 'publishing', publish_started_at: startedAt })
    .eq('id', articleId)
    .or(`publish_status.neq.publishing,publish_started_at.is.null,publish_started_at.lt."${staleBefore}"`)
    .select('id');

  if (error) {
    return { status: 'unavailable', reason: isMissingPublishLockColumn(error) ? 'missing_column' : 'error' };
  }
  return (data ?? []).length > 0 ? { status: 'acquired', startedAt } : { status: 'busy' };
}

/** Columns to add to the final article update so the lock is released — none without the lock. */
export function publishLockRelease(lock: PublishLockResult): { publish_started_at?: null } {
  return lock.status === 'acquired' ? { publish_started_at: null } : {};
}

export function isPublishLockStale(startedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!startedAt) return true;
  const time = new Date(startedAt).getTime();
  return !Number.isFinite(time) || now.getTime() - time > PUBLISH_LOCK_STALE_MS;
}

/**
 * The status to show: a `publishing` row whose lock is stale (or unknown)
 * belongs to a request that died — shown as `uncertain`, never stuck on
 * "Publishing". Pass `publish_started_at` only when it was selected.
 */
export function displayedPublishStatus(
  article: Pick<WordPressArticle, 'publish_status'> & { publish_started_at?: string | null },
  now: Date = new Date()
): WordPressArticle['publish_status'] {
  if (article.publish_status !== 'publishing') return article.publish_status;
  if (article.publish_started_at === undefined) return 'publishing';
  return isPublishLockStale(article.publish_started_at, now) ? 'uncertain' : 'publishing';
}
