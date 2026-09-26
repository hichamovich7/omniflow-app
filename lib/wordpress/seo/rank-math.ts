import { normalizeSiteUrl, type WordPressSiteCredentials } from '@/lib/wordpress/rest-client';

/**
 * Rank Math adapter. Writes SEO meta through Rank Math's own REST route —
 * never the WP database, never unverified meta names.
 *
 * Verified 2026-09-26 on the connected site (Rank Math 1.0.279 + PRO) from
 * the public namespace index GET /wp-json/rankmath/v1:
 *   POST /wp-json/rankmath/v1/updateMeta
 *   args: objectType (string, required), objectID (integer, required),
 *         meta (required)
 * Rank Math deletes a meta key sent with an empty value, so empty fields are
 * omitted (never cleared) and `permalink` is never sent — the slug is owned
 * by the core `slug` post field.
 */

export const RANK_MATH_UPDATE_META_ROUTE = '/rankmath/v1/updateMeta';

export interface RankMathSeoMeta {
  title: string | null;
  description: string | null;
  focusKeyword: string | null;
  /** Only when explicitly provided — never derived. */
  canonicalUrl?: string | null;
}

export type RankMathResult =
  | { status: 'saved' }
  | { status: 'not_detected' }
  | { status: 'failed'; httpStatus?: number; message: string };

export const RANK_MATH_NOT_DETECTED_WARNING = 'Rank Math was not detected.';
export const RANK_MATH_FAILED_WARNING = 'Rank Math metadata could not be saved.';

function authHeader(site: WordPressSiteCredentials): string {
  return `Basic ${Buffer.from(`${site.username}:${site.password}`).toString('base64')}`;
}

export function buildRankMathMeta(seo: RankMathSeoMeta): Record<string, string> {
  const meta: Record<string, string> = {};
  const set = (key: string, value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) meta[key] = trimmed;
  };
  set('rank_math_title', seo.title);
  set('rank_math_description', seo.description);
  set('rank_math_focus_keyword', seo.focusKeyword);
  set('rank_math_canonical_url', seo.canonicalUrl);
  return meta;
}

export function buildRankMathPayload(postId: number, seo: RankMathSeoMeta) {
  return { objectType: 'post', objectID: postId, meta: buildRankMathMeta(seo) };
}

/**
 * Detects the write route from the namespace index. 'absent' = the namespace
 * doesn't exist (Rank Math not installed/active); 'unavailable' = it exists
 * but updateMeta isn't exposed, or the site couldn't be read.
 */
export async function detectRankMath(
  site: WordPressSiteCredentials
): Promise<'available' | 'absent' | 'unavailable'> {
  let res: Response;
  try {
    res = await fetch(`${normalizeSiteUrl(site.siteUrl)}/wp-json/rankmath/v1`, {
      headers: { Authorization: authHeader(site) },
    });
  } catch {
    return 'unavailable';
  }
  if (res.status === 404) return 'absent';
  if (!res.ok) return 'unavailable';

  try {
    const index = (await res.json()) as { routes?: Record<string, { methods?: string[] }> };
    const route = index.routes?.[RANK_MATH_UPDATE_META_ROUTE];
    return route?.methods?.includes('POST') ? 'available' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const json = (await res.clone().json()) as { message?: string };
    if (json?.message) return json.message.slice(0, 200);
  } catch {
    // not JSON
  }
  return res.statusText || `HTTP ${res.status}`;
}

/**
 * Never throws: a Rank Math problem must not undo or block a post that was
 * already created. updateMeta overwrites the same keys on the same post id,
 * so a retry after a failure never duplicates anything.
 */
export async function saveRankMathMeta(
  site: WordPressSiteCredentials,
  postId: number,
  seo: RankMathSeoMeta
): Promise<RankMathResult> {
  const detected = await detectRankMath(site);
  if (detected === 'absent') return { status: 'not_detected' };
  if (detected === 'unavailable') {
    return { status: 'failed', message: 'Rank Math updateMeta endpoint is not available.' };
  }

  const payload = buildRankMathPayload(postId, seo);
  if (Object.keys(payload.meta).length === 0) return { status: 'saved' };

  let res: Response;
  try {
    res = await fetch(`${normalizeSiteUrl(site.siteUrl)}/wp-json${RANK_MATH_UPDATE_META_ROUTE}`, {
      method: 'POST',
      headers: { Authorization: authHeader(site), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return { status: 'failed', message: 'Could not reach the WordPress site.' };
  }

  if (!res.ok) {
    return { status: 'failed', httpStatus: res.status, message: await readErrorMessage(res) };
  }

  // updateMeta answers `true` (or the post's new slug); `false` is a refusal.
  const body = (await res.json().catch(() => null)) as unknown;
  if (body === false) {
    return { status: 'failed', httpStatus: res.status, message: 'Rank Math refused the metadata update.' };
  }
  return { status: 'saved' };
}
