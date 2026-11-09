import type { ApiError } from '@/types/api';
import type { Pin } from '@/types/database';
import type { PinRegenerationMode } from '@/lib/validations/pinterest';
import { readPinVisualFormat } from '@/lib/social/pin-display';

/**
 * Browser side of Pin regeneration (TASK-076 / TASK-082 / TASK-099). Every Pin
 * goes through POST /api/pinterest/pins/[id]/regenerate-text (auth, ownership,
 * shared rate limit, trial cap) with its mode:
 * - "text-and-image-prompt": one text AI call — title, description, keywords
 *   and a new image prompt; no image call, the image is kept.
 * - "complete": the same text call, then one image call per Pin.
 * Links, UTM, boards, sections, dates and status never change.
 */

export type { PinRegenerationMode };

/** Paid images "Regenerate complete Pins" makes for this Pin — the same count as the server's. */
export function completeRegenerationImageCallsOf(pin: Pick<Pin, 'image_analysis'>): number {
  return readPinVisualFormat(pin.image_analysis).imageCalls ?? 1;
}

/**
 * The Pins the complete mode can regenerate (at most one image call each) and
 * the ones it excludes (Step-by-step: one image per panel), plus the exact
 * number of paid images.
 */
export function planCompleteRegeneration<T extends Pick<Pin, 'id' | 'image_analysis'>>(
  pins: T[]
): { eligible: T[]; excluded: T[]; paidImages: number } {
  const eligible = pins.filter((pin) => completeRegenerationImageCallsOf(pin) <= 1);
  const excluded = pins.filter((pin) => completeRegenerationImageCallsOf(pin) > 1);
  const paidImages = eligible.reduce((total, pin) => total + completeRegenerationImageCallsOf(pin), 0);
  return { eligible, excluded, paidImages };
}

export type PinTextRegenerationResult =
  | { ok: true; pin: Pin }
  | { ok: false; status: number; error: ApiError };

const FAILED: ApiError = {
  message: 'Regeneration failed. The Pin was not modified.',
  code: 'request_failed',
  retryable: true,
};

export async function requestPinTextRegeneration(
  pinId: string,
  fetchImpl: typeof fetch = fetch,
  mode: PinRegenerationMode = 'text-and-image-prompt'
): Promise<PinTextRegenerationResult> {
  try {
    const res = await fetchImpl(`/api/pinterest/pins/${pinId}/regenerate-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
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
