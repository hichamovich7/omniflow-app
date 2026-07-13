import { getRoleConfig } from '../config';
import { generateImage as generateImageOpenAI } from '../providers/openai';
import { generateImage as generateImageOpenRouter } from '../providers/openrouter';

interface GenerateImageParams {
  prompt: string;
  size: string;
}

export async function generateImage({ prompt, size }: GenerateImageParams): Promise<Buffer> {
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
