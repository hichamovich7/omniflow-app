import sharp from 'sharp';
import { expect, test } from 'playwright/test';
import {
  attachAiIntegratedMetadata,
  sanitizeFinalPinterestImage,
} from '@/lib/pinterest/ai-integrated';
import type { AiIntegratedSettings } from '@/lib/pinterest/ai-integrated';

// TASK-FIX-033 strips embedded metadata (C2PA content credentials, EXIF, XMP)
// from generated images. AI Integrated and Photo Only skip the legacy SVG/Sharp
// compositing that used to do it implicitly, so they re-encode the provider
// file explicitly. Everything below is offline: the provider and Supabase are
// replaced and no request can leave this file.

// --- Fixtures ------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function chunkTypes(png: Buffer): string[] {
  const types: string[] = [];
  let offset = 8;
  while (offset + 12 <= png.length) {
    types.push(png.toString('latin1', offset + 4, offset + 8));
    offset += 12 + png.readUInt32BE(offset);
  }
  return types;
}

const C2PA_MARKERS = ['c2pa', 'jumb', 'xmpmeta'];

function containsProvenance(buffer: Buffer): boolean {
  const text = buffer.toString('latin1');
  return C2PA_MARKERS.some((marker) => text.includes(marker));
}

// A non-trivial 2:3 image so "identical pixels" is a meaningful assertion.
async function basePng(width = 200, height = 300): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      raw[i] = (x * 5) % 256;
      raw[i + 1] = (y * 3) % 256;
      raw[i + 2] = (x + y) % 256;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

// Shaped like what the providers return: a C2PA manifest in a `caBX` chunk plus
// an XMP `iTXt` chunk, placed before IEND.
function withProvenance(png: Buffer): Buffer {
  const c2pa = pngChunk(
    'caBX',
    Buffer.concat([Buffer.from([0, 0, 0, 32]), Buffer.from('jumbc2pa.manifest.store.provider-signature', 'latin1')])
  );
  const xmp = pngChunk(
    'iTXt',
    Buffer.concat([
      Buffer.from('XML:com.adobe.xmp', 'latin1'),
      Buffer.from([0, 0, 0, 0, 0]),
      Buffer.from('<x:xmpmeta>provenance</x:xmpmeta>', 'utf8'),
    ])
  );
  const end = png.length - 12; // IEND chunk is always the last 12 bytes
  return Buffer.concat([png.subarray(0, end), c2pa, xmp, png.subarray(end)]);
}

async function pixels(image: Buffer): Promise<Buffer> {
  return sharp(image).raw().toBuffer();
}

// --- Sanitizer ------------------------------------------------------------------

test('a provider PNG carrying a C2PA manifest and XMP keeps neither, and not one pixel changes', async () => {
  const source = withProvenance(await basePng());

  // The fixture really carries provenance and is still a readable image.
  expect(chunkTypes(source)).toEqual(expect.arrayContaining(['caBX', 'iTXt']));
  expect(containsProvenance(source)).toBe(true);
  expect((await sharp(source).metadata()).format).toBe('png');

  const { buffer, technical } = await sanitizeFinalPinterestImage(source);

  const remaining = chunkTypes(buffer);
  for (const forbidden of ['caBX', 'iTXt', 'tEXt', 'zTXt', 'eXIf']) {
    expect(remaining).not.toContain(forbidden);
  }
  expect(containsProvenance(buffer)).toBe(false);
  expect(technical).toMatchObject({ width: 200, height: 300, format: 'png' });
  expect((await pixels(buffer)).equals(await pixels(source))).toBe(true);
});

test('a provider JPEG loses its EXIF block; orientation is applied instead of being lost', async () => {
  const base = await basePng(200, 300);
  const withExif = await sharp(base)
    .jpeg({ quality: 95 })
    .withExif({ IFD0: { Copyright: 'Provenance-Test' } })
    .toBuffer();
  expect((await sharp(withExif).metadata()).exif).toBeDefined();

  const cleaned = await sanitizeFinalPinterestImage(withExif);
  expect(cleaned.technical).toMatchObject({ width: 200, height: 300, format: 'jpeg' });
  expect((await sharp(cleaned.buffer).metadata()).exif).toBeUndefined();
  expect(cleaned.buffer.toString('latin1')).not.toContain('Provenance-Test');

  // A 300x200 file flagged "rotate 90°" displays as 200x300: the pixels are
  // rotated for real before the tag is dropped, so the Pin does not turn sideways.
  const rotated = await sharp(await basePng(300, 200))
    .jpeg({ quality: 95 })
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const upright = await sanitizeFinalPinterestImage(rotated);
  expect(upright.technical).toMatchObject({ width: 200, height: 300, format: 'jpeg' });
  expect((await sharp(upright.buffer).metadata()).orientation).toBeUndefined();
});

