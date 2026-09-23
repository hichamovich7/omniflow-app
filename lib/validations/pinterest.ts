import { z } from 'zod';
import {
  PINTEREST_ANGLES,
  PINTEREST_CREATIVE_FORMATS,
  PINTEREST_GENERATION_MODES,
  PINTEREST_STRATEGIES,
  PINTEREST_TEXT_IMPORTANCE,
  SUPPORTED_LANGUAGES,
  PINS_OPTIONS,
} from '@/types/pinterest';

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

// "/" is Pinterest's own Board/Section separator (see lib/csv/pinterest.ts),
// so it — along with "\" and any line break or control character — can never
// appear inside a section name. Trimmed; an empty/whitespace-only value
// becomes undefined (stored as null), same convention as `board`.
export const BOARD_SECTION_FORBIDDEN_CHARS = /[\\/\r\n\x00-\x1F\x7F]/;
export const BOARD_SECTION_REQUIRES_BOARD_MESSAGE =
  'Select a board before entering a board section.';

const boardSectionSchema = z
  .string()
  .max(100, 'Board section is too long')
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  })
  .refine(
    (value) => value === undefined || !BOARD_SECTION_FORBIDDEN_CHARS.test(value),
    { message: 'Board section cannot contain "/", "\\", or line breaks.' }
  );

const generatePinsBaseSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  keyword: z.string().trim().min(1, 'Keyword is required').max(200, 'Keyword is too long'),
  language: z.enum(SUPPORTED_LANGUAGES, { message: 'Invalid language' }),
  pinsRequested: z.coerce.number().refine(
    (v): v is (typeof PINS_OPTIONS)[number] => (PINS_OPTIONS as readonly number[]).includes(v),
    { message: 'Invalid number of pins' }
  ),
  board: z.string().trim().max(100, 'Board name is too long').optional(),
  boardSection: boardSectionSchema,
  websiteUrl: z.string().trim().url('Invalid website URL').optional(),
  pinterestUrl: z.string().trim().url('Invalid Pinterest URL').optional(),
  analysisId: z.string().uuid('Invalid analysis ID').optional(),
});

// Supabase Storage public URL from POST /api/pinterest/reference-image —
// see app/api/pinterest/generate/route.ts for the VISION analysis step. Only
// Legacy Composite keeps this legacy mechanism (TASK-013), unchanged.
const legacyReferenceImageUrlSchema = z
  .string()
  .trim()
  .url('Invalid reference image URL')
  .optional();

// AI Integrated and Photo Only never accept a reference: the image is not sent
// to the image model yet (TASK-042), so accepting one would only trigger a
// Vision analysis the user cannot see. Any present value — even null or an
// empty string, from an obsolete client or a crafted request — is a validation
// error, raised before the route can reach Vision or a provider.
export const AI_INTEGRATED_REFERENCE_UNSUPPORTED_MESSAGE =
  'Reference images are not supported in AI Integrated yet. Remove the reference image and try again.';
export const PHOTO_ONLY_REFERENCE_UNSUPPORTED_MESSAGE =
  'Reference images are not supported in Photo Only mode. Remove the reference image and try again.';

const generatedTextSchema = z.object({ mode: z.literal('generate') }).strict();
const exactTextSchema = z.object({
  mode: z.literal('exact'),
  text: z.string().trim().min(1, 'Exact text is required').max(120, 'Exact text is too long'),
}).strict();
const noTextSchema = z.object({ mode: z.literal('none') }).strict();

export const headlineTextSchema = z.discriminatedUnion('mode', [
  generatedTextSchema,
  exactTextSchema,
]);
export const optionalIntegratedTextSchema = z.discriminatedUnion('mode', [
  generatedTextSchema,
  exactTextSchema,
  noTextSchema,
]);

export type IntegratedTextElement = 'headline' | 'subtitle' | 'cta';

// An element is on the image only when its text mode is not "none" AND its
// importance is not "none". Everything that counts lines, builds prompts or
// persists text goes through this single rule.
export function isIntegratedTextEnabled(
  settings: {
    headline: { mode: string };
    subtitle: { mode: string };
    cta: { mode: string };
    importance: Record<IntegratedTextElement, string>;
  },
  element: IntegratedTextElement
): boolean {
  return settings[element].mode !== 'none' && settings.importance[element] !== 'none';
}

const INTEGRATED_TEXT_ELEMENTS: readonly IntegratedTextElement[] = ['headline', 'subtitle', 'cta'];
const INTEGRATED_TEXT_LABELS: Record<IntegratedTextElement, string> = {
  headline: 'Headline',
  subtitle: 'Subtitle',
  cta: 'CTA',
};

