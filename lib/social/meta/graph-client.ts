import { createHmac } from 'crypto';
import type { MetaConfig } from './config';
import { MetaApiError, metaErrorFromBody } from './errors';

/**
 * Minimal Meta Graph API client for Facebook Pages (TASK-068), on native
 * fetch. Server-side only.
 *
 * Token handling: access tokens travel in the Authorization header (or in a
 * POST body for the OAuth exchanges) — never in a URL, so they cannot end up
 * in a proxy or access log. Every call signed with a token also sends
 * `appsecret_proof` (HMAC-SHA256 of the token with the App Secret), so a
 * leaked token is useless without the server. Errors are MetaApiError with
 * codes only; response bodies are never logged.
 *
 * Only Page endpoints are used: /me/accounts (Pages the person manages),
 * /{page-id}, /{page-id}/photos, /{page-id}/feed, /{page-id}/published_posts,
 * /{post-id}/comments. Nothing for personal profiles or groups.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const META_REQUEST_TIMEOUT_MS = 15_000;

export interface MetaGraphDeps {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export interface MetaUserToken {
  accessToken: string;
  /** Seconds until expiry when Meta reports it. */
  expiresIn: number | null;
}

export interface MetaPageAccount {
  id: string;
  name: string;
  tasks: string[];
  /** The Page access token — server-side only, never returned to the browser. */
  accessToken: string;
}

export interface MetaPagePost {
  id: string;
  message: string;
  createdTime: string | null;
}

export interface MetaComment {
  id: string;
  message: string;
  fromId: string | null;
}

const PAGE_ID = /^\d{1,32}$/;
const POST_ID = /^\d{1,32}(_\d{1,32})?$/;

export function isMetaPageId(value: string): boolean {
  return PAGE_ID.test(value);
}

export function isMetaPostId(value: string): boolean {
  return POST_ID.test(value);
}

