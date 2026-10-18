/**
 * Meta (Facebook Pages) configuration — TASK-068. Server-side only: every
 * value comes from environment variables, none is NEXT_PUBLIC_, and the App
 * Secret never leaves the server.
 */

/** Graph API version used when META_GRAPH_API_VERSION is not set. */
export const DEFAULT_META_GRAPH_API_VERSION = 'v25.0';

/**
 * Strictly minimal Facebook Login permissions for "publish a Page post, then
 * its first comment":
 * - pages_show_list: list the Pages the person manages (Page selection).
 * - pages_manage_posts: create the Page post (photo or text).
 * - pages_read_engagement: required by pages_manage_posts; also reads the
 *   Page's recent posts to settle an ambiguous timeout without a duplicate.
 * - pages_manage_engagement: publish the first comment as the Page.
 * - pages_read_user_content: required by pages_manage_engagement; also reads
 *   the post's comments to settle an ambiguous comment timeout.
 * Nothing for personal profiles or groups is ever requested.
 */
export const META_PAGE_SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_manage_engagement',
  'pages_read_user_content',
] as const;

/**
 * Only requested when the person asks for it after Meta returned no Page —
 * Pages owned by a Business Portfolio may need it to be listed.
 */
export const META_BUSINESS_SCOPE = 'business_management';

/** Scopes without which a post cannot be published at all. */
export const META_REQUIRED_POST_SCOPES = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement'] as const;
/** Scope needed for the first comment. */
export const META_COMMENT_SCOPE = 'pages_manage_engagement';

export const OAUTH_CALLBACK_PATH = '/api/social/connections/facebook/oauth/callback';

export interface MetaConfig {
  appId: string;
  appSecret: string;
  graphVersion: string;
}

/** Null when Meta is not configured (missing variables) — never a default secret. */
export function getMetaConfig(env: NodeJS.ProcessEnv = process.env): MetaConfig | null {
  const appId = env.META_APP_ID?.trim();
  const appSecret = env.META_APP_SECRET?.trim();
  if (!appId || !appSecret || !/^\d{5,32}$/.test(appId)) return null;
  const version = env.META_GRAPH_API_VERSION?.trim();
  return {
    appId,
    appSecret,
    graphVersion: version && /^v\d{1,3}\.\d{1,2}$/.test(version) ? version : DEFAULT_META_GRAPH_API_VERSION,
  };
}

/** True when the token encryption key is present (its format is checked on use). */
export function hasSocialTokenKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SOCIAL_TOKEN_ENCRYPTION_KEY?.trim());
}

/**
 * The OAuth redirect URI — must match the one declared in the Meta app.
 * NEXT_PUBLIC_APP_URL when set (stable across proxies), else the request's
 * own origin (local development).
 */
export function oauthRedirectUri(requestOrigin: string, env: NodeJS.ProcessEnv = process.env): string {
  const base = (env.NEXT_PUBLIC_APP_URL?.trim() || requestOrigin).replace(/\/+$/, '');
  return `${base}${OAUTH_CALLBACK_PATH}`;
}
