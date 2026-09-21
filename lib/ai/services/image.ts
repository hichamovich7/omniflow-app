import { getRoleConfig } from '../config';
import type { AIProvider } from '../types';
import { generateImage as generateImageOpenAI } from '../providers/openai';
import { generateImage as generateImageOpenRouter } from '../providers/openrouter';
import type { PinVisualFormat } from '@/types/database';

export interface ResolvedImageModel {
  provider: AIProvider;
  model: string;
}

// Pure function of env vars + visualFormat — same routing logic generateImage()
// uses internally, exported so callers can persist the exact model that will
// be (or was) used for a given call, e.g. pin_images.image_model (TASK-FIX-018),
// without duplicating or guessing the resolution rule.
//
// text-overlay has no hardcoded model fallback (TASK-FIX-030): the IMAGE
// role's default (gpt-image-1) is not reliable at rendering legible on-image
// text, so this path always routes through OpenRouter to a model chosen for
// text rendering instead of AI_IMAGE_PROVIDER/AI_IMAGE_MODEL — but which
// model that is must be an explicit, deliberate choice in the environment,
// not a value silently baked into the code that can drift from what the
// operator believes is configured. Reuses the existing
// OPENROUTER_IMAGE_API_KEY — no new provider key.
export function resolveImageModel(visualFormat: PinVisualFormat = 'photo'): ResolvedImageModel {
  if (visualFormat === 'text-overlay' || visualFormat === 'ai-integrated') {
    const model = process.env.AI_IMAGE_MODEL_TEXT?.trim();
    if (!model) {
      throw new Error(
        'AI_IMAGE_MODEL_TEXT is not set. Text-overlay pins require an explicit OpenRouter image model — set AI_IMAGE_MODEL_TEXT in the environment.'
      );
    }
    return { provider: 'openrouter', model };
  }

  return getRoleConfig('IMAGE');
}

interface GenerateImageParams {
  prompt: string;
  size: string;
  visualFormat?: PinVisualFormat;
}

export async function generateImage({
  prompt,
  size,
  visualFormat = 'photo',
}: GenerateImageParams): Promise<Buffer> {
  const { provider, model } = resolveImageModel(visualFormat);
  const isIntegrated = visualFormat === 'ai-integrated';

  switch (provider) {
    case 'openai':
      return generateImageOpenAI({
        model,
        prompt,
        size,
        ...(isIntegrated ? { quality: 'high' as const } : {}),
      });
    case 'openrouter':
      return generateImageOpenRouter({
        model,
        prompt,
        size,
        ...(isIntegrated
          ? { quality: 'high' as const, aspectRatio: '2:3' as const }
          : {}),
      });
    default:
      throw new Error(`Unsupported image provider: ${provider}`);
  }
}
