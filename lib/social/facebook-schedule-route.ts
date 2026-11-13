import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { getSocialConnection } from '@/lib/queries/social-connections';
import { getSocialPublication, supabaseScheduleStore } from '@/lib/queries/social-publications';
import { facebookCancelScheduleSchema, facebookRescheduleSchema } from '@/lib/validations/facebook';
import { PublishConflictError } from '@/lib/social/facebook-publish';
import {
  cancelFacebookSchedule,
  rescheduleFacebookPublication,
  SCHEDULE_ERROR_MESSAGES,
  scheduledConnectionProblem,
  ScheduleValidationError,
} from '@/lib/social/facebook-schedule';
import { resolveScheduleChoice } from '@/lib/social/schedule-time';
import { jsonError, publicationResponse, type PublicationResponse } from '@/lib/social/facebook-server';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

/**
 * Shared handler of PATCH /api/social/publications/[id]/schedule
 * (reschedule) and POST /api/social/publications/[id]/cancel — TASK-100.
 * The caller's own session (RLS + user_id filter); conditional updates on
 * `scheduled`, so a post already claimed by the cron cannot be changed.
 * Cancel never needs the Page; reschedule refuses a Page that is no longer
 * the one chosen (never moved to another Page).
 */
export async function handleFacebookScheduleChange(request: Request, id: string, action: 'reschedule' | 'cancel') {
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

  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'social/facebook-publish', 20, 3600);
  if (!rateLimit.allowed) return rateLimitErrorResponse(rateLimit);

  const publication = await getSocialPublication(supabase, user.id, id);
  if (!publication) return jsonError(404, 'not_found', 'Publication not found');
  const store = supabaseScheduleStore(supabase, user.id);

  try {
    let updated;
    if (action === 'cancel') {
      const parsed = facebookCancelScheduleSchema.safeParse(body);
      if (!parsed.success) return jsonError(400, 'invalid_request', parsed.error.issues[0].message);
      updated = await cancelFacebookSchedule(publication, { store });
    } else {
      const parsed = facebookRescheduleSchema.safeParse(body);
      if (!parsed.success) return jsonError(400, 'invalid_request', parsed.error.issues[0].message);
      const when = resolveScheduleChoice(parsed.data);
      if (!when.ok) return jsonError(422, 'invalid_schedule', when.message);
      const connection = publication.connection_id ? await getSocialConnection(supabase, user.id, publication.connection_id) : null;
      const problem = scheduledConnectionProblem(publication, connection);
      if (problem) return jsonError(409, problem, SCHEDULE_ERROR_MESSAGES[problem]);
      updated = await rescheduleFacebookPublication(publication, { scheduledAt: when.instant, timeZone: parsed.data.timeZone }, { store });
    }
    return NextResponse.json<ApiResponse<{ publication: PublicationResponse; warning: string | null }>>({
      data: { publication: publicationResponse(updated), warning: null },
      error: null,
    });
  } catch (err) {
    if (err instanceof PublishConflictError) return jsonError(err.status, err.code, err.message);
    if (err instanceof ScheduleValidationError) return jsonError(err.status, err.code, err.message);
    console.error(`[facebook] ${action} failed:`, err instanceof Error ? err.name : 'unknown error');
    return jsonError(500, `${action}_failed`, action === 'cancel' ? 'The schedule could not be cancelled. Please try again.' : 'The post could not be rescheduled. Please try again.');
  }
}
