import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOutlineConfig, getRoleConfig } from '@/lib/ai/config';
import { resolveTextModel } from '@/lib/ai/services/text';
import { generateArticleFromPins, generateWordPressArticle } from '@/lib/wordpress/generate-article';

/**
 * AI_OUTLINE_MODEL (WordPress outline step only). Offline: global fetch is
 * replaced by a stub that answers OpenRouter chat/image calls with fixed
 * fixtures and records every request body — no network, no paid call, no
 * database (Supabase Storage is a stub).
 */

const ENV_KEYS = [
  'AI_FAST_PROVIDER',
  'AI_FAST_MODEL',
  'AI_OUTLINE_PROVIDER',
  'AI_OUTLINE_MODEL',
  'AI_IMAGE_PROVIDER',
  'AI_IMAGE_MODEL',
  'OPENROUTER_API_KEY',
  'OPENROUTER_IMAGE_API_KEY',
  'OPENROUTER_TEXT_MODEL',
] as const;

const FAST_MODEL = 'test-vendor/fast-model';
const OUTLINE_MODEL = 'test-vendor/outline-model';
const TEST_API_KEY = 'sk-test-secret-never-logged';

let savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;
let savedFetch: typeof fetch;

test.beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  savedFetch = globalThis.fetch;
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.AI_FAST_PROVIDER = 'openrouter';
  process.env.AI_FAST_MODEL = FAST_MODEL;
  process.env.AI_IMAGE_PROVIDER = 'openrouter';
  process.env.AI_IMAGE_MODEL = 'test-vendor/image-model';
  process.env.OPENROUTER_API_KEY = TEST_API_KEY;
  process.env.OPENROUTER_IMAGE_API_KEY = TEST_API_KEY;
});

test.afterEach(() => {
  globalThis.fetch = savedFetch;
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

const OUTLINE_FIXTURE = {
  title: 'Crochet Cat Toys: A Complete Beginner Guide',
  metaTitle: 'Crochet Cat Toys Guide',
  slug: 'crochet-cat-toys-guide',
  metaDescription: 'Learn how to crochet safe, durable cat toys with simple stitches and the right yarn.',
  promise: 'Show readers how to crochet safe, durable cat toys.',
  quickAnswerAngle: 'Use tight stitches and cotton yarn.',
  keyTakeawaysThemes: ['yarn choice', 'stitch density', 'safety', 'washing'],
  sections: Array.from({ length: 8 }, (_, i) => ({ heading: `Section ${i + 1}`, summary: `Summary ${i + 1}` })),
  includeComparisonTable: false,
  comparisonTableReason: 'Not a comparison topic.',
  commonMistakesThemes: ['loose stitches', 'small parts', 'wrong yarn'],
  faqQuestions: ['Is cotton safe?', 'How big?', 'Can I wash it?', 'Catnip?'],
  featuredImage: { prompt: 'A crocheted mouse toy on a wooden floor.', altText: 'Crocheted mouse toy' },
  images: [
    { placementMarker: 'IMAGE_1', prompt: 'Cotton yarn skeins.', altText: 'Cotton yarn' },
    { placementMarker: 'IMAGE_2', prompt: 'A cat playing.', altText: 'Cat playing with a toy' },
  ],
};

const ARTICLE_FIXTURE = {
  content: '# Crochet Cat Toys\n\nIntro.\n\n{{IMAGE_1}}\n\n## Yarn\n\nText.\n\n{{IMAGE_2}}\n\nEnd.',
  quickAnswer: 'Use tight stitches and cotton yarn.',
  keyTakeaways: ['a', 'b', 'c', 'd'],
  comparisonTable: null,
  commonMistakes: ['x', 'y', 'z'],
  faq: Array.from({ length: 4 }, (_, i) => ({ question: `Q${i}`, answer: `A${i}` })),
};

interface ChatCall {
  model: string;
  webSearch: boolean;
}

// Answers the outline call, then the article call, with the fixtures above;
// the external-link call (web plugin) answers "no link found".
function installFetchStub(outlineFixture: object = OUTLINE_FIXTURE): ChatCall[] {
  const chatCalls: ChatCall[] = [];
  let textStep = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? '{}')) as { model: string; plugins?: unknown[] };

    if (url.endsWith('/images')) {
      return Response.json({ data: [{ b64_json: Buffer.from('png').toString('base64') }] });
    }

    const webSearch = Array.isArray(body.plugins) && body.plugins.length > 0;
    chatCalls.push({ model: body.model, webSearch });

    let content: string;
    if (webSearch) {
      content = JSON.stringify({ linkFound: false, content: 'unchanged', source: null });
    } else {
      content = JSON.stringify(textStep === 0 ? outlineFixture : ARTICLE_FIXTURE);
      textStep += 1;
    }
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content } }] });
  }) as typeof fetch;

  return chatCalls;
}

function storageStub(): SupabaseClient {
  return {
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
      }),
    },
  } as unknown as SupabaseClient;
}

function captureInfoLogs(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  return { lines, restore: () => (console.info = original) };
}

async function runKeywordGeneration() {
  return generateWordPressArticle({
    supabase: storageStub(),
    userId: 'user-1',
    generationId: 'gen-1',
    keyword: 'crochet cat toys',
    language: 'en',
    brandProfileDescription: null,
  });
}

test('outline uses AI_OUTLINE_MODEL / AI_OUTLINE_PROVIDER when configured', () => {
  process.env.AI_OUTLINE_PROVIDER = 'openrouter';
  process.env.AI_OUTLINE_MODEL = OUTLINE_MODEL;

  expect(getOutlineConfig()).toEqual({ provider: 'openrouter', model: OUTLINE_MODEL });
  expect(resolveTextModel('OUTLINE')).toEqual({ provider: 'openrouter', model: OUTLINE_MODEL });
});

