import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPinImageVersions, getPinOwnerUserId } from '@/lib/queries/pin-images';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';
import type { PinImage } from '@/types/database';

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const pinId = searchParams.get('pinId');

  if (!pinId || !isValidUuid(pinId)) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'A valid pinId is required', code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const ownerUserId = await getPinOwnerUserId(supabase, pinId);

  if (!ownerUserId) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Pin not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  if (ownerUserId !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this pin', code: 'forbidden' } },
      { status: 403 }
    );
  }

  const versions = await getPinImageVersions(supabase, pinId);

  return NextResponse.json<ApiResponse<{ versions: PinImage[] }>>({
    data: { versions },
    error: null,
  });
}
