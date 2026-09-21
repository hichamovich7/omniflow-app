import sharp from 'sharp';
import { z } from 'zod';
import { aiIntegratedSettingsSchema } from '@/lib/validations/pinterest';
import { LANGUAGE_LABELS, PINTEREST_ANGLES, SUPPORTED_LANGUAGES } from '@/types/pinterest';
import type {
  PinterestAngle,
  PinterestGenerationMode,
  SupportedLanguage,
} from '@/types/pinterest';
import type { Pin } from '@/types/database';

const AI_INTEGRATED_METADATA_KEY = '_pinterestAiIntegrated';

export type AiIntegratedSettings = z.infer<typeof aiIntegratedSettingsSchema>;

const resolvedTextSchema = z.object({
  headline: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().min(1).max(120).nullable(),
  cta: z.string().trim().min(1).max(60).nullable(),
}).strict();

const persistedAiIntegratedSchema = z.object({
  language: z.enum(['en', 'de', 'es', 'fr']),
  settings: aiIntegratedSettingsSchema,
  text: resolvedTextSchema,
}).strict();

export interface GeneratedIntegratedText {
  headline: string;
  subtitle?: string;
  cta?: string;
}

export type PersistedAiIntegrated = z.infer<typeof persistedAiIntegratedSchema>;