export const aiIntegratedSettingsSchema = z
  .object({
    creativeFormat: z.enum(PINTEREST_CREATIVE_FORMATS),
    strategy: z.enum(PINTEREST_STRATEGIES),
    manualAngle: z.enum(PINTEREST_ANGLES).optional(),
    headline: headlineTextSchema,
    subtitle: optionalIntegratedTextSchema,
    cta: optionalIntegratedTextSchema,
    maximumTextLines: z.coerce.number().int().min(2).max(6),
    importance: z.object({
      headline: z.enum(PINTEREST_TEXT_IMPORTANCE),
      subtitle: z.enum(PINTEREST_TEXT_IMPORTANCE),
      cta: z.enum(PINTEREST_TEXT_IMPORTANCE),
    }).strict(),
  })
  .strict()
  .superRefine((settings, ctx) => {
    if (settings.strategy === 'manual' && !settings.manualAngle) {
      ctx.addIssue({
        code: 'custom',
        path: ['manualAngle'],
        message: 'Manual angle is required when Pinterest strategy is Manual',
      });
    }
    if (settings.strategy !== 'manual' && settings.manualAngle) {
      ctx.addIssue({
        code: 'custom',
        path: ['manualAngle'],
        message: 'Manual angle is only allowed when Pinterest strategy is Manual',
      });
    }
    // Exact text on an element whose importance is None is contradictory: the
    // element would be both required and disabled.
    for (const element of INTEGRATED_TEXT_ELEMENTS) {
      if (settings[element].mode === 'exact' && settings.importance[element] === 'none') {
        ctx.addIssue({
          code: 'custom',
          path: ['importance', element],
          message: `${INTEGRATED_TEXT_LABELS[element]} has exact text but its importance is None. Remove the text or choose another importance.`,
        });
      }
    }
    if (!INTEGRATED_TEXT_ELEMENTS.some((element) => isIntegratedTextEnabled(settings, element))) {
      ctx.addIssue({
        code: 'custom',
        path: ['importance'],
        message: 'At least one of Headline, Subtitle or CTA must be enabled. Use Photo Only for an image without text.',
      });
    }
    // Only enabled elements take up lines; a None element never consumes one.
    const exactLineCount = INTEGRATED_TEXT_ELEMENTS
      .filter((element) => isIntegratedTextEnabled(settings, element))
      .map((element) => settings[element])
      .filter((field): field is Extract<typeof field, { mode: 'exact' }> => field.mode === 'exact')
      .reduce((count, field) => count + field.text.split(/\r?\n/).length, 0);
    if (exactLineCount > settings.maximumTextLines) {
      ctx.addIssue({
        code: 'custom',
        path: ['maximumTextLines'],
        message: 'Exact text contains more lines than Maximum text lines allows',
      });
    }
  });

const aiIntegratedRequestSchema = generatePinsBaseSchema.extend({
  generationMode: z.literal(PINTEREST_GENERATION_MODES[0]),
  aiIntegrated: aiIntegratedSettingsSchema,
  referenceImageUrl: z.never({ message: AI_INTEGRATED_REFERENCE_UNSUPPORTED_MESSAGE }).optional(),
});

const photoOnlyRequestSchema = generatePinsBaseSchema.extend({
  generationMode: z.literal(PINTEREST_GENERATION_MODES[1]),
  referenceImageUrl: z.never({ message: PHOTO_ONLY_REFERENCE_UNSUPPORTED_MESSAGE }).optional(),
});

const legacyCompositeRequestSchema = generatePinsBaseSchema.extend({
  generationMode: z.literal(PINTEREST_GENERATION_MODES[2]),
  referenceImageUrl: legacyReferenceImageUrlSchema,
  // Existing behavior is intentionally scoped to Legacy Composite.
  textOverlayMode: z.enum(TEXT_OVERLAY_MODES).default('auto'),
});

export const generatePinsSchema = z.preprocess(
  (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
    const candidate = input as Record<string, unknown>;
    return candidate.generationMode
      ? candidate
      : { ...candidate, generationMode: 'legacy-composite' };
  },
  z
    .discriminatedUnion('generationMode', [
      aiIntegratedRequestSchema,
      photoOnlyRequestSchema,
      legacyCompositeRequestSchema,
    ])
    .superRefine((data, ctx) => {
      if (data.boardSection && !data.board) {
        ctx.addIssue({
          code: 'custom',
          path: ['boardSection'],
          message: BOARD_SECTION_REQUIRES_BOARD_MESSAGE,
        });
      }
    })
);

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
    integratedText: z.object({
      // Optional: Headline importance "none" omits it from the plan.
      headline: z.string().trim().min(1).max(120).optional(),
      subtitle: z.string().trim().min(1).max(120).optional(),
      cta: z.string().trim().min(1).max(60).optional(),
    }).strict().optional(),
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
