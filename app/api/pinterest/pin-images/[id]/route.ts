import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPinOwnerUserId } from '@/lib/queries/pin-images';
import { isValidUuid } from '@/lib/utils/uuid';
import type { ApiResponse } from '@/types/api';
import type { PinImage } from '@/types/database';

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  if (!isValidUuid(id)) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid image version ID', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  const { data: pinImage } = await supabase
    .from('pin_images')
    .select('*')
    .eq('id', id)
    .single();

  if (!pinImage) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Image version not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  const image = pinImage as PinImage;

  const ownerUserId = await getPinOwnerUserId(supabase, image.pin_id);

  if (ownerUserId !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this image version', code: 'forbidden' } },
      { status: 403 }
    );
  }

  if (image.is_active) {
    return NextResponse.json<ApiResponse<{ pinId: string; activeImageId: string; url: string }>>({
      data: { pinId: image.pin_id, activeImageId: image.id, url: image.url },
      error: null,
    });
  }

  await supabase
    .from('pin_images')
    .update({ is_active: false })
    .eq('pin_id', image.pin_id)
    .eq('is_active', true);

  await supabase
    .from('pin_images')
    .update({ is_active: true })
    .eq('id', id);

  await supabase
    .from('pins')
    .update({ media_url: image.url })
    .eq('id', image.pin_id);

  return NextResponse.json<ApiResponse<{ pinId: string; activeImageId: string; url: string }>>({
    data: { pinId: image.pin_id, activeImageId: image.id, url: image.url },
    error: null,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  if (!isValidUuid(id)) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Invalid image version ID', code: 'invalid_id' } },
      { status: 400 }
    );
  }

  const { data: pinImage } = await supabase
    .from('pin_images')
    .select('*')
    .eq('id', id)
    .single();

  if (!pinImage) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Image version not found', code: 'not_found' } },
      { status: 404 }
    );
  }

  const image = pinImage as PinImage;

  const ownerUserId = await getPinOwnerUserId(supabase, image.pin_id);

  if (ownerUserId !== user.id) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'You do not have access to this image version', code: 'forbidden' } },
      { status: 403 }
    );
  }

  const { count } = await supabase
    .from('pin_images')
    .select('id', { count: 'exact', head: true })
    .eq('pin_id', image.pin_id);

  if ((count ?? 0) <= 1) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: { message: 'Cannot delete the only remaining version', code: 'invalid_request' } },
      { status: 400 }
    );
  }

  if (image.is_active) {
    const { data: replacement } = await supabase
      .from('pin_images')
      .select('*')
      .eq('pin_id', image.pin_id)
      .neq('id', id)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (replacement) {
      const rep = replacement as PinImage;
      await supabase
        .from('pin_images')
        .update({ is_active: true })
        .eq('id', rep.id);

      await supabase
        .from('pins')
        .update({ media_url: rep.url })
        .eq('id', image.pin_id);
    }
  }

  await supabase.from('pin_images').delete().eq('id', id);

  await supabase.storage
    .from('generated-images')
    .remove([image.storage_path]);

  return NextResponse.json<ApiResponse<{ deleted: true }>>({
    data: { deleted: true },
    error: null,
  });
}
