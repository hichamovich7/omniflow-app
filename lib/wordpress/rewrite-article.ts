import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateText } from '@/lib/ai/engine';
import { buildBrandProfileContext } from '@/lib/brand-profile';
import { buildWordPressRewritePrompt, REWRITE_PROMPT_ID } from '@/lib/ai/prompts/wordpress-rewrite-prompt';
import { FAQ_PLACEMENT_MARKER } from '@/lib/ai/prompts/wordpress-article-prompt';
import type { ResolvedNicheContext } from '@/lib/niche/types';
import { applyFaqSection, type FaqItem } from '@/lib/wordpress/faq-section';
import { faqItemSchema, resolveArticleFaq } from '@/lib/wordpress/faq-data';
import { runArticleQualityCheck, logArticleQuality, type ArticleQualityReport } from '@/lib/wordpress/quality-check';
import { getMetaTitle } from '@/lib/wordpress/export';
import {
  ARTICLE_GENERATION_TIMEOUT_MS,
  ARTICLE_MAX_TOKENS,
  ARTICLE_MAX_TOKENS_LARGE,
  TEXT_ROLE,
  logWordPressTextModel,
} from '@/lib/wordpress/generate-article';
import type { SupportedLanguage } from '@/types/pinterest';
import type { WordPressArticle, WordPressArticleImage, WordPressGeneration } from '@/types/wordpress';

/**
 * "Rewrite article" (WordPress review page). A rewrite is a NEW version: a
 * new wordpress_generations row (same options, same source fields) with its
 * own wordpress_articles row. The previous generation is never modified, so
 * it stays in the history and can be reopened, exported or published.
 *
 * The existing article is the reused outline and factual source: same H1,
 * same H2 sections, same images (copied to the new version's storage
 * folder), same links, same slug / meta title / meta description / category.
 * Only the text is regenerated (one AI text call, no outline call, no image
 * call, no web search). The FAQ is regenerated when the article has a
 * parseable one, kept as is otherwise. The Quality Gate runs again. Nothing
 * is ever sent to WordPress: the new version starts as a local draft.
 */

export const REWRITE_CONFIRMATION_MESSAGE =
  'A new version of this article will be generated from the same brief and settings. The current version is kept in your history and is not changed. Nothing is published to WordPress.';

export class RewriteArticleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'RewriteArticleError';
  }
}

// ------------------------------------------------------------ source prep

const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
const LINK_PATTERN = /(?<!!)\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g;
const FAQ_H2_PATTERN =
  /^##[ \t]+(FAQ\b|Frequently Asked Questions|Häufig gestellte Fragen|Preguntas frecuentes|Questions fréquentes|Foire aux questions)/i;
const FAQ_MARKER_LINE = new RegExp(`^[ \\t]*${FAQ_PLACEMENT_MARKER.replace(/[{}]/g, '\\$&')}[ \\t]*$`, 'gm');

export interface RewriteImage {
  /** Marker used in the rewrite prompt, e.g. "IMAGE_1". */
  marker: string;
  alt: string;
  url: string;
}

export type RewriteFaqPlan =
  | { mode: 'regenerate'; questions: string[] }
  | { mode: 'preserve'; section: string }
  | { mode: 'none' };

export interface PreparedRewriteSource {
  /** Article Markdown with images as {{IMAGE_N}} lines and the FAQ as the {{FAQ}} line. */
  sourceContent: string;
  images: RewriteImage[];
  headings: string[];
  links: string[];
  faq: RewriteFaqPlan;
}

/**
 * Turns the stored article into the rewrite input. Pure. Works for every
 * article (keyword, URL, Pins; before or after the structured FAQ column):
 * images are read from the Markdown itself, the FAQ from the stored column
 * or, for older articles, the content (resolveArticleFaq).
 */
