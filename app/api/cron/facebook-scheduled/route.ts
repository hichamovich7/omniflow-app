import { NextResponse } from 'next/server';
import { getSocialConnection } from '@/lib/queries/social-connections';
import { listDueScheduledPublications, supabasePublicationStore, supabaseScheduleStore } from '@/lib/queries/social-publications';
import { runDueFacebookSchedules } from '@/lib/social/facebook-schedule';
import { isAuthorizedCronRequest } from '@/lib/social/cron-auth';
import { createFacebookGraph, loadPageToken, recordConnectionError, socialAdminClient } from '@/lib/social/facebook-server';

// Up to 5 due posts in parallel; each: post + permalink + comment, every Graph call ≤ 15 s.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Facebook scheduling queue (TASK-100) — called every minute by Vercel Cron
 * (vercel.json). Not a user route: no session; the proxy lets /api/cron/
 * through and this route requires CRON_SECRET. Uses the service-role client,
 * and every read / write of a row is filtered by that row's own user_id. The
 * response and the logs carry counts only — never a token, text or Page id.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json({ data: null, error: { message: 'Scheduling is not configured.', code: 'cron_not_configured' } }, { status: 503 });
  }
  if (!isAuthorizedCronRequest(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ data: null, error: { message: 'Unauthorized', code: 'unauthorized' } }, { status: 401 });
  }

  const admin = socialAdminClient();
  const results = await runDueFacebookSchedules({
    listDue: (now, limit) => listDueScheduledPublications(admin, now, limit),
    storesFor: (userId) => ({ publications: supabasePublicationStore(admin, userId), schedules: supabaseScheduleStore(admin, userId) }),
    loadConnection: (publication) =>
      publication.connection_id ? getSocialConnection(admin, publication.user_id, publication.connection_id) : Promise.resolve(null),
    loadPageToken: (connection) => loadPageToken(admin, connection),
    graph: createFacebookGraph(),
    recordConnectionError: (connection, err) => recordConnectionError(admin, connection, err),
  });

  const summary = {
    due: results.length,
    ran: results.filter((r) => r.result === 'ran').length,
    blocked: results.filter((r) => r.result === 'blocked').length,
    skipped: results.filter((r) => r.result === 'skipped').length,
    errors: results.filter((r) => r.result === 'error').length,
  };
  if (summary.due > 0) console.info(`[facebook] scheduled run: ${JSON.stringify(summary)}`);
  return NextResponse.json({ data: summary, error: null });
}
