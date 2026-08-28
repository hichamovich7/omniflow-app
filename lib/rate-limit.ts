import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ApiResponse } from '@/types/api';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Which check rejected the request — absent when allowed. */
  reason?: 'rate_limit' | 'trial_limit';
}

export interface CheckRateLimitOptions {
  /**
   * Also enforce the lightweight lifetime trial cap (profiles.total_generations_used,
   * migration 023) on top of the existing hourly window check below. Opt-in per
   * call site — only the AI-cost-incurring generation endpoints pass this, not
   * every checkRateLimit() caller. See docs/DECISIONS.md for why this is
   * deliberately separate from the future Credits System (TASK-011/012).
   */
  enforceTrialLimit?: boolean;
}

const DEFAULT_TRIAL_GENERATION_LIMIT = 10;

/** Single source of truth for the configured trial cap — read by both the
 * enforcement check below and the dashboard's "X / Y free generations used" banner. */
export function getTrialGenerationLimit(): number {
  const parsed = Number.parseInt(process.env.TRIAL_GENERATION_LIMIT ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TRIAL_GENERATION_LIMIT;
}

export async function checkRateLimit(
  userId: string,
  userEmail: string,
  endpoint: string,
  limit: number,
  windowSeconds: number,
  options: CheckRateLimitOptions = {}
): Promise<RateLimitResult> {
  // Admin short-circuit: compared against the server-only env var, never a
  // client-supplied value — userEmail always comes from the caller's verified
  // supabase.auth.getUser() session (see call sites in the API routes). Takes
  // priority over every check below, including the trial cap.
  if (userEmail && userEmail === process.env.ADMIN_EMAIL) {
    return { allowed: true, remaining: limit };
  }

  const supabase = await createClient();

  // is_rate_limit_bypassed() is self-referential (reads auth.jwt() ->> 'email'
  // server-side) — it answers only for the caller's own session, so passing
  // userEmail here would be redundant and can't be used to check anyone else.
  // Also takes priority over the trial cap, same as the ADMIN_EMAIL check above.
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

  if (count > limit) {
    return { allowed: false, remaining: 0, reason: 'rate_limit' };
  }

  // Trial cap is checked (and incremented) only once the hourly window has
  // passed — a request already rejected above never consumes trial budget.
  if (options.enforceTrialLimit) {
    const { data: trialCount, error: trialError } = await supabase.rpc('increment_trial_usage', {
      p_user_id: userId,
    });

    if (trialError) {
      // Fail open, same policy as the hourly counter above.
      console.error(`Trial usage check failed for ${endpoint}:`, trialError);
      return { allowed: true, remaining: Math.max(0, limit - count) };
    }

    if ((trialCount as number) > getTrialGenerationLimit()) {
      return { allowed: false, remaining: 0, reason: 'trial_limit' };
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - count),
  };
}

/** Shared 429/403 response for a rejected checkRateLimit() result — keeps the
 * error shape/status/message identical across every call site. */
export function rateLimitErrorResponse(result: RateLimitResult): NextResponse<ApiResponse<null>> {
  if (result.reason === 'trial_limit') {
    return NextResponse.json<ApiResponse<null>>(
      {
        data: null,
        error: {
          message: `Trial limit reached — contact ${process.env.ADMIN_EMAIL ?? 'the site owner'} to continue.`,
          code: 'trial_limit_reached',
        },
      },
      { status: 403 }
    );
  }

  return NextResponse.json<ApiResponse<null>>(
    { data: null, error: { message: 'Rate limit exceeded. Try again later.', code: 'rate_limited' } },
    { status: 429 }
  );
}
