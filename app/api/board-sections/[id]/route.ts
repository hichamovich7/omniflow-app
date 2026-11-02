import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updateBoardSectionSchema } from '@/lib/validations/pinterest-accounts';
import { isValidUuid } from '@/lib/utils/uuid';
import type { PinterestBoardSection } from '@/types/pinterest-accounts';
import type { ApiResponse } from '@/types/api';

function fail(message: string, code: string, status: number) {
  return NextResponse.json<ApiResponse<null>>({ data: null, error: { message, code } }, { status });
}

/**
 * TASK-091: rename a section, change its external id, or (de)activate it.
 * Pins keep the section name they were generated with (pins.board_section).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return fail('Unauthorized', 'unauthorized', 401);

  const { id } = await params;
  if (!isValidUuid(id)) return fail('Invalid section ID', 'invalid_id', 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 'invalid_json', 400);
  }

  const parsed = updateBoardSectionSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0].message, 'invalid_request', 400);

  const { data: existing } = await supabase.from('pinterest_board_sections').select('id, user_id').eq('id', id).single();
  if (!existing) return fail('Section not found', 'not_found', 404);
  if (existing.user_id !== user.id) return fail('You do not have access to this section', 'forbidden', 403);

  const row: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) row.name = parsed.data.name;
  if (parsed.data.externalId !== undefined) row.external_id = parsed.data.externalId;
  if (parsed.data.isActive !== undefined) row.is_active = parsed.data.isActive;
  if (Object.keys(row).length === 0) return fail('Nothing to update', 'invalid_request', 400);

  const { data: section, error } = await supabase
    .from('pinterest_board_sections')
    .update(row)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error('PATCH /api/board-sections/[id] — Supabase error:', error);
    return error.code === '23505'
      ? fail('This board already has a section with this name', 'duplicate_name', 409)
      : fail('Failed to update section', 'server_error', 500);
  }

  return NextResponse.json<ApiResponse<{ section: PinterestBoardSection }>>({
    data: { section: section as PinterestBoardSection },
    error: null,
  });
}

/**
 * TASK-094: delete a section. Stream destinations on it are removed with it
 * (ON DELETE CASCADE); Pins keep their section name (pins.board_section) and
 * only lose the link (pinterest_section_id SET NULL). A stream left without
 * a primary uses its first active destination, as everywhere else.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return fail('Unauthorized', 'unauthorized', 401);

  const { id } = await params;
  if (!isValidUuid(id)) return fail('Invalid section ID', 'invalid_id', 400);

  const { data: existing } = await supabase.from('pinterest_board_sections').select('id, user_id').eq('id', id).single();
  if (!existing) return fail('Section not found', 'not_found', 404);
  if (existing.user_id !== user.id) return fail('You do not have access to this section', 'forbidden', 403);

  const { error } = await supabase.from('pinterest_board_sections').delete().eq('id', id).eq('user_id', user.id);
  if (error) {
    console.error('DELETE /api/board-sections/[id] — Supabase error:', error);
    return fail('Failed to delete section', 'server_error', 500);
  }

  return NextResponse.json<ApiResponse<{ success: boolean }>>({ data: { success: true }, error: null });
}
