import { createHash } from 'node:crypto';
import { resolveSourceAsset, type SourceAssetOptions } from '@/lib/wordpress/media-source';
import { PUBLISH_LOCK_STALE_MS } from '@/lib/wordpress/publish-lock';
import { silentPublishLogger, type PublishLogger } from '@/lib/wordpress/publish-log';
import {
  downloadSourceImage,
  getMedia,
  normalizeSiteUrl,
  updateMediaAltText,
  uploadMediaBytes,
  WordPressApiError,
  WORDPRESS_TIMEOUTS_MS,
  type TimeoutLimiter,
  type WordPressMediaResult,
  type WordPressSiteCredentials,
} from '@/lib/wordpress/rest-client';

/**
 * WordPress media reuse (TASK-FIX-060, migration 043). Before any
 * POST /wp/v2/media, the image's storage-independent key
 * (media-source.ts) is looked up for the connected site:
 *
 *   mapped + GET /wp/v2/media/<id> finds it  → reused, no upload;
 *   mapped but gone (404 / not an image) or
 *   created on another site URL               → one new upload, mapping updated;
 *   not mapped                                → the row is claimed first (unique
 *                                               (site, key)), then uploaded —
 *                                               or an attachment of identical
 *                                               bytes (source_hash) is reused —
 *                                               and the mapping saved at once.
 *
 * Concurrency: the claim row is inserted BEFORE uploading. A publish that
 * hits the unique key waits for the other one's attachment instead of
 * uploading a second copy; a claim older than the publish lock's stale delay
 * is a killed request and is taken over. Nothing is ever deleted on
 * WordPress; only an unfinished claim row of our own is removed on failure.
 *
 * Without the table (migration 043 not applied) or on any database error,
 * the image is uploaded exactly as before — the publish never fails because
 * of the mapping.
 */

export interface MediaAssetRow {
  sourceAssetKey: string;
  sourceHash: string | null;
  wpMediaId: number | null;
  wpMediaUrl: string | null;
  /** Normalized URL of the site the attachment was created on. */
  siteUrl: string;
  /** Claim of an upload in progress; null once the mapping is complete. */
  uploadStartedAt: string | null;
}

/** A database failure of the mapping store. `unavailable` = the table does not exist (043 not applied). */
export class MediaStoreError extends Error {
  unavailable: boolean;

  constructor(message: string, unavailable = false) {
    super(message);
    this.name = 'MediaStoreError';
    this.unavailable = unavailable;
  }
}

/** Mapping rows of ONE WordPress site. Every method throws MediaStoreError only. */
export interface MediaAssetStore {
  find(sourceAssetKey: string): Promise<MediaAssetRow | null>;
  /** Completed rows with this content hash. */
  findByHash(sourceHash: string): Promise<MediaAssetRow[]>;
  /** Inserts a claim row; false = the key already exists (unique violation). */
  claim(sourceAssetKey: string, siteUrl: string, startedAt: string): Promise<boolean>;
  /** Takes the row's claim when it is free or older than `staleBefore`; false = someone else holds it. */
  takeOver(sourceAssetKey: string, startedAt: string, staleBefore: string): Promise<boolean>;
  /** Saves the attachment on a row we still hold; false = the claim was lost meanwhile. */
  complete(
    sourceAssetKey: string,
    startedAt: string,
    values: { wpMediaId: number; wpMediaUrl: string; sourceHash: string | null; siteUrl: string }
  ): Promise<boolean>;
  /** Gives our claim back: our unfinished row is removed, a mapped row keeps its attachment. */
  release(sourceAssetKey: string, startedAt: string): Promise<void>;
}

export type MediaOutcomeSource =
  | 'uploaded'
  | 'reused'
  | 'reused_unverified'
  | 'reused_hash'
  | 'uploaded_unmapped';

export interface MediaOutcome {
  media: WordPressMediaResult;
  source: MediaOutcomeSource;
}

export interface MediaReuseRequest {
  url: string;
  filename: string;
  altText: string | null;
}

