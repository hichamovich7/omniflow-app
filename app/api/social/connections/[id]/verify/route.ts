import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSocialConnection, updateConnectionStatus } from '@/lib/queries/social-connections';
import { logMetaError, MetaApiError } from '@/lib/social/meta/errors';
import type { SocialConnectionStatus } from '@/lib/social/facebook-publication';
import {
  createFacebookGraph,
  jsonError,
  loadPageToken,
  META_NOT_CONFIGURED_MESSAGE,
  socialAdminClient,
} from '@/lib/social/facebook-server';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

/**
 * "Verify" a connected Page (TASK-068): one read (GET /{page-id}) with the
 * stored Page token. Detects an expired / revoked token or a Page that is no
 * longer reachable, and saves the status. Never returns the token.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, 'unauthorized', 'Unauthorized');

  const { id } = await params;
  if (!isValidUuid(id)) return jsonError(400, 'invalid_id', 'Invalid connection ID');

  const connection = await getSocialConnection(supabase, user.id, id);
  if (!connection) return jsonError(404, 'not_found', 'Connection not found');

  const graph = createFacebookGraph();
  if (!graph) return jsonError(503, 'meta_not_configured', META_NOT_CONFIGURED_MESSAGE);
  const admin = socialAdminClient();
  const pageToken = await loadPageToken(admin, connection);

  let status: SocialConnectionStatus = 'active';
  let errorCode: string | null = null;
  let message: string | null = null;
  if (!pageToken) {
    status = 'expired';
    errorCode = 'token_unreadable';
    message = 'The stored connection cannot be used any more. Reconnect the Facebook Page.';
  } else {
    try {
      const page = await graph.getPage(pageToken, connection.external_account_id);
      if (page.id !== connection.external_account_id) throw new MetaApiError('page_unavailable');
    } catch (err) {
      if (!(err instanceof MetaApiError)) throw err;
      logMetaError('verify', err);
      errorCode = err.codeLabel;
      message = err.message;
      // A temporary Facebook problem does not change the connection status.
      status = err.kind === 'token_expired' ? 'expired' : err.retryable ? connection.status : 'error';
    }
  }
  await updateConnectionStatus(admin, { connectionId: connection.id, userId: user.id, status, errorCode, verifiedAt: new Date() });
  return NextResponse.json<ApiResponse<{ status: SocialConnectionStatus; message: string | null }>>({
    data: { status, message },
    error: null,
  });
}
