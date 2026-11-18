import type { SupabaseClient } from '@supabase/supabase-js';
import type { FacebookImageVariant, VariantStore } from '@/lib/social/facebook-image-variants';
import type { SocialContentGeneration } from '@/lib/social/social-content';

/**
 * social_content_image_variants + the image columns of
 * social_content_generations (migration 050, TASK-101). The caller's own
 * session: every query filters on `user_id` on top of RLS.
 */

/** Table or column missing (migration 050 not applied). */
const MISSING_CODES = new Set(['PGRST205', '42P01', 'PGRST204', '42703']);

function code(error: unknown): string {
  return (error as { code?: string } | null)?.code ?? '';
}

export function supabaseVariantStore(supabase: SupabaseClient, userId: string): VariantStore {
  return {
    async insertVariant(row) {
      if (row.user_id !== userId) return null;
      const { data, error } = await supabase.from('social_content_image_variants').insert(row).select('*').single();
      if (error) console.error(`[facebook] image variant save failed: ${code(error) || 'unknown'}`);
      return (data as FacebookImageVariant | null) ?? null;
    },
    async getVariant(id) {
      const { data } = await supabase.from('social_content_image_variants').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
      return (data as FacebookImageVariant | null) ?? null;
    },
    async updateDraftImage(generationId, patch) {
      const { data, error } = await supabase
        .from('social_content_generations')
        .update(patch)
        .eq('id', generationId)
        .eq('user_id', userId)
        .eq('platform', 'facebook')
        .select('*, projects(name)')
        .maybeSingle();
      if (error) console.error(`[facebook] image selection failed: ${code(error) || 'unknown'}`);
      return (data as SocialContentGeneration | null) ?? null;
    },
  };
}

/** The draft's variants, newest batch first. `unavailable` when migration 050 is not applied. */
export async function listImageVariants(
  supabase: SupabaseClient,
  userId: string,
  generationId: string
): Promise<{ variants: FacebookImageVariant[]; unavailable: boolean }> {
  const { data, error } = await supabase
    .from('social_content_image_variants')
    .select('*')
    .eq('user_id', userId)
    .eq('social_content_generation_id', generationId)
    .order('created_at', { ascending: false })
    .order('position', { ascending: true })
    .limit(30);
  if (error) return { variants: [], unavailable: MISSING_CODES.has(code(error)) };
  return { variants: (data ?? []) as FacebookImageVariant[], unavailable: false };
}
