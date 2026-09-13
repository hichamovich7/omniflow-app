import { z } from 'zod';
import { SUPPORTED_LANGUAGES } from '@/types/pinterest';

// Core Settings (TASK-FIX-034, "1-Click Blog Post" / Option 1 only). Every
// field is optional — omitting all five reproduces the pre-existing outline
// and article prompts exactly (see lib/ai/prompts/wordpress-outline-prompt.ts
// and generate-article.ts). Kept here (not in types/wordpress.ts) because the
// values are validated boundaries first and reused as literal-typed source of
// truth for the DB row's article_type/article_size/tone_of_voice/point_of_view.
export const ARTICLE_TYPES = ['how-to', 'listicle', 'product-review', 'news', 'comparison'] as const;
export const ARTICLE_SIZES = ['small', 'medium', 'large'] as const;
export const TONES_OF_VOICE = [
  'friendly',
  'professional',
  'informational',
  'transactional',
  'inspirational',
  'neutral',
  'witty',
  'casual',
] as const;
export const POINTS_OF_VIEW = ['first-singular', 'first-plural', 'second', 'third'] as const;

// Free-text on the DB column (no FK/lookup needed — it's a prompt hint, not an
// identifier), but constrained to this fixed list at the Zod layer so the UI
// select and the AI prompt always agree on the exact label. Covers OmniFlow's
// four supported content languages (en/de/es/fr) plus other common markets.
export const TARGET_COUNTRIES = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
  'Austria',
  'Switzerland',
  'France',
  'Belgium',
  'Spain',
  'Mexico',
  'Argentina',
  'Ireland',
  'New Zealand',
  'Netherlands',
  'Italy',
  'Portugal',
  'India',
] as const;

export const ARTICLE_SIZE_CONFIG: Record<
  (typeof ARTICLE_SIZES)[number],
  { minSections: number; maxSections: number; minWords: number; maxWords: number }
> = {
  small: { minSections: 5, maxSections: 8, minWords: 1200, maxWords: 2400 },
  medium: { minSections: 9, maxSections: 12, minWords: 2400, maxWords: 3600 },
  large: { minSections: 13, maxSections: 16, minWords: 3600, maxWords: 5000 },
};

// Pre-existing behavior (no articleSize chosen) — unchanged from before
// TASK-FIX-034, and still what buildWordpressOutlineSchema()/wordpressOutlineSchema
// (no args) produce.
export const DEFAULT_SECTIONS_RANGE = { minSections: 8, maxSections: 10 } as const;
export const DEFAULT_WORDS_RANGE = { minWords: 1800, maxWords: 2500 } as const;

// Structure (TASK-FIX-035, "1-Click Blog Post" / Option 1 only). Hook Brief is
// free text (capped, with 5 client-side presets — see components/wordpress/
// article-form.tsx); the other 9 are 3-state toggles represented as
// z.boolean().optional() — true ("Oui"), false ("Non"), omitted/undefined
// ("Non défini", the default that reproduces pre-existing behavior exactly).
export const HOOK_BRIEF_MAX_LENGTH = 500;

// Key Takeaways and FAQ are always-present sections before TASK-FIX-035 (the
// outline schema requires 4-6 items for each). DEFAULT_* reproduces that
// exactly — used whenever the corresponding toggle is true/undefined. Only an
// explicit "Non" swaps in DISABLED_RANGE (a hard 0-length array), which is a
// genuine Zod-enforced guarantee of absence, not just a soft prompt request.
export const DEFAULT_KEY_TAKEAWAYS_RANGE = { min: 4, max: 6 } as const;
export const DEFAULT_FAQ_RANGE = { min: 4, max: 6 } as const;
export const DISABLED_ARRAY_RANGE = { min: 0, max: 0 } as const;

export const generateArticleSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  keyword: z.string().trim().min(1, 'Keyword is required').max(200, 'Keyword is too long'),
  language: z.enum(SUPPORTED_LANGUAGES, { message: 'Invalid language' }),
  researchNotes: z.string().trim().max(2000, 'Research notes are too long').optional(),
  categoryId: z.string().uuid('Invalid category ID').optional(),
  articleType: z.enum(ARTICLE_TYPES, { message: 'Invalid article type' }).optional(),
  articleSize: z.enum(ARTICLE_SIZES, { message: 'Invalid article size' }).optional(),
  toneOfVoice: z.enum(TONES_OF_VOICE, { message: 'Invalid tone of voice' }).optional(),
  pointOfView: z.enum(POINTS_OF_VIEW, { message: 'Invalid point of view' }).optional(),
  targetCountry: z.enum(TARGET_COUNTRIES, { message: 'Invalid target country' }).optional(),
  hookBrief: z.string().trim().max(HOOK_BRIEF_MAX_LENGTH, 'Hook brief is too long').optional(),
  includeConclusion: z.boolean().optional(),
  includeTables: z.boolean().optional(),
  includeH3: z.boolean().optional(),
  includeLists: z.boolean().optional(),
  includeItalics: z.boolean().optional(),
  includeQuotes: z.boolean().optional(),
  includeKeyTakeaways: z.boolean().optional(),
  includeFaq: z.boolean().optional(),
  includeBold: z.boolean().optional(),
});