/** Per-publish state shared by every image of the attempt. */
export interface MediaReuseContext {
  site: WordPressSiteCredentials;
  store: MediaAssetStore;
  /** The upload used when the mapping cannot be used (unchanged pre-043 behavior). */
  plainUpload: (request: MediaReuseRequest) => Promise<WordPressMediaResult>;
  limit?: TimeoutLimiter;
  log?: PublishLogger;
  sourceOptions?: SourceAssetOptions;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Set once the table is known to be missing — later images skip the lookup. */
  state?: { unavailable: boolean };
}

export const MEDIA_CLAIM_POLL_MS = 500;
/** How long a publish waits for another one's upload of the same image (download + upload + alt text). */
export const MEDIA_CLAIM_WAIT_MS =
  WORDPRESS_TIMEOUTS_MS.imageDownload + WORDPRESS_TIMEOUTS_MS.mediaUpload + WORDPRESS_TIMEOUTS_MS.mediaAltText;
const MAX_ROUNDS = 4;

export function hashImageBytes(bytes: ArrayBuffer): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

/** Postgres undefined table (42P01) or PostgREST schema-cache miss (PGRST205) on the mapping table. */
export function isMissingMediaAssetsTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (error.code === '42P01' || error.code === 'PGRST205') && /wordpress_media_assets/.test(error.message ?? '');
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Verified = { status: 'found'; media: WordPressMediaResult } | { status: 'missing' } | { status: 'unknown' };

/**
 * Returns the WordPress attachment to use for one image. Throws only when
 * the image could not be put on WordPress at all (upload failed, no time
 * left) — the caller then falls back exactly as for a failed upload.
 */
