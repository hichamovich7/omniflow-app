import type { SupabaseClient } from '@supabase/supabase-js';
import { generateText, generateImage } from '@/lib/ai/engine';
import { buildBrandProfileContext } from '@/lib/brand-profile';
import { buildWordPressOutlinePrompt } from '@/lib/ai/prompts/wordpress-outline-prompt';
import { buildWordPressArticlePrompt } from '@/lib/ai/prompts/wordpress-article-prompt';
import { buildWordPressFromPinsPrompt } from '@/lib/ai/prompts/wordpress-from-pins-prompt';
import type { PinSummary } from '@/lib/ai/prompts/wordpress-from-pins-prompt';
import { addExternalLink } from '@/lib/ai/services/external-link';
import {
  wordpressArticleResponseSchema,
  buildWordpressPinsOutlineSchema,
  buildWordpressOutlineSchema,
  buildWordpressArticleResponseSchema,
  ARTICLE_SIZE_CONFIG,
  DEFAULT_KEY_TAKEAWAYS_RANGE,
  DEFAULT_FAQ_RANGE,
  DISABLED_ARRAY_RANGE,
  type ARTICLE_TYPES,
  type ARTICLE_SIZES,
  type TONES_OF_VOICE,
  type POINTS_OF_VIEW,
} from '@/lib/validations/wordpress';
import { promisePool } from '@/lib/utils/promise-pool';
import { truncateAtWordBoundary } from '@/lib/utils/text-truncate';
import type { SupportedLanguage } from '@/types/pinterest';

// Centralizes the text-generation role for TASK-028 Option 1: FAST while the
// feature is being tested for output quality. Bump to 'SMART' here alone if
// FAST isn't good enough — every call site in this file reads this constant,
// nothing else needs to change. Exported: Option 3 (generate-article-from-url.ts)
// reuses the exact same outline/article prompts and must stay on the same role.
export const TEXT_ROLE: 'FAST' | 'SMART' = 'FAST';

// Exported for reuse by Option 3 (generate-article-from-url.ts) — same image
// pipeline, same config.
export const WORDPRESS_IMAGE_CONFIG = {
  size: '1024x1024',
  concurrency: 3,
} as const;

// Bumped alongside the outline/article prompt restructure (10-block AEO layout,
// 1800-2500 word target instead of 800-1200, plus Quick Answer/Key Takeaways/
// Common Mistakes/FAQ as extra structured fields on the article response) —
// the previous budgets were sized for the shorter structure and would truncate
// the JSON response before it finished, breaking JSON.parse. Exported: Option 3
// (generate-article-from-url.ts) drives the exact same outline/article
// generateText() calls and must stay sized identically.
export const OUTLINE_MAX_TOKENS = 3000;
export const ARTICLE_MAX_TOKENS = 8000;

// Article Size (TASK-FIX-034, Option 1 only) can widen the target well past
// the 1800-2500 words ARTICLE_MAX_TOKENS was originally sized for. Only the
// 'large' tier (3600-5000 words) risks truncating the JSON response before it
// finishes — bumped for that tier alone, everything else (including no size
// chosen) keeps the exact original ARTICLE_MAX_TOKENS.
export const ARTICLE_MAX_TOKENS_LARGE = 11000;

// The full-article write (10-block AEO structure, 1800-2500 words, 8000 max
// tokens) routinely runs past the provider's default 60s fetch timeout —
// measured at ~60-90s for this prompt, unlike the much lighter outline call
// (~15-20s), which keeps the shared default. See DECISIONS.md 2026-07-18.
export const ARTICLE_GENERATION_TIMEOUT_MS = 120000;

// Kept in sync with the max()s on wordpressOutlineSchema (lib/validations/wordpress.ts).
const TITLE_MAX_LENGTH = 100;
const META_TITLE_MAX_LENGTH = 70;
const SLUG_MAX_LENGTH = 100;
const META_DESCRIPTION_MAX_LENGTH = 160;

