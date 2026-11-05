import sharp from 'sharp';
import { expect, test } from 'playwright/test';
import { generateImage, resolveImageModel } from '@/lib/ai/services/image';
import { resetImageModelCapabilityCache } from '@/lib/ai/providers/openrouter';
import { sanitizeFinalPinterestImage } from '@/lib/pinterest/ai-integrated';
import { optimizeImage } from '@/lib/media/optimize-image';

// TASK-FIX-097: routing between the two OpenRouter GPT Image 2.6 models.
// AI_IMAGE_MODEL_TEXT (sunburst) = images with integrated text (AI-generated
// design, AI Integrated, text-overlay); AI_IMAGE_MODEL (flare, through
// AI_IMAGE_PROVIDER=openrouter) = images without text. Offline: `fetch` is a
// fake that records every request; the key is a placeholder.

const TEXT_MODEL = 'openai/gpt-image-2.6-sunburst';
const PHOTO_MODEL = 'openai/gpt-image-2.6-flare';
const TEST_KEY = 'sk-or-test-placeholder-key-097';
const ENV_KEYS = ['AI_IMAGE_MODEL_TEXT', 'AI_IMAGE_MODEL', 'AI_IMAGE_PROVIDER', 'OPENROUTER_IMAGE_API_KEY'] as const;
const REFERENCE = { buffer: Buffer.from('fake-reference-jpeg'), mimeType: 'image/jpeg' as const };
const CATALOG_PARAMETERS = {
  aspect_ratio: { type: 'enum', values: ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9', 'auto'] },
  quality: { type: 'enum', values: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] },
  input_references: { type: 'range', min: 0, max: 16 },
};
const CATALOG = {
  data: [
    { id: TEXT_MODEL, supported_parameters: CATALOG_PARAMETERS },
    { id: PHOTO_MODEL, supported_parameters: CATALOG_PARAMETERS },
  ],
};

let savedEnv: Record<string, string | undefined>;

interface Recorded {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

async function portraitPng(width = 1024, height = 1536): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#c8a27a' } }).png().toBuffer();
}

async function withFetch(
  options: { catalog?: unknown; image?: () => Promise<Response> },
  run: (requests: Recorded[], logs: string[]) => Promise<void>
): Promise<void> {
  const requests: Recorded[] = [];
  const logs: string[] = [];
  const originals = { fetch: globalThis.fetch, error: console.error, warn: console.warn, log: console.log };
  const capture = (...args: unknown[]) => logs.push(args.map(String).join(' '));
  console.error = capture;
  console.warn = capture;
  console.log = capture;
  const imageB64 = (await portraitPng()).toString('base64');
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    });
    if (url.endsWith('/images/models')) return new Response(JSON.stringify(options.catalog ?? CATALOG), { status: 200 });
    if (options.image) return options.image();
    return new Response(JSON.stringify({ data: [{ b64_json: imageB64 }] }), { status: 200 });
  }) as typeof fetch;
  try {
    await run(requests, logs);
  } finally {
    globalThis.fetch = originals.fetch;
    console.error = originals.error;
    console.warn = originals.warn;
    console.log = originals.log;
  }
}

const posts = (requests: Recorded[]) => requests.filter((request) => request.method === 'POST');

test.beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.AI_IMAGE_MODEL_TEXT = TEXT_MODEL;
  process.env.AI_IMAGE_MODEL = PHOTO_MODEL;
  process.env.AI_IMAGE_PROVIDER = 'openrouter';
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

test('resolution: text formats → AI_IMAGE_MODEL_TEXT, formats without text → AI_IMAGE_MODEL', () => {
  for (const format of ['ai-integrated', 'text-overlay'] as const) {
    expect(resolveImageModel(format)).toEqual({ provider: 'openrouter', model: TEXT_MODEL });
  }
  for (const format of ['photo', 'photo-only'] as const) {
    expect(resolveImageModel(format)).toEqual({ provider: 'openrouter', model: PHOTO_MODEL });
  }
});

