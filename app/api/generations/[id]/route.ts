import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGenerationWithPins } from '@/lib/queries/generations';
import type { ApiResponse } from '@/types/api';

export async function GET(
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
  const { generation, pins } = await getGenerationWithPins(supabase, id);

  if (!generation) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Generation not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  return NextResponse.json<ApiResponse<{ generation: typeof generation; pins: typeof pins }>>(
    { data: { generation, pins }, error: null }
  );
}

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
  const { error: dbError } = await supabase.from('generations').delete().eq('id', id);

  if (dbError) {
    console.error('Failed to delete generation:', dbError);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to delete generation', code: 'server_error' } },
      { status: 500 }
    );
  }

  return NextResponse.json<ApiResponse<{ success: boolean }>>(
    { data: { success: true }, error: null }
  );
}