test('the sanitizer still enforces the final Pin contract', async () => {
  const square = await sharp({
    create: { width: 300, height: 300, channels: 3, background: '#eee8dc' },
  }).png().toBuffer();
  await expect(sanitizeFinalPinterestImage(square)).rejects.toThrow(/expected a 2:3/);
  await expect(sanitizeFinalPinterestImage(Buffer.alloc(0))).rejects.toThrow(/empty file/);
  await expect(sanitizeFinalPinterestImage(Buffer.from('definitely not an image'))).rejects.toThrow(
    /unreadable image/
  );

  const tiff = await sharp(await basePng()).tiff().toBuffer();
  await expect(sanitizeFinalPinterestImage(tiff)).rejects.toThrow(/Unsupported generated image format: tiff/);
});

// --- Route behavior (Supabase, rate limit and the provider are replaced) ------

const settings: AiIntegratedSettings = {
  creativeFormat: 'hero-pin',
  strategy: 'ai-recommends',
  headline: { mode: 'generate' },
  subtitle: { mode: 'generate' },
  cta: { mode: 'none' },
  maximumTextLines: 4,
  importance: { headline: 'high', subtitle: 'medium', cta: 'low' },
};

function pinRow(visualFormat: 'ai-integrated' | 'photo-only' | 'photo') {
  return {
    id: `pin-${visualFormat}`,
    generation_id: 'generation-1',
    language: 'de',
    title: 'Kleines Bad',
    description: 'Ideen für kleine Bäder.',
    keywords: 'bad, stauraum',
    board: 'Bäder',
    board_id: null,
    image_prompt: 'A bright small bathroom with a white oak shelf, photorealistic.',
    visual_format: visualFormat,
    overlay_text: null,
    title_banner_template: null,
    cta_banner_template: visualFormat === 'photo' ? 'clean-band' : null,
    media_url: null,
    publish_date: null,
    link_url: null,
    image_analysis:
      visualFormat === 'ai-integrated'
        ? attachAiIntegratedMetadata(null, {
            language: 'de',
            settings,
            text: { headline: 'Kleines Bad', subtitle: 'Ideen', cta: null },
          })
        : null,
  };
}

interface Upload {
  bucket: string;
  path: string;
  buffer: Buffer;
  contentType: string | undefined;
}

interface ImageRouteResult {
  status: number;
  uploads: Upload[];
  providerCalls: number;
  fetchCalls: number;
}

