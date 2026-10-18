import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client — bypasses RLS entirely. Reserved for:
 * - app/api/admin/bypass-emails/route.ts, which re-verifies the caller's
 *   session email against ADMIN_EMAIL before ever calling this;
 * - social_connections token reads / writes (TASK-068, through
 *   lib/social/facebook-server.ts → lib/queries/social-connections.ts),
 *   only after the route checked the caller's ownership with their own
 *   session, and always filtered on the owner's user_id.
 * Never import this into a route that doesn't perform one of those checks first.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
