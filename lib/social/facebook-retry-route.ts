import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { getSocialConnection } from '@/lib/queries/social-connections';
import { getSocialPublication, supabasePublicationStore } from '@/lib/queries/social-publications';
import { facebookRetrySchema } from '@/lib/validations/facebook';
import { PublishConflictError, retryFacebookComment, retryFacebookPost } from '@/lib/social/facebook-publish';
import {
  CONNECTION_UNUSABLE_MESSAGES,
  createFacebookGraph,
  jsonError,
  loadPageToken,
  META_NOT_CONFIGURED_MESSAGE,
  publicationResponse,
  recordConnectionError,
  socialAdminClient,
  type PublicationResponse,
} from '@/lib/social/facebook-server';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

/**
 * Shared handler of POST /api/social/publications/[id]/retry (post step) and
 * /retry-comment (first comment only) — TASK-068. Uses the publication's own
 * Page connection; never posts a second time what Facebook already has.
 */
export async function handleFacebookRetry(request: Request, id: string, step: 'post' | 'comment') {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, 'unauthorized', 'Unauthorized');
  if (!isValidUuid(id)) return jsonError(400, 'invalid_id', 'Invalid publication ID');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json', 'Invalid JSON body');
  }
  const parsed = facebookRetrySchema.safeParse(body);
  if (!parsed.success) return jsonError(400, 'invalid_request', parsed.error.issues[0].message);

  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'social/facebook-publish', 20, 3600);
  if (!rateLimit.allowed) return rateLimitErrorResponse(rateLimit);

  const publication = await getSocialPublication(supabase, user.id, id);
  if (!publication) return jsonError(404, 'not_found', 'Publication not found');

  const connection = publication.connection_id ? await getSocialConnection(supabase, user.id, publication.connection_id) : null;
  if (!connection || connection.external_account_id !== publication.external_account_id) {
    return jsonError(409, 'no_page_connected', 'The Facebook Page of this publication is no longer connected. Reconnect it, then try again.');
  }
  if (connection.status === 'expired' || connection.status === 'revoked') {
    return jsonError(409, `connection_${connection.status}`, CONNECTION_UNUSABLE_MESSAGES[connection.status]);
  }

  const graph = createFacebookGraph();
  if (!graph) return jsonError(503, 'meta_not_configured', META_NOT_CONFIGURED_MESSAGE);
  const admin = socialAdminClient();
  const pageToken = await loadPageToken(admin, connection);
  if (!pageToken) return jsonError(409, 'connection_expired', CONNECTION_UNUSABLE_MESSAGES.expired);

  try {
    const deps = { graph, store: supabasePublicationStore(supabase, user.id) };
    const outcome = step === 'comment' ? await retryFacebookComment(publication, pageToken, deps) : await retryFacebookPost(publication, pageToken, deps);
    await recordConnectionError(admin, connection, outcome.error);
    return NextResponse.json<ApiResponse<{ publication: PublicationResponse; warning: string | null }>>({
      data: { publication: publicationResponse(outcome.publication), warning: outcome.error?.message ?? null },
      error: null,
    });
  } catch (err) {
    if (err instanceof PublishConflictError) return jsonError(err.status, err.code, err.message);
    console.error(`[facebook] retry ${step} failed:`, err instanceof Error ? err.name : 'unknown error');
    return jsonError(500, 'publish_failed', 'The retry could not be completed. Please try again.');
  }
}
