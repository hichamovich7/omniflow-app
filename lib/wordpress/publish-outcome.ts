/**
 * How the Publish control reads `POST /api/wordpress/[id]/publish`
 * (TASK-FIX-058). Never throws: a non-JSON body (e.g. a platform 504 page)
 * or a network error is mapped to an outcome, so the button is always
 * released and the user is never told "failed" when WordPress may have
 * saved the post.
 */

export const PUBLISH_UNCERTAIN_MESSAGE =
  'Sent to WordPress, but the confirmation is uncertain. Check WordPress before retrying.';
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
