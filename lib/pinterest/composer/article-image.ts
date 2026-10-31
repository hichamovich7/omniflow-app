import sharp from 'sharp';
import { isAllowedReferenceImage } from '@/lib/pinterest/article-vision';
import type { ListicleSource } from './content';

/**
 * TASK-083 — reading the article photo a numbered Pin is composed on. GET
 * only, from the connected WordPress site or OmniFlow media storage; the
 * file is never written back, never modified at its source and never sent
 * to an image model. Any failure throws: the caller stores nothing.
 */

export const ARTICLE_IMAGE_TIMEOUT_MS = 15_000;
export const ARTICLE_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
/** Shorter side below this would be visibly blurry once cropped to 1000×1500. */
export const ARTICLE_IMAGE_MIN_SIDE = 400;

export class ArticleImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArticleImageError';
  }
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** A literal IP, localhost or a local name is never fetched, even when listed. */
function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) ||
    host.includes(':')
  );
}

export async function downloadArticleImage(url: string, allowedHosts: readonly string[], fetchFn: FetchFn = fetch): Promise<Buffer> {
  if (!isAllowedReferenceImage(url, allowedHosts) || isLocalHost(new URL(url).hostname)) {
    throw new ArticleImageError('Article image host is not allowed');
  }
  let response: Response;
  try {
    // No redirect: a redirect could leave the allowed hosts.
    response = await fetchFn(url, { method: 'GET', redirect: 'error', headers: { Accept: 'image/*' }, signal: AbortSignal.timeout(ARTICLE_IMAGE_TIMEOUT_MS) });
  } catch {
    throw new ArticleImageError('Article image could not be downloaded');
  }
  if (!response.ok) throw new ArticleImageError(`Article image download failed (HTTP ${response.status})`);
  const type = (response.headers.get('content-type') ?? '').toLowerCase();
  if (!type.startsWith('image/') || type.includes('svg')) throw new ArticleImageError('Article file is not a raster image');
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > ARTICLE_IMAGE_MAX_BYTES) throw new ArticleImageError('Article image is too large');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0 || buffer.length > ARTICLE_IMAGE_MAX_BYTES) throw new ArticleImageError('Article image is empty or too large');
  let width = 0;
  let height = 0;
  try {
    ({ width = 0, height = 0 } = await sharp(buffer).metadata());
  } catch {
    throw new ArticleImageError('Article image could not be read');
  }
  if (Math.min(width, height) < ARTICLE_IMAGE_MIN_SIDE) throw new ArticleImageError('Article image is too small');
  return buffer;
}

export interface LoadedArticlePhoto {
  photo: Buffer;
  /** The URL actually read (the planned one, or the featured-image fallback). */
  url: string;
  warnings: string[];
}

/** The planned article photo, else its featured-image fallback (documented in the contract). */
export async function loadArticlePhoto(source: ListicleSource, allowedHosts: readonly string[], fetchFn: FetchFn = fetch): Promise<LoadedArticlePhoto> {
  try {
    return { photo: await downloadArticleImage(source.imageUrl, allowedHosts, fetchFn), url: source.imageUrl, warnings: [] };
  } catch (error) {
    if (!source.fallbackUrl) throw error;
    const photo = await downloadArticleImage(source.fallbackUrl, allowedHosts, fetchFn);
    return { photo, url: source.fallbackUrl, warnings: ['SOURCE_FALLBACK_FEATURED'] };
  }
}
