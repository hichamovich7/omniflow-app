import { facebookPostRow, type FacebookPostOptions, type FacebookPostResult, type FacebookPostSource } from '@/lib/social/facebook-post';
import { variantUsableBy, wordpressImageOf, type DraftForVariants, type FacebookImageVariant, type FacebookVisualAngle } from '@/lib/social/facebook-image-variants';
import { regenerateRequestFor, type SocialContentGeneration, type SocialContentGenerationInsert } from '@/lib/social/social-content';
import type { MediumSummaryRequest } from '@/lib/validations/medium-summary';

/**
 * "Create new post with this image" (TASK-101 extension / TASK-103). A NEW
 * Facebook draft for the same article, with its own text, CTA and first
 * comment written for the image's visual angle from the article itself
 * (re-read, not a copy of the earlier text), and the existing image reused
 * by reference — no image call, no image quota.
 *
 * - The original draft is only read — never modified, even when it is
 *   published or scheduled; its variant is never moved or deleted.
 * - Only the caller's own draft and own variant (of that draft, or the
 *   variant it was itself created with).
 * - Quota: the existing text-generation limits (1 unit per request, checked
 *   before the WordPress read and the AI call).
 * - Idempotent: a request id (generated once per confirmation in the UI) is
 *   reserved atomically (migration 052) BEFORE the quota and any AI call. Two
 *   identical requests at the same time → at most one billed text generation
 *   and one draft; the second gets `request_in_progress` (409) while the
 *   first runs, then the finished draft.
 * - A request id is billed at most once: it is released only when nothing
 *   was consumed (quota refused). Once the quota is counted the id is
 *   consumed for good — a `pending` reservation is never taken over (even
 *   when stale: `request_expired`), and a save error after a successful AI
 *   call is retried in place without any new AI call.
 * - Nothing is published or scheduled here.
 */

export type DerivedPostErrorCode =
  | 'not_found'
  | 'variant_not_found'
  | 'no_image'
  | 'source_unavailable'
  | 'request_reused'
  | 'request_in_progress'
  | 'request_expired'
  | 'quota'
  | 'migration_required'
  | 'save_failed';

const STATUS: Record<DerivedPostErrorCode, number> = {
  not_found: 404,
  variant_not_found: 404,
  no_image: 422,
  source_unavailable: 409,
  request_reused: 409,
  request_in_progress: 409,
  request_expired: 409,
  quota: 429,
  migration_required: 503,
  save_failed: 500,
};

export class DerivedPostError extends Error {
  readonly status: number;
  constructor(
    readonly code: DerivedPostErrorCode,
    message: string,
    /** For `quota`: the refused limit check, turned into the shared 429 / 403 response. */
    readonly limit?: { allowed: false; remaining: number; reason?: 'rate_limit' | 'trial_limit' }
  ) {
    super(message);
    this.name = 'DerivedPostError';
    this.status = STATUS[code];
  }
}

export type ParentDraft = DraftForVariants &
  Pick<
    SocialContentGeneration,
    | 'project_id'
    | 'source_type'
    | 'source_wordpress_generation_id'
    | 'source_wordpress_site_id'
    | 'source_wordpress_article_id'
    | 'source_pinterest_generation_id'
  >;

/** Answer of the atomic reservation of a request id (social_draft_creation_requests, migration 052). */
export type RequestReservation =
  | { status: 'reserved' }
  | { status: 'in_progress' }
  | { status: 'expired' }
  | { status: 'completed' }
  | { status: 'other_parent' }
  | { status: 'migration_required' };

/**
 * A `pending` reservation older than this is reported as expired (route
 * maxDuration 60 s + margin). It is never taken over: its quota unit and AI
 * call may already be spent, and nothing proves the first call has stopped.
 */
export const DRAFT_REQUEST_STALE_MS = 120_000;

/** In-place save attempts after a successful AI call (no new AI call). */
export const DRAFT_SAVE_ATTEMPTS = 3;