export function appSecretProof(token: string, appSecret: string): string {
  return createHmac('sha256', appSecret).update(token).digest('hex');
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export class MetaGraphClient {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: MetaConfig,
    deps: MetaGraphDeps = {}
  ) {
    this.fetchImpl = deps.fetchImpl ?? ((input, init) => fetch(input, init));
    this.timeoutMs = deps.timeoutMs ?? META_REQUEST_TIMEOUT_MS;
  }

  private url(path: string, query: Record<string, string> = {}): string {
    const search = new URLSearchParams(query).toString();
    return `https://graph.facebook.com/${this.config.graphVersion}${path}${search ? `?${search}` : ''}`;
  }

  private async send(method: 'GET' | 'POST', path: string, options: { token?: string; query?: Record<string, string>; body?: Record<string, string> }) {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const query = { ...(options.query ?? {}) };
    const body = options.body ? { ...options.body } : undefined;
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
      const proof = appSecretProof(options.token, this.config.appSecret);
      if (body) body.appsecret_proof = proof;
      else query.appsecret_proof = proof;
    }
    if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(this.url(path, query), {
        method,
        headers,
        body: body ? new URLSearchParams(body).toString() : undefined,
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch (err) {
      // A write that timed out may still have been applied by Meta.
      const timedOut = controller.signal.aborted || (err instanceof Error && err.name === 'AbortError');
      throw new MetaApiError(timedOut ? 'timeout' : 'network', { ambiguous: method === 'POST' });
    } finally {
      clearTimeout(timer);
    }

    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    if (!response.ok || (json && typeof json === 'object' && 'error' in json)) {
      throw metaErrorFromBody(response.status, json);
    }
    if (!json || typeof json !== 'object') throw new MetaApiError('unknown', { httpStatus: response.status });
    return json as Record<string, unknown>;
  }

  // -------------------------------------------------------------------------
  // OAuth (Facebook Login) — secrets and tokens in the POST body only

  async exchangeCode(code: string, redirectUri: string): Promise<MetaUserToken> {
    const json = await this.send('POST', '/oauth/access_token', {
      body: { client_id: this.config.appId, client_secret: this.config.appSecret, redirect_uri: redirectUri, code },
    });
    return this.userToken(json);
  }

  /** Short-lived user token → long-lived (~60 days); Page tokens read with it have no fixed expiry. */
  async exchangeLongLived(shortLivedToken: string): Promise<MetaUserToken> {
    const json = await this.send('POST', '/oauth/access_token', {
      body: {
        grant_type: 'fb_exchange_token',
        client_id: this.config.appId,
        client_secret: this.config.appSecret,
        fb_exchange_token: shortLivedToken,
      },
    });
    return this.userToken(json);
  }

  private userToken(json: Record<string, unknown>): MetaUserToken {
    const accessToken = str(json.access_token);
    if (!accessToken) throw new MetaApiError('oauth_failed');
    return { accessToken, expiresIn: typeof json.expires_in === 'number' ? json.expires_in : null };
  }

  /** Permissions the person actually granted (they can untick some in the dialog). */
  async grantedPermissions(userToken: string): Promise<string[]> {
    const json = await this.send('GET', '/me/permissions', { token: userToken });
    const rows = Array.isArray(json.data) ? (json.data as Array<Record<string, unknown>>) : [];
    return rows.filter((row) => row.status === 'granted').map((row) => str(row.permission)).filter(Boolean);
  }

  /** Pages the person manages, with their Page tokens (kept server-side). */
  async listPages(userToken: string): Promise<MetaPageAccount[]> {
    const json = await this.send('GET', '/me/accounts', {
      token: userToken,
      query: { fields: 'id,name,tasks,access_token', limit: '100' },
    });
    const rows = Array.isArray(json.data) ? (json.data as Array<Record<string, unknown>>) : [];
    return rows
      .map((row) => ({
        id: str(row.id),
        name: str(row.name).slice(0, 200),
        tasks: Array.isArray(row.tasks) ? (row.tasks as unknown[]).map(str).filter(Boolean) : [],
        accessToken: str(row.access_token),
      }))
      .filter((page) => isMetaPageId(page.id) && page.accessToken);
  }

  // -------------------------------------------------------------------------
  // Page calls — with the Page access token

  async getPage(pageToken: string, pageId: string): Promise<{ id: string; name: string }> {
    this.assertPageId(pageId);
    const json = await this.send('GET', `/${pageId}`, { token: pageToken, query: { fields: 'id,name' } });
    return { id: str(json.id), name: str(json.name).slice(0, 200) };
  }

  /** Photo post: Facebook downloads `imageUrl` (public HTTPS) and publishes it with the caption. */
  async createPhotoPost(pageToken: string, pageId: string, input: { imageUrl: string; caption: string }): Promise<{ postId: string }> {
    this.assertPageId(pageId);
    const json = await this.send('POST', `/${pageId}/photos`, {
      token: pageToken,
      body: { url: input.imageUrl, caption: input.caption, published: 'true' },
    });
    const postId = str(json.post_id) || (str(json.id) ? `${pageId}_${str(json.id)}` : '');
    if (!isMetaPostId(postId)) throw new MetaApiError('unknown');
    return { postId };
  }

  /** Text post (no image). */
  async createFeedPost(pageToken: string, pageId: string, input: { message: string }): Promise<{ postId: string }> {
    this.assertPageId(pageId);
    const json = await this.send('POST', `/${pageId}/feed`, { token: pageToken, body: { message: input.message } });
    const postId = str(json.id);
    if (!isMetaPostId(postId)) throw new MetaApiError('unknown');
    return { postId };
  }

  async createComment(pageToken: string, postId: string, message: string): Promise<{ commentId: string }> {
    this.assertPostId(postId);
    const json = await this.send('POST', `/${postId}/comments`, { token: pageToken, body: { message } });
    const commentId = str(json.id);
    if (!commentId) throw new MetaApiError('unknown');
    return { commentId };
  }

  /** Public link of a post — best effort (null on any error). */
  async postPermalink(pageToken: string, postId: string): Promise<string | null> {
    this.assertPostId(postId);
    try {
      const json = await this.send('GET', `/${postId}`, { token: pageToken, query: { fields: 'permalink_url' } });
      const url = str(json.permalink_url);
      return /^https:\/\/(www\.|m\.)?facebook\.com\//.test(url) ? url : null;
    } catch {
      return null;
    }
  }

  /** The Page's posts since a time — used to find a post whose creation timed out. */
  async recentPagePosts(pageToken: string, pageId: string, sinceUnix: number): Promise<MetaPagePost[]> {
    this.assertPageId(pageId);
    const json = await this.send('GET', `/${pageId}/published_posts`, {
      token: pageToken,
      query: { fields: 'id,message,created_time', since: String(Math.max(0, Math.floor(sinceUnix))), limit: '25' },
    });
    const rows = Array.isArray(json.data) ? (json.data as Array<Record<string, unknown>>) : [];
    return rows
      .map((row) => ({ id: str(row.id), message: str(row.message), createdTime: str(row.created_time) || null }))
      .filter((post) => isMetaPostId(post.id));
  }

  /** The post's latest comments — used to find a comment whose creation timed out. */
  async postComments(pageToken: string, postId: string): Promise<MetaComment[]> {
    this.assertPostId(postId);
    const json = await this.send('GET', `/${postId}/comments`, {
      token: pageToken,
      query: { fields: 'id,message,from', filter: 'stream', order: 'reverse_chronological', limit: '50' },
    });
    const rows = Array.isArray(json.data) ? (json.data as Array<Record<string, unknown>>) : [];
    return rows.map((row) => ({
      id: str(row.id),
      message: str(row.message),
      fromId: row.from && typeof row.from === 'object' ? str((row.from as Record<string, unknown>).id) || null : null,
    }));
  }

  private assertPageId(pageId: string): void {
    if (!isMetaPageId(pageId)) throw new MetaApiError('page_unavailable');
  }

  private assertPostId(postId: string): void {
    if (!isMetaPostId(postId)) throw new MetaApiError('unknown');
  }
}

/** Facebook Login dialog URL (no token in it — only the app id, scopes and the anti-CSRF state). */
export function buildOAuthDialogUrl(config: MetaConfig, input: { redirectUri: string; state: string; scopes: readonly string[] }): string {
  const query = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: input.redirectUri,
    state: input.state,
    scope: input.scopes.join(','),
    response_type: 'code',
  });
  return `https://www.facebook.com/${config.graphVersion}/dialog/oauth?${query.toString()}`;
}
