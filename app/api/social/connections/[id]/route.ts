import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { deleteSocialConnection } from '@/lib/queries/social-connections';
import { jsonError } from '@/lib/social/facebook-server';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

/**
 * "Disconnect Page" (TASK-068): deletes the connection and its encrypted
 * token. Posts already on Facebook stay there and keep their publication
 * record. To remove OmniFlow's access on Facebook's side too, the person can
 * also remove the app in their Facebook settings (explained in the UI).
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, 'unauthorized', 'Unauthorized');

  const { id } = await params;
  if (!isValidUuid(id)) return jsonError(400, 'invalid_id', 'Invalid connection ID');

  const outcome = await deleteSocialConnection(supabase, user.id, id);
  if (outcome === 'not_found') return jsonError(404, 'not_found', 'Connection not found');
  if (outcome === 'error') return jsonError(500, 'delete_failed', 'The Page could not be disconnected. Please try again.');
  return NextResponse.json<ApiResponse<{ id: string }>>({ data: { id }, error: null });
}
