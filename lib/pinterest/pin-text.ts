import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadArticlePinterestSource,
  regenerateArticlePin,
  SocialGenerationError,
  type ArticlePinterestSource,
  type GenerateTextFn,
} from '@/lib/social/pinterest-from-article';
import type { UpdatePinTextInput } from '@/lib/validations/pinterest';
import { SUPPORTED_LANGUAGES } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import type { Generation, Pin } from '@/types/database';

/**
 * Saved Pin text: manual edit and single-Pin regeneration (TASK-044 phase
 * 2). Only the text fields and the private angle metadata are ever written;
 * board, board section, link_url, image and schedule are never touched.
 */

type OwnedGeneration = Pick<Generation, 'id' | 'user_id' | 'project_id' | 'keyword' | 'language' | 'status'>;

export async function loadOwnedPin(
  supabase: SupabaseClient,
  userId: string,
  pinId: string
): Promise<{ pin: Pin; generation: OwnedGeneration }> {
  const { data: pin } = await supabase.from('pins').select('*').eq('id', pinId).single();
  if (!pin) {
    throw new SocialGenerationError('not_found', 'Pin not found');
  }

  const { data: generation } = await supabase
    .from('generations')
    .select('id, user_id, project_id, keyword, language, status')
    .eq('id', (pin as Pin).generation_id)
    .single();
  if (!generation) {
    throw new SocialGenerationError('not_found', 'Pin not found');
  }
  if ((generation as OwnedGeneration).user_id !== userId) {
    throw new SocialGenerationError('forbidden', 'You do not have access to this Pin');
  }

  return { pin: pin as Pin, generation: generation as OwnedGeneration };
}

export async function updatePinText(
  supabase: SupabaseClient,
  userId: string,
  pinId: string,
  input: UpdatePinTextInput
): Promise<Pin> {
  await loadOwnedPin(supabase, userId, pinId);

  const keywords = input.keywords
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .join(', ');

  const { data, error } = await supabase
    .from('pins')
    .update({ title: input.title, description: input.description, keywords })
    .eq('id', pinId)
    .select('*')
    .single();

  if (error || !data) {
    throw new SocialGenerationError('generation_failed', 'Failed to save the Pin. Please try again.');
  }
  return data as Pin;
}

/**
 * Every check before regenerating one Pin of a generation made from an
 * article: Pin owned, article owned and completed, same project. Read-only;
 * the route runs its rate limit only after this passes.
 */
export async function prepareArticlePinRegeneration(
  supabase: SupabaseClient,
  userId: string,
  pinId: string,
  wordpressArticleId: string
): Promise<{ pin: Pin; generation: OwnedGeneration; source: ArticlePinterestSource }> {
  const { pin, generation } = await loadOwnedPin(supabase, userId, pinId);
  const source = await loadArticlePinterestSource(supabase, userId, wordpressArticleId);
  if (source.projectId !== generation.project_id) {
    throw new SocialGenerationError('project_mismatch', "The article does not belong to this Pin's project");
  }
  return { pin, generation, source };
}

/** One AI call, then one update of that Pin's text fields. */
export async function regenerateAndSavePin(
  supabase: SupabaseClient,
  prepared: { pin: Pin; generation: OwnedGeneration; source: ArticlePinterestSource },
  deps: { generateText: GenerateTextFn }
): Promise<Pin> {
  const { pin, generation, source } = prepared;

  const { data: siblings } = await supabase
    .from('pins')
    .select('id, title')
    .eq('generation_id', generation.id);

  const language: SupportedLanguage = (SUPPORTED_LANGUAGES as readonly string[]).includes(generation.language)
    ? (generation.language as SupportedLanguage)
    : source.language;

  const update = await regenerateArticlePin(
    {
      pin,
      siblingTitles: ((siblings ?? []) as Array<{ id: string; title: string }>)
        .filter((sibling) => sibling.id !== pin.id)
        .map((sibling) => sibling.title),
      keyword: generation.keyword,
      language,
      source,
    },
    deps
  );

  const { data, error } = await supabase.from('pins').update(update).eq('id', pin.id).select('*').single();
  if (error || !data) {
    throw new SocialGenerationError('generation_failed', 'Failed to save the regenerated Pin. Please try again.');
  }
  return data as Pin;
}
