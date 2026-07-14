import { createClient } from '@/lib/supabase/server';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export async function checkRateLimit(
  userId: string,
  endpoint: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const supabase = await createClient();
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
