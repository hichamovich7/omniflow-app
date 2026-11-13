import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { getSocialContentGeneration } from '@/lib/queries/social-content';
import { getSocialConnection } from '@/lib/queries/social-connections';
import { supabaseScheduleStore } from '@/lib/queries/social-publications';
import { facebookScheduleSchema } from '@/lib/validations/facebook';
import { PublishConflictError } from '@/lib/social/facebook-publish';
import { scheduleFacebookContent, ScheduleValidationError } from '@/lib/social/facebook-schedule';
import { resolveScheduleChoice } from '@/lib/social/schedule-time';
import { getMetaConfig, hasSocialTokenKey, META_COMMENT_SCOPE } from '@/lib/social/meta/config';
import {
  CONNECTION_UNUSABLE_MESSAGES,
  jsonError,
  META_NOT_CONFIGURED_MESSAGE,
  publicationResponse,
  type PublicationResponse,
} from '@/lib/social/facebook-server';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

/**
 * "Schedule" (TASK-100) — the person confirmed the Page, the date, the time
 * and the time zone. Nothing is sent to Facebook here: the publication is
 * queued (`scheduled`, UTC instant) with the exact text / image / link of
 * "Publish now", and the cron route publishes it at that time. Same checks
 * and rate limit as the publish route; no token is read.
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
  const parsed = facebookScheduleSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, 'invalid_request', parsed.error.issues[0].message);

  const when = resolveScheduleChoice(parsed.data);
  if (!when.ok) return jsonError(422, 'invalid_schedule', when.message);

  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'social/facebook-publish', 20, 3600);
  if (!rateLimit.allowed) return rateLimitErrorResponse(rateLimit);

  const generation = await getSocialContentGeneration(supabase, user.id, id);
  if (!generation || generation.platform !== 'facebook') return jsonError(404, 'not_found', 'Content not found');
  if (generation.status !== 'completed') return jsonError(422, 'not_publishable', 'Only completed content can be scheduled.');

  const connection = await getSocialConnection(supabase, user.id, parsed.data.connectionId);
  if (!connection || connection.project_id !== generation.project_id) {
    return jsonError(409, 'no_page_connected', 'Connect and select a Facebook Page for this project before scheduling.');
  }
  if (connection.status === 'expired' || connection.status === 'revoked') {
    return jsonError(409, `connection_${connection.status}`, CONNECTION_UNUSABLE_MESSAGES[connection.status]);
  }
  if (generation.link_placement === 'first_comment' && generation.cta_url && !connection.granted_scopes.includes(META_COMMENT_SCOPE)) {
    return jsonError(409, 'comment_not_allowed', 'The first-comment permission was not granted for this Page. Reconnect it, or choose another link option.');
  }
  if (!getMetaConfig() || !hasSocialTokenKey()) return jsonError(503, 'meta_not_configured', META_NOT_CONFIGURED_MESSAGE);

  try {
    const publication = await scheduleFacebookContent(
      { generation, connection, scheduledAt: when.instant, timeZone: parsed.data.timeZone },
      { store: supabaseScheduleStore(supabase, user.id) }
    );
    return NextResponse.json<ApiResponse<{ publication: PublicationResponse; warning: string | null }>>({
      data: { publication: publicationResponse(publication), warning: null },
      error: null,
    });
  } catch (err) {
    if (err instanceof PublishConflictError) return jsonError(err.status, err.code, err.message);
    if (err instanceof ScheduleValidationError) return jsonError(err.status, err.code, err.message);
    console.error('[facebook] schedule failed:', err instanceof Error ? err.name : 'unknown error');
    return jsonError(500, 'schedule_failed', 'The post could not be scheduled. Please try again.');
  }
}
