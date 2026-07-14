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