interface RawOutlineTextFields {
  title?: unknown;
  metaTitle?: unknown;
  slug?: unknown;
  metaDescription?: unknown;
}

/**
 * LLM character counting is unreliable across languages (German compound
 * words especially) — rather than let the outline fail Zod validation and
 * force a full retry, the length-sensitive fields are deterministically
 * truncated at a word boundary before the schema ever sees them. Zod's
 * max()s become an unreachable backstop instead of a real failure mode, so
 * `wordpressOutlineSchema.safeParse` only ever rejects genuine structural
 * problems (missing fields, wrong types) — never length overflow.
 * metaTitle falls back to a truncated `title` when the model omits it.
 *
 * Exported: Option 3 (generate-article-from-url.ts) validates its outline
 * response against the same wordpressOutlineSchema and needs the identical
 * pre-truncation step.
 */
export function applyOutlineTextLimits(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const outline = raw as RawOutlineTextFields;

  const title = typeof outline.title === 'string' ? truncateAtWordBoundary(outline.title, TITLE_MAX_LENGTH) : outline.title;

  const metaTitleSource = typeof outline.metaTitle === 'string' ? outline.metaTitle : typeof title === 'string' ? title : '';
  const metaTitle = metaTitleSource ? truncateAtWordBoundary(metaTitleSource, META_TITLE_MAX_LENGTH) : outline.metaTitle;

  // Slug has no spaces to break on, so truncateAtWordBoundary degrades to a
  // hard cut at maxLength — strip a trailing hyphen that cut might leave so
  // the slug regex (no leading/trailing hyphen) still validates.
  const slug =
    typeof outline.slug === 'string'
      ? truncateAtWordBoundary(outline.slug, SLUG_MAX_LENGTH).replace(/-+$/, '')
      : outline.slug;

  const metaDescription =
    typeof outline.metaDescription === 'string'
      ? truncateAtWordBoundary(outline.metaDescription, META_DESCRIPTION_MAX_LENGTH)
      : outline.metaDescription;

  return { ...outline, title, metaTitle, slug, metaDescription };
}

interface GenerateArticleParams {
  supabase: SupabaseClient;
  userId: string;
  generationId: string;
  keyword: string;
  language: SupportedLanguage;
  brandProfileDescription: string | null;
  researchNotes?: string | null;
  // Core Settings (TASK-FIX-034, "1-Click Blog Post" / Option 1 only) — all
  // optional. Leaving every one of them undefined/null reproduces the exact
  // pre-existing outline/article generation with zero regression.
  articleType?: (typeof ARTICLE_TYPES)[number] | null;
  articleSize?: (typeof ARTICLE_SIZES)[number] | null;
  toneOfVoice?: (typeof TONES_OF_VOICE)[number] | null;
  pointOfView?: (typeof POINTS_OF_VIEW)[number] | null;
  targetCountry?: string | null;
  // Structure (TASK-FIX-035, "1-Click Blog Post" / Option 1 only) — all
  // optional/null. Leaving every one of them unset reproduces the exact
  // pre-existing outline/article generation with zero regression.
  hookBrief?: string | null;
  includeConclusion?: boolean | null;
  includeTables?: boolean | null;
  includeH3?: boolean | null;
  includeLists?: boolean | null;
  includeItalics?: boolean | null;
  includeQuotes?: boolean | null;
  includeKeyTakeaways?: boolean | null;
  includeFaq?: boolean | null;
  includeBold?: boolean | null;
  // SEO Keywords (TASK-FIX-036, "1-Click Blog Post" / Option 1 only) —
  // optional/null. Empty/unset reproduces the exact pre-existing article
  // generation with zero regression.
  seoKeywords?: string[] | null;
  // External Linking (TASK-FIX-037, "1-Click Blog Post" / Option 1 only) —
  // optional/null, manual URLs only. Purely additive to addExternalLink()
  // below, which is called unconditionally regardless of this field.
  manualExternalUrls?: string[] | null;
}

interface GeneratedImageResult {
  marker: string;
  url: string | null;
}

