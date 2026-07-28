import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { testConnectionSchema } from '@/lib/validations/wordpress-site';
import { testConnection, WordPressApiError } from '@/lib/wordpress/rest-client';
import { checkRateLimit } from '@/lib/rate-limit';
import type { ApiResponse } from '@/types/api';

export async function POST(request: Request) {
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

  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'wordpress/sites/test', 30, 3600);
  if (!rateLimit.allowed) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Rate limit exceeded. Try again later.', code: 'rate_limited' } },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid JSON body', code: 'invalid_json' } },
      { status: 400 }
    );
  }

  const parsed = testConnectionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const { siteUrl, wpUsername, applicationPassword } = parsed.data;

  try {
    const result = await testConnection(siteUrl, wpUsername, applicationPassword);
    return NextResponse.json<ApiResponse<{ connected: true; displayName: string }>>(
      { data: { connected: true, displayName: result.displayName }, error: null }
    );
  } catch (err) {
    const message = err instanceof WordPressApiError ? err.message : 'Could not connect to that WordPress site.';
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message, code: 'connection_failed' } },
      { status: 400 }
    );
  }
}
