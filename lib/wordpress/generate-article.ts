import type { SupabaseClient } from '@supabase/supabase-js';
import { generateText, generateImage } from '@/lib/ai/engine';
import { buildBrandProfileContext } from '@/lib/brand-profile';
import { buildWordPressOutlinePrompt } from '@/lib/ai/prompts/wordpress-outline-prompt';
import { buildWordPressArticlePrompt } from '@/lib/ai/prompts/wordpress-article-prompt';
import { wordpressOutlineSchema, wordpressArticleResponseSchema } from '@/lib/validations/wordpress';
import { promisePool } from '@/lib/utils/promise-pool';
import type { SupportedLanguage } from '@/types/pinterest';

// Centralizes the text-generation role for TASK-028 Option 1: FAST while the
// feature is being tested for output quality. Bump to 'SMART' here alone if
// FAST isn't good enough — every call site in this file reads this constant,
// nothing else needs to change.
const TEXT_ROLE: 'FAST' | 'SMART' = 'FAST';

const WORDPRESS_IMAGE_CONFIG = {
  size: '1024x1024',
  concurrency: 3,
} as const;

// Bumped alongside the outline/article prompt restructure (10-block AEO layout,
// 1800-2500 word target instead of 800-1200, plus Quick Answer/Key Takeaways/
// Common Mistakes/FAQ as extra structured fields on the article response) —
// the previous budgets were sized for the shorter structure and would truncate
// the JSON response before it finished, breaking JSON.parse.
const OUTLINE_MAX_TOKENS = 3000;
const ARTICLE_MAX_TOKENS = 8000;

interface GenerateArticleParams {
  supabase: SupabaseClient;
  userId: string;
  generationId: string;
  keyword: string;
  language: SupportedLanguage;
  brandProfileDescription: string | null;
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
  const { supabase, userId, generationId, keyword, language, brandProfileDescription } = params;
  const brandProfileContext = buildBrandProfileContext(brandProfileDescription);

  // Step 1: outline
  const { system: outlineSystem, user: outlineUser } = buildWordPressOutlinePrompt({
    keyword,
    brandProfileContext: brandProfileContext || undefined,
    language,
  });

  const outlineRaw = await generateText({
    role: TEXT_ROLE,
    messages: [
      { role: 'system', content: outlineSystem },
      { role: 'user', content: outlineUser },
    ],
    maxTokens: OUTLINE_MAX_TOKENS,
  });

  const outlineValidated = wordpressOutlineSchema.safeParse(JSON.parse(outlineRaw));
  if (!outlineValidated.success) {
    throw new Error('AI returned an invalid outline format. Try again.');
  }
  const outline = outlineValidated.data;

  // Step 2: full article, written from the validated outline
  const { system: articleSystem, user: articleUser } = buildWordPressArticlePrompt({
    outline,
    language,
  });

  const articleRaw = await generateText({
    role: TEXT_ROLE,
    messages: [
      { role: 'system', content: articleSystem },
      { role: 'user', content: articleUser },
    ],
    maxTokens: ARTICLE_MAX_TOKENS,
  });

  const articleValidated = wordpressArticleResponseSchema.safeParse(JSON.parse(articleRaw));
  if (!articleValidated.success) {
    throw new Error('AI returned an invalid article format. Try again.');
  }
  let content = articleValidated.data.content;

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
    slug: outline.slug,
    metaDescription: outline.metaDescription,
    content,
    wordCount,
    featuredImagePrompt: outline.featuredImage.prompt,
    featuredImageUrl: urlByMarker.get('FEATURED') ?? null,
    internalImages,
  };
}
