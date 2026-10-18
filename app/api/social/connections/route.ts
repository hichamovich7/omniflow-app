import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listSocialConnections } from '@/lib/queries/social-connections';
import type { SocialConnection } from '@/lib/social/facebook-publication';
import { jsonError } from '@/lib/social/facebook-server';
import type { ApiResponse } from '@/types/api';

/**
 * The caller's connected Facebook Pages (TASK-068): Page name and id, status,
 * granted permissions. Safe columns only — the access token is never
 * selected (the session's role cannot even read that column).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, 'unauthorized', 'Unauthorized');

  const { connections, unavailable } = await listSocialConnections(supabase, user.id);
  if (unavailable) return jsonError(503, 'migration_required', 'Facebook connections are not available yet (database migration 046 not applied).');
  return NextResponse.json<ApiResponse<SocialConnection[]>>({ data: connections, error: null });
}
