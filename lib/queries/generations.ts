import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pin } from '@/types/database';

export async function getGenerationWithPins(supabase: SupabaseClient, generationId: string) {
  const { data: generation } = await supabase
    .from('generations')
    .select('*')
    .eq('id', generationId)
    .single();

  if (!generation) {
    return { generation: null, pins: [] as Pin[] };
  }

  const { data: pins } = await supabase
    .from('pins')
    .select('*')
    .eq('generation_id', generationId)
    .order('created_at', { ascending: true });

  return { generation, pins: (pins ?? []) as Pin[] };
}
