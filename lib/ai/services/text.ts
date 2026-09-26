import { getOutlineConfig, getRoleConfig } from '../config';
import { chatCompletion } from '../providers/openrouter';
import type { AIRoleConfig, AITool, ChatMessage } from '../types';

// OUTLINE is the WordPress outline step (AI_OUTLINE_MODEL, falling back to
// FAST — see getOutlineConfig()). It is a text role, not an AIRole.
export type TextRole = 'FAST' | 'SMART' | 'OUTLINE';

interface GenerateTextParams {
  role: TextRole;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  tools?: AITool[];
  /** Overrides the provider's default fetch timeout — for calls known to routinely run long. */
  timeoutMs?: number;
}

// Same resolution generateText() uses, exported so callers can log the exact
// model of a call (model ids only — never keys).
export function resolveTextModel(role: TextRole): AIRoleConfig {
  return role === 'OUTLINE' ? getOutlineConfig() : getRoleConfig(role);
}

export async function generateText({
  role,
  messages,
  maxTokens,
  temperature,
  tools,
  timeoutMs,
}: GenerateTextParams): Promise<string> {
  const { provider, model } = resolveTextModel(role);

  // FAST must stay fast: if the configured model is a reasoning model, keep its
  // hidden reasoning budget minimal so it doesn't consume the whole maxTokens
  // before producing any visible output. OUTLINE replaces a former FAST call
  // with the same token budget, so it keeps the same minimal effort. SMART is
  // reserved for complex reasoning, so its models keep their default behavior.
  const reasoningEffort = role === 'FAST' || role === 'OUTLINE' ? 'minimal' : undefined;

  switch (provider) {
    case 'openrouter':
      return chatCompletion({ model, messages, maxTokens, temperature, reasoningEffort, tools, timeoutMs });
    default:
      throw new Error(`Unsupported text provider for role ${role}: ${provider}`);
  }
}