async function runImageRoute(
  pin: ReturnType<typeof pinRow>,
  providerImage: Buffer
): Promise<ImageRouteResult> {
  const uploads: Upload[] = [];
  const result: ImageRouteResult = { status: 0, uploads, providerCalls: 0, fetchCalls: 0 };

  const supabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1', email: 'user@example.com' } } }),
    },
    from(table: string) {
      let operation: 'select' | 'insert' | 'update' = 'select';
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        is: () => query,
        order: () => query,
        limit: () => query,
        insert: () => {
          operation = 'insert';
          return query;
        },
        update: () => {
          operation = 'update';
          return query;
        },
        single: async () => ({
          data:
            table === 'generations'
              ? { id: 'generation-1', image_status: 'none', status: 'completed', user_id: 'user-1', project_id: 'project-1' }
              : table === 'projects'
                ? { niche: 'Home Decor' }
                : null,
          error: null,
        }),
        then: (resolve: (value: unknown) => unknown) =>
          resolve({
            data: operation === 'select' && table === 'pins' ? [pin] : operation === 'select' && table === 'pin_images' ? [] : null,
            error: null,
          }),
      };
      return query;
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, buffer: Buffer, options?: { contentType?: string }) => {
          uploads.push({ bucket, path, buffer, contentType: options?.contentType });
          return { error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
        remove: async () => ({ error: null }),
      }),
    },
  };

  const fakes: Record<string, unknown> = {
    '@/lib/supabase/server': { createClient: async () => supabase },
    '@/lib/rate-limit': {
      checkRateLimit: async () => ({ allowed: true }),
      rateLimitErrorResponse: () => {
        throw new Error('rate limit response must not be reached');
      },
    },
    '@/lib/ai/engine': {
      generateImage: async () => {
        result.providerCalls += 1;
        return providerImage;
      },
      resolveImageModel: () => ({ provider: 'openrouter', model: 'test/image-model' }),
      generateText: async () => {
        throw new Error('Text generation must not be called');
      },
      analyzeImage: async () => {
        throw new Error('Vision must not be called');
      },
    },
  };

  const routeKey = require.resolve('@/app/api/pinterest/generate-images/route');
  const keys = [...Object.keys(fakes).map((specifier) => require.resolve(specifier)), routeKey];
  const originals = new Map<string, NodeJS.Module | undefined>(keys.map((key) => [key, require.cache[key]]));
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const originalError = console.error;

  try {
    for (const [specifier, exports] of Object.entries(fakes)) {
      const filename = require.resolve(specifier);
      require.cache[filename] = {
        id: filename,
        filename,
        loaded: true,
        exports,
        children: [],
        paths: [],
        path: '',
        parent: null,
        isPreloading: false,
        require,
      } as unknown as NodeJS.Module;
    }
    delete require.cache[routeKey];

    globalThis.fetch = (async () => {
      result.fetchCalls += 1;
      throw new Error('No network call is allowed in this test');
    }) as typeof fetch;
    console.warn = () => undefined;
    console.error = () => undefined;

    // A CommonJS load is required: the route must be re-evaluated after its
    // dependencies were replaced in require.cache (an ES import is hoisted).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const route = require('@/app/api/pinterest/generate-images/route') as {
      POST: (request: Request) => Promise<Response>;
    };
    const response = await route.POST(
      new Request('http://localhost/api/pinterest/generate-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId: '11111111-1111-4111-8111-111111111111' }),
      })
    );
    result.status = response.status;
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
    globalThis.fetch = originalFetch;
    for (const [key, original] of originals) {
      if (original) require.cache[key] = original;
      else delete require.cache[key];
    }
  }

  return result;
}

for (const visualFormat of ['ai-integrated', 'photo-only'] as const) {
  test(`${visualFormat}: the stored image has no C2PA, XMP or other metadata, and the same pixels`, async () => {
    const providerImage = withProvenance(await basePng());
    expect(containsProvenance(providerImage)).toBe(true);

    const result = await runImageRoute(pinRow(visualFormat), providerImage);

    expect(result.status).toBe(200);
    expect(result.providerCalls).toBe(1);
    expect(result.fetchCalls).toBe(0);

    // One image file, no raw "source companion" holding the original bytes.
    expect(result.uploads).toHaveLength(1);
    const [upload] = result.uploads;
    expect(upload.bucket).toBe('generated-images');
    expect(upload.path).toMatch(/\/1\.png$/);
    expect(upload.contentType).toBe('image/png');

    expect(chunkTypes(upload.buffer)).not.toContain('caBX');
    expect(chunkTypes(upload.buffer)).not.toContain('iTXt');
    expect(containsProvenance(upload.buffer)).toBe(false);
    expect((await pixels(upload.buffer)).equals(await pixels(providerImage))).toBe(true);
    expect((await sharp(upload.buffer).metadata())).toMatchObject({ width: 200, height: 300 });
  });
}

test('legacy Composite: the stored image is still free of provenance metadata (unchanged behavior)', async () => {
  const providerImage = withProvenance(await basePng());

  const result = await runImageRoute(pinRow('photo'), providerImage);

  expect(result.status).toBe(200);
  expect(result.uploads).toHaveLength(1);
  expect(containsProvenance(result.uploads[0].buffer)).toBe(false);
  expect(chunkTypes(result.uploads[0].buffer)).not.toContain('caBX');
});
