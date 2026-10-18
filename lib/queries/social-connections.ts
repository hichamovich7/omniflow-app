import type { SupabaseClient } from '@supabase/supabase-js';
import type { SocialConnection, SocialConnectionStatus } from '@/lib/social/facebook-publication';

/**
 * social_connections (migration 046, TASK-068).
 *
 * Two kinds of functions:
 * - With the caller's own session (`supabase`): safe columns only — the
 *   `authenticated` role cannot even read encrypted_access_token (column
 *   privileges), RLS limits rows to the caller, and every query also
 *   filters on user_id (defense in depth).
 * - With the service-role client (`admin`, lib/supabase/admin.ts): the only
 *   writes, and the only read of the encrypted token. Routes call them only
 *   after checking ownership with the caller's session, and each one still
 *   filters on the connection / project AND the owner, so a wrong id can
 *   never reach another user's row.
 * The decrypted token never leaves the server: it is not returned by any
 * API response and never logged.
 */

export const SAFE_CONNECTION_COLUMNS =
  'id, user_id, project_id, platform, account_type, external_account_id, external_account_name, token_expires_at, granted_scopes, status, last_verified_at, last_error_code, created_at, updated_at';

const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01']);

export async function listSocialConnections(
  supabase: SupabaseClient,
  userId: string
): Promise<{ connections: SocialConnection[]; unavailable: boolean }> {
  const { data, error } = await supabase
    .from('social_connections')
    .select(SAFE_CONNECTION_COLUMNS)
    .eq('user_id', userId)
    .eq('platform', 'facebook');
  if (error) return { connections: [], unavailable: MISSING_TABLE_CODES.has((error as { code?: string }).code ?? '') };
  return { connections: (data ?? []) as unknown as SocialConnection[], unavailable: false };
}

export async function getSocialConnection(supabase: SupabaseClient, userId: string, id: string): Promise<SocialConnection | null> {
  const { data } = await supabase
    .from('social_connections')
    .select(SAFE_CONNECTION_COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as unknown as SocialConnection | null) ?? null;
}

export async function getProjectFacebookConnection(
  supabase: SupabaseClient,
  userId: string,
  projectId: string
): Promise<SocialConnection | null> {
  const { data } = await supabase
    .from('social_connections')
    .select(SAFE_CONNECTION_COLUMNS)
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('platform', 'facebook')
    .maybeSingle();
  return (data as unknown as SocialConnection | null) ?? null;
}

/** Disconnect: deletes the row (and the encrypted token with it). Publications keep their history (connection_id SET NULL). */
export async function deleteSocialConnection(supabase: SupabaseClient, userId: string, id: string): Promise<'deleted' | 'not_found' | 'error'> {
  const { data, error } = await supabase.from('social_connections').delete().eq('id', id).eq('user_id', userId).select('id');
  if (error) return 'error';
  return (data ?? []).length > 0 ? 'deleted' : 'not_found';
}

// ---------------------------------------------------------------------------
// Service-role functions — server only, after the ownership check

export interface SaveFacebookPageInput {
  userId: string;
  projectId: string;
  pageId: string;
  pageName: string;
  encryptedToken: string;
  grantedScopes: string[];
  now: Date;
}

/** One Page per project: connecting again replaces the previous Page and token. */
export async function saveFacebookPageConnection(admin: SupabaseClient, input: SaveFacebookPageInput): Promise<SocialConnection | null> {
  const { data, error } = await admin
    .from('social_connections')
    .upsert(
      {
        user_id: input.userId,
        project_id: input.projectId,
        platform: 'facebook',
        account_type: 'facebook_page',
        external_account_id: input.pageId,
        external_account_name: input.pageName,
        encrypted_access_token: input.encryptedToken,
        token_expires_at: null,
        granted_scopes: input.grantedScopes,
        status: 'active',
        last_verified_at: input.now.toISOString(),
        last_error_code: null,
      },
      { onConflict: 'project_id,platform' }
    )
    .select(SAFE_CONNECTION_COLUMNS)
    .single();
  if (error || !data) {
    console.error(`[facebook] connection save failed: ${(error as { code?: string } | null)?.code ?? 'no row returned'}`);
    return null;
  }
  const row = data as unknown as SocialConnection;
  // The upsert key is the project; a project of another user can never be written (checked before, re-checked here).
  return row.user_id === input.userId ? row : null;
}

/** The encrypted Page token of the caller's own connection — null when not found. */
export async function readEncryptedConnectionToken(admin: SupabaseClient, input: { connectionId: string; userId: string }): Promise<string | null> {
  const { data, error } = await admin
    .from('social_connections')
    .select('encrypted_access_token')
    .eq('id', input.connectionId)
    .eq('user_id', input.userId)
    .maybeSingle();
  if (error || !data) return null;
  const value = (data as { encrypted_access_token: string | null }).encrypted_access_token;
  return value || null;
}

export async function updateConnectionStatus(
  admin: SupabaseClient,
  input: { connectionId: string; userId: string; status: SocialConnectionStatus; errorCode: string | null; verifiedAt?: Date }
): Promise<void> {
  const patch: Record<string, unknown> = { status: input.status, last_error_code: input.errorCode };
  if (input.verifiedAt) patch.last_verified_at = input.verifiedAt.toISOString();
  const { error } = await admin.from('social_connections').update(patch).eq('id', input.connectionId).eq('user_id', input.userId);
  if (error) console.error(`[facebook] connection status update failed: ${(error as { code?: string }).code ?? 'unknown'}`);
}
