import type { SupabaseClient } from '@supabase/supabase-js';
import type { PinImage } from '@/types/database';

export async function getPinImageVersions(
  supabase: SupabaseClient,
  pinId: string
): Promise<PinImage[]> {
  const { data } = await supabase
    .from('pin_images')
    .select('*')
    .eq('pin_id', pinId)
    .order('version', { ascending: false });

  return (data ?? []) as PinImage[];
}

/**
 * Active image URL per pin, for pins that have one. Missing entries mean the
 * pin has no active image (never generated, or all versions deleted).
 */
export async function getActivePinImageUrls(
  supabase: SupabaseClient,
  pinIds: string[]
): Promise<Map<string, string>> {
  if (pinIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('pin_images')
    .select('pin_id, url')
    .in('pin_id', pinIds)
    .eq('is_active', true);

  if (error) {
    console.error('[pin-images] getActivePinImageUrls query failed:', error);
  }

  return new Map((data ?? []).map((row) => [row.pin_id as string, row.url as string]));
}

export async function getPinOwnerUserId(
  supabase: SupabaseClient,
  pinId: string
): Promise<string | null> {
  const { data: pin } = await supabase
    .from('pins')
    .select('generation_id')
    .eq('id', pinId)
    .single();

  if (!pin) return null;

  const { data: generation } = await supabase
    .from('generations')
    .select('user_id')
    .eq('id', (pin as { generation_id: string }).generation_id)
    .single();

  return (generation as { user_id: string } | null)?.user_id ?? null;
}
