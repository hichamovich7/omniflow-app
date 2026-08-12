import type { SupabaseClient } from '@supabase/supabase-js';
import { generateText, generateImage } from '@/lib/ai/engine';
import { buildBrandProfileContext } from '@/lib/brand-profile';
import { buildWordPressOutlinePrompt } from '@/lib/ai/prompts/wordpress-outline-prompt';
import { buildWordPressArticlePrompt } from '@/lib/ai/prompts/wordpress-article-prompt';
import { buildSourceContextSummaryPrompt } from '@/lib/ai/prompts/source-context-summary';
import { addExternalLink } from '@/lib/ai/services/external-link';
import { scrapeUrl, CONTENT_CHAR_CAP } from '@/lib/research/providers/firecrawl';
import {
  wordpressOutlineSchema,
  wordpressArticleResponseSchema,
  sourceContextSummarySchema,
} from '@/lib/validations/wordpress';
import type { SourceContextSummary } from '@/lib/validations/wordpress';
import {
  TEXT_ROLE,
  WORDPRESS_IMAGE_CONFIG,
  OUTLINE_MAX_TOKENS,
  ARTICLE_MAX_TOKENS,
  ARTICLE_GENERATION_TIMEOUT_MS,
  applyOutlineTextLimits,
} from '@/lib/wordpress/generate-article';
import type { GenerateArticleResult, GeneratedArticleImage } from '@/lib/wordpress/generate-article';
import { promisePool } from '@/lib/utils/promise-pool';
import type { SupportedLanguage } from '@/types/pinterest';

const SUMMARY_MAX_TOKENS = 1500;
const MAX_KEYWORD_LENGTH = 200;

interface GenerateArticleFromUrlParams {
  supabase: SupabaseClient;
  userId: string;
  generationId: string;
  /** Present when the source is a link to scrape — mutually exclusive with pastedContent. */
  sourceUrl?: string;
  /** Present when the source is text pasted directly — mutually exclusive with sourceUrl. */
  pastedContent?: string;
  language: SupportedLanguage;
  brandProfileDescription: string | null;
}

export interface GenerateArticleFromUrlResult extends GenerateArticleResult {
  /**
   * The keyword actually used to target the outline/article prompts —
   * derived from the source itself (scraped title, or the summary's own
   * theme for pasted text), never the raw URL or raw pasted text. The
   * caller persists this back onto wordpress_generations.keyword so the
   * stored record matches what was really generated.
   */
  resolvedKeyword: string;
  sourceSummary: SourceContextSummary;
}

function formatSummaryAsResearchNotes(summary: SourceContextSummary): string {
  return [
    `Theme: ${summary.theme}`,
    `Topics covered: ${summary.topics.join('; ')}`,
    `Angles: ${summary.angles.join('; ')}`,
    `Key points: ${summary.keyPoints.join('; ')}`,
  ].join('\n');
}

function truncateAtWord(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const cut = trimmed.slice(0, maxLength).replace(/\s+\S*$/, '');
  return cut || trimmed.slice(0, maxLength);
}

/**
 * TASK-028 Option 3 (external source → article, DECISIONS.md 2026-08-12).
 * Reuses the EXACT same outline → full-article prompts, schemas, and image
 * pipeline as Option 1 (generateWordPressArticle, generate-article.ts) — the
 * only thing that differs is where the "research notes" fed into the outline
 * prompt come from: instead of the user typing them, they're a structured
 * summary of an external source's topics/angles/key points (never the
 * source's own sentences/structure/phrasing), generated fresh every call and
 * never persisted. The source is never reproduced or paraphrased closely —
 * see lib/ai/prompts/source-context-summary.ts.
 *
 * Orchestration-level duplication with generateWordPressArticle (outline
 * call, article call, image generation loop) is deliberate, not an
 * oversight — same "reasonable duplication over premature shared
 * abstraction" convention already applied to generateArticleFromPins
 * (Option 4), see DECISIONS.md 2026-07-15.
 */
