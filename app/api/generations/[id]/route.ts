import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGenerationWithPins } from '@/lib/queries/generations';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';

export async function GET(
  _request: Request,
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
      { data: null, error: { message: 'Invalid generation ID', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  const { generation, pins } = await getGenerationWithPins(supabase, id);

  if (!generation) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Generation not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  if ((generation as { user_id: string }).user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this generation', code: 'forbidden' } },
      { status: 403 }
    );
  }

  return NextResponse.json<ApiResponse<{ generation: typeof generation; pins: typeof pins }>>(
    { data: { generation, pins }, error: null }
  );
}

export async function DELETE(
  _request: Request,
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
      { data: null, error: { message: 'Invalid generation ID', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  const { data: existingGeneration } = await supabase
    .from('generations')
    .select('id, user_id')
    .eq('id', id)
    .single();

  if (!existingGeneration) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Generation not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  if (existingGeneration.user_id !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this generation', code: 'forbidden' } },
      { status: 403 }
    );
  }

  // Storage cleanup — best-effort, never blocks the DB delete below. Unlike
  // WordPress images (one shared folder per generation), pin images are
  // stored one folder per pin (see app/api/pinterest/generate-images/route.ts:
  // `${userId}/${pinId}/${version}.png`), so each pin's folder must be listed
  // separately before a single batched remove() call.
  try {
    const { data: pinRows, error: pinsError } = await supabase
      .from('pins')
      .select('id')
      .eq('generation_id', id);

    if (pinsError) {
      console.error(`[generation delete] Failed to list pins for ${id}:`, pinsError);
    } else if (pinRows && pinRows.length > 0) {
      const listResults = await Promise.all(
        pinRows.map((pin) =>
          supabase.storage.from('generated-images').list(`${user.id}/${pin.id}`)
        )
      );

      const filePaths: string[] = [];
      listResults.forEach((result, index) => {
        if (result.error) {
          console.error(
            `[generation delete] Failed to list storage files for pin ${pinRows[index].id}:`,
            result.error
          );
          return;
        }
        for (const file of result.data ?? []) {
          filePaths.push(`${user.id}/${pinRows[index].id}/${file.name}`);
        }
      });

      if (filePaths.length > 0) {
        const { error: removeError } = await supabase.storage.from('generated-images').remove(filePaths);
        if (removeError) {
          console.error(`[generation delete] Failed to remove storage files for ${id}:`, removeError);
        }
      }
    }
  } catch (err) {
    console.error(`[generation delete] Unexpected storage cleanup error for ${id}:`, err);
  }

  // pins and pin_images both have ON DELETE CASCADE to generations/pins
  // (migrations 001, 005) — deleting the generation row is enough.
  const { error: dbError } = await supabase
    .from('generations')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (dbError) {
    console.error('Failed to delete generation:', dbError);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Failed to delete generation', code: 'server_error' } },
      { status: 500 }
    );
  }

  return NextResponse.json<ApiResponse<{ success: boolean }>>(
    { data: { success: true }, error: null }
  );
}
