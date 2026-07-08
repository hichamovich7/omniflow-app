import { getRoleConfig } from '../config';
import { visionCompletion } from '../providers/openrouter';

interface AnalyzeImageParams {
  imageUrl: string;
  instructions: string;
  maxTokens?: number;
}

export async function analyzeImage({
  imageUrl,
  instructions,
  maxTokens,
}: AnalyzeImageParams): Promise<string> {
  const { provider, model } = getRoleConfig('VISION');

  switch (provider) {
    case 'openrouter':
      return visionCompletion({ model, imageUrl, instructions, maxTokens });
    default:
      throw new Error(`Unsupported vision provider: ${provider}`);
  }
}
