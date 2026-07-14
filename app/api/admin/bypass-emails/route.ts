import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { addBypassEmailSchema } from '@/lib/validations/admin';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';
import type { RateLimitBypassEntry } from '@/types/database';

const NOT_FOUND_RESPONSE = NextResponse.json<ApiResponse<null>>(
  { data: null, error: { message: 'Not found', code: 'not_found' } },
  { status: 404 }
);

async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return !!user?.email && user.email === process.env.ADMIN_EMAIL;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NOT_FOUND_RESPONSE;
  }

  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin
    .from('rate_limit_bypass')
    .select('id, email, added_at')
    .order('added_at', { ascending: false });

  if (error) {
    console.error('Failed to list rate limit bypass emails:', error);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to load bypass list', code: 'server_error' } },
      { status: 500 }
    );
  }

  return NextResponse.json<ApiResponse<{ emails: RateLimitBypassEntry[] }>>({
    data: { emails: (data ?? []) as RateLimitBypassEntry[] },
    error: null,
  });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NOT_FOUND_RESPONSE;
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

  const parsed = addBypassEmailSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin
    .from('rate_limit_bypass')
    .insert({ email: parsed.data.email })
    .select('id, email, added_at')
    .single();

  if (error) {
    const isDuplicate = error.code === '23505';
    return NextResponse.json<ApiResponse<null>>(
      {
        data: null,
        error: {
          message: isDuplicate ? 'This email is already on the bypass list' : 'Failed to add email',
          code: isDuplicate ? 'invalid_request' : 'server_error',
        },
      },
      { status: isDuplicate ? 400 : 500 }
    );
  }

  return NextResponse.json<ApiResponse<{ entry: RateLimitBypassEntry }>>(
    { data: { entry: data as RateLimitBypassEntry }, error: null },
    { status: 201 }
  );
}

export async function DELETE(request: Request) {
  if (!(await requireAdmin())) {
    return NOT_FOUND_RESPONSE;
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id || !isValidUuid(id)) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'A valid id is required', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin.from('rate_limit_bypass').delete().eq('id', id);

  if (error) {
    console.error('Failed to remove rate limit bypass email:', error);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to remove email', code: 'server_error' } },
      { status: 500 }
    );
  }

  return NextResponse.json<ApiResponse<{ success: boolean }>>(
    { data: { success: true }, error: null }
  );
}
