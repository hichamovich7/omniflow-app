import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import type { ApiResponse } from '@/types/api';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

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

  const rateLimit = await checkRateLimit(user.id, user.email ?? '', 'pinterest/reference-image', 30, 3600);
  if (!rateLimit.allowed) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Rate limit exceeded. Try again later.', code: 'rate_limited' } },
      { status: 429 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid form data', code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'No file provided', code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Unsupported file type — use JPG, PNG, or WebP', code: 'invalid_request' } },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'File is too large — 5MB maximum', code: 'invalid_request' } },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('reference-images')
    .upload(filePath, buffer, { contentType: file.type });

  if (uploadError) {
    console.error('Reference image upload failed:', uploadError);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Upload failed. Try again.', code: 'server_error' } },
      { status: 500 }
    );
  }

  const { data: publicUrl } = supabase.storage.from('reference-images').getPublicUrl(filePath);

  return NextResponse.json<ApiResponse<{ url: string }>>(
    { data: { url: publicUrl.publicUrl }, error: null },
    { status: 201 }
  );
}
