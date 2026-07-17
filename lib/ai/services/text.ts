import { getRoleConfig } from '../config';
import { chatCompletion } from '../providers/openrouter';
import type { AITool, ChatMessage } from '../types';

interface GenerateTextParams {
  role: 'FAST' | 'SMART';
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  tools?: AITool[];
}

export async function generateText({
  role,
  messages,
  maxTokens,
  temperature,
  tools,
}: GenerateTextParams): Promise<string> {
  const { provider, model } = getRoleConfig(role);

  // FAST must stay fast: if the configured model is a reasoning model, keep its
  // hidden reasoning budget minimal so it doesn't consume the whole maxTokens
  // before producing any visible output. SMART is reserved for complex
  // reasoning, so its models keep their default reasoning behavior.
  const reasoningEffort = role === 'FAST' ? 'minimal' : undefined;

  switch (provider) {
    case 'openrouter':
      return chatCompletion({ model, messages, maxTokens, temperature, reasoningEffort, tools });
    default:
      throw new Error(`Unsupported text provider for role ${role}: ${provider}`);
  }
}
