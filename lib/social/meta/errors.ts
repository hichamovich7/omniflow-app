/**
 * Meta Graph API errors → stable kinds and plain-language messages
 * (TASK-068). Meta's own message text is never shown nor logged — it can
 * quote request details; only the numeric code / subcode and fbtrace_id
 * (needed by Meta support) are kept.
 */

export type MetaErrorKind =
  | 'token_expired'
  | 'permission_denied'
  | 'rate_limited'
  | 'temporarily_blocked'
  | 'page_unavailable'
  | 'duplicate_post'
  | 'invalid_link'
  | 'invalid_image'
  | 'timeout'
  | 'network'
  | 'oauth_failed'
  | 'unknown';

export const META_ERROR_MESSAGES: Record<MetaErrorKind, string> = {
  token_expired: 'The Facebook connection has expired or was revoked. Reconnect the Facebook Page, then try again.',
  permission_denied:
    'Facebook refused the request: a permission is missing, or your Facebook account no longer has the right to post on this Page. Reconnect the Page and accept every requested permission.',
  rate_limited: 'Facebook is limiting requests right now. Wait a few minutes, then try again.',
  temporarily_blocked: 'Facebook has temporarily blocked posting from this Page. Wait, then try again later.',
  page_unavailable: 'The Facebook Page could not be reached: it may have been deleted, unpublished, or your access was removed.',
  duplicate_post: 'Facebook refused this post as a duplicate of a recent post on the Page. Edit the text, then try again.',
  invalid_link: 'Facebook could not read the article link. Check that the article is public, then try again.',
  invalid_image: 'Facebook could not download the article image. Check that the image is public, or remove it, then try again.',
  timeout: 'Facebook did not answer in time. The result is being checked before any new attempt, so nothing is posted twice.',
  network: 'Facebook could not be reached. The result is being checked before any new attempt, so nothing is posted twice.',
  oauth_failed: 'The Facebook connection could not be completed. Try connecting the Page again.',
  unknown: 'Facebook returned an unexpected error. Try again in a moment.',
};

const RETRYABLE: ReadonlySet<MetaErrorKind> = new Set(['rate_limited', 'temporarily_blocked', 'timeout', 'network', 'unknown']);

export class MetaApiError extends Error {
  readonly kind: MetaErrorKind;
  readonly code: number | null;
  readonly subcode: number | null;
  readonly fbtraceId: string | null;
  readonly httpStatus: number | null;
  /**
   * True when the request may have succeeded on Meta's side (timeout or
   * network failure after sending a write): never retried blindly.
   */
  readonly ambiguous: boolean;

  constructor(
    kind: MetaErrorKind,
    details: { code?: number | null; subcode?: number | null; fbtraceId?: string | null; httpStatus?: number | null; ambiguous?: boolean } = {}
  ) {
    super(META_ERROR_MESSAGES[kind]);
    this.name = 'MetaApiError';
    this.kind = kind;
    this.code = details.code ?? null;
    this.subcode = details.subcode ?? null;
    this.fbtraceId = details.fbtraceId ?? null;
    this.httpStatus = details.httpStatus ?? null;
    this.ambiguous = details.ambiguous ?? false;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.kind);
  }

  /** "190/463" — what is stored as error_code and logged. Never the message. */
  get codeLabel(): string {
    if (this.code === null) return this.kind;
    return this.subcode ? `${this.code}/${this.subcode}` : String(this.code);
  }
}

const TOKEN_SUBCODES = new Set([458, 459, 460, 463, 464, 467]);

/** Classifies a Graph API error by its numeric code / subcode. */
export function classifyMetaError(code: number | null, subcode: number | null, httpStatus: number | null): MetaErrorKind {
  if (code === 190 || code === 102 || (subcode !== null && TOKEN_SUBCODES.has(subcode))) return 'token_expired';
  if (code === 506) return 'duplicate_post';
  if (code === 1609005) return 'invalid_link';
  if (code === 324) return 'invalid_image';
  if (code === 368) return 'temporarily_blocked';
  if (code === 4 || code === 17 || code === 32 || code === 341 || code === 613 || code === 80001) return 'rate_limited';
  if (code === 803 || (code === 100 && subcode === 33)) return 'page_unavailable';
  if (code === 10 || code === 1705 || (code !== null && code >= 200 && code <= 299)) return 'permission_denied';
  if (code === 1 || code === 2) return 'unknown';
  if (httpStatus === 401) return 'token_expired';
  if (httpStatus === 403) return 'permission_denied';
  if (httpStatus === 404) return 'page_unavailable';
  if (httpStatus === 429) return 'rate_limited';
  return 'unknown';
}

/** Builds the error from a Graph API JSON error body (`{ error: { code, error_subcode, fbtrace_id } }`). */
export function metaErrorFromBody(httpStatus: number, body: unknown): MetaApiError {
  const error =
    body && typeof body === 'object' && 'error' in body && (body as { error: unknown }).error && typeof (body as { error: unknown }).error === 'object'
      ? ((body as { error: Record<string, unknown> }).error)
      : {};
  const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const code = num(error.code);
  const subcode = num(error.error_subcode);
  const fbtraceId = typeof error.fbtrace_id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(error.fbtrace_id) ? error.fbtrace_id : null;
  return new MetaApiError(classifyMetaError(code, subcode, httpStatus), { code, subcode, fbtraceId, httpStatus });
}

/** One log line with codes only — never a token, a message from Meta or the content. */
export function logMetaError(step: string, err: MetaApiError): void {
  console.error(
    `[facebook] ${step} failed: kind=${err.kind} code=${err.codeLabel}${err.fbtraceId ? ` fbtrace_id=${err.fbtraceId}` : ''}${err.ambiguous ? ' ambiguous' : ''}`
  );
}
