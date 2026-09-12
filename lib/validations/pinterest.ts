import { z } from 'zod';
import { PINTEREST_ANGLES, SUPPORTED_LANGUAGES, PINS_OPTIONS } from '@/types/pinterest';

export const TEXT_OVERLAY_MODES = ['auto', 'always', 'never'] as const;
export type TextOverlayMode = (typeof TEXT_OVERLAY_MODES)[number];

// Static SVG banner shapes (TASK-FIX-024) — see lib/pinterest/banner-templates/.
// One enum shared by both banners (title hook, CTA); each pin picks a template
// per banner independently (titleBannerTemplate / ctaBannerTemplate below).
export const LEGACY_BANNER_TEMPLATES = [
  'clean-band',
  'ribbon',
  'pill',
  'torn-paper',
  'corner-tag',
] as const;

export const V2_BANNER_TEMPLATES = [
  'editorial',
  'minimal',
  'split',
  'magazine',
] as const;

export const BANNER_TEMPLATES = [
  ...LEGACY_BANNER_TEMPLATES,
  ...V2_BANNER_TEMPLATES,
] as const;
export type BannerTemplate = (typeof BANNER_TEMPLATES)[number];

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
  analysisId: z.string().uuid('Invalid analysis ID').optional(),
  // Supabase Storage public URL from POST /api/pinterest/reference-image —
  // see app/api/pinterest/generate/route.ts for the VISION analysis step.
  referenceImageUrl: z.string().trim().url('Invalid reference image URL').optional(),
  // Whether the AI decides photo vs. text-overlay per pin ('auto'), or it's
  // forced uniformly across the whole generation. Server clamps this to
  // 'never' when the project's niche doesn't allow text overlay at all —
  // see getNicheVisualConvention() / app/api/pinterest/generate/route.ts.
  textOverlayMode: z.enum(TEXT_OVERLAY_MODES).default('auto'),
});

const pinResponseSchema = z
  .object({
    angle: z.enum(PINTEREST_ANGLES),
    title: z.string().max(100),
    description: z.string().max(500),
    keywords: z.string(),
    board: z.string(),
    image_prompt: z.string(),
    visualFormat: z.enum(['photo', 'text-overlay']),
    overlayText: z.string().max(80).optional(),
    // Kept optional for compatibility with earlier model responses. Phase 4
    // derives the Headline template from angle; the CTA remains model-chosen
    // and is clamped against the niche's allowed list server-side.
    titleBannerTemplate: z.enum(BANNER_TEMPLATES).optional(),
    ctaBannerTemplate: z.enum(BANNER_TEMPLATES).optional(),
  })
  .refine((pin) => pin.visualFormat !== 'text-overlay' || !!pin.overlayText?.trim(), {
    message: 'overlayText is required when visualFormat is text-overlay',
    path: ['overlayText'],
  });

export const openRouterPinsResponseSchema = z.object({
  pins: z.array(pinResponseSchema).min(1),
});

export type GeneratePinsInput = z.infer<typeof generatePinsSchema>;