export type GenerateArticleInput = z.infer<typeof generateArticleSchema>;

export const generateArticleFromPinsSchema = z.object({
  pinIds: z.array(z.string().uuid()).min(1, 'Select at least one pin').max(20, 'Too many pins selected'),
  researchNotes: z.string().trim().max(2000, 'Research notes are too long').optional(),
  categoryId: z.string().uuid('Invalid category ID').optional(),
});

export type GenerateArticleFromPinsInput = z.infer<typeof generateArticleFromPinsSchema>;

// Matches CONTENT_CHAR_CAP in lib/research/providers/firecrawl.ts — pasted
// text is capped at the exact same length Firecrawl itself already enforces
// on scraped content.
export const MAX_PASTED_CONTENT_LENGTH = 12000;

export const generateArticleFromUrlSchema = z
  .object({
    projectId: z.string().uuid('Invalid project ID'),
    language: z.enum(SUPPORTED_LANGUAGES, { message: 'Invalid language' }),
    categoryId: z.string().uuid('Invalid category ID').optional(),
    sourceType: z.enum(['link', 'pasted'], { message: 'Invalid source type' }),
    sourceUrl: z.string().trim().url('Invalid URL').max(2000, 'URL is too long').optional(),
    pastedContent: z
      .string()
      .trim()
      .min(1, 'Pasted content is required')
      .max(MAX_PASTED_CONTENT_LENGTH, 'Pasted content is too long')
      .optional(),
  })
  .refine((data) => data.sourceType !== 'link' || !!data.sourceUrl, {
    message: 'A URL is required when source type is "link"',
    path: ['sourceUrl'],
  })
  .refine((data) => data.sourceType !== 'pasted' || !!data.pastedContent, {
    message: 'Pasted content is required when source type is "pasted"',
    path: ['pastedContent'],
  })
  .refine((data) => !(data.sourceType === 'link' && data.pastedContent), {
    message: 'Remove pasted content when using a URL source',
    path: ['pastedContent'],
  })
  .refine((data) => !(data.sourceType === 'pasted' && data.sourceUrl), {
    message: 'Remove the URL when using pasted content',
    path: ['sourceUrl'],
  });

export type GenerateArticleFromUrlInput = z.infer<typeof generateArticleFromUrlSchema>;

const outlineImageSchema = z.object({
  placementMarker: z.string().min(1),
  prompt: z.string().min(1),
  altText: z.string().min(1),
});

interface OutlineSchemaOptions {
  sectionsRange?: { minSections: number; maxSections: number };
  keyTakeawaysRange?: { min: number; max: number };
  faqRange?: { min: number; max: number };
}

/**
 * Parameterized by Main Content section count (Article Size, TASK-FIX-034)
 * and by Key Takeaways/FAQ array length (Structure, TASK-FIX-035) so those
 * optional settings can widen, narrow, or zero out parts of the outline
 * without duplicating the whole schema. Called with no args, this produces
 * byte-for-byte the same schema as before TASK-FIX-034/035 (8-10 sections,
 * 4-6 Key Takeaways, 4-6 FAQ) — see DEFAULT_SECTIONS_RANGE/
 * DEFAULT_KEY_TAKEAWAYS_RANGE/DEFAULT_FAQ_RANGE.
 */
