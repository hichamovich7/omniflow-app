import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadArticlePinterestSource,
  regenerateArticlePin,
  SocialGenerationError,
  type ArticlePinterestSource,
  type GenerateTextFn,
} from '@/lib/social/pinterest-from-article';
import { loadWordPressPostPinterestSource } from '@/lib/social/pinterest-from-wordpress-post';
import { readArticleSourceMetadata } from '@/lib/pinterest/article-briefs';
import {
  PIN_TEXT_NOT_MODIFIED,
  regeneratePinText,
  type PinTextRegenerationSource,
  type RegeneratedPinPackage,
} from '@/lib/pinterest/regenerate-text';
import { readPinVisualFormat } from '@/lib/social/pin-display';
import { listContentStreamNamesForBoard } from '@/lib/queries/niche-context';
import { getProjectNicheSettings } from '@/lib/queries/niche-settings';
import type { ReadDeps } from '@/lib/wordpress/post-reader';
import type { WordPressPostSource } from '@/lib/validations/wordpress-post-source';
import type { UpdatePinLinkInput, UpdatePinTextInput } from '@/lib/validations/pinterest';
import { SUPPORTED_LANGUAGES } from '@/types/pinterest';
import type { SupportedLanguage } from '@/types/pinterest';
import type { Generation, Pin } from '@/types/database';

/**
 * Saved Pin text: manual edit and single-Pin regeneration (TASK-044 phase
 * 2). Only the text fields and the private angle metadata are ever written;
 * board, board section, link_url, image and schedule are never touched.
 * `updatePinLink` (TASK-071) writes link_url alone.
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
 * Destination URL edit (TASK-071): ownership first, then only
 * `pins.link_url` is written — no AI call, text / image / board untouched.
 */