test('AI-generated design: sunburst, reference image kept, 2:3, quality high, no size', async () => {
  await withFetch({}, async (requests) => {
    await generateImage({ prompt: 'PROMPT', size: '1024x1536', visualFormat: 'ai-integrated', reference: REFERENCE });
    expect(posts(requests)).toHaveLength(1);
    expect(posts(requests)[0].body).toEqual({
      model: TEXT_MODEL,
      prompt: 'PROMPT',
      aspect_ratio: '2:3',
      quality: 'high',
      input_references: [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${REFERENCE.buffer.toString('base64')}` } }],
    });
  });
});

for (const format of ['photo', 'photo-only'] as const) {
  test(`no-text image (${format}): flare, former 2:3 size payload unchanged, no reference`, async () => {
    await withFetch({}, async (requests) => {
      await generateImage({ prompt: 'PROMPT', size: '1024x1536', visualFormat: format });
      expect(requests).toHaveLength(1);
      expect(requests[0].body).toEqual({ model: PHOTO_MODEL, prompt: 'PROMPT', size: '1024x1536' });
    });
  });
}

test('legacy text-overlay: sunburst, former payload unchanged', async () => {
  await withFetch({}, async (requests) => {
    await generateImage({ prompt: 'PROMPT', size: '1024x1536', visualFormat: 'text-overlay' });
    expect(requests[0].body).toEqual({ model: TEXT_MODEL, prompt: 'PROMPT', size: '1024x1536' });
  });
});

test('WordPress square image (no visual format) goes to flare with its size', async () => {
  await withFetch({}, async (requests) => {
    await generateImage({ prompt: 'PROMPT', size: '1024x1024' });
    expect(requests[0].body).toEqual({ model: PHOTO_MODEL, prompt: 'PROMPT', size: '1024x1024' });
  });
});

test('final Pin stays 1000×1500 after the existing sanitize + compression', async () => {
  await withFetch({}, async () => {
    const raw = await generateImage({ prompt: 'P', size: '1024x1536', visualFormat: 'ai-integrated', reference: REFERENCE });
    const sanitized = await sanitizeFinalPinterestImage(raw);
    const optimized = await optimizeImage(sanitized.buffer, 'pinterest-pin');
    expect([optimized.width, optimized.height]).toEqual([1000, 1500]);
    expect(optimized.contentType).toBe('image/jpeg');
  });
});

test('a non-2:3 provider image is refused explicitly, never cropped', async () => {
  await expect(sanitizeFinalPinterestImage(await portraitPng(1024, 1024))).rejects.toThrow(/expected a 2:3 Pinterest image/);
});

for (const [label, format, model, reference] of [
  ['text (sunburst)', 'ai-integrated', TEXT_MODEL, undefined],
  ['no text (flare)', 'photo-only', PHOTO_MODEL, undefined],
] as const) {
  test(`unavailable model, ${label}: one call, explicit error naming the model, no retry, no other model`, async () => {
    await withFetch(
      {
        image: async () =>
          new Response(JSON.stringify({ error: { message: `No endpoints found for ${model}.` } }), { status: 404 }),
      },
      async (requests) => {
        const failure = await generateImage({ prompt: 'P', size: '1024x1536', visualFormat: format, reference }).catch(
          (error: Error) => error
        );
        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toContain(`OpenRouter image generation failed (model ${model}, HTTP 404)`);
        expect(posts(requests)).toHaveLength(1);
        expect(posts(requests).map((request) => request.body?.model)).toEqual([model]);
      }
    );
  });
}

test('AI-generated design with a model absent from the catalog: fails before any paid call', async () => {
  process.env.AI_IMAGE_MODEL_TEXT = 'openai/gpt-image-9-missing';
  await withFetch({}, async (requests) => {
    await expect(
      generateImage({ prompt: 'P', size: '1024x1536', visualFormat: 'ai-integrated', reference: REFERENCE })
    ).rejects.toThrow('is not in the OpenRouter image catalog');
    expect(posts(requests)).toEqual([]);
  });
});

test('no silent fallback: the text model is never replaced by AI_IMAGE_MODEL when unset', () => {
  delete process.env.AI_IMAGE_MODEL_TEXT;
  expect(() => resolveImageModel('ai-integrated')).toThrow(/AI_IMAGE_MODEL_TEXT/);
});

test('logs and errors never carry the key, the prompt or base64 image data', async () => {
  await withFetch(
    { image: async () => new Response(JSON.stringify({ error: { message: 'Model unavailable' } }), { status: 503 }) },
    async (_requests, logs) => {
      const failure = await generateImage({
        prompt: 'SECRET-FULL-PROMPT-097',
        size: '1024x1536',
        visualFormat: 'ai-integrated',
        reference: REFERENCE,
      }).catch((error: Error) => error);
      const text = `${(failure as Error).message}\n${logs.join('\n')}`;
      expect(text).toContain('Model unavailable');
      for (const forbidden of [TEST_KEY, 'SECRET-FULL-PROMPT-097', REFERENCE.buffer.toString('base64'), 'data:image', 'b64_json']) {
        expect(text).not.toContain(forbidden);
      }
    }
  );
});
