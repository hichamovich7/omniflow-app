import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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

  const { error: dbError } = await supabase.from('research_results').delete().eq('id', id);

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
