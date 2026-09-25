import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { weeklyReviewActionSchema } from '@/lib/validations/tasks';
import { ensureWeeklyReviewRoutine, getWeeklyReviewRoutine, setWeeklyReviewOccurrence } from '@/lib/queries/tasks';
import { parseLocalDayKey } from '@/lib/dashboard/local-date';
import type { ApiResponse } from '@/types/api';
import type { Task, TaskOccurrence } from '@/types/tasks';

/**
 * Sunday analytics review routine.
 * - start:    creates the recurring `weekly_review` task if it doesn't exist yet (idempotent).
 * - complete: marks one Sunday's occurrence completed (row written lazily, §9).
 * - reopen:   sets that occurrence back to pending.
 * Completing or reopening one Sunday never touches the routine itself (§8).
 */
export async function POST(request: Request) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid JSON body', code: 'invalid_json' } },
      { status: 400 }
    );
  }

  const parsed = weeklyReviewActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { action, occurrenceDate } = parsed.data;

  if (action !== 'start' && (!occurrenceDate || parseLocalDayKey(occurrenceDate).getDay() !== 0)) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'occurrenceDate must be a Sunday', code: 'invalid_request' } },
      { status: 400 }
    );
  }

  try {
    const routine =
      action === 'reopen' ? await getWeeklyReviewRoutine(supabase, user.id) : await ensureWeeklyReviewRoutine(supabase, user.id);

    if (!routine) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: 'Weekly review routine not found', code: 'not_found' } },
        { status: 404 }
      );
    }

    let occurrence: TaskOccurrence | null = null;
    if (action !== 'start' && occurrenceDate) {
      occurrence = await setWeeklyReviewOccurrence(
        supabase,
        user.id,
        routine.id,
        occurrenceDate,
        action === 'complete' ? 'completed' : 'pending'
      );
    }

    return NextResponse.json<ApiResponse<{ routine: Task; occurrence: TaskOccurrence | null }>>({
      data: { routine, occurrence },
      error: null,
    });
  } catch (err) {
    console.error('POST /api/tasks/weekly-review — Supabase error:', err);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to update the weekly review', code: 'server_error' } },
      { status: 500 }
    );
  }
}
