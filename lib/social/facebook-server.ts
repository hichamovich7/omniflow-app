import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMetaConfig, hasSocialTokenKey } from '@/lib/social/meta/config';
import { MetaGraphClient } from '@/lib/social/meta/graph-client';
import { MetaApiError } from '@/lib/social/meta/errors';
import { decryptSocialToken } from '@/lib/social/meta/token-crypto';
import {
  findProjectPageConnection,
  getSocialConnection,
  readEncryptedConnectionToken,
  updateConnectionStatus,
} from '@/lib/queries/social-connections';
import { listPublicationsForGeneration, supabasePublicationStore } from '@/lib/queries/social-publications';
import { OTHER_PAGE_PUBLICATION_CODE, otherPageConflictMessage, otherPagePublication, resolvePublicationConnection } from '@/lib/social/facebook-pages';
import type { SocialConnection, SocialPublication } from '@/lib/social/facebook-publication';
import type { ApiResponse } from '@/types/api';

/**
 * Shared server plumbing of the Facebook routes (TASK-068). The service-role
 * client is created here only for social_connections token reads / writes,
 * always after the route checked the caller's ownership with their own
 * session — see lib/queries/social-connections.ts.
 */

export function jsonError(status: number, code: string, message: string, extra: { retryable?: boolean } = {}) {
  return NextResponse.json<ApiResponse<null>>({ data: null, error: { message, code, ...extra } }, { status });
}

export const META_NOT_CONFIGURED_MESSAGE =
  'Facebook publishing is not configured on this server yet (Meta app credentials or token encryption key missing).';

/** The Graph client, or null when Meta or the token key is not configured. */
export function createFacebookGraph(): MetaGraphClient | null {
  const config = getMetaConfig();
  if (!config || !hasSocialTokenKey()) return null;
  return new MetaGraphClient(config);
}

export function socialAdminClient(): SupabaseClient {
  return createAdminClient();
}

/** The decrypted Page token of the caller's own connection — null when missing or unreadable. Never logged. */
export async function loadPageToken(admin: SupabaseClient, connection: Pick<SocialConnection, 'id' | 'user_id'>): Promise<string | null> {
  const encrypted = await readEncryptedConnectionToken(admin, { connectionId: connection.id, userId: connection.user_id });
  if (!encrypted) return null;
  try {
    return decryptSocialToken(encrypted);
  } catch {
    console.error('[facebook] stored token could not be decrypted');
    return null;
  }
}

/** Keeps the connection status in line with what Facebook answered. */
export async function recordConnectionError(
  admin: SupabaseClient,
  connection: Pick<SocialConnection, 'id' | 'user_id'>,
  err: MetaApiError | null
): Promise<void> {
  if (!err) return;
  if (err.kind === 'token_expired') {
    await updateConnectionStatus(admin, { connectionId: connection.id, userId: connection.user_id, status: 'expired', errorCode: err.codeLabel });
  } else if (err.kind === 'page_unavailable' || err.kind === 'permission_denied') {
    await updateConnectionStatus(admin, { connectionId: connection.id, userId: connection.user_id, status: 'error', errorCode: err.codeLabel });
  }
}

/** Publication as returned to the browser: no internal lock, nothing secret (there is no secret in this table). */
export type PublicationResponse = Omit<SocialPublication, 'locked_at'>;

export function publicationResponse(publication: SocialPublication): PublicationResponse {
  const { locked_at: _locked, ...rest } = publication;
  void _locked;
  return rest;
}

export const CONNECTION_UNUSABLE_MESSAGES: Record<Exclude<SocialConnection['status'], 'active'>, string> = {
  expired: 'The Facebook connection has expired. Reconnect the Facebook Page, then try again.',
  revoked: 'Access to the Facebook Page was removed. Reconnect the Page, then try again.',
  error: 'The Facebook Page could not be reached last time. Check it with "Verify" or reconnect it, then try again.',
};

/**
 * TASK-102 — one draft targets one Page: refuses to publish / schedule a
 * draft on `pageId` while it is published, scheduled or running on another
 * Page of the project. Fails closed when the rows cannot be read.
 */
export async function otherPageConflictResponse(supabase: SupabaseClient, userId: string, generationId: string, pageId: string) {
  const rows = await listPublicationsForGeneration(supabase, userId, generationId);
  if (rows === null) return jsonError(500, 'publications_unreadable', 'The publications of this post could not be checked. Please try again.');
  const blocking = otherPagePublication(rows, pageId);
  return blocking ? jsonError(409, OTHER_PAGE_PUBLICATION_CODE, otherPageConflictMessage(blocking)) : null;
}

/**
 * TASK-102 — the connection of a publication's own Page (caller's session,
 * user_id filters). After a disconnect + reconnect of the SAME Page in the
 * same project, the row is linked again to the new connection; another Page
 * is never used.
 */
export async function publicationConnection(supabase: SupabaseClient, userId: string, publication: SocialPublication): Promise<SocialConnection | null> {
  const { connection, relinked } = await resolvePublicationConnection(publication, {
    byId: (id) => getSocialConnection(supabase, userId, id),
    byProjectPage: (projectId, pageId) => findProjectPageConnection(supabase, userId, projectId, pageId),
  });
  if (connection && relinked) {
    const updated = await supabasePublicationStore(supabase, userId).update(publication.id, { connection_id: connection.id });
    if (!updated) return null;
    publication.connection_id = connection.id;
  }
  return connection;
}