export async function obtainReusableMedia(ctx: MediaReuseContext, request: MediaReuseRequest): Promise<MediaOutcome> {
  const log = ctx.log ?? silentPublishLogger;
  const now = ctx.now ?? Date.now;
  const sleep = ctx.sleep ?? defaultSleep;
  const state = ctx.state ?? { unavailable: false };
  const siteUrl = normalizeSiteUrl(ctx.site.siteUrl);
  const asset = resolveSourceAsset(request.url, ctx.sourceOptions);

  const plain = async (): Promise<MediaOutcome> => ({ media: await ctx.plainUpload(request), source: 'uploaded_unmapped' });
  if (state.unavailable || !asset) return plain();

  const iso = (ms: number) => new Date(ms).toISOString();
  const isStale = (startedAt: string) => {
    const t = Date.parse(startedAt);
    return Number.isNaN(t) || now() - t > PUBLISH_LOCK_STALE_MS;
  };

  async function verify(mediaId: number): Promise<Verified> {
    try {
      const found = await getMedia(ctx.site, mediaId, ctx.limit);
      return found.status === 'found' ? found : { status: 'missing' };
    } catch (err) {
      log.warn('media_verify', {
        ...(err instanceof WordPressApiError && err.status !== undefined ? { http: err.status } : {}),
        result: err instanceof WordPressApiError ? err.kind : 'error',
      });
      return { status: 'unknown' };
    }
  }

  /** Reused attachment: its alt text completed when WordPress has none (an update, never a new upload). */
  async function withAltText(media: WordPressMediaResult): Promise<WordPressMediaResult> {
    const alt = request.altText?.trim();
    if (!alt || media.altText) return media;
    return { ...media, altText: await updateMediaAltText(ctx.site, media.id, alt, ctx.limit) };
  }

  /** We hold the claim: reuse identical bytes already on the site, else upload; save the mapping at once. */
  async function uploadClaimed(key: string, startedAt: string): Promise<MediaOutcome> {
    let outcome: MediaOutcome;
    let sourceHash: string | null = null;
    try {
      const image = await downloadSourceImage(asset!.url, request.filename, ctx.limit);
      sourceHash = hashImageBytes(image.bytes);
      let reused: WordPressMediaResult | null = null;
      let candidates: MediaAssetRow[] = [];
      try {
        candidates = await ctx.store.findByHash(sourceHash);
      } catch {
        log.warn('media_reuse_hash', { result: 'store_error' });
      }
      for (const candidate of candidates) {
        if (candidate.wpMediaId === null || candidate.siteUrl !== siteUrl) continue;
        const checked = await verify(candidate.wpMediaId);
        if (checked.status === 'found') {
          reused = await withAltText(checked.media);
          break;
        }
      }
      outcome = reused
        ? { media: reused, source: 'reused_hash' }
        : { media: await uploadMediaBytes(ctx.site, image, request.filename, request.altText, ctx.limit), source: 'uploaded' };
    } catch (err) {
      try {
        await ctx.store.release(key, startedAt);
      } catch {
        log.warn('media_reuse_release', { result: 'store_error' });
      }
      throw err;
    }

    // Saved before the post is written: a retry finds it even if the publish dies right after.
    try {
      const saved = await ctx.store.complete(key, startedAt, {
        wpMediaId: outcome.media.id,
        wpMediaUrl: outcome.media.sourceUrl,
        sourceHash,
        siteUrl,
      });
      if (!saved) log.warn('media_reuse_save', { result: 'claim_lost' });
    } catch {
      log.warn('media_reuse_save', { result: 'store_error' });
    }
    return outcome;
  }

  /** Waits until another publish's claim on this key changes. Throws when out of time. */
  async function waitForClaim(key: string, startedAt: string, waitUntil: number): Promise<void> {
    for (;;) {
      const remaining = waitUntil - now();
      if (remaining <= 0) {
        log.warn('media_reuse_wait', { result: 'time_limit' });
        throw new WordPressApiError('Another publish is still uploading this image.', undefined, 'budget');
      }
      await sleep(Math.min(MEDIA_CLAIM_POLL_MS, remaining));
      const row = await ctx.store.find(key);
      if (!row || row.uploadStartedAt !== startedAt) return;
    }
  }

  const maxWait = ctx.limit ? ctx.limit(MEDIA_CLAIM_WAIT_MS) : MEDIA_CLAIM_WAIT_MS;
  const waitUntil = now() + Math.max(0, maxWait);

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const row = await ctx.store.find(asset.key);

      if (!row) {
        const startedAt = iso(now());
        if (await ctx.store.claim(asset.key, siteUrl, startedAt)) return await uploadClaimed(asset.key, startedAt);
        // Unique collision: another publish claimed it first — read its row again.
        log.step('media_reuse_claim', { result: 'collision' });
        continue;
      }

      if (row.wpMediaId !== null && row.siteUrl === siteUrl) {
        const checked = await verify(row.wpMediaId);
        if (checked.status === 'found') return { media: await withAltText(checked.media), source: 'reused' };
        if (checked.status === 'unknown' && row.wpMediaUrl) {
          // WordPress could not answer: the attachment existed last time — reused, never duplicated.
          return {
            media: { id: row.wpMediaId, sourceUrl: row.wpMediaUrl, altText: request.altText?.trim() || null },
            source: 'reused_unverified',
          };
        }
        if (checked.status === 'missing') log.step('media_verify', { result: 'missing' });
      }

      if (row.uploadStartedAt && !isStale(row.uploadStartedAt)) {
        await waitForClaim(asset.key, row.uploadStartedAt, waitUntil);
        continue;
      }

      // Attachment gone / created on another site / stale claim: re-upload under our claim.
      const startedAt = iso(now());
      if (await ctx.store.takeOver(asset.key, startedAt, iso(now() - PUBLISH_LOCK_STALE_MS))) {
        return await uploadClaimed(asset.key, startedAt);
      }
    }
    log.warn('media_reuse', { result: 'contended' });
    throw new WordPressApiError('This image is being uploaded by another publish.', undefined, 'budget');
  } catch (err) {
    if (!(err instanceof MediaStoreError)) throw err;
    if (err.unavailable) {
      if (!state.unavailable) log.warn('media_reuse', { result: 'unavailable_migration_043_not_applied' });
      state.unavailable = true;
    } else {
      log.warn('media_reuse', { result: 'store_error' });
    }
    return plain();
  }
}
