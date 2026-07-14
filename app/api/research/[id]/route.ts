import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
      { data: null, error: { message: 'Invalid research result ID', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  const { data: existingResult } = await supabase
    .from('research_results')
    .select('id, user_id')
    .eq('id', id)
    .single();

  if (!existingResult) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Research result not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  if (existingResult.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this research result', code: 'forbidden' } },
      { status: 403 }
    );
  }

  const { error: dbError } = await supabase
    .from('research_results')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (dbError) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to delete research result', code: 'server_error' } },
      { status: 500 }
    );
  }

  return NextResponse.json<ApiResponse<{ success: boolean }>>(
    { data: { success: true }, error: null }
  );
}