test('outline provider falls back to the FAST provider when only AI_OUTLINE_MODEL is set', () => {
  process.env.AI_OUTLINE_MODEL = OUTLINE_MODEL;

  expect(getOutlineConfig()).toEqual({ provider: 'openrouter', model: OUTLINE_MODEL });
});

for (const [label, value] of [
  ['unset', undefined],
  ['empty', ''],
  ['whitespace', '   '],
] as const) {
  test(`outline falls back to the whole FAST config when AI_OUTLINE_MODEL is ${label}`, () => {
    if (value !== undefined) process.env.AI_OUTLINE_MODEL = value;
    process.env.AI_OUTLINE_PROVIDER = 'openai';

    expect(getOutlineConfig()).toEqual(getRoleConfig('FAST'));
    expect(getOutlineConfig()).toEqual({ provider: 'openrouter', model: FAST_MODEL });
  });
}

test('AI_OUTLINE_MODEL never changes the FAST role (article, Pinterest, external link)', () => {
  process.env.AI_OUTLINE_MODEL = OUTLINE_MODEL;

  expect(resolveTextModel('FAST')).toEqual({ provider: 'openrouter', model: FAST_MODEL });
});

test('keyword article: outline on AI_OUTLINE_MODEL, article and external link on AI_FAST_MODEL', async () => {
  process.env.AI_OUTLINE_PROVIDER = 'openrouter';
  process.env.AI_OUTLINE_MODEL = OUTLINE_MODEL;
  const chatCalls = installFetchStub();
  const logs = captureInfoLogs();

  let result;
  try {
    result = await runKeywordGeneration();
  } finally {
    logs.restore();
  }

  const textCalls = chatCalls.filter((c) => !c.webSearch);
  expect(textCalls.map((c) => c.model)).toEqual([OUTLINE_MODEL, FAST_MODEL]);
  expect(chatCalls.filter((c) => c.webSearch).map((c) => c.model)).toEqual([FAST_MODEL]);

  expect(logs.lines).toContain(`[wordpress] outline model: openrouter/${OUTLINE_MODEL} (role OUTLINE)`);
  expect(logs.lines).toContain(`[wordpress] article model: openrouter/${FAST_MODEL} (role FAST)`);
  expect(logs.lines.join('\n')).not.toContain(TEST_API_KEY);

  // Same output contract as before: outline fields, resolved image markers.
  expect(result.title).toBe(OUTLINE_FIXTURE.title);
  expect(result.metaTitle).toBe(OUTLINE_FIXTURE.metaTitle);
  expect(result.slug).toBe(OUTLINE_FIXTURE.slug);
  expect(result.metaDescription).toBe(OUTLINE_FIXTURE.metaDescription);
  expect(result.content).not.toContain('{{IMAGE_');
  expect(result.content).toContain('![Cotton yarn](https://storage.test/user-1/gen-1/IMAGE_1.png)');
  expect(result.featuredImageUrl).toBe('https://storage.test/user-1/gen-1/FEATURED.png');
  expect(result.internalImages).toHaveLength(2);
});

test('keyword article without AI_OUTLINE_MODEL: both steps on AI_FAST_MODEL (unchanged behavior)', async () => {
  const chatCalls = installFetchStub();
  const logs = captureInfoLogs();
  try {
    await runKeywordGeneration();
  } finally {
    logs.restore();
  }

  expect(chatCalls.filter((c) => !c.webSearch).map((c) => c.model)).toEqual([FAST_MODEL, FAST_MODEL]);
  expect(logs.lines).toContain(`[wordpress] outline model: openrouter/${FAST_MODEL} (role OUTLINE)`);
});

test('outline from AI_OUTLINE_MODEL is still Zod-validated (invalid outline rejected, article never requested)', async () => {
  process.env.AI_OUTLINE_MODEL = OUTLINE_MODEL;
  const chatCalls = installFetchStub({ ...OUTLINE_FIXTURE, sections: [] });
  const logs = captureInfoLogs();
  const originalError = console.error;
  console.error = () => {};
  try {
    await expect(runKeywordGeneration()).rejects.toThrow('AI returned an invalid outline format. Try again.');
  } finally {
    console.error = originalError;
    logs.restore();
  }

  expect(chatCalls.map((c) => c.model)).toEqual([OUTLINE_MODEL]);
});

test('pins article: outline on AI_OUTLINE_MODEL, article on AI_FAST_MODEL', async () => {
  process.env.AI_OUTLINE_MODEL = OUTLINE_MODEL;
  const chatCalls = installFetchStub();
  const logs = captureInfoLogs();
  const originalLog = console.log;
  console.log = () => {};

  let result;
  try {
    result = await generateArticleFromPins({
      supabase: storageStub(),
      userId: 'user-1',
      generationId: 'gen-2',
      pins: [
        { title: 'Pin A', description: 'Desc A', keywords: 'a' },
        { title: 'Pin B', description: 'Desc B', keywords: 'b' },
      ],
      internalImageUrls: ['https://pins.test/a.png', 'https://pins.test/b.png'],
      language: 'en',
      brandProfileDescription: null,
    });
  } finally {
    logs.restore();
    console.log = originalLog;
  }

  expect(chatCalls.filter((c) => !c.webSearch).map((c) => c.model)).toEqual([OUTLINE_MODEL, FAST_MODEL]);
  expect(logs.lines).toContain(`[wordpress-from-pins] outline model: openrouter/${OUTLINE_MODEL} (role OUTLINE)`);
  expect(logs.lines).toContain(`[wordpress-from-pins] article model: openrouter/${FAST_MODEL} (role FAST)`);
  expect(result.content).toContain('![Cotton yarn](https://pins.test/a.png)');
});
