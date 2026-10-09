/**
 * How the Publish control reads `POST /api/wordpress/[id]/publish`
 * (TASK-FIX-058). Never throws: a non-JSON body (e.g. a platform 504 page)
 * or a network error is mapped to an outcome, so the button is always
 * released and the user is never told "failed" when WordPress may have
 * saved the post.
 */

export const PUBLISH_UNCERTAIN_MESSAGE = 'Publication status is uncertain. Check WordPress before retrying.';
export const PUBLISH_IN_PROGRESS_MESSAGE =
  'Another publish of this article is already in progress. Wait for it to finish, then refresh the page.';
export const PUBLISH_FAILED_MESSAGE = 'Failed to publish to WordPress';

export interface PublishSuccessData {
  internalLinks?: { insertedCount?: number };
  warnings?: string[];
}

export type PublishOutcome =
  | { kind: 'success'; data: PublishSuccessData }
  | { kind: 'failed'; message: string }
  | { kind: 'uncertain'; message: string }
  | { kind: 'busy'; message: string };

interface PublishResponseBody {
  data?: PublishSuccessData | null;
  error?: { message?: string; code?: string } | null;
}

function parseBody(text: string): PublishResponseBody | null {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === 'object' ? (value as PublishResponseBody) : null;
  } catch {
    return null;
  }
}

// Gateway / timeout statuses: the server may have reached WordPress.
function isAmbiguousStatus(status: number): boolean {
  return status === 408 || status >= 500;
}

export async function readPublishResponse(res: Response): Promise<PublishOutcome> {
  let text = '';
  try {
    text = await res.text();
  } catch {
    return { kind: 'uncertain', message: PUBLISH_UNCERTAIN_MESSAGE };
  }
  const body = parseBody(text);

  if (res.status === 409 || body?.error?.code === 'publish_in_progress') {
    return { kind: 'busy', message: PUBLISH_IN_PROGRESS_MESSAGE };
  }
  if (body?.error?.code === 'publish_uncertain') {
    return { kind: 'uncertain', message: PUBLISH_UNCERTAIN_MESSAGE };
  }
  if (!body) {
    // No JSON (platform timeout page, proxy error): outcome unknown on 5xx.
    return isAmbiguousStatus(res.status)
      ? { kind: 'uncertain', message: PUBLISH_UNCERTAIN_MESSAGE }
      : { kind: 'failed', message: PUBLISH_FAILED_MESSAGE };
  }
  if (!res.ok || body.error) {
    return { kind: 'failed', message: body.error?.message || PUBLISH_FAILED_MESSAGE };
  }
  return { kind: 'success', data: body.data ?? {} };
}

export type PublishedMode = 'draft' | 'now' | 'schedule';

const DONE_LABEL: Record<PublishedMode, string> = {
  draft: 'Saved as draft on WordPress',
  now: 'Published to WordPress',
  schedule: 'Scheduled on WordPress',
};
const DONE_SHORT: Record<PublishedMode, string> = {
  draft: 'Saved as draft',
  now: 'Published',
  schedule: 'Scheduled',
};

// One-warning headlines for the time-budget cases (TASK-FIX-059), matched on
// the warning's opening words (the server constants in publish-post.ts /
// publish-media.ts).
const SINGLE_WARNING_HEADLINES: [prefix: string, clause: string][] = [
  ['Featured image could not be uploaded', 'the featured image could not be uploaded'],
  ['Internal links were skipped because the time limit was reached', 'internal links were skipped because the time limit was reached'],
  ['Rank Math metadata was skipped because the time limit was reached', 'Rank Math metadata was skipped because the time limit was reached'],
  ['Some tags were skipped because the time limit was reached', 'some tags were skipped because the time limit was reached'],
];

/**
 * The success toast: plain success, or success with warnings — the post was
 * sent either way (warnings never mean a failure). `details` = the warnings
 * to list after the headline (none when the headline already says it all).
 */
export function describePublishSuccess(
  mode: PublishedMode,
  warnings: string[] = []
): { headline: string; details: string[] } {
  if (warnings.length === 0) return { headline: DONE_LABEL[mode], details: [] };
  if (warnings.length === 1) {
    const known = SINGLE_WARNING_HEADLINES.find(([prefix]) => warnings[0].startsWith(prefix));
    if (known) return { headline: `${DONE_SHORT[mode]}, but ${known[1]}.`, details: [] };
  }
  return {
    headline: `${DONE_LABEL[mode]} with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.`,
    details: warnings,
  };
}

/** The request + its reading. A network error after sending is an unknown outcome, not a failure. */
export async function requestPublish(
  fetchImpl: typeof fetch,
  url: string,
  payload: unknown
): Promise<PublishOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return { kind: 'uncertain', message: PUBLISH_UNCERTAIN_MESSAGE };
  }
  return readPublishResponse(res);
}
