import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client — bypasses RLS entirely. Reserved for
 * app/api/admin/bypass-emails/route.ts, which re-verifies the caller's session
 * email against ADMIN_EMAIL before ever calling this. Never import this into
 * a route that doesn't perform that check first.
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
