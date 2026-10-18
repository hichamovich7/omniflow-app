import { randomBytes, timingSafeEqual } from 'crypto';
import { decryptSocialToken, encryptSocialToken } from './token-crypto';

/**
 * Short-lived, encrypted, httpOnly cookies for the Facebook Login round trip
 * (TASK-068). Nothing is written to the database before the person picks a
 * Page:
 *
 * 1. `start` sets OAUTH_STATE_COOKIE: the anti-CSRF `state`, the user and
 *    the project (10 minutes).
 * 2. `callback` checks the state, exchanges the code for a long-lived user
 *    token and keeps it only in PENDING_CONNECTION_COOKIE (10 minutes).
 * 3. `select` reads the Pages again with that token, stores only the chosen
 *    Page's token (encrypted, social_connections) and clears the cookie.
 *
 * Both cookies are sealed with SOCIAL_TOKEN_ENCRYPTION_KEY (AES-256-GCM):
 * the browser holds an opaque value it cannot read, and JavaScript cannot
 * access it (httpOnly).
 */

export const OAUTH_STATE_COOKIE = 'omniflow_meta_oauth';
export const PENDING_CONNECTION_COOKIE = 'omniflow_meta_pending';
export const OAUTH_COOKIE_PATH = '/api/social/connections/facebook';
export const OAUTH_COOKIE_MAX_AGE_SECONDS = 600;

export interface OAuthStatePayload {
  kind: 'state';
  userId: string;
  projectId: string;
  state: string;
  business: boolean;
  exp: number;
}

export interface PendingConnectionPayload {
  kind: 'pending';
  userId: string;
  projectId: string;
  userToken: string;
  grantedScopes: string[];
  exp: number;
}

export function newOAuthState(): string {
  return randomBytes(32).toString('base64url');
}

export function sealOAuthState(input: Omit<OAuthStatePayload, 'kind' | 'exp'>, now: number = Date.now()): string {
  const payload: OAuthStatePayload = { kind: 'state', ...input, exp: now + OAUTH_COOKIE_MAX_AGE_SECONDS * 1000 };
  return encryptSocialToken(JSON.stringify(payload));
}

export function sealPendingConnection(input: Omit<PendingConnectionPayload, 'kind' | 'exp'>, now: number = Date.now()): string {
  const payload: PendingConnectionPayload = { kind: 'pending', ...input, exp: now + OAUTH_COOKIE_MAX_AGE_SECONDS * 1000 };
  return encryptSocialToken(JSON.stringify(payload));
}

function open(value: string | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(decryptSocialToken(value));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Null when absent, tampered, expired or for another user. */
export function openOAuthState(value: string | undefined, userId: string, now: number = Date.now()): OAuthStatePayload | null {
  const payload = open(value);
  if (!payload || payload.kind !== 'state' || payload.userId !== userId) return null;
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;
  if (typeof payload.state !== 'string' || typeof payload.projectId !== 'string') return null;
  return payload as unknown as OAuthStatePayload;
}

/** Null when absent, tampered, expired, for another user or another project. */
export function openPendingConnection(
  value: string | undefined,
  userId: string,
  projectId: string,
  now: number = Date.now()
): PendingConnectionPayload | null {
  const payload = open(value);
  if (!payload || payload.kind !== 'pending' || payload.userId !== userId || payload.projectId !== projectId) return null;
  if (typeof payload.exp !== 'number' || payload.exp < now || typeof payload.userToken !== 'string' || !payload.userToken) return null;
  return {
    ...(payload as unknown as PendingConnectionPayload),
    grantedScopes: Array.isArray(payload.grantedScopes) ? (payload.grantedScopes as unknown[]).filter((s): s is string => typeof s === 'string') : [],
  };
}

/** Constant-time comparison of the state returned by Meta with the cookie's. */
export function statesMatch(expected: string, received: string | null): boolean {
  if (!received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function oauthCookieOptions(maxAge: number = OAUTH_COOKIE_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: OAUTH_COOKIE_PATH,
    maxAge,
  };
}
