export class WordPressApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'WordPressApiError';
    this.status = status;
  }
}

export interface WordPressSiteCredentials {
  siteUrl: string;
  username: string;
  password: string;
}

export interface WordPressCategoryOption {
  id: number;
  name: string;
  slug: string;
}

export interface CreatePostInput {
  title: string;
  content: string;
  status: 'draft' | 'publish' | 'future';
  date?: string;
  excerpt?: string;
  slug?: string;
  categoryIds?: number[];
  tagIds?: number[];
  featuredMediaId?: number;
}

export interface WordPressPostResult {
  id: number;
  link: string;
  status: string;
}

const KNOWN_MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.trim().replace(/\/+$/, '');
}

function authHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

async function parseErrorBody(res: Response): Promise<string> {
  try {
    const json = (await res.clone().json()) as { message?: string; code?: string };
    if (json?.message) return json.message;
  } catch {
    // not JSON, fall through
  }
  try {
    const text = await res.text();
    if (text) return text.slice(0, 300);
  } catch {
    // ignore
  }
  return res.statusText || `HTTP ${res.status}`;
}

function guessMimeFromFilename(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  return (ext && KNOWN_MIME_BY_EXTENSION[ext]) || null;
}

/**
 * Validates a WordPress Application Password by fetching the authenticated
 * user's own profile. This IS the credential-validation step — callers must
 * run it successfully before persisting any connection.
 */
export async function testConnection(
  siteUrl: string,
  username: string,
  password: string
): Promise<{ ok: true; displayName: string }> {
  const url = `${normalizeSiteUrl(siteUrl)}/wp-json/wp/v2/users/me`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: authHeader(username, password) },
    });
  } catch {
    throw new WordPressApiError('Could not reach that WordPress site. Check the Site URL.');
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new WordPressApiError(
        'WordPress rejected the username/Application Password combination.',
        res.status
      );
    }
    throw new WordPressApiError(await parseErrorBody(res), res.status);
  }

  const data = (await res.json()) as { name?: string };
  return { ok: true, displayName: data.name ?? username };
}

export async function fetchCategories(
  site: WordPressSiteCredentials
): Promise<WordPressCategoryOption[]> {
  const url = `${normalizeSiteUrl(site.siteUrl)}/wp-json/wp/v2/categories?per_page=100`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: authHeader(site.username, site.password) },
    });
  } catch {
    throw new WordPressApiError('Could not reach that WordPress site.');
  }

  if (!res.ok) {
    throw new WordPressApiError(await parseErrorBody(res), res.status);
  }

  const data = (await res.json()) as { id: number; name: string; slug: string }[];
  return data.map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
}

/**
 * Resolves a tag name to its WordPress term id: reuses an existing tag whose
 * name matches case-insensitively, otherwise creates it. Returns null (never
 * throws) when the tag can't be found nor created — e.g. the account lacks
 * the manage_categories capability — so one bad tag never blocks a publish.
 * `search` is a fuzzy match on WP's side, hence the exact-name filter here.
 */
export async function findOrCreateTag(site: WordPressSiteCredentials, name: string): Promise<number | null> {
  const base = `${normalizeSiteUrl(site.siteUrl)}/wp-json/wp/v2/tags`;
  const headers = { Authorization: authHeader(site.username, site.password) };
  const wanted = name.trim().toLowerCase();

  try {
    const res = await fetch(`${base}?search=${encodeURIComponent(name)}&per_page=100`, { headers });
    if (res.ok) {
      const found = (await res.json()) as { id: number; name: string }[];
      const match = found.find((t) => decodeHtmlEntities(t.name).trim().toLowerCase() === wanted);
      if (match) return match.id;
    }
  } catch {
    return null;
  }

  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json().catch(() => null)) as
      | { id?: number; code?: string; data?: { term_id?: number } }
      | null;
    if (res.ok && typeof data?.id === 'number') return data.id;
    // Race or a name WP normalizes differently: WP answers 400 term_exists
    // with the existing term's id.
    if (data?.code === 'term_exists' && typeof data.data?.term_id === 'number') return data.data.term_id;
    return null;
  } catch {
    return null;
  }
}

// WP returns term names HTML-escaped ("Bad &amp; Boujee").
function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Downloads an image from its current (public) URL and uploads it to the
 * WordPress media library. WP's media endpoint expects the raw file bytes as
 * the request body (NOT multipart/form-data) with Content-Type set to the
 * file's mime type and Content-Disposition carrying the filename.
 */
export async function uploadMedia(
  site: WordPressSiteCredentials,
  imageUrl: string,
  filename: string
): Promise<{ id: number; sourceUrl: string }> {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error('Could not fetch source image for upload');
  }

  const bytes = await imgRes.arrayBuffer();
  const mime =
    (imgRes.headers.get('content-type')?.split(';')[0].trim().startsWith('image/')
      ? imgRes.headers.get('content-type')?.split(';')[0].trim()
      : null) ??
    guessMimeFromFilename(filename) ??
    'image/png';

  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const url = `${normalizeSiteUrl(site.siteUrl)}/wp-json/wp/v2/media`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader(site.username, site.password),
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
      },
      body: bytes,
    });
  } catch {
    throw new WordPressApiError('Could not reach that WordPress site while uploading media.');
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new WordPressApiError(
        'WordPress rejected the connection credentials while uploading media.',
        res.status
      );
    }
    throw new WordPressApiError(await parseErrorBody(res), res.status);
  }

  const data = (await res.json()) as { id: number; source_url: string };
  return { id: data.id, sourceUrl: data.source_url };
}

/**
 * Creates a new post, or updates an existing one when existingWpPostId is
 * provided. On a 404 from the update path (the WP post no longer exists),
 * throws a WordPressApiError with status 404 so the caller can decide to
 * fall back to creating a fresh post — this module stays a dumb transport
 * layer and does not make that policy decision itself.
 */
export async function upsertPost(
  site: WordPressSiteCredentials,
  existingWpPostId: number | null,
  input: CreatePostInput
): Promise<WordPressPostResult> {
  const base = normalizeSiteUrl(site.siteUrl);
  const url = existingWpPostId
    ? `${base}/wp-json/wp/v2/posts/${existingWpPostId}`
    : `${base}/wp-json/wp/v2/posts`;

  const body: Record<string, unknown> = {
    title: input.title,
    content: input.content,
    status: input.status,
  };
  if (input.date) body.date = input.date;
  if (input.excerpt) body.excerpt = input.excerpt;
  if (input.slug) body.slug = input.slug;
  if (input.categoryIds && input.categoryIds.length > 0) body.categories = input.categoryIds;
  if (input.tagIds && input.tagIds.length > 0) body.tags = input.tagIds;
  if (input.featuredMediaId) body.featured_media = input.featuredMediaId;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader(site.username, site.password),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new WordPressApiError('Could not reach that WordPress site while creating the post.');
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new WordPressApiError(
        'WordPress rejected the connection credentials while creating the post.',
        res.status
      );
    }
    throw new WordPressApiError(await parseErrorBody(res), res.status);
  }

  const data = (await res.json()) as { id: number; link: string; status: string };
  return { id: data.id, link: data.link, status: data.status };
}

/**
 * Formats a Date as WP-local time with no timezone suffix
 * (YYYY-MM-DDTHH:MM:SS). WordPress interprets a date in this shape as
 * site-local time and, combined with status: 'future', schedules the post
 * for WP-Cron to auto-publish with no further action from OmniFlow.
 */
export function toWordPressLocalDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
