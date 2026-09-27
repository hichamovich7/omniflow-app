import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updatePinTextSchema } from '@/lib/validations/pinterest';
import { updatePinText } from '@/lib/pinterest/pin-text';
import { SocialGenerationError } from '@/lib/social/pinterest-from-article';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';
import type { Pin } from '@/types/database';

/**
 * Manual edit of a saved Pin's title, description and keywords (TASK-044
 * phase 2). No AI call; board, link, image and schedule are never changed.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  if (!isValidUuid(id)) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid Pin ID', code: 'invalid_id' } },
      { status: 400 }
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

  const parsed = updatePinTextSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: parsed.error.issues[0].message, code: 'invalid_request' } },
      { status: 400 }
    );
  }

  try {
    const pin = await updatePinText(supabase, user.id, id, parsed.data);
    return NextResponse.json<ApiResponse<Pin>>({ data: pin, error: null });
  } catch (err) {
    if (err instanceof SocialGenerationError) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: { message: err.message, code: err.code } },
        { status: err.status }
      );
    }
    console.error('Pin update failed:', err);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to save the Pin. Please try again.', code: 'server_error' } },
      { status: 500 }
    );
  }
}
