import type { ApiError } from '@/types/api';
import type { Pin } from '@/types/database';

/**
 * Browser side of "Regenerate text" (TASK-076 / TASK-082). Every Pin goes
 * through the existing POST /api/pinterest/pins/[id]/regenerate-text route
 * (auth, ownership, shared rate limit, trial cap, one text AI call, never the
 * image model). Only title, description and keywords can change.
 */

export type PinTextRegenerationResult =
  | { ok: true; pin: Pin }
  | { ok: false; status: number; error: ApiError };

const FAILED: ApiError = {
  message: 'Text regeneration failed. The Pin was not modified.',
  code: 'request_failed',
  retryable: true,
};

export async function requestPinTextRegeneration(
  pinId: string,
  fetchImpl: typeof fetch = fetch
): Promise<PinTextRegenerationResult> {
  try {
    const res = await fetchImpl(`/api/pinterest/pins/${pinId}/regenerate-text`, { method: 'POST' });
    const json = (await res.json().catch(() => ({}))) as { data?: Pin | null; error?: ApiError | null };
    if (!res.ok || json.error || !json.data) {
      return { ok: false, status: res.status, error: json.error ?? FAILED };
    }
    return { ok: true, pin: json.data };
  } catch {
    return { ok: false, status: 0, error: FAILED };
  }
}

/** Every later Pin would fail the same way: the batch stops, the rest is left as it is. */
const STOP_CODES = new Set(['rate_limited', 'trial_limit_reached', 'unauthorized']);

export type BulkPinTextStatus = 'succeeded' | 'failed' | 'not_processed';

export interface BulkPinTextOutcome {
  pinId: string;
  status: BulkPinTextStatus;
  error?: ApiError;
}

export interface BulkPinTextSummary {
  outcomes: BulkPinTextOutcome[];
  succeeded: string[];
  failed: string[];
  /** Not attempted: the batch stopped on a rate / trial limit or a lost session. */
  notProcessed: string[];
  stoppedBy: ApiError | null;
}

/**
 * Regenerates the text of `pinIds` one at a time — never in parallel, so the
 * shared rate limit, the trial cap and ownership are checked per Pin. A
 * success is saved by its own request; a failure leaves that Pin unchanged
 * and the batch continues.
 */
export async function runBulkPinTextRegeneration(
  pinIds: string[],
  regenerateOne: (pinId: string) => Promise<PinTextRegenerationResult>,
  onProgress?: (done: number, total: number, outcome: BulkPinTextOutcome) => void
): Promise<BulkPinTextSummary> {
  const outcomes: BulkPinTextOutcome[] = [];
  let stoppedBy: ApiError | null = null;

  for (const pinId of pinIds) {
    if (stoppedBy) {
      outcomes.push({ pinId, status: 'not_processed' });
      continue;
    }
    const result = await regenerateOne(pinId);
    const outcome: BulkPinTextOutcome = result.ok
      ? { pinId, status: 'succeeded' }
      : { pinId, status: 'failed', error: result.error };
    if (!result.ok && STOP_CODES.has(result.error.code)) stoppedBy = result.error;
    outcomes.push(outcome);
    onProgress?.(outcomes.length, pinIds.length, outcome);
  }

  const ids = (status: BulkPinTextStatus) => outcomes.filter((o) => o.status === status).map((o) => o.pinId);
  return { outcomes, succeeded: ids('succeeded'), failed: ids('failed'), notProcessed: ids('not_processed'), stoppedBy };
}
