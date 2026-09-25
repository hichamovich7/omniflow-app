import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { upsertPublishingActivitySchema } from '@/lib/validations/content-streams';
import {
  PublishingActivityError,
  publishingActivityErrorStatus,
  upsertPublishingActivity,
} from '@/lib/queries/stream-publishing-activity';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';
import type { StreamPublishingActivity } from '@/types/content-streams';

/**
 * Records (or updates) how many Pins were published outside OmniFlow for
 * this content stream on one day. Upsert: one row per stream and day.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Unauthorized', code: 'unauthorized' } },
      { status: 401 }
    );
  }

  const { id } = await params;

  if (!isValidUuid(id)) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid content stream ID', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid JSON body', code: 'invalid_json' } },
      { status: 400 }
    );
  }

  const parsed = upsertPublishingActivitySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  try {
    const activity = await upsertPublishingActivity(supabase, user.id, id, parsed.data, new Date());
    return NextResponse.json<ApiResponse<{ activity: StreamPublishingActivity }>>({ data: { activity }, error: null });
  } catch (err) {
    if (err instanceof PublishingActivityError) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: err.message, code: err.code } },
        { status: publishingActivityErrorStatus(err) }
      );
    }
    console.error('PUT /api/content-streams/[id]/publishing-activity — Supabase error:', err);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to save publishing activity', code: 'server_error' } },
      { status: 500 }
    );
  }
}
