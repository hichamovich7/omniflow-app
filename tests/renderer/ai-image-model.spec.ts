import { expect, test } from 'playwright/test';
import { resolveImageModel } from '@/lib/ai/services/image';

// TASK-FIX-030: AI_IMAGE_MODEL_TEXT has no hardcoded fallback anymore — these
// tests exercise resolveImageModel() directly (pure function of process.env +
// visualFormat), no network/database/browser involved, consistent with the
// rest of the offline renderer suite.

const ENV_KEYS = ['AI_IMAGE_MODEL_TEXT', 'AI_IMAGE_PROVIDER', 'AI_IMAGE_MODEL'] as const;
let savedEnv: Record<(typeof ENV_KEYS)[number], string | undefined>;

test.beforeEach(() => {
  savedEnv = {
    AI_IMAGE_MODEL_TEXT: process.env.AI_IMAGE_MODEL_TEXT,
    AI_IMAGE_PROVIDER: process.env.AI_IMAGE_PROVIDER,
    AI_IMAGE_MODEL: process.env.AI_IMAGE_MODEL,
  };
});

test.afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test('text-overlay uses the configured AI_IMAGE_MODEL_TEXT via OpenRouter', () => {
  process.env.AI_IMAGE_MODEL_TEXT = 'some-vendor/some-text-model';

  expect(resolveImageModel('text-overlay')).toEqual({
    provider: 'openrouter',
    model: 'some-vendor/some-text-model',
  });
});

test('AI Integrated uses the configured AI_IMAGE_MODEL_TEXT and never exposes a model selector', () => {
  process.env.AI_IMAGE_MODEL_TEXT = 'some-vendor/server-owned-text-model';

  expect(resolveImageModel('ai-integrated')).toEqual({
    provider: 'openrouter',
    model: 'some-vendor/server-owned-text-model',
  });
});

test('text-overlay throws naming AI_IMAGE_MODEL_TEXT when the variable is unset', () => {
  delete process.env.AI_IMAGE_MODEL_TEXT;

  expect(() => resolveImageModel('text-overlay')).toThrow(/AI_IMAGE_MODEL_TEXT/);
});

test('text-overlay throws naming AI_IMAGE_MODEL_TEXT when the variable is empty', () => {
  process.env.AI_IMAGE_MODEL_TEXT = '';

  expect(() => resolveImageModel('text-overlay')).toThrow(/AI_IMAGE_MODEL_TEXT/);
});

test('text-overlay throws naming AI_IMAGE_MODEL_TEXT when the variable is only whitespace', () => {
  process.env.AI_IMAGE_MODEL_TEXT = '   ';

  expect(() => resolveImageModel('text-overlay')).toThrow(/AI_IMAGE_MODEL_TEXT/);
});

test('text-overlay never falls back to the old hardcoded Gemini model', () => {
  delete process.env.AI_IMAGE_MODEL_TEXT;

  expect(() => resolveImageModel('text-overlay')).toThrow();
  try {
    resolveImageModel('text-overlay');
  } catch (error) {
    expect(String(error)).not.toContain('gemini');
  }
});

test('photo routing is unaffected by AI_IMAGE_MODEL_TEXT and unchanged when unset', () => {
  delete process.env.AI_IMAGE_MODEL_TEXT;
  delete process.env.AI_IMAGE_PROVIDER;
  delete process.env.AI_IMAGE_MODEL;

  expect(resolveImageModel('photo')).toEqual({ provider: 'openai', model: 'gpt-image-1' });
  expect(resolveImageModel()).toEqual({ provider: 'openai', model: 'gpt-image-1' });
});

test('photo routing still honors AI_IMAGE_PROVIDER/AI_IMAGE_MODEL when set, regardless of AI_IMAGE_MODEL_TEXT', () => {
  delete process.env.AI_IMAGE_MODEL_TEXT;
  process.env.AI_IMAGE_PROVIDER = 'openrouter';
  process.env.AI_IMAGE_MODEL = 'black-forest-labs/flux.2-pro';

  expect(resolveImageModel('photo')).toEqual({
    provider: 'openrouter',
    model: 'black-forest-labs/flux.2-pro',
  });
});