export const REQUEST_EXPIRED_MESSAGE =
  'An earlier attempt of this request did not finish. Nothing more is charged for it: reload the page (its post may appear in "Posts from this article"), or confirm again to write a new post.';

export const SAVE_FAILED_AFTER_WRITE_MESSAGE =
  'The new post was written but could not be saved. Nothing more is charged for this request; confirm again to write a new post (one new text generation).';

export const REQUEST_IN_PROGRESS_MESSAGE = 'This post is still being written. Wait a few seconds, then reload the page — it will appear in "Posts from this article".';

export interface DerivedPostDeps {
  /** The caller's draft created by this request id, if any (user filter). */
  findByRequestId(requestId: string): Promise<SocialContentGeneration | null>;
  /**
   * Reserves the request id for this parent draft, atomically (PRIMARY KEY):
   * the first caller gets `reserved`; a concurrent one `in_progress` (or
   * `expired` once stale — never taken over); only a `failed` reservation
   * (released before anything was consumed) is taken over, by one
   * conditional update.
   */
  reserveRequest(requestId: string, parentId: string, variantId: string | null): Promise<RequestReservation>;
  completeRequest(requestId: string, generationId: string): Promise<void>;
  /** Releases the id — only when nothing was consumed (quota refused). */
  failRequest(requestId: string): Promise<void>;
  /** Only the caller's own variant (user filter + RLS). */
  getVariant(id: string): Promise<FacebookImageVariant | null>;
  /** Existing hourly + trial limits for a text generation — before any read or AI call. */
  checkQuota(): Promise<{ allowed: boolean; remaining: number; reason?: 'rate_limit' | 'trial_limit' }>;
  loadSource(request: MediumSummaryRequest): Promise<FacebookPostSource>;
  /** Texts of the article's existing Facebook posts (the parent first) — to write a different one. */
  articlePostTexts(): Promise<string[]>;
  writePost(source: FacebookPostSource, options: FacebookPostOptions): Promise<FacebookPostResult>;
  insertDraft(row: SocialContentGenerationInsert): Promise<{ row: SocialContentGeneration | null; reason?: 'conflict' | 'migration_required' | 'error' }>;
}

export interface DerivedPostResult {
  draft: SocialContentGeneration;
  /** True when the same request had already created this draft (no new AI call). */
  reused: boolean;
}

