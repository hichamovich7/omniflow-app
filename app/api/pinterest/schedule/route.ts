import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  scheduleSchema,
  clearScheduleSchema,
  calculateDaySchedule,
  calculateHourSchedule,
} from '@/lib/validations/schedule';
import type { ApiResponse } from '@/types/api';

export async function PATCH(request: Request) {
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

  const body = await request.json();

  const clearParsed = clearScheduleSchema.safeParse(body);
  if (clearParsed.success) {
    const { generationId } = clearParsed.data;

    const { data: generation } = await supabase
      .from('generations')
      .select('id')
      .eq('id', generationId)
      .single();

    if (!generation) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: 'Generation not found', code: 'not_found' } },
        { status: 404 }
      );
    }

    const { data: pins } = await supabase
      .from('pins')
      .select('id')
      .eq('generation_id', generationId);

    for (const pin of pins ?? []) {
      await supabase.from('pins').update({ publish_date: null }).eq('id', pin.id);
    }

    return NextResponse.json<ApiResponse<{ pinsCleared: number }>>(
      { data: { pinsCleared: (pins ?? []).length }, error: null }
    );
  }

  const parsed = scheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { generationId, startDate, startTime } = parsed.data;

  const startDateTime = new Date(`${startDate}T${startTime}`);
  if (startDateTime <= new Date()) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Start date must be in the future', code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { data: generation } = await supabase
    .from('generations')
    .select('id')
    .eq('id', generationId)
    .single();

  if (!generation) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Generation not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  const { data: pins } = await supabase
    .from('pins')
    .select('id')
    .eq('generation_id', generationId)
    .order('created_at', { ascending: true });

  const pinList = pins ?? [];

  if (pinList.length === 0) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'No pins to schedule', code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const dates =
    parsed.data.mode === 'hours'
      ? calculateHourSchedule(pinList.length, startDate, startTime, parsed.data.intervalMinutes)
      : calculateDaySchedule(pinList.length, startDate, startTime, parsed.data.frequency);

  for (let i = 0; i < pinList.length; i++) {
    await supabase
      .from('pins')
      .update({ publish_date: dates[i].toISOString() })
      .eq('id', pinList[i].id);
  }

  return NextResponse.json<ApiResponse<{ pinsScheduled: number }>>(
    { data: { pinsScheduled: pinList.length }, error: null }
  );
}
