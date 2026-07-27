import { getRoleConfig } from '../config';
import { generateImage as generateImageOpenAI } from '../providers/openai';
import { generateImage as generateImageOpenRouter } from '../providers/openrouter';

// Default model for pins with visualFormat 'text-overlay'. The IMAGE role's
// default (gpt-image-1) is not reliable at rendering legible on-image text,
// so text-overlay pins always route through OpenRouter to a model chosen for
// text rendering instead, regardless of AI_IMAGE_PROVIDER/AI_IMAGE_MODEL.
// Reuses the existing OPENROUTER_IMAGE_API_KEY — no new provider key.
const IMAGE_TEXT_MODEL_DEFAULT = 'google/gemini-3.1-flash-image';

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
  if (visualFormat === 'text-overlay') {
    const model = process.env.AI_IMAGE_MODEL_TEXT ?? IMAGE_TEXT_MODEL_DEFAULT;
    return generateImageOpenRouter({ model, prompt, size });
  }

  const { provider, model } = getRoleConfig('IMAGE');

  switch (provider) {
    case 'openai':
      return generateImageOpenAI({ model, prompt, size });
    case 'openrouter':
      return generateImageOpenRouter({ model, prompt, size });
    default:
      throw new Error(`Unsupported image provider: ${provider}`);
  }
}
