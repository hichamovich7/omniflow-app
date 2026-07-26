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
 * however many internal images are actually available to reuse (0-3 selected
 * pins with an active image) instead of Option 1's fixed 2-3 — the pins flow
 * never generates internal images, it only has as many as pins supply.
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
