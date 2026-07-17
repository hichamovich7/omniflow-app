import { z } from 'zod';
import { SUPPORTED_LANGUAGES } from '@/types/pinterest';

export const generateArticleSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  keyword: z.string().trim().min(1, 'Keyword is required').max(200, 'Keyword is too long'),
  language: z.enum(SUPPORTED_LANGUAGES, { message: 'Invalid language' }),
  researchNotes: z.string().trim().max(2000, 'Research notes are too long').optional(),
});

export type GenerateArticleInput = z.infer<typeof generateArticleSchema>;

const outlineImageSchema = z.object({
  placementMarker: z.string().min(1),
  prompt: z.string().min(1),
  altText: z.string().min(1),
});

export const wordpressOutlineSchema = z.object({
  title: z.string().min(1).max(70),
  slug: z
    .string()
    .min(1)
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
