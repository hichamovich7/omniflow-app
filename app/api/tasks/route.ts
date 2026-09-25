import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createTaskSchema } from '@/lib/validations/tasks';
import { TaskError, createTask, listTasks, taskErrorStatus } from '@/lib/queries/tasks';
import type { ApiResponse } from '@/types/api';
import type { Task } from '@/types/tasks';

export async function GET() {
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

  const tasks = await listTasks(supabase, user.id);
  return NextResponse.json<ApiResponse<{ tasks: Task[] }>>({ data: { tasks }, error: null });
}

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

  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  try {
    const task = await createTask(supabase, user.id, parsed.data);
    return NextResponse.json<ApiResponse<{ task: Task }>>({ data: { task }, error: null }, { status: 201 });
  } catch (err) {
    if (err instanceof TaskError) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: err.message, code: err.code } },
        { status: taskErrorStatus(err) }
      );
    }
    console.error('POST /api/tasks — Supabase error:', err);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to create task', code: 'server_error' } },
      { status: 500 }
    );
  }
}