export interface GeneratedArticleImage {
  placementMarker: string;
  prompt: string;
  altText: string;
  url: string | null;
  position: number;
}

export interface GenerateArticleResult {
  title: string;
  metaTitle: string;
  slug: string;
  metaDescription: string;
  content: string;
  wordCount: number;
  featuredImagePrompt: string;
  featuredImageUrl: string | null;
  internalImages: GeneratedArticleImage[];
}

/**
 * Two-step generation (outline, then full article), followed by featured +
 * internal image generation. This function only produces the article data —
 * it does not read or write any wordpress_* table, that's the caller's job
 * (see app/api/wordpress/generate/route.ts), consistent with how the AI
 * Engine itself stays free of persistence concerns.
 */
export async function generateWordPressArticle(
  params: GenerateArticleParams
): Promise<GenerateArticleResult> {
  const {
    supabase,
    userId,
    generationId,
    keyword,
    language,
    brandProfileDescription,
    researchNotes,
    articleType,
    articleSize,
    toneOfVoice,
    pointOfView,
    targetCountry,
    hookBrief,
    includeConclusion,
    includeTables,
    includeH3,
    includeLists,
    includeItalics,
    includeQuotes,
    includeKeyTakeaways,
    includeFaq,
    includeBold,
    seoKeywords,
    manualExternalUrls,
  } = params;
  const brandProfileContext = buildBrandProfileContext(brandProfileDescription);
  const sizeConfig = articleSize ? ARTICLE_SIZE_CONFIG[articleSize] : undefined;
  // Only an explicit "Non" (false) shrinks these to a hard 0-length — "Oui"
  // (true) and "Non défini" (undefined/null) both keep the pre-existing 4-6
  // range, since Key Takeaways/FAQ were always present before TASK-FIX-035.
  const keyTakeawaysRange = includeKeyTakeaways === false ? DISABLED_ARRAY_RANGE : DEFAULT_KEY_TAKEAWAYS_RANGE;
  const faqRange = includeFaq === false ? DISABLED_ARRAY_RANGE : DEFAULT_FAQ_RANGE;

  // Step 1: outline
  const { system: outlineSystem, user: outlineUser } = buildWordPressOutlinePrompt({
    keyword,
    brandProfileContext: brandProfileContext || undefined,
    researchNotes: researchNotes || undefined,
    language,
    articleType: articleType || undefined,
    articleSize: articleSize || undefined,
    toneOfVoice: toneOfVoice || undefined,
    pointOfView: pointOfView || undefined,
    targetCountry: targetCountry || undefined,
    hookBrief: hookBrief || undefined,
    includeConclusion: includeConclusion ?? undefined,
    includeKeyTakeaways: includeKeyTakeaways ?? undefined,
    includeFaq: includeFaq ?? undefined,
  });

  const outlineRaw = await generateText({
    role: TEXT_ROLE,
    messages: [
      { role: 'system', content: outlineSystem },
      { role: 'user', content: outlineUser },
    ],
    maxTokens: OUTLINE_MAX_TOKENS,
  });

  let outlineJson: unknown;
  try {
    outlineJson = JSON.parse(outlineRaw);
  } catch (err) {
    console.error('[wordpress] outline JSON.parse failed. Raw response below:\n' + outlineRaw);
    throw err;
  }
  // Always rebuilt (never the bare wordpressOutlineSchema singleton) — when
  // sizeConfig/keyTakeawaysRange/faqRange are all left at their defaults this
  // produces byte-for-byte the same validation as before TASK-FIX-034/035.
  const outlineSchema = buildWordpressOutlineSchema({ sectionsRange: sizeConfig, keyTakeawaysRange, faqRange });
  const outlineValidated = outlineSchema.safeParse(applyOutlineTextLimits(outlineJson));
  if (!outlineValidated.success) {
    console.error('[wordpress] outline Zod validation failed:', JSON.stringify(outlineValidated.error.format(), null, 2));
    console.error('[wordpress] Raw response below:\n' + outlineRaw);
    throw new Error('AI returned an invalid outline format. Try again.');
  }
  const outline = outlineValidated.data;

  // Step 2: full article, written from the validated outline
  const { system: articleSystem, user: articleUser } = buildWordPressArticlePrompt({
    outline,
    language,
    minWords: sizeConfig?.minWords,
    maxWords: sizeConfig?.maxWords,
    toneOfVoice: toneOfVoice || undefined,
    pointOfView: pointOfView || undefined,
    targetCountry: targetCountry || undefined,
    hookBrief: hookBrief || undefined,
    includeConclusion: includeConclusion ?? undefined,
    includeTables: includeTables ?? undefined,
    includeH3: includeH3 ?? undefined,
    includeLists: includeLists ?? undefined,
    includeItalics: includeItalics ?? undefined,
    includeQuotes: includeQuotes ?? undefined,
    includeBold: includeBold ?? undefined,
    seoKeywords: seoKeywords && seoKeywords.length > 0 ? seoKeywords : undefined,
    manualExternalUrls: manualExternalUrls && manualExternalUrls.length > 0 ? manualExternalUrls : undefined,
  });

  const articleRaw = await generateText({
    role: TEXT_ROLE,
    messages: [
      { role: 'system', content: articleSystem },
      { role: 'user', content: articleUser },
    ],
    maxTokens: articleSize === 'large' ? ARTICLE_MAX_TOKENS_LARGE : ARTICLE_MAX_TOKENS,
    timeoutMs: ARTICLE_GENERATION_TIMEOUT_MS,
  });

  // Same keyTakeawaysRange/faqRange as the outline, so the article response's
  // arrays are validated against the exact lengths the outline actually
  // committed to (0 when disabled, 4-6 otherwise).
  const articleSchema = buildWordpressArticleResponseSchema({ keyTakeawaysRange, faqRange });
  const articleValidated = articleSchema.safeParse(JSON.parse(articleRaw));
  if (!articleValidated.success) {
    throw new Error('AI returned an invalid article format. Try again.');
  }
  let content = articleValidated.data.content;

  // Step 2b: best-effort single external link (real, web-search-verified source).
  // Runs before image marker resolution so it never has to reason about
  // {{IMAGE_N}} markers — see lib/ai/services/external-link.ts for the
  // no-link-found / provider-error fallback (article is simply returned as-is).
  const externalLink = await addExternalLink(content, outline.title, language);
  content = externalLink.content;

  // Step 3: featured image + internal images, generated in parallel (bounded concurrency)
  const imageTasks = [
    { marker: 'FEATURED', prompt: outline.featuredImage.prompt },
    ...outline.images.map((img) => ({ marker: img.placementMarker, prompt: img.prompt })),
  ];

  const { successes, failures } = await promisePool<(typeof imageTasks)[number], GeneratedImageResult>(
    imageTasks,
    async (task) => {
      const imageBuffer = await generateImage({ prompt: task.prompt, size: WORDPRESS_IMAGE_CONFIG.size });
      const filePath = `${userId}/${generationId}/${task.marker}.png`;

      const { error: uploadError } = await supabase.storage
        .from('wordpress-images')
        .upload(filePath, imageBuffer, { contentType: 'image/png' });

      if (uploadError) {
        throw new Error(`Storage upload failed for ${task.marker}: ${uploadError.message}`);
      }

      const { data: publicUrl } = supabase.storage.from('wordpress-images').getPublicUrl(filePath);

      return { marker: task.marker, url: publicUrl.publicUrl };
    },
    WORDPRESS_IMAGE_CONFIG.concurrency
  );

  if (failures.length > 0) {
    console.warn(
      `[wordpress-article] ${failures.length} image(s) failed:`,
      failures.map((e) => e.message)
    );
  }

  const urlByMarker = new Map(successes.map((r) => [r.marker, r.url]));

  // Step 4: resolve {{IMAGE_N}} markers into Markdown image syntax. A marker whose
  // image failed to generate is stripped rather than left as raw {{IMAGE_N}} text.
  for (const img of outline.images) {
    const url = urlByMarker.get(img.placementMarker);
    const markerPattern = new RegExp(`\\{\\{${img.placementMarker}\\}\\}`, 'g');
    content = content.replace(markerPattern, url ? `![${img.altText}](${url})` : '');
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length;

  const internalImages: GeneratedArticleImage[] = outline.images.map((img, i) => ({
    placementMarker: img.placementMarker,
    prompt: img.prompt,
    altText: img.altText,
    url: urlByMarker.get(img.placementMarker) ?? null,
    position: i,
  }));

  return {
    title: outline.title,
    metaTitle: outline.metaTitle,
    slug: outline.slug,
    metaDescription: outline.metaDescription,
    content,
    wordCount,
    featuredImagePrompt: outline.featuredImage.prompt,
    featuredImageUrl: urlByMarker.get('FEATURED') ?? null,
    internalImages,
  };
}

interface GenerateArticleFromPinsParams {
  supabase: SupabaseClient;
  userId: string;
  generationId: string;
  /**
   * All selected pins, text only. The caller must order this array so that
   * the first `internalImageUrls.length` entries are exactly the pins whose
   * image is being reused, in the same order as `internalImageUrls` — the
   * outline prompt maps "image slot N" to "pin N" in this list.
   */
  pins: PinSummary[];
  /**
   * Active pin_images URLs to reuse as internal images — every selected pin
   * with an active image, uncapped (TASK-FIX-009).
   */
  internalImageUrls: string[];
  language: SupportedLanguage;
  brandProfileDescription: string | null;
  researchNotes?: string | null;
}

/**
 * Pins → unified article generation (TASK-028 Option 4). Same outline → full
 * article two-step pipeline as generateWordPressArticle, but:
 * - the outline is synthesized from multiple pins' theme instead of a keyword
 * - internal images are the pins' own already-generated images, copied as-is
 *   (no generateImage() call, no storage upload — just their existing public URL)
 * - only the featured image is newly generated, from the outline's unified-theme prompt
 */
export async function generateArticleFromPins(
  params: GenerateArticleFromPinsParams
): Promise<GenerateArticleResult> {
  const { supabase, userId, generationId, pins, internalImageUrls, language, brandProfileDescription, researchNotes } = params;
  const brandProfileContext = buildBrandProfileContext(brandProfileDescription);
  const imageCount = internalImageUrls.length;

  // Step 1: outline, synthesized from the pins' theme
  const { system: outlineSystem, user: outlineUser } = buildWordPressFromPinsPrompt({
    pins,
    brandProfileContext: brandProfileContext || undefined,
    researchNotes: researchNotes || undefined,
    language,
    imageCount,
  });

  let stepStart = Date.now();
  const outlineRaw = await generateText({
    role: TEXT_ROLE,
    messages: [
      { role: 'system', content: outlineSystem },
      { role: 'user', content: outlineUser },
    ],
    maxTokens: OUTLINE_MAX_TOKENS,
  });
  console.log(`[wordpress-from-pins] outline generateText took ${Date.now() - stepStart}ms`);

  let outlineJson: unknown;
  try {
    outlineJson = JSON.parse(outlineRaw);
  } catch (err) {
    console.error('[wordpress-from-pins] outline JSON.parse failed. Raw response below:\n' + outlineRaw);
    throw err;
  }
  const outlineValidated = buildWordpressPinsOutlineSchema(imageCount).safeParse(applyOutlineTextLimits(outlineJson));
  if (!outlineValidated.success) {
    console.error('[wordpress-from-pins] outline Zod validation failed:', JSON.stringify(outlineValidated.error.format(), null, 2));
    console.error('[wordpress-from-pins] Raw response below:\n' + outlineRaw);
    throw new Error('AI returned an invalid outline format. Try again.');
  }
  const outline = outlineValidated.data;

  // Step 2: full article, written from the validated outline — identical to Option 1
  const { system: articleSystem, user: articleUser } = buildWordPressArticlePrompt({
    outline,
    language,
  });

  stepStart = Date.now();
  const articleRaw = await generateText({
    role: TEXT_ROLE,
    messages: [
      { role: 'system', content: articleSystem },
      { role: 'user', content: articleUser },
    ],
    maxTokens: ARTICLE_MAX_TOKENS,
    timeoutMs: ARTICLE_GENERATION_TIMEOUT_MS,
  });
  console.log(`[wordpress-from-pins] article generateText took ${Date.now() - stepStart}ms`);

  let articleJson: unknown;
  try {
    articleJson = JSON.parse(articleRaw);
  } catch (err) {
    console.error(
      '[wordpress-from-pins] article JSON.parse failed:',
      err instanceof Error ? err.message : err,
      '\nRaw response below:\n' + articleRaw
    );
    throw err;
  }
  const articleValidated = wordpressArticleResponseSchema.safeParse(articleJson);
  if (!articleValidated.success) {
    console.error(
      '[wordpress-from-pins] article Zod validation failed:',
      JSON.stringify(articleValidated.error.format(), null, 2)
    );
    throw new Error('AI returned an invalid article format. Try again.');
  }
  let content = articleValidated.data.content;

  // Step 2b: best-effort single external link (real, web-search-verified source).
  // Runs before image marker resolution so it never has to reason about
  // {{IMAGE_N}} markers — see lib/ai/services/external-link.ts for the
  // no-link-found / provider-error fallback (article is simply returned as-is).
  const externalLink = await addExternalLink(content, outline.title, language);
  content = externalLink.content;

  // Step 3: featured image only — generated fresh from the unified-theme prompt.
  // Unlike Option 1 (which routes all image generation through promisePool so a
  // failed image never kills the article), this call is unguarded on purpose
  // right now — surface the real error instead of masking it.
  let imageBuffer: Buffer;
  stepStart = Date.now();
  try {
    imageBuffer = await generateImage({ prompt: outline.featuredImage.prompt, size: WORDPRESS_IMAGE_CONFIG.size });
    console.log(`[wordpress-from-pins] featured image generateImage took ${Date.now() - stepStart}ms`);
  } catch (err) {
    console.error(
      `[wordpress-from-pins] featured image generation failed after ${Date.now() - stepStart}ms:`,
      err instanceof Error ? err.message : err
    );
    throw err;
  }
  const filePath = `${userId}/${generationId}/FEATURED.png`;

  let featuredImageUrl: string | null = null;
  try {
    const { error: uploadError } = await supabase.storage
      .from('wordpress-images')
      .upload(filePath, imageBuffer, { contentType: 'image/png' });

    if (uploadError) throw new Error(`Storage upload failed for FEATURED: ${uploadError.message}`);

    const { data: publicUrl } = supabase.storage.from('wordpress-images').getPublicUrl(filePath);
    featuredImageUrl = publicUrl.publicUrl;
  } catch (err) {
    console.error(
      '[wordpress-from-pins] featured image upload failed:',
      err instanceof Error ? err.message : err
    );
  }

  // Step 4: resolve {{IMAGE_N}} markers to the reused pin image URLs (no generation, no upload).
  for (const [i, img] of outline.images.entries()) {
    const url = internalImageUrls[i] ?? null;
    const markerPattern = new RegExp(`\\{\\{${img.placementMarker}\\}\\}`, 'g');
    content = content.replace(markerPattern, url ? `![${img.altText}](${url})` : '');
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length;

  const internalImages: GeneratedArticleImage[] = outline.images.map((img, i) => ({
    placementMarker: img.placementMarker,
    prompt: img.prompt,
    altText: img.altText,
    url: internalImageUrls[i] ?? null,
    position: i,
  }));

  return {
    title: outline.title,
    metaTitle: outline.metaTitle,
    slug: outline.slug,
    metaDescription: outline.metaDescription,
    content,
    wordCount,
    featuredImagePrompt: outline.featuredImage.prompt,
    featuredImageUrl,
    internalImages,
  };
}