export async function createFacebookPostFromImage(
  input: { parent: ParentDraft | null; userId: string; variantId: string | null; requestId: string },
  deps: DerivedPostDeps
): Promise<DerivedPostResult> {
  const { parent, userId, variantId, requestId } = input;
  if (!parent || parent.platform !== 'facebook' || parent.user_id !== userId) throw new DerivedPostError('not_found', 'Content not found');

  // A repeated request (double click, network retry) returns the first result.
  const existing = await deps.findByRequestId(requestId);
  if (existing) {
    if (existing.derived_from_generation_id !== parent.id) {
      throw new DerivedPostError('request_reused', 'This request was already used for another post. Reload the page and try again.');
    }
    return { draft: existing, reused: true };
  }

  // The image: a variant of this draft (or the one it was created with), or its WordPress image.
  let variant: FacebookImageVariant | null = null;
  let image: { url: string | null; alt: string | null };
  let angle: FacebookVisualAngle;
  if (variantId) {
    variant = await deps.getVariant(variantId);
    if (!variant || !variantUsableBy(variant, parent)) throw new DerivedPostError('variant_not_found', 'This image does not belong to this post.');
    image = { url: variant.image_url, alt: variant.image_alt };
    angle = (['hero', 'lifestyle', 'detail'] as const).find((id) => id === variant?.angle) ?? 'hero';
  } else {
    image = wordpressImageOf(parent);
    if (!image.url) throw new DerivedPostError('no_image', 'This post has no WordPress image to reuse.');
    angle = 'wordpress';
  }

  const request = regenerateRequestFor(parent);
  if (!request) throw new DerivedPostError('source_unavailable', 'The source article of this post no longer exists in OmniFlow, so no new post can be written from it.');

  // Atomic reservation BEFORE the quota and the AI call: only one caller goes on.
  const reservation = await deps.reserveRequest(requestId, parent.id, variant?.id ?? null);
  if (reservation.status === 'migration_required') {
    throw new DerivedPostError('migration_required', 'New posts from an image are not available yet (database migration 052 not applied).');
  }
  if (reservation.status === 'other_parent') {
    throw new DerivedPostError('request_reused', 'This request was already used for another post. Reload the page and try again.');
  }
  if (reservation.status === 'in_progress') throw new DerivedPostError('request_in_progress', REQUEST_IN_PROGRESS_MESSAGE);
  if (reservation.status === 'expired') throw new DerivedPostError('request_expired', REQUEST_EXPIRED_MESSAGE);
  if (reservation.status === 'completed') {
    const done = await deps.findByRequestId(requestId);
    if (done) return { draft: done, reused: true };
    throw new DerivedPostError('request_reused', 'This request already created a post that no longer exists. Reload the page and try again.');
  }

  let quota: Awaited<ReturnType<DerivedPostDeps['checkQuota']>>;
  try {
    quota = await deps.checkQuota();
  } catch (err) {
    await deps.failRequest(requestId); // nothing counted: the id may be retried
    throw err;
  }
  if (!quota.allowed) {
    await deps.failRequest(requestId); // refused, nothing counted: the id may be retried
    throw new DerivedPostError('quota', 'Generation limit reached.', { allowed: false, remaining: quota.remaining, reason: quota.reason });
  }

  // From here the request is consumed (quota unit counted, AI call next): the
  // id is never released, so the same request can never be billed twice.
  const source = await deps.loadSource(request);
  const previousPosts = await deps.articlePostTexts();
  const result = await deps.writePost(source, { visualAngle: angle, previousPosts });

  const wordpress = wordpressImageOf(parent);
  const row: SocialContentGenerationInsert = {
    ...facebookPostRow(userId, source.ref, result),
    // Same project as the original draft (never moved to another project).
    project_id: parent.project_id,
    image_url: image.url,
    image_alt: image.alt ?? result.imageAlt,
    source_image_url: wordpress.url ?? result.imageUrl,
    source_image_alt: wordpress.alt ?? result.imageAlt,
    selected_image_variant_id: variant?.id ?? null,
    origin_image_variant_id: variant?.id ?? null,
    derived_from_generation_id: parent.id,
    visual_angle: angle,
    creation_request_id: requestId,
  };

  // The text is paid for: save it, retrying in place (never a new AI call).
  let inserted: Awaited<ReturnType<DerivedPostDeps['insertDraft']>> = { row: null, reason: 'error' };
  for (let attempt = 1; attempt <= DRAFT_SAVE_ATTEMPTS; attempt += 1) {
    inserted = await deps.insertDraft(row);
    if (inserted.row) {
      await deps.completeRequest(requestId, inserted.row.id);
      return { draft: inserted.row, reused: false };
    }
    if (inserted.reason === 'conflict') {
      // Second guard (UNIQUE (user_id, creation_request_id), 051): a draft already exists for this id.
      const first = await deps.findByRequestId(requestId);
      if (first) {
        await deps.completeRequest(requestId, first.id);
        return { draft: first, reused: true };
      }
    }
    if (inserted.reason === 'migration_required') break;
  }
  // The reservation stays consumed (not released): retrying this request never calls the AI again.
  if (inserted.reason === 'migration_required') {
    throw new DerivedPostError('migration_required', 'New posts from an image are not available yet (database migration 051 not applied).');
  }
  throw new DerivedPostError('save_failed', SAVE_FAILED_AFTER_WRITE_MESSAGE);
}
