import { expect, test } from 'playwright/test';
import { generateImage, ImageReferenceUnsupportedError } from '@/lib/ai/services/image';
import { resetImageModelCapabilityCache } from '@/lib/ai/providers/openrouter';

// TASK-088: a reference image for the image model (AI-generated design of a
// numbered Pin). Offline: `fetch` is a fake that records every request; no
// network, no real key (a placeholder is set for the test only).

const ENV_KEYS = ['AI_IMAGE_MODEL_TEXT', 'OPENROUTER_IMAGE_API_KEY'] as const;
const TEST_KEY = 'sk-or-test-placeholder-key';
const MODEL = 'vendor/text-image-model';
const REFERENCE = { buffer: Buffer.from('fake-jpeg-bytes'), mimeType: 'image/jpeg' as const };
const IMAGE_B64 = Buffer.from('generated-image').toString('base64');

let savedEnv: Record<string, string | undefined>;

interface Recorded {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
  headers: Record<string, string>;
}

function catalog(parameters: Record<string, unknown>) {
  return { data: [{ id: MODEL, supported_parameters: parameters }, { id: 'other/model', supported_parameters: {} }] };
}

const SUPPORTED = {
  aspect_ratio: { type: 'enum', values: ['1:1', '2:3', '3:2'] },
  quality: { type: 'enum', values: ['low', 'medium', 'high'] },
  input_references: { type: 'range', min: 0, max: 16 },
};

async function withFetch(
  catalogBody: unknown,
  run: (requests: Recorded[], logs: string[]) => Promise<void>
): Promise<void> {
  const requests: Recorded[] = [];
  const logs: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  console.error = (...args: unknown[]) => logs.push(args.map(String).join(' '));
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    if (url.endsWith('/images/models')) return new Response(JSON.stringify(catalogBody), { status: 200 });
    return new Response(JSON.stringify({ data: [{ b64_json: IMAGE_B64 }] }), { status: 200 });
  }) as typeof fetch;
  try {
    await run(requests, logs);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
}

test.beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.AI_IMAGE_MODEL_TEXT = MODEL;
  process.env.OPENROUTER_IMAGE_API_KEY = TEST_KEY;
  resetImageModelCapabilityCache();
});

test.afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  resetImageModelCapabilityCache();
});

test('with a reference: one catalog check, then one image call adding only input_references (a data URL) to the AI Integrated body', async () => {
  await withFetch(catalog(SUPPORTED), async (requests) => {
    const image = await generateImage({ prompt: 'PROMPT', size: '1024x1536', visualFormat: 'ai-integrated', reference: REFERENCE });
    expect(image.toString()).toBe('generated-image');
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      'GET https://openrouter.ai/api/v1/images/models',
      'POST https://openrouter.ai/api/v1/images',
    ]);
    expect(requests[1].body).toEqual({
      model: MODEL,
      prompt: 'PROMPT',
      aspect_ratio: '2:3',
      quality: 'high',
      input_references: [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${REFERENCE.buffer.toString('base64')}` } }],
    });
  });
});

test('without a reference: no catalog call and the body is exactly the former one', async () => {
  await withFetch(catalog(SUPPORTED), async (requests) => {
    await generateImage({ prompt: 'PROMPT', size: '1024x1536', visualFormat: 'ai-integrated' });
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toEqual({ model: MODEL, prompt: 'PROMPT', aspect_ratio: '2:3', quality: 'high' });
  });
});

test('the catalog answer is cached: a second Pin makes no second catalog call', async () => {
  await withFetch(catalog(SUPPORTED), async (requests) => {
    await generateImage({ prompt: 'A', size: '1024x1536', visualFormat: 'ai-integrated', reference: REFERENCE });
    await generateImage({ prompt: 'B', size: '1024x1536', visualFormat: 'ai-integrated', reference: REFERENCE });
    expect(requests.filter((request) => request.url.endsWith('/images/models'))).toHaveLength(1);
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(2);
  });
});

for (const [label, parameters] of [
  ['no input_references', { aspect_ratio: SUPPORTED.aspect_ratio }],
  ['input_references max 0', { ...SUPPORTED, input_references: { type: 'range', min: 0, max: 0 } }],
  ['no 2:3 format', { ...SUPPORTED, aspect_ratio: { type: 'enum', values: ['1:1'] } }],
] as const) {
  test(`model without reference support (${label}): explicit error, no paid call, no fallback without the reference`, async () => {
    await withFetch(catalog(parameters), async (requests) => {
      await expect(
        generateImage({ prompt: 'PROMPT', size: '1024x1536', visualFormat: 'ai-integrated', reference: REFERENCE })
      ).rejects.toBeInstanceOf(ImageReferenceUnsupportedError);
      expect(requests.filter((request) => request.method === 'POST')).toEqual([]);
    });
  });
}

test('model absent from the catalog, or catalog unavailable: fails closed before any paid call', async () => {
  await withFetch({ data: [] }, async (requests) => {
    await expect(generateImage({ prompt: 'P', size: '1024x1536', visualFormat: 'ai-integrated', reference: REFERENCE })).rejects.toThrow(
      'is not in the OpenRouter image catalog'
    );
    expect(requests.filter((request) => request.method === 'POST')).toEqual([]);
  });
});

test('provider error: the key, the prompt and the reference never reach the logs or the error', async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const logs: string[] = [];
  console.error = (...args: unknown[]) => logs.push(args.map(String).join(' '));
  globalThis.fetch = (async (input: string | URL | Request) => {
    if (String(input).endsWith('/images/models')) return new Response(JSON.stringify(catalog(SUPPORTED)), { status: 200 });
    return new Response(JSON.stringify({ error: { message: 'Your request was rejected by the safety system' } }), { status: 400 });
  }) as typeof fetch;
  try {
    const failure = await generateImage({ prompt: 'SECRET-PROMPT-TEXT', size: '1024x1536', visualFormat: 'ai-integrated', reference: REFERENCE }).catch(
      (error: Error) => error
    );
    expect(failure).toBeInstanceOf(Error);
    const text = `${(failure as Error).message}\n${logs.join('\n')}`;
    expect(text).toContain('rejected by the safety system');
    for (const forbidden of [TEST_KEY, 'SECRET-PROMPT-TEXT', REFERENCE.buffer.toString('base64'), 'data:image']) {
      expect(text).not.toContain(forbidden);
    }
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});
