import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { deleteSocialContentGeneration } from '@/lib/queries/social-content';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

/**
 * Deletes one saved social content item (Medium history, TASK-063). Only the
 * caller's own row (user_id filter + RLS); its source article, WordPress post
 * or Pins are never touched. The UI asks for confirmation first.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
      { data: null, error: { message: 'Invalid content ID', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  const outcome = await deleteSocialContentGeneration(supabase, user.id, id);
  if (outcome === 'not_found') {
    // Same answer for "does not exist" and "belongs to someone else".
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Content not found', code: 'not_found' } },
      { status: 404 }
    );
  }
  if (outcome === 'error') {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'The content could not be deleted. Please try again.', code: 'delete_failed' } },
      { status: 500 }
    );
  }
  return NextResponse.json<ApiResponse<{ id: string }>>({ data: { id }, error: null });
}