function parseMetadata(imageAnalysisJson: string | null): Record<string, unknown> {
  if (!imageAnalysisJson) return {};
  try {
    const parsed = JSON.parse(imageAnalysisJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function resolveTextField(
  field: { mode: 'generate' } | { mode: 'exact'; text: string } | { mode: 'none' },
  generated: string | undefined,
  label: string
): string | null {
  if (field.mode === 'none') return null;
  if (field.mode === 'exact') return field.text.trim();
  const value = generated?.trim();
  if (!value) throw new Error(`AI Integrated ${label} was not generated`);
  return value;
}

export function resolveAiIntegratedText(
  settings: AiIntegratedSettings,
  generated: GeneratedIntegratedText | undefined
): PersistedAiIntegrated['text'] {
  const text = {
    headline: resolveTextField(settings.headline, generated?.headline, 'headline') ?? '',
    subtitle: resolveTextField(settings.subtitle, generated?.subtitle, 'subtitle'),
    cta: resolveTextField(settings.cta, generated?.cta, 'CTA'),
  };

  const parsed = resolvedTextSchema.parse(text);
  const explicitLines = [parsed.headline, parsed.subtitle, parsed.cta]
    .filter((value): value is string => Boolean(value))
    .reduce((count, value) => count + value.split(/\r?\n/).length, 0);
  if (explicitLines > settings.maximumTextLines) {
    throw new Error('AI Integrated text exceeds Maximum text lines');
  }
  return parsed;
}

export function attachAiIntegratedMetadata(
  imageAnalysisJson: string | null,
  value: PersistedAiIntegrated
): string {
  const parsed = persistedAiIntegratedSchema.parse(value);
  return JSON.stringify({
    ...parseMetadata(imageAnalysisJson),
    [AI_INTEGRATED_METADATA_KEY]: parsed,
  });
}

export function readAiIntegratedMetadata(
  imageAnalysisJson: string | null
): PersistedAiIntegrated | null {
  const candidate = parseMetadata(imageAnalysisJson)[AI_INTEGRATED_METADATA_KEY];
  const parsed = persistedAiIntegratedSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function generationModeForVisualFormat(
  visualFormat: Pin['visual_format']
): PinterestGenerationMode {
  if (visualFormat === 'ai-integrated') return 'ai-integrated';
  if (visualFormat === 'photo-only') return 'photo-only';
  return 'legacy-composite';
}

export function resolveEffectiveLanguage(
  mode: PinterestGenerationMode,
  requestedLanguage: SupportedLanguage,
  projectDefaultLanguage: string | null
): SupportedLanguage {
  if (mode !== 'ai-integrated') return requestedLanguage;
  return SUPPORTED_LANGUAGES.includes(projectDefaultLanguage as SupportedLanguage)
    ? (projectDefaultLanguage as SupportedLanguage)
    : requestedLanguage;
}

export function resolvePinAngle(
  requestedStrategy: AiIntegratedSettings['strategy'],
  requestedManualAngle: PinterestAngle | undefined,
  generatedAngle: PinterestAngle
): PinterestAngle {
  if (requestedStrategy !== 'manual') return generatedAngle;
  if (!requestedManualAngle || !PINTEREST_ANGLES.includes(requestedManualAngle)) {
    throw new Error('AI Integrated manual strategy requires a valid angle');
  }
  return requestedManualAngle;
}

const FORMAT_DIRECTIONS: Record<AiIntegratedSettings['creativeFormat'], string> = {
  'hero-pin':
    'Hero Pin: use a dominant photorealistic subject, a compact headline area, a discreet CTA, and immediate mobile readability.',
  'pattern-guide':
    'Pattern Guide: use this format only when the supplied content really provides the shown elements. Never invent steps, materials, measurements, instructions, or pattern details.',
  'editorial-story':
    'Editorial Story: use a premium magazine composition. For Home Decor, keep photography at 75-80% of the canvas and a subtle translucent cream text area at 20-25%; never cover a shower, vanity, bathtub, or the main room feature.',
  'ai-chooses':
    'Choose the strongest of Hero Pin, Pattern Guide, or Editorial Story for the supplied evidence. Pattern Guide remains forbidden unless the evidence actually supplies the elements to show.',
};

const IMPORTANCE_LABELS = {
  high: 'primary',
  medium: 'secondary',
  low: 'subtle',
} as const;

function quoteExact(value: string | null): string {
  return value === null ? 'NONE — render no element for this field' : JSON.stringify(value);
}

export function buildAiIntegratedImagePrompt(
  pin: Pick<Pin, 'image_prompt' | 'language' | 'board'>,
  metadata: PersistedAiIntegrated,
  version = 1
): string {
  const { settings, text } = metadata;
  const language = LANGUAGE_LABELS[metadata.language as SupportedLanguage];
  const variation = version > 1
    ? `Create a genuinely different photographic composition for version ${version}, while preserving every exact text string.`
    : '';

  return [
    'Create one finished Pinterest Pin as a single native image. The photography, typography, and CTA must be generated together by the image model.',
    'Canvas: vertical 2:3 Pinterest composition, edge to edge, designed for excellent mobile readability.',
    `Photographic scene: ${pin.image_prompt}`,
    FORMAT_DIRECTIONS[settings.creativeFormat],
    `Content language: ${language}. Do not translate the approved text.`,
    'APPROVED TEXT — reproduce these strings exactly, preserving spelling, accents, punctuation, capitalization, and arrows:',
    `Headline (${IMPORTANCE_LABELS[settings.importance.headline]}): ${quoteExact(text.headline)}`,
    `Subtitle (${IMPORTANCE_LABELS[settings.importance.subtitle]}): ${quoteExact(text.subtitle)}`,
    `CTA (${IMPORTANCE_LABELS[settings.importance.cta]}): ${quoteExact(text.cta)}`,
    `Use no more than ${settings.maximumTextLines} total visible text lines. Keep a clear hierarchy between headline, subtitle, and CTA.`,
    'Keep all approved text readable at mobile size and keep it clear of the main subject. Do not cover faces, hands, crochet stitches, yarn details, showers, vanities, bathtubs, or key decor features.',
    'For Crochet: show realistic stitches and yarn fibers in a warm craft or lifestyle environment. Do not reveal complete instructions or a full pattern in the Pin.',
    'STRICT TEXT CONSTRAINT: render only the approved text above. Add no other word, letter, number, caption, label, signature, pseudo-text, logo, brand mark, watermark, URL, hashtag, badge, or decorative writing anywhere in the image.',
    'Output a polished, photorealistic final image. Do not output a mockup, frame, border, collage, split screen, or screenshot.',
    variation,
  ].filter(Boolean).join('\n\n');
}

export interface TechnicalImageValidation {
  width: number;
  height: number;
  format: string;
  bytes: number;
  aspectRatio: number;
}

export async function validateFinalPinterestImage(
  imageBuffer: Buffer
): Promise<TechnicalImageValidation> {
  if (imageBuffer.byteLength === 0) throw new Error('Image provider returned an empty file');
  const metadata = await sharp(imageBuffer).metadata();
  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new Error('Image provider returned an unreadable image');
  }
  const aspectRatio = metadata.width / metadata.height;
  if (Math.abs(aspectRatio - 2 / 3) > 0.01) {
    throw new Error(
      `Image provider returned ${metadata.width}x${metadata.height}; expected a 2:3 Pinterest image`
    );
  }
  if (!['png', 'jpeg', 'webp'].includes(metadata.format)) {
    throw new Error(`Unsupported generated image format: ${metadata.format}`);
  }
  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    bytes: imageBuffer.byteLength,
    aspectRatio,
  };
}
