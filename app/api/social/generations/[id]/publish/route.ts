import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { getSocialContentGeneration } from '@/lib/queries/social-content';
import { getSocialConnection } from '@/lib/queries/social-connections';
import { supabasePublicationStore } from '@/lib/queries/social-publications';
import { facebookPublishSchema } from '@/lib/validations/facebook';
import { publishFacebookContent, PublishConflictError } from '@/lib/social/facebook-publish';
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

// Post + permalink + comment, each Graph call ≤ 15 s.
export const maxDuration = 60;

/**
 * "Publish to Facebook" (TASK-068) — manual, confirmed by the user, on the
 * Facebook Page connected to the content's project. Publishes the post, saves
 * its id, then (link in first comment) the comment. Never twice on the same
 * Page: an existing publication is refused, or retried without duplicate.
 * Separate rate limit (no AI cost, no trial cap). The WordPress article is
 * never touched.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, 'unauthorized', 'Unauthorized');

  const { id } = await params;
  if (!isValidUuid(id)) return jsonError(400, 'invalid_id', 'Invalid content ID');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_json', 'Invalid JSON body');
  }
  const parsed = facebookPublishSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, 'invalid_request', parsed.error.issues[0].message);

  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'social/facebook-publish', 20, 3600);
  if (!rateLimit.allowed) return rateLimitErrorResponse(rateLimit);

  const generation = await getSocialContentGeneration(supabase, user.id, id);
  if (!generation || generation.platform !== 'facebook') return jsonError(404, 'not_found', 'Content not found');
  if (generation.status !== 'completed') return jsonError(422, 'not_publishable', 'Only completed content can be published.');

  const connection = await getSocialConnection(supabase, user.id, parsed.data.connectionId);
  if (!connection || connection.project_id !== generation.project_id) {
    return jsonError(409, 'no_page_connected', 'Connect and select a Facebook Page for this project before publishing.');
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
    const outcome = await publishFacebookContent(
      { generation, connection, pageToken },
      { graph, store: supabasePublicationStore(supabase, user.id) }
    );
    await recordConnectionError(admin, connection, outcome.error);
    return NextResponse.json<ApiResponse<{ publication: PublicationResponse; warning: string | null }>>({
      data: { publication: publicationResponse(outcome.publication), warning: outcome.error?.message ?? null },
      error: null,
    });
  } catch (err) {
    if (err instanceof PublishConflictError) return jsonError(err.status, err.code, err.message);
    console.error('[facebook] publish failed:', err instanceof Error ? err.name : 'unknown error');
    return jsonError(500, 'publish_failed', 'The post could not be published. Please try again.');
  }
}
