import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { pinterestAccountRow, updatePinterestAccountSchema } from '@/lib/validations/pinterest-accounts';
import { isValidUuid } from '@/lib/utils/uuid';
import type { PinterestAccount } from '@/types/pinterest-accounts';
import type { ApiResponse } from '@/types/api';

function fail(message: string, code: string, status: number) {
  return NextResponse.json<ApiResponse<null>>({ data: null, error: { message, code } }, { status });
}

/**
 * TASK-091: edit a Pinterest account, or archive it (`status: "archived"`).
 * Accounts are never deleted from the app: archiving keeps its boards,
 * streams and Pins untouched and only stops offering it for new Pins.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return fail('Unauthorized', 'unauthorized', 401);

  const { id } = await params;
  if (!isValidUuid(id)) return fail('Invalid Pinterest account ID', 'invalid_id', 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 'invalid_json', 400);
  }

  const parsed = updatePinterestAccountSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0].message, 'invalid_request', 400);

  const { data: existing } = await supabase.from('pinterest_accounts').select('id, user_id').eq('id', id).single();
  if (!existing) return fail('Pinterest account not found', 'not_found', 404);
  if (existing.user_id !== user.id) return fail('You do not have access to this Pinterest account', 'forbidden', 403);

  const row = pinterestAccountRow(parsed.data);
  if (Object.keys(row).length === 0) return fail('Nothing to update', 'invalid_request', 400);

  const { data: account, error } = await supabase
    .from('pinterest_accounts')
    .update(row)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error('PATCH /api/pinterest-accounts/[id] — Supabase error:', error);
    return error.code === '23505'
      ? fail('A Pinterest account with this name already exists in this project', 'duplicate_name', 409)
      : fail('Failed to update Pinterest account', 'server_error', 500);
  }

  return NextResponse.json<ApiResponse<{ account: PinterestAccount }>>({ data: { account: account as PinterestAccount }, error: null });
}
