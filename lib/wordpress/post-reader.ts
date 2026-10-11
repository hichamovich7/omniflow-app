import { normalizeSiteUrl, type WordPressSiteCredentials } from '@/lib/wordpress/rest-client';
import { decodeEntities } from '@/lib/wordpress/article-context';

/**
 * Read-only access to the posts of a connected WordPress site (Pinterest
 * from an existing article). Every request is a GET: nothing here can create,
 * update or delete anything on WordPress. Errors carry a message meant for
 * the user and never include credentials or post content.
 */

export const WORDPRESS_READ_TIMEOUTS_MS = { search: 10_000, post: 15_000 } as const;
/** Larger responses are refused rather than parsed. */
export const WORDPRESS_READ_MAX_BYTES = 3_000_000;
/** Below this much text the post is treated as empty. */
export const WORDPRESS_POST_MIN_TEXT_LENGTH = 80;

export type WordPressReadErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'timeout'
  | 'network'
  | 'invalid_response'
  | 'empty_content'
  | 'http';

const READ_ERROR_STATUS: Record<WordPressReadErrorCode, number> = {
  unauthorized: 502,
  forbidden: 403,
  not_found: 404,
  timeout: 504,
  network: 502,
  invalid_response: 502,
  empty_content: 422,
  http: 502,
};

export class WordPressReadError extends Error {
  readonly code: WordPressReadErrorCode;
  /** HTTP status OmniFlow answers with (not WordPress's). */
  readonly status: number;
  /** WordPress's own HTTP status, when it answered. */
  readonly wordpressStatus?: number;

  constructor(code: WordPressReadErrorCode, message: string, wordpressStatus?: number) {
    super(message);
    this.name = 'WordPressReadError';
    this.code = code;
    this.status = READ_ERROR_STATUS[code];
    this.wordpressStatus = wordpressStatus;
  }
}

export type PostStatusFilter = 'publish' | 'draft';

export interface WordPressImageRef {
  url: string;
  alt: string;
  caption: string;
}

export interface WordPressPostListItem {
  id: number;
  title: string;
  date: string;
  status: string;
  categories: string[];
  featuredImage: WordPressImageRef | null;
}

export interface WordPressPostDetail extends WordPressPostListItem {
  /** WordPress category term ids (mapped to OmniFlow categories / Content Streams). */
  categoryIds: number[];
  excerpt: string;
  contentHtml: string;
  tags: string[];
  /** Traceability only — never a Pin destination. */
  link: string;
}

export interface ReadDeps {
  fetchImpl?: typeof fetch;
}

function authHeader(site: WordPressSiteCredentials): string {
  return `Basic ${Buffer.from(`${site.username}:${site.password}`).toString('base64')}`;
}

function isTimeout(err: unknown): boolean {
  const name = typeof err === 'object' && err !== null ? (err as { name?: unknown }).name : undefined;
  return name === 'TimeoutError' || name === 'AbortError';
}

function errorForStatus(status: number, what: 'posts' | 'post'): WordPressReadError {
  if (status === 401) {
    return new WordPressReadError('unauthorized', 'WordPress rejected the saved credentials. Reconnect the site with a valid Application Password.', status);
  }
  if (status === 403) {
    return new WordPressReadError(
      'forbidden',
      what === 'post'
        ? 'This WordPress account is not allowed to read this post. Drafts need an account that can edit posts.'
        : 'This WordPress account is not allowed to list these posts. Drafts need an account that can edit posts.',
      status
    );
  }
  if (status === 404) {
    return new WordPressReadError('not_found', what === 'post' ? 'This post was not found on WordPress.' : 'The WordPress posts endpoint was not found.', status);
  }
  return new WordPressReadError('http', `WordPress answered with an error (HTTP ${status}). Try again later.`, status);
}

async function getJson(url: string, site: WordPressSiteCredentials, timeoutMs: number, what: 'posts' | 'post', deps: ReadDeps): Promise<unknown> {
  const doFetch = deps.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url, {
      method: 'GET',
      headers: { Authorization: authHeader(site), Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
  } catch (err) {
    if (isTimeout(err)) throw new WordPressReadError('timeout', 'WordPress took too long to answer. Try again in a moment.');
    throw new WordPressReadError('network', 'Could not reach the WordPress site.');
  }

  if (!res.ok) throw errorForStatus(res.status, what);

  let text: string;
  try {
    text = await res.text();
  } catch (err) {
    if (isTimeout(err)) throw new WordPressReadError('timeout', 'WordPress took too long to answer. Try again in a moment.');
    throw new WordPressReadError('network', 'The WordPress answer could not be read.');
  }
  if (text.length > WORDPRESS_READ_MAX_BYTES) {
    throw new WordPressReadError('invalid_response', 'This WordPress post is too large to be used.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new WordPressReadError('invalid_response', 'WordPress returned an unexpected answer.');
  }
}

function rendered(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { rendered?: unknown }).rendered === 'string') {
    return (value as { rendered: string }).rendered;
  }
  return '';
}