export function prepareRewriteSource(
  article: Pick<WordPressArticle, 'content'> & { faq?: unknown },
  includeFaq: boolean | null | undefined
): PreparedRewriteSource {
  const images: RewriteImage[] = [];
  let content = article.content.replace(IMAGE_PATTERN, (_match, alt: string, url: string) => {
    const marker = `IMAGE_${images.length + 1}`;
    images.push({ marker, alt, url });
    return `{{${marker}}}`;
  });

  // FAQ section: from its H2 to the next H1/H2, replaced by the {{FAQ}} line.
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => FAQ_H2_PATTERN.test(line.trim()));
  let faqSection: string | null = null;
  if (start !== -1) {
    let end = lines.findIndex((line, index) => index > start && /^#{1,2}\s/.test(line.trim()));
    if (end === -1) end = lines.length;
    faqSection = lines.slice(start, end).join('\n').trim();
    lines.splice(start, end - start, FAQ_PLACEMENT_MARKER, '');
    content = lines.join('\n');
  }

  const resolvedFaq = resolveArticleFaq(article, includeFaq);
  const faq: RewriteFaqPlan = faqSection === null
    ? { mode: 'none' }
    : resolvedFaq.items.length > 0
      ? { mode: 'regenerate', questions: resolvedFaq.items.map((item) => item.question) }
      : { mode: 'preserve', section: faqSection };

  const headings = content
    .split(/\r?\n/)
    .map((line) => /^##[ \t]+(.+?)\s*$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1]);

  const links = [...new Set([...content.matchAll(LINK_PATTERN)].map((match) => match[1]))];

  return { sourceContent: content.replace(/\n{3,}/g, '\n\n').trim(), images, headings, links, faq };
}

// ------------------------------------------------------------ finalization

export interface FinalizeRewriteInput {
  rewrittenContent: string;
  rewrittenFaq: FaqItem[];
  title: string;
  language: SupportedLanguage;
  includeH3: boolean | null | undefined;
  source: PreparedRewriteSource;
}

export interface FinalizedRewrite {
  content: string;
  /** Before image resolution — where the Quality Gate counts {{IMAGE_N}} markers. */
  contentBeforeImages: string;
  faq: FaqItem[];
  /** Markers the model dropped and the server put back (at the end of the body). */
  restoredImageMarkers: string[];
}

/**
 * Deterministic guarantees on the model output, so a rewrite never loses
 * what must be kept: the stored H1, every image (missing markers put back,
 * duplicates dropped), the FAQ (regenerated from the structured field, or
 * the original section put back as is). Pure.
 */
export function finalizeRewrittenContent(input: FinalizeRewriteInput): FinalizedRewrite {
  const { source } = input;
  let content = input.rewrittenContent.replace(/\r\n/g, '\n').trim();

  // H1: always the stored title, exactly once, first line.
  const contentLines = content.split('\n').filter((line) => !/^#[ \t]+/.test(line));
  content = [`# ${input.title}`, '', ...contentLines].join('\n').replace(/\n{3,}/g, '\n\n');

  // Images: each marker exactly once.
  const restoredImageMarkers: string[] = [];
  for (const image of source.images) {
    const token = `{{${image.marker}}}`;
    const first = content.indexOf(token);
    if (first === -1) {
      restoredImageMarkers.push(image.marker);
      continue;
    }
    content = content.slice(0, first + token.length) + content.slice(first + token.length).split(token).join('');
  }
  if (restoredImageMarkers.length > 0) {
    const block = restoredImageMarkers.map((marker) => `{{${marker}}}`).join('\n\n');
    const faqIndex = content.search(FAQ_MARKER_LINE);
    FAQ_MARKER_LINE.lastIndex = 0;
    content = faqIndex === -1
      ? `${content.trimEnd()}\n\n${block}\n`
      : `${content.slice(0, faqIndex).trimEnd()}\n\n${block}\n\n${content.slice(faqIndex)}`;
  }

  // FAQ.
  let faq: FaqItem[] = [];
  if (source.faq.mode === 'regenerate') {
    const applied = applyFaqSection(content, input.rewrittenFaq, {
      language: input.language,
      useH3: input.includeH3 !== false,
    });
    content = applied.content;
    faq = applied.faq;
  } else if (source.faq.mode === 'preserve') {
    const section = source.faq.section;
    let placed = false;
    content = content.replace(FAQ_MARKER_LINE, () => {
      if (placed) return '';
      placed = true;
      return section;
    });
    if (!placed) content = `${content.trimEnd()}\n\n${section}\n`;
  } else {
    content = content.replace(FAQ_MARKER_LINE, '');
  }
  content = content.replace(/\n{3,}/g, '\n\n').trim() + '\n';

  const contentBeforeImages = content;
  for (const image of source.images) {
    content = content.split(`{{${image.marker}}}`).join(`![${image.alt}](${image.url})`);
  }

  return { content, contentBeforeImages, faq, restoredImageMarkers };
}

// ------------------------------------------------------------ AI step

function splitList(value: string | null): string[] {
  return (value ?? '').split(',').map((v) => v.trim()).filter(Boolean);
}

function rewriteResponseSchema(faqCount: number) {
  return z.object({
    content: z.string().min(1),
    faq: z.array(faqItemSchema).length(faqCount),
  });
}

/** Strips a ```json fence some models add despite the instructions. */
function parseJsonResponse(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

export interface RewriteArticleInput {
  generation: WordPressGeneration;
  article: WordPressArticle;
  brandProfileDescription: string | null;
  niche: ResolvedNicheContext | null;
  siteUrl: string | null;
}

export interface RewriteArticleDeps {
  generateText: typeof generateText;
}

export interface RewriteArticleResult extends FinalizedRewrite {
  wordCount: number;
  quality: ArticleQualityReport;
}

/**
 * The rewrite itself: one text call, then finalizeRewrittenContent() and a
 * fresh Quality Gate report. Reads and writes nothing — persistence is the
 * route's job (app/api/wordpress/[id]/rewrite/route.ts).
 */
export async function rewriteArticleContent(
  input: RewriteArticleInput,
  source: PreparedRewriteSource,
  deps: RewriteArticleDeps = { generateText }
): Promise<RewriteArticleResult> {
  const { generation, article } = input;
  const language = generation.language as SupportedLanguage;
  const faqQuestions = source.faq.mode === 'regenerate' ? source.faq.questions : [];
  const brandProfileContext = buildBrandProfileContext(input.brandProfileDescription);

  const { system, user } = buildWordPressRewritePrompt({
    title: article.title,
    primaryKeyword: generation.keyword,
    language,
    sourceContent: source.sourceContent,
    headings: source.headings,
    imageMarkers: source.images.map((image) => image.marker),
    links: source.links,
    faqQuestions,
    hasFaqMarker: source.faq.mode !== 'none',
    brandProfileContext: brandProfileContext || undefined,
    researchNotes: generation.research_notes || undefined,
    niche: input.niche,
    articleType: generation.article_type ?? undefined,
    articleSize: generation.article_size ?? undefined,
    toneOfVoice: generation.tone_of_voice ?? undefined,
    pointOfView: generation.point_of_view ?? undefined,
    targetCountry: generation.target_country ?? undefined,
    hookBrief: generation.hook_brief ?? undefined,
    includeConclusion: generation.include_conclusion ?? undefined,
    includeTables: generation.include_tables ?? undefined,
    includeH3: generation.include_h3 ?? undefined,
    includeLists: generation.include_lists ?? undefined,
    includeItalics: generation.include_italics ?? undefined,
    includeQuotes: generation.include_quotes ?? undefined,
    includeBold: generation.include_bold ?? undefined,
    seoKeywords: splitList(generation.seo_keywords),
  });

  const finishReasons: (string | null)[] = [];
  logWordPressTextModel('wordpress-rewrite', 'article', TEXT_ROLE);
  const raw = await deps.generateText({
    role: TEXT_ROLE,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    maxTokens: generation.article_size === 'large' ? ARTICLE_MAX_TOKENS_LARGE : ARTICLE_MAX_TOKENS,
    timeoutMs: ARTICLE_GENERATION_TIMEOUT_MS,
    onFinish: ({ finishReason }) => finishReasons.push(finishReason),
  });

  let json: unknown;
  try {
    json = parseJsonResponse(raw);
  } catch {
    throw new RewriteArticleError('invalid_rewrite', "The AI returned a response that wasn't valid JSON. Try again.", 422);
  }
  const parsed = rewriteResponseSchema(faqQuestions.length).safeParse(json);
  if (!parsed.success) {
    throw new RewriteArticleError('invalid_rewrite', 'AI returned an invalid article format. Try again.', 422);
  }

  const finalized = finalizeRewrittenContent({
    rewrittenContent: parsed.data.content,
    rewrittenFaq: parsed.data.faq,
    title: article.title,
    language,
    includeH3: generation.include_h3,
    source,
  });
  if (finalized.restoredImageMarkers.length > 0) {
    console.warn(`[${REWRITE_PROMPT_ID}] image marker(s) restored: ${finalized.restoredImageMarkers.join(', ')}`);
  }

  const manualUrls = splitList(generation.manual_external_urls);
  const outboundLinkUrl = source.links.find((url) => !input.siteUrl || !sameHost(url, input.siteUrl)) ?? null;
  const quality = runArticleQualityCheck({
    title: article.title,
    metaTitle: getMetaTitle(article),
    metaDescription: article.meta_description,
    slug: article.slug,
    content: finalized.content,
    contentBeforeImages: finalized.contentBeforeImages,
    language,
    articleSize: generation.article_size,
    expectedH2Headings: source.headings,
    expectedImageMarkers: source.images.map((image) => image.marker),
    includeH3: generation.include_h3,
    faqExpected: source.faq.mode !== 'none',
    includeKeyTakeaways: generation.include_key_takeaways,
    includeConclusion: generation.include_conclusion,
    includeTables: generation.include_tables,
    includeQuotes: generation.include_quotes,
    allowedUrls: [...manualUrls, ...source.links],
    outboundLinkUrl,
    siteUrl: input.siteUrl,
    finishReasons,
  });
  logArticleQuality('wordpress-rewrite', quality);

  return {
    ...finalized,
    wordCount: finalized.content.split(/\s+/).filter(Boolean).length,
    quality,
  };
}

function sameHost(url: string, siteUrl: string): boolean {
  try {
    return new URL(url).host.replace(/^www\./, '') === new URL(siteUrl).host.replace(/^www\./, '');
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ persistence helpers

const WORDPRESS_IMAGES_BUCKET = 'wordpress-images';
const PUBLIC_PATH_SEGMENT = `/object/public/${WORDPRESS_IMAGES_BUCKET}/`;

/**
 * Copies the images of the previous version that live in its own storage
 * folder (`<user>/<generation>/…`, removed when that version is deleted)
 * into the new version's folder, so deleting either version never breaks
 * the other. Other URLs (e.g. reused Pin images) are kept as they are. A
 * failed copy keeps the original URL and is reported as a warning.
 */
export async function copyArticleImages(
  supabase: SupabaseClient,
  params: { userId: string; fromGenerationId: string; toGenerationId: string; urls: string[] }
): Promise<{ urlMap: Map<string, string>; warnings: string[] }> {
  const urlMap = new Map<string, string>();
  const warnings: string[] = [];
  const fromPrefix = `${params.userId}/${params.fromGenerationId}/`;

  for (const url of new Set(params.urls)) {
    const index = url.indexOf(PUBLIC_PATH_SEGMENT);
    if (index === -1) continue;
    const path = decodeURIComponent(url.slice(index + PUBLIC_PATH_SEGMENT.length).split('?')[0]);
    if (!path.startsWith(fromPrefix)) continue;

    const target = `${params.userId}/${params.toGenerationId}/${path.slice(fromPrefix.length)}`;
    try {
      const { error } = await supabase.storage.from(WORDPRESS_IMAGES_BUCKET).copy(path, target);
      if (error) throw new Error(error.message);
      urlMap.set(url, supabase.storage.from(WORDPRESS_IMAGES_BUCKET).getPublicUrl(target).data.publicUrl);
    } catch (err) {
      console.warn('[wordpress-rewrite] image copy failed:', err instanceof Error ? err.message : err);
      warnings.push('An image could not be copied to the new version; it still points to the previous version, so keep that version if you delete anything.');
    }
  }
  return { urlMap, warnings: [...new Set(warnings)] };
}

/** Points the content's image URLs to the copied files (old → new). Pure. */
export function applyImageUrlMap(content: string, urlMap: Map<string, string>): string {
  let result = content;
  for (const [from, to] of urlMap) result = result.split(`](${from})`).join(`](${to})`);
  return result;
}

/** Options copied from the previous generation onto the new version's row. */
export function buildRewriteGenerationRow(generation: WordPressGeneration) {
  return {
    project_id: generation.project_id,
    user_id: generation.user_id,
    keyword: generation.keyword,
    language: generation.language,
    source_type: generation.source_type,
    research_notes: generation.research_notes,
    source_pin_ids: generation.source_pin_ids,
    source_url: generation.source_url,
    status: 'processing' as const,
    article_type: generation.article_type,
    article_size: generation.article_size,
    tone_of_voice: generation.tone_of_voice,
    point_of_view: generation.point_of_view,
    target_country: generation.target_country,
    hook_brief: generation.hook_brief,
    include_conclusion: generation.include_conclusion,
    include_tables: generation.include_tables,
    include_h3: generation.include_h3,
    include_lists: generation.include_lists,
    include_italics: generation.include_italics,
    include_quotes: generation.include_quotes,
    include_key_takeaways: generation.include_key_takeaways,
    include_faq: generation.include_faq,
    include_bold: generation.include_bold,
    seo_keywords: generation.seo_keywords,
    manual_external_urls: generation.manual_external_urls,
  };
}

/**
 * The new version's article row: slug, meta title, meta description,
 * category and featured image kept; new content. No WordPress post id and
 * the default local publish status — the new version is never linked to,
 * nor sent to, the WordPress post of the previous one.
 */
export function buildRewriteArticleRow(
  article: WordPressArticle,
  newGenerationId: string,
  rewrite: Pick<RewriteArticleResult, 'content' | 'wordCount'>,
  imageUrlMap: Map<string, string>
) {
  return {
    generation_id: newGenerationId,
    title: article.title,
    meta_title: article.meta_title,
    slug: article.slug,
    meta_description: article.meta_description,
    content: rewrite.content,
    word_count: rewrite.wordCount,
    featured_image_prompt: article.featured_image_prompt,
    featured_image_url: article.featured_image_url
      ? imageUrlMap.get(article.featured_image_url) ?? article.featured_image_url
      : null,
    status: 'completed' as const,
    category_id: article.category_id,
  };
}

export function buildRewriteImageRows(
  images: WordPressArticleImage[],
  newArticleId: string,
  imageUrlMap: Map<string, string>
) {
  return images.map((image) => ({
    article_id: newArticleId,
    placement_marker: image.placement_marker,
    prompt: image.prompt,
    alt_text: image.alt_text,
    url: image.url ? imageUrlMap.get(image.url) ?? image.url : null,
    position: image.position,
  }));
}
