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