export async function generateArticleFromUrl(
  params: GenerateArticleFromUrlParams
): Promise<GenerateArticleFromUrlResult> {
  const { supabase, userId, generationId, sourceUrl, pastedContent, language, brandProfileDescription } = params;
  const brandProfileContext = buildBrandProfileContext(brandProfileDescription);

  // Step 0: get the source content — scrape (link, via the same Firecrawl
  // provider Research uses) or use pasted text as-is, both capped at the
  // same length Firecrawl itself already enforces.
  let sourceTitle: string | null = null;
  let sourceContent: string;
  if (sourceUrl) {
    const scraped = await scrapeUrl(sourceUrl);
    sourceTitle = scraped.title;
    sourceContent = scraped.content;
  } else {
    sourceContent = (pastedContent ?? '').slice(0, CONTENT_CHAR_CAP);
  }

  // Step 1: structured research summary — topics/angles/key points only,
  // never the source's own sentences/structure/phrasing (see prompt).
  const { system: summarySystem, user: summaryUser } = buildSourceContextSummaryPrompt({
    title: sourceTitle,
    content: sourceContent,
    language,
  });

  const summaryRaw = await generateText({
    role: 'FAST',
    messages: [
      { role: 'system', content: summarySystem },
      { role: 'user', content: summaryUser },
    ],
    maxTokens: SUMMARY_MAX_TOKENS,
  });

  let summaryJson: unknown;
  try {
    summaryJson = JSON.parse(summaryRaw);
  } catch (err) {
    console.error('[wordpress-from-url] summary JSON.parse failed. Raw response below:\n' + summaryRaw);
    throw err;
  }
  const summaryValidated = sourceContextSummarySchema.safeParse(summaryJson);
  if (!summaryValidated.success) {
    console.error(
      '[wordpress-from-url] summary Zod validation failed:',
      JSON.stringify(summaryValidated.error.format(), null, 2)
    );
    throw new Error('AI returned an invalid source summary format. Try again.');
  }
  const sourceSummary = summaryValidated.data;
  const researchNotes = formatSummaryAsResearchNotes(sourceSummary);

  // The keyword the outline/article target is derived from the source
  // itself (scraped title, or the summary's own theme for pasted text) —
  // never the raw URL or raw pasted text, which would make a poor SEO
  // target string (see buildSeoGuidelines, seo-guidelines.ts).
  const resolvedKeyword = truncateAtWord(sourceTitle || sourceSummary.theme, MAX_KEYWORD_LENGTH);

  // Step 2: outline — EXACT same prompt/schema as Option 1. Only the
  // researchNotes input differs (a source summary instead of user-typed notes).
  const { system: outlineSystem, user: outlineUser } = buildWordPressOutlinePrompt({
    keyword: resolvedKeyword,
    brandProfileContext: brandProfileContext || undefined,
    researchNotes,
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

  let outlineJson: unknown;
  try {
    outlineJson = JSON.parse(outlineRaw);
  } catch (err) {
    console.error('[wordpress-from-url] outline JSON.parse failed. Raw response below:\n' + outlineRaw);
    throw err;
  }
  const outlineValidated = wordpressOutlineSchema.safeParse(applyOutlineTextLimits(outlineJson));
  if (!outlineValidated.success) {
    console.error(
      '[wordpress-from-url] outline Zod validation failed:',
      JSON.stringify(outlineValidated.error.format(), null, 2)
    );
    console.error('[wordpress-from-url] Raw response below:\n' + outlineRaw);
    throw new Error('AI returned an invalid outline format. Try again.');
  }
  const outline = outlineValidated.data;

  // Step 3: full article — EXACT same prompt/schema as Option 1, unchanged.
  const { system: articleSystem, user: articleUser } = buildWordPressArticlePrompt({ outline, language });

  const articleRaw = await generateText({
    role: TEXT_ROLE,
    messages: [
      { role: 'system', content: articleSystem },
      { role: 'user', content: articleUser },
    ],
    maxTokens: ARTICLE_MAX_TOKENS,
    timeoutMs: ARTICLE_GENERATION_TIMEOUT_MS,
  });

  const articleValidated = wordpressArticleResponseSchema.safeParse(JSON.parse(articleRaw));
  if (!articleValidated.success) {
    throw new Error('AI returned an invalid article format. Try again.');
  }
  let content = articleValidated.data.content;

  // Step 3b: best-effort single external link — same as Option 1/4.
  const externalLink = await addExternalLink(content, outline.title, language);
  content = externalLink.content;

  // Step 4: featured + internal images — freshly generated via generateImage(),
  // same as Option 1. Never reuses any image from the external source.
  const imageTasks = [
    { marker: 'FEATURED', prompt: outline.featuredImage.prompt },
    ...outline.images.map((img) => ({ marker: img.placementMarker, prompt: img.prompt })),
  ];

  const { successes, failures } = await promisePool<
    (typeof imageTasks)[number],
    { marker: string; url: string | null }
  >(
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
      `[wordpress-from-url] ${failures.length} image(s) failed:`,
      failures.map((e) => e.message)
    );
  }

  const urlByMarker = new Map(successes.map((r) => [r.marker, r.url]));

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
    resolvedKeyword,
    sourceSummary,
  };
}
