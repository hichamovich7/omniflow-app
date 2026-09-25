import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updateTaskSchema } from '@/lib/validations/tasks';
import { TaskError, taskErrorStatus, updateTask } from '@/lib/queries/tasks';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';
import type { Task } from '@/types/tasks';

/**
 * Edit a task, change its status, or pin/unpin it. "Delete" is the soft
 * `status: 'cancelled'` (§11 §5) — there is no DELETE handler on purpose.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
      { data: null, error: { message: 'Invalid task ID', code: 'invalid_id' } },
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

  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  try {
    const task = await updateTask(supabase, user.id, id, parsed.data);
    return NextResponse.json<ApiResponse<{ task: Task }>>({ data: { task }, error: null });
  } catch (err) {
    if (err instanceof TaskError) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: err.message, code: err.code } },
        { status: taskErrorStatus(err) }
      );
    }
    console.error('PATCH /api/tasks/[id] — Supabase error:', err);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to update task', code: 'server_error' } },
      { status: 500 }
    );
  }
}
