import type { AIProvider, AIRole, AIRoleConfig } from './types';

const ROLE_DEFAULTS: Record<AIRole, AIRoleConfig> = {
  FAST: { provider: 'openrouter', model: 'google/gemini-2.5-flash' },
  SMART: { provider: 'openrouter', model: 'google/gemini-2.5-flash' },
  VISION: { provider: 'openrouter', model: 'google/gemini-2.5-flash' },
  IMAGE: { provider: 'openai', model: 'gpt-image-1' },
};

// Legacy env vars kept for backward compatibility with existing deployments.
const LEGACY_MODEL_ENV: Partial<Record<AIRole, string | undefined>> = {
  FAST: process.env.OPENROUTER_TEXT_MODEL,
  IMAGE: process.env.OPENAI_IMAGE_MODEL,
};

export function getRoleConfig(role: AIRole): AIRoleConfig {
  const provider =
    (process.env[`AI_${role}_PROVIDER`] as AIProvider | undefined) ?? ROLE_DEFAULTS[role].provider;
  const model =
    process.env[`AI_${role}_MODEL`] ?? LEGACY_MODEL_ENV[role] ?? ROLE_DEFAULTS[role].model;

  return { provider, model };
}

// WordPress outline step only (the article, external link, summaries and
// Pinterest all stay on their own roles). Not an AIRole: it has no default of
// its own — when AI_OUTLINE_MODEL is unset or blank the whole FAST config is
// used (AI_OUTLINE_PROVIDER alone is ignored), so existing deployments keep
// exactly the pre-existing behavior.
export function getOutlineConfig(): AIRoleConfig {
  const fast = getRoleConfig('FAST');
  const model = process.env.AI_OUTLINE_MODEL?.trim();
  if (!model) return fast;

  const provider = (process.env.AI_OUTLINE_PROVIDER?.trim() || fast.provider) as AIProvider;
  return { provider, model };
}