function plain(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function featuredImageOf(raw: Record<string, unknown>): WordPressImageRef | null {
  const list = record(raw._embedded)['wp:featuredmedia'];
  const media = record(Array.isArray(list) ? list[0] : null);
  const url = typeof media.source_url === 'string' ? media.source_url : '';
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    url,
    alt: typeof media.alt_text === 'string' ? plain(media.alt_text) : '',
    caption: plain(rendered(media.caption)),
  };
}

/** Category and tag names from the embedded terms (wp:term is [categories[], tags[]]). */
function termNames(raw: Record<string, unknown>, taxonomy: 'category' | 'post_tag'): string[] {
  const groups = record(raw._embedded)['wp:term'];
  if (!Array.isArray(groups)) return [];
  return groups
    .flatMap((group) => (Array.isArray(group) ? group : []))
    .map(record)
    .filter((term) => term.taxonomy === taxonomy && typeof term.name === 'string')
    .map((term) => plain(term.name as string))
    .filter(Boolean);
}

function listItem(raw: Record<string, unknown>): WordPressPostListItem | null {
  if (typeof raw.id !== 'number') return null;
  return {
    id: raw.id,
    title: plain(rendered(raw.title)) || '(untitled)',
    date: typeof raw.date === 'string' ? raw.date : '',
    status: typeof raw.status === 'string' ? raw.status : 'publish',
    categories: termNames(raw, 'category'),
    featuredImage: featuredImageOf(raw),
  };
}

const EMBED = '_embed=wp:featuredmedia,wp:term';

/** One page of posts matching a title / keyword search. GET only. */
export async function searchWordPressPosts(
  site: WordPressSiteCredentials,
  query: { search: string; status: PostStatusFilter; page: number; perPage: number },
  deps: ReadDeps = {}
): Promise<{ posts: WordPressPostListItem[]; totalPages: number }> {
  const params = new URLSearchParams({
    status: query.status,
    per_page: String(query.perPage),
    page: String(query.page),
    orderby: query.search.trim() ? 'relevance' : 'date',
    _fields: 'id,date,status,title,_links,_embedded',
  });
  if (query.search.trim()) params.set('search', query.search.trim());
  const url = `${normalizeSiteUrl(site.siteUrl)}/wp-json/wp/v2/posts?${params.toString()}&${EMBED}`;

  // WordPress answers 400 for a page past the last one: that is an empty page.
  let data: unknown;
  try {
    data = await getJson(url, site, WORDPRESS_READ_TIMEOUTS_MS.search, 'posts', deps);
  } catch (err) {
    if (err instanceof WordPressReadError && err.wordpressStatus === 400) {
      // Drafts the account may not list are refused by WordPress with a 400.
      if (query.status === 'draft') throw errorForStatus(403, 'posts');
      if (query.page > 1) return { posts: [], totalPages: query.page - 1 };
    }
    throw err;
  }
  if (!Array.isArray(data)) throw new WordPressReadError('invalid_response', 'WordPress returned an unexpected answer.');

  const posts = data.map(record).map(listItem).filter((post): post is WordPressPostListItem => post !== null);
  return { posts, totalPages: posts.length < query.perPage ? query.page : query.page + 1 };
}

/**
 * The full post (rendered content, featured image, category and tag names).
 * GET only. An empty or unreadable post is refused with `empty_content`.
 */
export async function getWordPressPost(site: WordPressSiteCredentials, postId: number, deps: ReadDeps = {}): Promise<WordPressPostDetail> {
  const url = `${normalizeSiteUrl(site.siteUrl)}/wp-json/wp/v2/posts/${postId}?${EMBED}`;
  const raw = record(await getJson(url, site, WORDPRESS_READ_TIMEOUTS_MS.post, 'post', deps));
  const item = listItem(raw);
  if (!item || item.id !== postId) throw new WordPressReadError('invalid_response', 'WordPress returned an unexpected answer.');

  const contentHtml = rendered(raw.content);
  const contentProtected = record(raw.content).protected === true;
  if (contentProtected || plain(contentHtml).length < WORDPRESS_POST_MIN_TEXT_LENGTH) {
    throw new WordPressReadError('empty_content', 'This post has no readable content (empty or password-protected), so no Pin can be built from it.');
  }

  return {
    ...item,
    categoryIds: Array.isArray(raw.categories) ? raw.categories.filter((id): id is number => typeof id === 'number') : [],
    excerpt: plain(rendered(raw.excerpt)),
    contentHtml,
    tags: termNames(raw, 'post_tag'),
    link: typeof raw.link === 'string' ? raw.link : '',
  };
}