export function buildWordpressOutlineSchema(opts: OutlineSchemaOptions = {}) {
  const sectionsRange = opts.sectionsRange ?? DEFAULT_SECTIONS_RANGE;
  const keyTakeawaysRange = opts.keyTakeawaysRange ?? DEFAULT_KEY_TAKEAWAYS_RANGE;
  const faqRange = opts.faqRange ?? DEFAULT_FAQ_RANGE;

  return z.object({
    // H1 shown on the page — generous ceiling, deterministically truncated
    // (truncateAtWordBoundary) before this schema ever sees it, so this max is
    // a last-resort backstop, not the real length control. See metaTitle below
    // for the strict SEO-facing limit.
    title: z.string().min(1).max(100),
    // <title>/SERP-facing title, separate from the H1 so the strict 60-70 char
    // SEO limit never has to compromise the on-page H1's readability. Optional
    // because the model may omit it — generate-article.ts falls back to a
    // truncated `title` before this schema runs, so by validation time it's
    // always populated.
    metaTitle: z.string().min(1).max(70),
    slug: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase, hyphen-separated, ASCII only'),
    metaDescription: z.string().min(1).max(160),
    quickAnswerAngle: z.string().min(1),
    keyTakeawaysThemes: z.array(z.string().min(1)).min(keyTakeawaysRange.min).max(keyTakeawaysRange.max),
    sections: z
      .array(z.object({ heading: z.string().min(1), summary: z.string().min(1) }))
      .min(sectionsRange.minSections)
      .max(sectionsRange.maxSections),
    includeComparisonTable: z.boolean(),
    comparisonTableReason: z.string().min(1),
    commonMistakesThemes: z.array(z.string().min(1)).min(3).max(5),
    faqQuestions: z.array(z.string().min(1)).min(faqRange.min).max(faqRange.max),
    featuredImage: z.object({ prompt: z.string().min(1), altText: z.string().min(1) }),
    images: z.array(outlineImageSchema).min(2).max(3),
  });
}

export const wordpressOutlineSchema = buildWordpressOutlineSchema();

export type WordPressOutline = z.infer<typeof wordpressOutlineSchema>;

/**
 * Same shape as wordpressOutlineSchema, except `images` length is pinned to
 * however many internal images are actually available to reuse — every
 * selected pin with an active image, uncapped (TASK-FIX-009) — instead of
 * Option 1's fixed 2-3. The pins flow never generates internal images, it
 * only has as many as pins supply.
 */
export function buildWordpressPinsOutlineSchema(imageCount: number) {
  return wordpressOutlineSchema.extend({
    images: z.array(outlineImageSchema).length(imageCount),
  });
}

const faqItemSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

const comparisonTableSchema = z.object({
  headers: z.array(z.string().min(1)).min(2),
  rows: z.array(z.array(z.string().min(1)).min(2)).min(2),
});

interface ArticleResponseSchemaOptions {
  keyTakeawaysRange?: { min: number; max: number };
  faqRange?: { min: number; max: number };
}

/**
 * Parameterized the same way as buildWordpressOutlineSchema (TASK-FIX-035) so
 * the article response's keyTakeaways/faq array lengths stay consistent with
 * whatever range the outline was built with. Called with no args, this is
 * byte-for-byte the same schema as before TASK-FIX-035 (4-6 each).
 */
export function buildWordpressArticleResponseSchema(opts: ArticleResponseSchemaOptions = {}) {
  const keyTakeawaysRange = opts.keyTakeawaysRange ?? DEFAULT_KEY_TAKEAWAYS_RANGE;
  const faqRange = opts.faqRange ?? DEFAULT_FAQ_RANGE;

  return z.object({
    content: z.string().min(1),
    quickAnswer: z.string().min(1),
    keyTakeaways: z.array(z.string().min(1)).min(keyTakeawaysRange.min).max(keyTakeawaysRange.max),
    comparisonTable: comparisonTableSchema.nullable(),
    commonMistakes: z.array(z.string().min(1)).min(3).max(5),
    faq: z.array(faqItemSchema).min(faqRange.min).max(faqRange.max),
  });
}

export const wordpressArticleResponseSchema = buildWordpressArticleResponseSchema();

export type WordPressArticleResponse = z.infer<typeof wordpressArticleResponseSchema>;

// TASK-028 Option 3 — structural anti-reproduction guardrail (same
// philosophy as imageStyleAnalysisSchema, TASK-013): every field is a short
// phrase array, capped at 150 chars each. There is no free-text
// excerpt/summary field a full sentence copied from the source could land
// in intact — see DECISIONS.md 2026-08-12.
const sourceSummaryPhrase = z.string().min(1).max(150);

export const sourceContextSummarySchema = z.object({
  theme: sourceSummaryPhrase,
  topics: z.array(sourceSummaryPhrase).min(4).max(8),
  angles: z.array(sourceSummaryPhrase).min(2).max(6),
  keyPoints: z.array(sourceSummaryPhrase).min(3).max(8),
});

export type SourceContextSummary = z.infer<typeof sourceContextSummarySchema>;
