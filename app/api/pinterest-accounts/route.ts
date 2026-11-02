import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createPinterestAccountSchema, pinterestAccountRow } from '@/lib/validations/pinterest-accounts';
import type { PinterestAccount } from '@/types/pinterest-accounts';
import type { ApiResponse } from '@/types/api';

function fail(message: string, code: string, status: number) {
  return NextResponse.json<ApiResponse<null>>({ data: null, error: { message, code } }, { status });
}

/** TASK-091: create a Pinterest account (manual entry, no credential) in one of the caller's projects. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return fail('Unauthorized', 'unauthorized', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 'invalid_json', 400);
  }

  const parsed = createPinterestAccountSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0].message, 'invalid_request', 400);

  const { data: project } = await supabase.from('projects').select('id, user_id').eq('id', parsed.data.projectId).single();
  if (!project) return fail('Project not found', 'invalid_project', 400);
  if (project.user_id !== user.id) return fail('You do not have access to this project', 'forbidden', 403);

  const { data: account, error } = await supabase
    .from('pinterest_accounts')
    .insert({ project_id: parsed.data.projectId, user_id: user.id, ...pinterestAccountRow(parsed.data) })
    .select()
    .single();

  if (error) {
    console.error('POST /api/pinterest-accounts — Supabase error:', error);
    return error.code === '23505'
      ? fail('A Pinterest account with this name already exists in this project', 'duplicate_name', 409)
      : fail('Failed to create Pinterest account', 'server_error', 500);
  }

  return NextResponse.json<ApiResponse<{ account: PinterestAccount }>>(
    { data: { account: account as PinterestAccount }, error: null },
    { status: 201 }
  );
}