export async function updatePinLink(
  supabase: SupabaseClient,
  userId: string,
  pinId: string,
  input: UpdatePinLinkInput
): Promise<Pin> {
  await loadOwnedPin(supabase, userId, pinId);

  const { data, error } = await supabase
    .from('pins')
    .update({ link_url: input.linkUrl })
    .eq('id', pinId)
    .select('*')
    .single();

  if (error || !data) {
    throw new SocialGenerationError('generation_failed', 'Failed to save the destination URL. Please try again.');
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
  articleSource: string | { wordpressPost: WordPressPostSource },
  deps: ReadDeps = {}
): Promise<{ pin: Pin; generation: OwnedGeneration; source: ArticlePinterestSource }> {
  const { pin, generation } = await loadOwnedPin(supabase, userId, pinId);
  // An OmniFlow article id, or an existing WordPress post (read again, GET only).
  const source =
    typeof articleSource === 'string'
      ? await loadArticlePinterestSource(supabase, userId, articleSource)
      : await loadWordPressPostPinterestSource(supabase, userId, articleSource.wordpressPost, deps);
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

// ---------------------------------------------------------------------------
// Regenerate text only (TASK-076)

export interface PreparedPinTextRegeneration {
  pin: Pin;
  generation: OwnedGeneration;
  source: PinTextRegenerationSource;
}

/**
 * Every check before "Regenerate text": Pin and generation owned, project
 * owned, and the source the generation was made from resolved server-side
 * (generations.source_type / source ids — the client sends nothing). An
 * article source is read again (WordPress: GET only) and must belong to the
 * Pin's project. Read-only; the route rate-limits only after this passes.
 */
export async function preparePinTextRegeneration(
  supabase: SupabaseClient,
  userId: string,
  pinId: string,
  deps: ReadDeps = {}
): Promise<PreparedPinTextRegeneration> {
  const { pin, generation } = await loadOwnedPin(supabase, userId, pinId);

  const { data: project } = await supabase
    .from('projects')
    .select('id, user_id, niche, description')
    .eq('id', generation.project_id)
    .single();
  if (!project) {
    throw new SocialGenerationError('not_found', 'Project not found');
  }
  if (project.user_id !== userId) {
    throw new SocialGenerationError('forbidden', 'You do not have access to this project');
  }

  // Source columns (migrations 040 / 044) read apart, so an older row
  // without them is simply a keyword generation.
  const { data: sourceRow } = await supabase.from('generations').select('*').eq('id', generation.id).single();
  const sourceColumns = (sourceRow ?? {}) as {
    source_type?: string | null;
    source_wordpress_generation_id?: string | null;
    source_wordpress_site_id?: string | null;
    source_wordpress_post_id?: number | null;
  };

  let article: ArticlePinterestSource | null = null;
  if (sourceColumns.source_type === 'external_wordpress_post') {
    if (!sourceColumns.source_wordpress_site_id || !sourceColumns.source_wordpress_post_id) {
      throw new SocialGenerationError('source_unavailable', 'The WordPress post this Pin was made from is no longer available');
    }
    article = await loadWordPressPostPinterestSource(
      supabase,
      userId,
      { siteId: sourceColumns.source_wordpress_site_id, postId: Number(sourceColumns.source_wordpress_post_id) },
      deps
    );
  } else if (sourceColumns.source_wordpress_generation_id) {
    article = await loadArticlePinterestSource(supabase, userId, sourceColumns.source_wordpress_generation_id);
  } else if (sourceColumns.source_type === 'omniflow_article' || readArticleSourceMetadata(pin.image_analysis)) {
    // An article Pin whose article was deleted: never rewritten from the keyword alone.
    throw new SocialGenerationError('source_unavailable', 'The article this Pin was made from is no longer available');
  }
  if (article && article.projectId !== generation.project_id) {
    throw new SocialGenerationError('project_mismatch', "The article does not belong to this Pin's project");
  }

  const language: SupportedLanguage = (SUPPORTED_LANGUAGES as readonly string[]).includes(generation.language)
    ? (generation.language as SupportedLanguage)
    : article?.language ?? 'en';

  // Same context as the generation: the board's Content Stream, then the
  // article category's Streams; niche settings of the project.
  const contentStreams = [
    ...(await listContentStreamNamesForBoard(supabase, userId, generation.project_id, pin.board)),
    ...(article?.contentStreams ?? []),
  ];

  return {
    pin,
    generation,
    source: {
      keyword: generation.keyword,
      language,
      niche: (project.niche as string | null) ?? null,
      contentStreams: [...new Set(contentStreams)],
      nicheSettings: article
        ? article.nicheSettings ?? null
        : await getProjectNicheSettings(supabase, userId, generation.project_id),
      brandProfileDescription: (project.description as string | null) ?? null,
      article,
    },
  };
}

/** The new text, written by one Pin-row update. */
export type PinTextUpdate = Pick<Pin, 'title' | 'description' | 'keywords'> & Partial<Pick<Pin, 'image_prompt'>>;

async function siblingTitlesOf(supabase: SupabaseClient, prepared: PreparedPinTextRegeneration): Promise<string[]> {
  const { data: siblings } = await supabase
    .from('pins')
    .select('id, title')
    .eq('generation_id', prepared.generation.id);
  return ((siblings ?? []) as Array<{ id: string; title: string }>)
    .filter((sibling) => sibling.id !== prepared.pin.id)
    .map((sibling) => sibling.title);
}

/**
 * One text AI call, then one update of title / description / keywords — and,
 * with `withImagePrompt` (TASK-099 "Regenerate text + image prompts"), the new
 * image_prompt in that same update. No image call; media_url, link, board,
 * section, date and status are never written. Nothing is written on failure.
 */
export async function regenerateAndSavePinText(
  supabase: SupabaseClient,
  prepared: PreparedPinTextRegeneration,
  deps: { generateText: GenerateTextFn },
  options: { withImagePrompt?: boolean } = {}
): Promise<Pin> {
  const { pin, source } = prepared;
  const siblingTitles = await siblingTitlesOf(supabase, prepared);

  const update: PinTextUpdate = options.withImagePrompt
    ? await regeneratePinText({ pin, siblingTitles, source, withImagePrompt: true }, deps)
    : await regeneratePinText({ pin, siblingTitles, source }, deps);

  const { data, error } = await supabase
    .from('pins')
    .update({
      title: update.title,
      description: update.description,
      keywords: update.keywords,
      ...(update.image_prompt !== undefined ? { image_prompt: update.image_prompt } : {}),
    })
    .eq('id', pin.id)
    .select('*')
    .single();
  if (error || !data) {
    throw new SocialGenerationError('generation_failed', 'Failed to save the regenerated text. Please try again.');
  }
  return data as Pin;
}

// ---------------------------------------------------------------------------
// Regenerate complete Pin (TASK-099)

/** Paid image calls "Regenerate complete Pins" would make for this Pin (same count as the confirmation). */
export function completeRegenerationImageCalls(pin: Pick<Pin, 'image_analysis'>): number {
  return readPinVisualFormat(pin.image_analysis).imageCalls ?? 1;
}

/** Writes the new image and, in the same Pin-row update, `pinUpdate`. Throws (nothing written) on failure. */
export type RenderPinImageFn = (pin: Pin, pinUpdate: Required<PinTextUpdate>) => Promise<void>;

/**
 * Checks run before any AI call: a Pin whose mode needs several image calls
 * (Step-by-step: one per panel) is refused — the complete mode makes at most
 * one image call per Pin.
 */
export function assertCompleteRegenerationAllowed(pin: Pin): void {
  if (completeRegenerationImageCalls(pin) > 1) {
    throw new SocialGenerationError(
      'multi_image_pin',
      `"${pin.title}" needs several images (Step-by-step) and cannot be regenerated completely. Use "Regenerate text + image prompts" instead. ${PIN_TEXT_NOT_MODIFIED}`
    );
  }
}

/**
 * "Regenerate complete Pins": one text call (title, description, keywords,
 * new image_prompt), then the image of the Pin made from that new prompt —
 * at most one image call — and only then one Pin-row update with the text,
 * the prompt and the image. Any failure leaves the Pin as it was.
 */
export async function regenerateCompletePin(
  supabase: SupabaseClient,
  prepared: PreparedPinTextRegeneration,
  deps: { generateText: GenerateTextFn; renderImage: RenderPinImageFn }
): Promise<Pin> {
  const { pin, source } = prepared;
  assertCompleteRegenerationAllowed(pin);
  const siblingTitles = await siblingTitlesOf(supabase, prepared);

  const text: RegeneratedPinPackage = await regeneratePinText(
    { pin, siblingTitles, source, withImagePrompt: true },
    { generateText: deps.generateText }
  );
  const pinUpdate = { title: text.title, description: text.description, keywords: text.keywords, image_prompt: text.image_prompt };

  try {
    await deps.renderImage({ ...pin, ...pinUpdate }, pinUpdate);
  } catch (err) {
    // The reason only — never the prompt or the model's text.
    console.error(`[pinterest regenerate] complete Pin ${pin.id} image failed: ${err instanceof Error ? err.name : 'unknown error'}`);
    const named = err instanceof Error && err.name === 'PinImageError' ? err.message : null;
    throw new SocialGenerationError(
      'image_failed',
      named ?? `The new image of "${pin.title}" could not be generated. Its previous text and image are kept. Please try again.`
    );
  }

  const { data, error } = await supabase.from('pins').select('*').eq('id', pin.id).single();
  if (error || !data) {
    throw new SocialGenerationError('generation_failed', 'The Pin was regenerated but could not be reloaded. Refresh the page.');
  }
  return data as Pin;
}
