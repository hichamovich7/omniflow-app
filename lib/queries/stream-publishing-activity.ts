import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublishingActivitySource, StreamPublishingActivity } from '@/types/content-streams';
import type { UpsertPublishingActivityInput } from '@/lib/validations/content-streams';
import type { ExternalActivityInput } from '@/lib/dashboard/build-content-coverage';
import { toLocalDayKey } from '@/lib/dashboard/local-date';

/**
 * Manual / external publishing activity per content stream and local day
 * (migration 035, TASK-FIX-043). Writes only ever touch
 * content_stream_publishing_activity — never `pins`, so publish dates,
 * Created / Planned counters and Pinterest statistics stay untouched.
 */

export type PublishingActivityErrorCode = 'not_found' | 'forbidden' | 'future_date';

export class PublishingActivityError extends Error {
  constructor(
    public code: PublishingActivityErrorCode,
    message: string
  ) {
    super(message);
  }
}

export function publishingActivityErrorStatus(err: PublishingActivityError): number {
  switch (err.code) {
    case 'not_found':
      return 404;
    case 'forbidden':
      return 403;
    default:
      return 400;
  }
}

/**
 * Activity can only be recorded for today or a past day (runtime-local
 * calendar, same convention as the coverage grid): future days are covered
 * by OmniFlow's planned Pins, never by a manual count.
 */
export function isRecordableActivityDate(activityDate: string, now: Date): boolean {
  return activityDate <= toLocalDayKey(now);
}

/** Pure ownership decision, mirrored by the table's RLS WITH CHECK. */
export function assertStreamOwnedBy(stream: { user_id: string } | null | undefined, userId: string): void {
  if (!stream) throw new PublishingActivityError('not_found', 'Content stream not found');
  if (stream.user_id !== userId) {
    throw new PublishingActivityError('forbidden', 'You do not have access to this content stream');
  }
}

/** Row written for one stream + day. user_id always comes from the session, never from the body. */
export function buildPublishingActivityRow(userId: string, contentStreamId: string, input: UpsertPublishingActivityInput) {
  return {
    user_id: userId,
    content_stream_id: contentStreamId,
    activity_date: input.activityDate,
    published_count: input.publishedCount,
    note: input.note,
    source: input.source,
  };
}

/** One row per (user, stream, day): saving again updates it instead of creating a duplicate. */
export const PUBLISHING_ACTIVITY_CONFLICT_TARGET = 'user_id,content_stream_id,activity_date';

export async function upsertPublishingActivity(
  supabase: SupabaseClient,
  userId: string,
  contentStreamId: string,
  input: UpsertPublishingActivityInput,
  now: Date
): Promise<StreamPublishingActivity> {
  const { data: stream } = await supabase.from('content_streams').select('id, user_id').eq('id', contentStreamId).maybeSingle();
  assertStreamOwnedBy(stream, userId);

  if (!isRecordableActivityDate(input.activityDate, now)) {
    throw new PublishingActivityError('future_date', 'Future days use the Pins planned in OmniFlow. Record activity for today or earlier.');
  }

  const { data, error } = await supabase
    .from('content_stream_publishing_activity')
    .upsert(buildPublishingActivityRow(userId, contentStreamId, input), { onConflict: PUBLISHING_ACTIVITY_CONFLICT_TARGET })
    .select()
    .single();

  if (error) throw error;
  return data as StreamPublishingActivity;
}

/** Activity rows on or after `fromDayKey`, scoped to the caller by RLS. */
export async function listPublishingActivityFrom(supabase: SupabaseClient, fromDayKey: string): Promise<ExternalActivityInput[]> {
  const { data, error } = await supabase
    .from('content_stream_publishing_activity')
    .select('content_stream_id, activity_date, published_count, note, source')
    .gte('activity_date', fromDayKey);

  if (error) console.error('Command Center — publishing activity read failed (is migration 035 applied?):', error);

  return (data ?? []).map((row) => ({
    streamId: row.content_stream_id as string,
    activityDate: row.activity_date as string,
    publishedCount: row.published_count as number,
    note: (row.note as string | null) ?? null,
    source: row.source as PublishingActivitySource,
  }));
}
