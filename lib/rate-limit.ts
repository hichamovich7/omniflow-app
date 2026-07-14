import { createClient } from '@/lib/supabase/server';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export async function checkRateLimit(
  userId: string,
  userEmail: string,
  endpoint: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  // Admin short-circuit: compared against the server-only env var, never a
  // client-supplied value — userEmail always comes from the caller's verified
  // supabase.auth.getUser() session (see call sites in the API routes).
  if (userEmail && userEmail === process.env.ADMIN_EMAIL) {
    return { allowed: true, remaining: limit };
  }

  const supabase = await createClient();

  // is_rate_limit_bypassed() is self-referential (reads auth.jwt() ->> 'email'
  // server-side) — it answers only for the caller's own session, so passing
  // userEmail here would be redundant and can't be used to check anyone else.
  const { data: bypassed, error: bypassError } = await supabase.rpc('is_rate_limit_bypassed');

  if (bypassError) {
    console.error(`Rate limit bypass check failed for ${endpoint}:`, bypassError);
  } else if (bypassed) {
    return { allowed: true, remaining: limit };
  }

  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  const { data, error } = await supabase.rpc('increment_rate_limit', {
    p_user_id: userId,
    p_endpoint: endpoint,
    p_window_start: windowStart.toISOString(),
  });

  if (error) {
    // Fail open: a rate-limit infra hiccup shouldn't take down generation/research
    // endpoints. The abuse case this guards against is sustained overuse, not a
    // single bypassed request.
    console.error(`Rate limit check failed for ${endpoint}:`, error);
    return { allowed: true, remaining: limit };
  }

  const count = data as number;

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
  };
}
