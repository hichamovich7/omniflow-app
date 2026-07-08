import { z } from 'zod';
import { SUPPORTED_LANGUAGES, PINS_OPTIONS } from '@/types/pinterest';

export const generatePinsSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  keyword: z.string().trim().min(1, 'Keyword is required').max(200, 'Keyword is too long'),
  language: z.enum(SUPPORTED_LANGUAGES, { message: 'Invalid language' }),
  pinsRequested: z.coerce.number().refine(
    (v): v is (typeof PINS_OPTIONS)[number] => (PINS_OPTIONS as readonly number[]).includes(v),
    { message: 'Invalid number of pins' }
  ),
  board: z.string().trim().max(100, 'Board name is too long').optional(),
  websiteUrl: z.string().trim().url('Invalid website URL').optional(),
  pinterestUrl: z.string().trim().url('Invalid Pinterest URL').optional(),
});

const pinResponseSchema = z.object({
  title: z.string().max(100),
  description: z.string().max(500),
  keywords: z.string(),
  board: z.string(),
  image_prompt: z.string(),
});

export const openRouterPinsResponseSchema = z.object({
  pins: z.array(pinResponseSchema).min(1),
});

export type GeneratePinsInput = z.infer<typeof generatePinsSchema>;
