import { getRoleConfig } from '../config';
import type { AIProvider } from '../types';
import { generateImage as generateImageOpenAI } from '../providers/openai';
import { generateImage as generateImageOpenRouter } from '../providers/openrouter';

// Default model for pins with visualFormat 'text-overlay'. The IMAGE role's
// default (gpt-image-1) is not reliable at rendering legible on-image text,
// so text-overlay pins always route through OpenRouter to a model chosen for
// text rendering instead, regardless of AI_IMAGE_PROVIDER/AI_IMAGE_MODEL.
// Reuses the existing OPENROUTER_IMAGE_API_KEY — no new provider key.
const IMAGE_TEXT_MODEL_DEFAULT = 'google/gemini-3.1-flash-image';

export interface ResolvedImageModel {
  provider: AIProvider;
  model: string;
}

// Pure function of env vars + visualFormat — same routing logic generateImage()
// uses internally, exported so callers can persist the exact model that will
// be (or was) used for a given call, e.g. pin_images.image_model (TASK-FIX-018),
// without duplicating or guessing the resolution rule.
export function resolveImageModel(visualFormat: 'photo' | 'text-overlay' = 'photo'): ResolvedImageModel {
  if (visualFormat === 'text-overlay') {
    return { provider: 'openrouter', model: process.env.AI_IMAGE_MODEL_TEXT ?? IMAGE_TEXT_MODEL_DEFAULT };
  }

  return getRoleConfig('IMAGE');
}

interface GenerateImageParams {
  prompt: string;
  size: string;
  visualFormat?: 'photo' | 'text-overlay';
}

export async function generateImage({
  prompt,
  size,
  visualFormat = 'photo',
}: GenerateImageParams): Promise<Buffer> {
  const { provider, model } = resolveImageModel(visualFormat);

  switch (provider) {
    case 'openai':
      return generateImageOpenAI({ model, prompt, size });
    case 'openrouter':
      return generateImageOpenRouter({ model, prompt, size });
    default:
      throw new Error(`Unsupported image provider: ${provider}`);
  }
}
