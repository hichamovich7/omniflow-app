import { z } from 'zod';
import { SUPPORTED_LANGUAGES } from '@/types/pinterest';

export const generateArticleSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  keyword: z.string().trim().min(1, 'Keyword is required').max(200, 'Keyword is too long'),
  language: z.enum(SUPPORTED_LANGUAGES, { message: 'Invalid language' }),
  researchNotes: z.string().trim().max(2000, 'Research notes are too long').optional(),
  categoryId: z.string().uuid('Invalid category ID').optional(),
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

export const wordpressOutlineSchema = z.object({
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
  keyTakeawaysThemes: z.array(z.string().min(1)).min(4).max(6),
  sections: z
    .array(z.object({ heading: z.string().min(1), summary: z.string().min(1) }))
    .min(8)
    .max(10),
  includeComparisonTable: z.boolean(),
  comparisonTableReason: z.string().min(1),
  commonMistakesThemes: z.array(z.string().min(1)).min(3).max(5),
  faqQuestions: z.array(z.string().min(1)).min(4).max(6),
  featuredImage: z.object({ prompt: z.string().min(1), altText: z.string().min(1) }),
  images: z.array(outlineImageSchema).min(2).max(3),
});

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

export const wordpressArticleResponseSchema = z.object({
  content: z.string().min(1),
  quickAnswer: z.string().min(1),
  keyTakeaways: z.array(z.string().min(1)).min(4).max(6),
  comparisonTable: comparisonTableSchema.nullable(),
  commonMistakes: z.array(z.string().min(1)).min(3).max(5),
  faq: z.array(faqItemSchema).min(4).max(6),
});

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
