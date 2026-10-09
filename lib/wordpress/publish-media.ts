import { mapWithConcurrency } from '@/lib/wordpress/publish-budget';
import { silentPublishLogger, type PublishLogger } from '@/lib/wordpress/publish-log';
import {
  uploadMedia,
  WordPressApiError,
  type TimeoutLimiter,
  type WordPressSiteCredentials,
} from '@/lib/wordpress/rest-client';

/**
 * Media of one WordPress publish (TASK-FIX-059): the featured image and the
 * article's internal images, uploaded at most MEDIA_UPLOAD_CONCURRENCY at a
 * time within the publish budget. Never blocks the post:
 *   - featured image failed / out of time → the post is sent without
 *     `featured_media` (an existing one on WordPress is left untouched);
 *   - internal image failed / out of time → its original (public) Supabase
 *     Storage URL stays in the content, as before.
 * Nothing is ever deleted, on WordPress or in Storage.
 *
 * Internal image URLs are swapped for inert placeholder tokens before the
 * HTML export, so internal linking can run while the uploads are in flight;
 * every token is then replaced by the uploaded URL or the original one.
 */

export const MEDIA_UPLOAD_CONCURRENCY = 3;

export const FEATURED_IMAGE_FAILED_WARNING =
  'Featured image could not be uploaded — the post was sent without a new featured image.';
export const FEATURED_ALT_TEXT_WARNING = 'WordPress did not save the featured image alt text — add it in the Media Library.';

export function internalImagesFallbackWarning(count: number): string {
  return count === 1
    ? '1 article image could not be uploaded to WordPress — it is still shown from OmniFlow storage.'
    : `${count} article images could not be uploaded to WordPress — they are still shown from OmniFlow storage.`;
}

export interface MediaUploadRequest {
  url: string;
  filename: string;
  altText: string | null;
}

export interface InternalMediaItem {
  token: string;
  originalUrl: string;
  request: MediaUploadRequest;
}

export interface PublishMediaPlan {
  featured: MediaUploadRequest | null;
  internal: InternalMediaItem[];
}

export interface PublishMediaResult {
  featuredMediaId?: number;
  /** token → uploaded WordPress URL (uploaded images only). */
  replacements: Map<string, string>;
  uploadedCount: number;
  warnings: string[];
}

// Inert, ASCII-only, never a prefix of another token ("…/1.img" vs "…/11.img").
const TOKEN_PREFIX = 'https://omniflow-media.invalid/pending/';

/**
 * Replaces each internal image URL found in `content` with a placeholder
 * token. Images whose URL is not in the content are not uploaded (nothing
 * would show them); the same URL is planned once.
 */
export function planInternalMedia(
  content: string,
  images: { url: string | null; filename: string; altText: string | null }[]
): { content: string; internal: InternalMediaItem[] } {
  const internal: InternalMediaItem[] = [];
  let planned = content;
  for (const image of images) {
    if (!image.url || internal.some((item) => item.originalUrl === image.url)) continue;
    if (!planned.includes(image.url)) continue;
    const token = `${TOKEN_PREFIX}${internal.length}.img`;
    planned = planned.split(image.url).join(token);
    internal.push({ token, originalUrl: image.url, request: { url: image.url, filename: image.filename, altText: image.altText } });
  }
  return { content: planned, internal };
}

/** Every token back to a real URL: the uploaded one, else the original Storage URL. */
export function applyMediaReplacements(html: string, internal: InternalMediaItem[], replacements: Map<string, string>): string {
  let result = html;
  for (const item of internal) {
    result = result.split(item.token).join(replacements.get(item.token) ?? item.originalUrl);
  }
  return result;
}

function failureFields(err: unknown): { http?: number; result: string } {
  if (err instanceof WordPressApiError) {
    return { ...(err.status !== undefined ? { http: err.status } : {}), result: err.kind === 'budget' ? 'time_limit' : err.kind };
  }
  return { result: 'failed' };
}

/** Never throws. */
export async function uploadPublishMedia(
  site: WordPressSiteCredentials,
  plan: PublishMediaPlan,
  options: { limit?: TimeoutLimiter; log?: PublishLogger } = {}
): Promise<PublishMediaResult> {
  const log = options.log ?? silentPublishLogger;
  const jobs: { kind: 'featured' | 'internal'; request: MediaUploadRequest; token?: string }[] = [];
  // Featured first: it starts in the first wave.
  if (plan.featured) jobs.push({ kind: 'featured', request: plan.featured });
  for (const item of plan.internal) jobs.push({ kind: 'internal', request: item.request, token: item.token });

  const started = Date.now();
  const settled = await mapWithConcurrency(jobs, MEDIA_UPLOAD_CONCURRENCY, async (job) => {
    const t = Date.now();
    const step = job.kind === 'featured' ? 'media_featured' : 'media_internal_item';
    try {
      const uploaded = await uploadMedia(site, job.request.url, job.request.filename, job.request.altText, options.limit);
      log.step(step, { ms: Date.now() - t, result: 'uploaded' });
      return uploaded;
    } catch (err) {
      log.warn(step, { ms: Date.now() - t, ...failureFields(err) });
      throw err;
    }
  });

  const result: PublishMediaResult = { replacements: new Map(), uploadedCount: 0, warnings: [] };
  let internalFallbacks = 0;
  settled.forEach((outcome, index) => {
    const job = jobs[index];
    if (job.kind === 'featured') {
      if (outcome.status === 'fulfilled') {
        result.featuredMediaId = outcome.value.id;
        if (job.request.altText && !outcome.value.altText) result.warnings.push(FEATURED_ALT_TEXT_WARNING);
      } else {
        result.warnings.unshift(FEATURED_IMAGE_FAILED_WARNING);
      }
      return;
    }
    if (outcome.status === 'fulfilled' && job.token) {
      result.replacements.set(job.token, outcome.value.sourceUrl);
      result.uploadedCount++;
    } else {
      internalFallbacks++;
    }
  });
  if (internalFallbacks > 0) result.warnings.push(internalImagesFallbackWarning(internalFallbacks));

  log.step('media', {
    ms: Date.now() - started,
    count: result.uploadedCount + (result.featuredMediaId !== undefined ? 1 : 0),
    result: plan.featured ? (result.featuredMediaId !== undefined ? 'featured_uploaded' : 'featured_skipped') : 'no_featured',
  });
  return result;
}
