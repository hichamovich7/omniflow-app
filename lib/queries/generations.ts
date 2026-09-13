import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pin } from '@/types/database';

export async function getGenerationWithPins(supabase: SupabaseClient, generationId: string) {
  const { data: generation } = await supabase
    .from('generations')
    .select('*')
    .eq('id', generationId)
    .single();

  if (!generation) {
    return {
      generation: null,
      pins: [] as Pin[],
      imageVersionCounts: {} as Record<string, number>,
      activeImageModels: {} as Record<string, string | null>,
      boardNames: {} as Record<string, string | null>,
    };
  }

  const { data: pins } = await supabase
    .from('pins')
    .select('*, boards(name)')
    .eq('generation_id', generationId)
    .order('created_at', { ascending: true });

  const rawPins = pins ?? [];
  const pinList = rawPins as Pin[];

  const boardNames: Record<string, string | null> = {};
  for (const row of rawPins) {
    const boardRelation = (row as { boards?: { name: string } | { name: string }[] | null }).boards;
    const boardName = Array.isArray(boardRelation) ? boardRelation[0]?.name : boardRelation?.name;
    boardNames[row.id] = boardName ?? null;
  }

  const imageVersionCounts: Record<string, number> = {};
  const activeImageModels: Record<string, string | null> = {};

  if (pinList.length > 0) {
    const pinIds = pinList.map(p => p.id);
    const { data: versionRows } = await supabase
      .from('pin_images')
      .select('pin_id, is_active, image_model')
      .in('pin_id', pinIds);

    if (versionRows) {
      for (const row of versionRows) {
        const { pin_id: pinId, is_active: isActive, image_model: imageModel } = row as {
          pin_id: string;
          is_active: boolean;
          image_model: string | null;
        };
        imageVersionCounts[pinId] = (imageVersionCounts[pinId] ?? 0) + 1;
        if (isActive) {
          activeImageModels[pinId] = imageModel;
        }
      }
    }
  }

  return { generation, pins: pinList, imageVersionCounts, activeImageModels, boardNames };
}
