import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { archiveContentStream } from '@/lib/queries/content-streams';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
      { data: null, error: { message: 'Invalid content stream ID', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  const { data: existingStream } = await supabase.from('content_streams').select('id, user_id').eq('id', id).single();

  if (!existingStream) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Content stream not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  if (existingStream.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this content stream', code: 'forbidden' } },
      { status: 403 }
    );
  }

  try {
    const archived = await archiveContentStream(supabase, user.id, id);
    return NextResponse.json<ApiResponse<{ contentStream: typeof archived }>>({ data: { contentStream: archived }, error: null });
  } catch (err) {
    console.error('POST /api/content-streams/[id]/archive — Supabase error:', err);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to archive content stream', code: 'server_error' } },
      { status: 500 }
    );
  }
}
