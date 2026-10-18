'use client';

import type { ApiError } from '@/types/api';

/**
 * The Facebook UI's only requests (TASK-068) — all to OmniFlow's own API.
 * The browser never talks to Meta and never receives a token.
 */

export interface FacebookApiResult<T> {
  data: T | null;
  error: ApiError | null;
}

async function call<T>(url: string, init: RequestInit, fallback: string): Promise<FacebookApiResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: init.body ? { 'Content-Type': 'application/json', ...(init.headers ?? {}) } : init.headers,
    });
    const json = (await res.json().catch(() => null)) as { data: T | null; error: ApiError | null } | null;
    if (!res.ok || !json?.data) {
      return { data: null, error: json?.error ?? { message: fallback, code: 'request_failed' } };
    }
    return { data: json.data, error: null };
  } catch {
    return { data: null, error: { message: 'Could not reach OmniFlow. Check your connection and try again.', code: 'network' } };
  }
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export function requestFacebookPost<T>(source: unknown) {
  return call<T>('/api/social/facebook-post', post(source), 'The Facebook post could not be generated. Please try again.');
}

export function saveFacebookEdits<T>(id: string, body: unknown) {
  return call<T>(`/api/social/generations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, 'The changes could not be saved.');
}

export function publishToFacebook<T>(id: string, connectionId: string) {
  return call<T>(`/api/social/generations/${id}/publish`, post({ connectionId, confirm: true }), 'The post could not be published.');
}

export function retryFacebookStep<T>(publicationId: string, step: 'post' | 'comment') {
  const path = step === 'comment' ? 'retry-comment' : 'retry';
  return call<T>(`/api/social/publications/${publicationId}/${path}`, post({ confirm: true }), 'The retry could not be completed.');
}

export function listFacebookPages<T>(projectId: string) {
  return call<T>(`/api/social/connections/facebook/pages?projectId=${encodeURIComponent(projectId)}`, { method: 'GET' }, 'Your Facebook Pages could not be listed.');
}

export function selectFacebookPage<T>(projectId: string, pageId: string) {
  return call<T>('/api/social/connections/facebook/select', post({ projectId, pageId }), 'The Facebook Page could not be saved.');
}

export function verifyFacebookConnection<T>(connectionId: string) {
  return call<T>(`/api/social/connections/${connectionId}/verify`, { method: 'POST' }, 'The connection could not be checked.');
}

export function disconnectFacebookPage<T>(connectionId: string) {
  return call<T>(`/api/social/connections/${connectionId}`, { method: 'DELETE' }, 'The Page could not be disconnected.');
}

export function deleteSocialContent<T>(id: string) {
  return call<T>(`/api/social/generations/${id}`, { method: 'DELETE' }, 'The content could not be deleted.');
}

/** Facebook Login starts with a full-page navigation (never fetch): the route redirects to Facebook. */
export function facebookConnectHref(projectId: string, business = false): string {
  return `/api/social/connections/facebook/oauth/start?projectId=${encodeURIComponent(projectId)}${business ? '&business=1' : ''}`;
}
