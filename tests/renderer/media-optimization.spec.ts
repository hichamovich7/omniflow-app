import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getMediaProfile,
  listMediaProfiles,
  MEDIA_PROFILE_IDS,
  type MediaProfileId,
} from '@/lib/media/media-profiles';
import { describeOptimization, ImageOptimizationError, optimizeImage } from '@/lib/media/optimize-image';
import { createMediaStorage, r2MediaKey } from '@/lib/storage';
import { createR2MediaStorage } from '@/lib/storage/r2-provider';
import type { S3ObjectClient } from '@/lib/storage/s3-client';
import { getPinImageObjectKey, getPinSourceStoragePath } from '@/lib/pinterest/pin-image-storage';
import { storeArticleImage } from '@/lib/wordpress/article-image-storage';
import { mediaFilename } from '@/lib/wordpress/publish-media';
import { resolveSourceAssetKey } from '@/lib/wordpress/media-source';
import { hashImageBytes } from '@/lib/wordpress/media-reuse';
import { downloadSourceImage } from '@/lib/wordpress/rest-client';

/**
 * TASK-050 — media profiles and image optimization before storage. Offline:
 * fixtures are generated with sharp, storage is faked — no network, no AI.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const USER = '99999999-9999-4999-8999-999999999999';
const GEN = '11111111-1111-4111-8111-111111111111';
const PIN = '22222222-2222-4222-8222-222222222222';
const PUBLIC = 'https://media.n8nflow.org';
const SUPABASE_PUBLIC = 'https://abcd.supabase.co/storage/v1/object/public';
const SECRET = 'fake/SECRET+key/never-log-me-0123456789';

// ------------------------------------------------------------------ fixtures

/** Photo-like RGB image: smooth gradients + light grain, like a generated image. */
async function photoPng(width: number, height: number, text?: string): Promise<Buffer> {
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  let seed = 7;
  const grain = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed % 9) - 4;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      raw[i] = Math.max(0, Math.min(255, 128 + 90 * Math.sin(x / 70) + grain()));
      raw[i + 1] = Math.max(0, Math.min(255, 110 + 80 * Math.cos(y / 90) + grain()));
      raw[i + 2] = Math.max(0, Math.min(255, 100 + 60 * Math.sin((x + y) / 120) + grain()));
    }
  }
  let image = sharp(raw, { raw: { width, height, channels } });
  if (text) {
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${width}" height="${Math.round(height / 5)}" fill="#1f3b2d"/><text x="50%" y="${Math.round(height / 9)}" font-size="${Math.round(width / 12)}" font-family="sans-serif" fill="#ffffff" text-anchor="middle">${text}</text></svg>`;
    image = image.composite([{ input: Buffer.from(svg) }]);
  }
  return image.png().toBuffer();
}

let PIN_PNG: Buffer;
let ARTICLE_PNG: Buffer;
test.beforeAll(async () => {
  PIN_PNG = await photoPng(1024, 1536, 'Cozy Crochet Ideas');
  ARTICLE_PNG = await photoPng(1024, 1024);
});

function fakeS3() {
  const puts: { key: string; contentType: string; size: number }[] = [];
  const client: S3ObjectClient = {
    async putObject({ key, body, contentType }) {
      puts.push({ key, contentType, size: body.length });
    },
    async getObject() {
      return Buffer.alloc(0);
    },
    async deleteObject() {},
    async listObjects() {
      return [];
    },
  };
  return { client, puts };
}

function fakeSupabase() {
  const uploads: { bucket: string; path: string; options: unknown }[] = [];
  const client = {
    storage: {
      from: (bucket: string) => ({
        async upload(path: string, _body: Buffer, options: unknown) {
          uploads.push({ bucket, path, options });
          return { data: { path }, error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `${SUPABASE_PUBLIC}/${bucket}/${path}` } }),
      }),
    },
  } as unknown as SupabaseClient;
  return { client, uploads };
}

// ------------------------------------------------------------------ profiles

test('active profiles: Pinterest 1000x1500 JPEG q88, WordPress ≤1600 WebP q85 with explicit JPEG fallback', () => {
  const pin = getMediaProfile('pinterest-pin');
  expect(pin).toMatchObject({
    platform: 'pinterest',
    status: 'active',
    resize: { mode: 'exact', width: 1000, height: 1500, fit: 'cover' },
    format: 'jpeg',
    quality: 88,
    extension: 'jpg',
    contentType: 'image/jpeg',
    transparency: { mode: 'flatten' },
    storageChannel: 'pinterest',
  });
  const wp = getMediaProfile('wordpress-article');
  expect(wp).toMatchObject({
    platform: 'wordpress',
    status: 'active',
    resize: { mode: 'max', maxWidth: 1600, maxHeight: 1600, fit: 'inside' },
    format: 'webp',
    quality: 85,
    extension: 'webp',
    contentType: 'image/webp',
    fallbackProfileId: 'wordpress-article-jpeg',
    storageChannel: 'wordpress',
  });
  const fallback = getMediaProfile('wordpress-article-jpeg');
  expect(fallback).toMatchObject({ status: 'active', format: 'jpeg', extension: 'jpg', contentType: 'image/jpeg' });
  expect(fallback.resize).toEqual(wp.resize);

  for (const profile of listMediaProfiles()) {
    expect(profile.maxBytes, profile.id).toBeGreaterThan(0);
    expect(profile.minQuality, profile.id).toBeLessThanOrEqual(profile.quality);
    expect(profile.contentType.endsWith(profile.format), profile.id).toBe(true);
  }
});

test('future profiles are configured but planned', () => {
  const expected: Record<string, [string, number, number, string]> = {
    'facebook-feed-portrait': ['facebook', 1080, 1359, 'facebookImage'],
    'facebook-feed-square': ['facebook', 1080, 1080, 'facebookImage'],
    'facebook-story': ['facebook', 1080, 1920, 'facebookImage'],
    'facebook-cover': ['facebook', 851, 315, 'facebookImage'],
    'instagram-post-portrait': ['instagram', 1080, 1350, 'instagramImage'],
    'instagram-post-square': ['instagram', 1080, 1080, 'instagramImage'],
    'instagram-story-reel': ['instagram', 1080, 1920, 'instagramImage'],
    'tiktok-vertical': ['tiktok', 1080, 1920, 'tiktok'],
    'reels-vertical': ['reels', 1080, 1920, 'reels'],
  };
  for (const [id, [platform, width, height, channel]] of Object.entries(expected)) {
    const profile = getMediaProfile(id as MediaProfileId);
    expect(profile, id).toMatchObject({ platform, status: 'planned', resize: { mode: 'exact', width, height }, storageChannel: channel });
  }
  expect(listMediaProfiles('active').map((p) => p.id)).toEqual(['pinterest-pin', 'wordpress-article', 'wordpress-article-jpeg']);
  expect(MEDIA_PROFILE_IDS).toHaveLength(12);
  expect(r2MediaKey('instagramImage', USER, 'c1', 'a.jpg')).toBe(`images/instagram/${USER}/c1/a.jpg`);
});

test('planned profiles cannot be produced — no Facebook / Instagram / TikTok variant is created', async () => {
  await expect(optimizeImage(PIN_PNG, 'facebook-feed-portrait')).rejects.toThrow(/planned, not active/);
  await expect(optimizeImage(PIN_PNG, 'tiktok-vertical')).rejects.toBeInstanceOf(ImageOptimizationError);

  // Only active profile ids are referenced outside lib/media, and only once per use.
  const files = ['app', 'lib', 'components'].flatMap((dir) =>
    readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !join(e.parentPath, e.name).includes(join('lib', 'media')))
      .map((e) => join(e.parentPath, e.name))
  );
  const calls = files.flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/optimizeImage\([^,]+,\s*'([a-z-]+)'/g)].map((m) => m[1])
  );
  expect(calls.sort()).toEqual(['pinterest-pin', 'pinterest-pin', 'wordpress-article']);
});

// -------------------------------------------------------------- optimization

test('Pinterest: 1024x1536 PNG → exactly 1000x1500 JPEG, smaller, metadata stripped, input untouched', async () => {
  const before = Buffer.from(PIN_PNG);
  const result = await optimizeImage(PIN_PNG, 'pinterest-pin');

  expect(PIN_PNG.equals(before)).toBe(true);
  expect(result).toMatchObject({ width: 1000, height: 1500, format: 'jpeg', extension: 'jpg', contentType: 'image/jpeg', quality: 88 });
  expect(result.bytes).toBe(result.buffer.byteLength);
  expect(result.bytes).toBeLessThan(PIN_PNG.byteLength / 2);
  const meta = await sharp(result.buffer).metadata();
  expect(meta).toMatchObject({ format: 'jpeg', width: 1000, height: 1500 });
  expect(meta.exif).toBeUndefined();
  expect(meta.xmp).toBeUndefined();
  expect(meta.orientation).toBeUndefined();
  console.log(`fixture ${describeOptimization(result)}`);
});

test('WordPress: longest side capped at 1600, aspect kept, WebP, smaller', async () => {
  const large = await photoPng(2400, 1600);
  const result = await optimizeImage(large, 'wordpress-article');
  expect(result).toMatchObject({ width: 1600, height: 1067, format: 'webp', extension: 'webp', contentType: 'image/webp' });
  expect((await sharp(result.buffer).metadata()).format).toBe('webp');
  expect(result.bytes).toBeLessThan(large.byteLength / 2);

  const article = await optimizeImage(ARTICLE_PNG, 'wordpress-article');
  expect(article).toMatchObject({ width: 1024, height: 1024 });
  expect(article.bytes).toBeLessThan(ARTICLE_PNG.byteLength / 2);
  console.log(`fixture ${describeOptimization(result)}`);
  console.log(`fixture ${describeOptimization(article)}`);
});

test('images are never enlarged', async () => {
  const smallPin = await photoPng(600, 900);
  expect(await optimizeImage(smallPin, 'pinterest-pin')).toMatchObject({ width: 600, height: 900 });
  const smallArticle = await photoPng(500, 300);
  expect(await optimizeImage(smallArticle, 'wordpress-article')).toMatchObject({ width: 500, height: 300 });
});

test('EXIF orientation is applied before resizing', async () => {
  // Stored landscape, EXIF orientation 6 → displayed portrait.
  const sideways = await sharp(await photoPng(1536, 1024)).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const pin = await optimizeImage(sideways, 'pinterest-pin');
  expect(pin).toMatchObject({ width: 1000, height: 1500, originalWidth: 1024, originalHeight: 1536 });
  expect((await sharp(pin.buffer).metadata()).orientation).toBeUndefined();

  const small = await sharp(await photoPng(600, 400)).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  expect(await optimizeImage(small, 'wordpress-article')).toMatchObject({ width: 400, height: 600 });
});

test('no aggressive crop: a Pin far from 2:3 is refused instead of cut', async () => {
  const square = await photoPng(1024, 1024);
  await expect(optimizeImage(square, 'pinterest-pin')).rejects.toThrow(/no aggressive crop/);
});

test('transparency: flattened for JPEG Pins, preserved in WebP articles', async () => {
  const transparent = await sharp({
    create: { width: 1024, height: 1536, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
  const pin = await sharp((await optimizeImage(transparent, 'pinterest-pin')).buffer).metadata();
  expect(pin.hasAlpha).toBe(false);
  const { data } = await sharp((await optimizeImage(transparent, 'pinterest-pin')).buffer).raw().toBuffer({ resolveWithObject: true });
  expect(data[0]).toBeGreaterThan(245); // white background

  const article = await sharp((await optimizeImage(transparent, 'wordpress-article')).buffer).metadata();
  expect(article.hasAlpha).toBe(true);
});

test('failures are explicit: empty or unreadable input never yields a buffer', async () => {
  await expect(optimizeImage(Buffer.alloc(0), 'pinterest-pin')).rejects.toThrow(/empty/);
  await expect(optimizeImage(Buffer.from('not an image'), 'wordpress-article')).rejects.toBeInstanceOf(ImageOptimizationError);
});

// --------------------------------------------------------------- storage wiring

test('Pinterest route optimizes before any storage write and stores the real format', () => {
  const route = read('app/api/pinterest/generate-images/route.ts');
  const optimizeAt = route.indexOf("optimizeImage(imageBuffer, 'pinterest-pin')");
  expect(optimizeAt).toBeGreaterThan(0);
  expect(optimizeAt).toBeLessThan(route.indexOf('getPinImageObjectKey('));
  expect(optimizeAt).toBeLessThan(route.indexOf('.upload(sourcePath'));
  expect(route).toContain('extension: optimized.extension');
  expect(route).toContain('body: optimized.buffer, contentType: optimized.contentType');
  // The .source photo keeps the raw, unconverted provider bytes.
  expect(route).toMatch(/\.upload\(sourcePath, rawImageBuffer, \{ contentType: 'image\/png' \}\)/);

  const recompose = read('app/api/pinterest/pin-images/recompose/route.ts');
  expect(recompose).toContain("optimizeImage(composition.imageBuffer, 'pinterest-pin')");
  expect(recompose).toContain('bucket.upload(newSourcePath, sourceImageBuffer');
  expect(recompose).toContain('body: optimized.buffer');
});

test('.source paths: always .source.png on Supabase, old paths unchanged', () => {
  expect(getPinSourceStoragePath(`${USER}/${PIN}/3.png`)).toBe(`${USER}/${PIN}/3.source.png`);
  expect(getPinSourceStoragePath(`${USER}/${PIN}/4.jpg`)).toBe(`${USER}/${PIN}/4.source.png`);
  expect(getPinSourceStoragePath(`images/pinterest/${USER}/${GEN}/${PIN}/5.jpg`)).toBe(`${USER}/${PIN}/5.source.png`);
});

test('Pinterest and WordPress keys are distinct and carry the real extension', () => {
  const pinKey = getPinImageObjectKey('r2', { userId: USER, generationId: GEN, pinId: PIN, version: 1, extension: 'jpg' });
  expect(pinKey).toBe(`images/pinterest/${USER}/${GEN}/${PIN}/1.jpg`);
  expect(getPinImageObjectKey('supabase', { userId: USER, generationId: GEN, pinId: PIN, version: 1, extension: 'jpg' })).toBe(
    `${USER}/${PIN}/1.jpg`
  );
  expect(r2MediaKey('wordpress', USER, GEN, 'FEATURED.webp')).toBe(`images/wordpress/${USER}/${GEN}/FEATURED.webp`);
  expect(pinKey.startsWith('images/wordpress/')).toBe(false);
});

test('WordPress images: Supabase stays the default provider, optimized WebP with matching path and type', async () => {
  const { client, uploads } = fakeSupabase();
  const storage = createMediaStorage(client, 'wordpress-images', { env: {} });
  expect(storage.provider).toBe('supabase');
  const url = await storeArticleImage(storage, { userId: USER, generationId: GEN, marker: 'FEATURED', body: ARTICLE_PNG });
  expect(url).toBe(`${SUPABASE_PUBLIC}/wordpress-images/${USER}/${GEN}/FEATURED.webp`);
  expect(uploads).toEqual([{ bucket: 'wordpress-images', path: `${USER}/${GEN}/FEATURED.webp`, options: { contentType: 'image/webp' } }]);
});

test('WordPress images on R2: media.n8nflow.org URL, .webp key, image/webp, smaller than the PNG', async () => {
  const { client, puts } = fakeS3();
  const storage = createR2MediaStorage({ publicUrl: PUBLIC }, client);
  const url = await storeArticleImage(storage, { userId: USER, generationId: GEN, marker: 'IMAGE_1', body: ARTICLE_PNG });
  expect(url).toBe(`${PUBLIC}/images/wordpress/${USER}/${GEN}/IMAGE_1.webp`);
  expect(puts).toHaveLength(1);
  expect(puts[0]).toMatchObject({ key: `images/wordpress/${USER}/${GEN}/IMAGE_1.webp`, contentType: 'image/webp' });
  expect(puts[0].size).toBeLessThan(ARTICLE_PNG.byteLength);
});

test('an image that cannot be optimized is never stored as the raw PNG', async () => {
  const { client, puts } = fakeS3();
  const storage = createR2MediaStorage({ publicUrl: PUBLIC }, client);
  await expect(
    storeArticleImage(storage, { userId: USER, generationId: GEN, marker: 'FEATURED', body: Buffer.from('corrupt') })
  ).rejects.toThrow(/Image optimization failed for FEATURED/);
  expect(puts).toHaveLength(0);
});

// ------------------------------------------------------------- WordPress reuse

test('WordPress filenames follow the real format; old PNG URLs keep .png', () => {
  expect(mediaFilename('my-post-featured', `${PUBLIC}/images/wordpress/${USER}/${GEN}/FEATURED.webp`)).toBe('my-post-featured.webp');
  expect(mediaFilename('my-post-1', `${PUBLIC}/images/pinterest/${USER}/${GEN}/${PIN}/2.jpg`)).toBe('my-post-1.jpg');
  expect(mediaFilename('my-post-1', `${SUPABASE_PUBLIC}/wordpress-images/${USER}/${GEN}/IMAGE_1.png`)).toBe('my-post-1.png');
  expect(mediaFilename('my-post-1', 'not a url')).toBe('my-post-1.png');
  expect(mediaFilename('my-post-1', null)).toBe('my-post-1.png');
  const route = read('app/api/wordpress/[id]/publish/route.ts');
  expect(route).toContain('mediaFilename(`${article.slug}-featured`, article.featured_image_url)');
  expect(route).not.toMatch(/-featured\.png`/);
});

test('media reuse keys stay stable per object: new extensions are new keys, old PNG keys unchanged', () => {
  const options = { cdnOrigins: [{ baseUrl: PUBLIC, bucket: 'omniflow-media' }] };
  const oldPng = `${SUPABASE_PUBLIC}/wordpress-images/${USER}/${GEN}/FEATURED.png`;
  const newWebp = `${PUBLIC}/images/wordpress/${USER}/${GEN}/FEATURED.webp`;
  expect(resolveSourceAssetKey(oldPng, options)).toBe(`storage:wordpress-images/${USER}/${GEN}/FEATURED.png`);
  expect(resolveSourceAssetKey(newWebp, options)).toBe(`storage:omniflow-media/images/wordpress/${USER}/${GEN}/FEATURED.webp`);
  // Same object, same key on every publish (cache-busting query ignored).
  expect(resolveSourceAssetKey(`${newWebp}?v=3`, options)).toBe(resolveSourceAssetKey(newWebp, options));
});

test('media reuse: an optimized image downloads with its real MIME and a stable hash', async () => {
  const optimized = await optimizeImage(ARTICLE_PNG, 'wordpress-article');
  const again = await optimizeImage(ARTICLE_PNG, 'wordpress-article');
  // Deterministic output → a regenerated copy of the same bytes hashes the same.
  expect(hashImageBytes(new Uint8Array(again.buffer).buffer)).toBe(hashImageBytes(new Uint8Array(optimized.buffer).buffer));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(new Uint8Array(optimized.buffer), { status: 200, headers: { 'content-type': 'image/webp' } })) as typeof fetch;
  try {
    const image = await downloadSourceImage(`${PUBLIC}/images/wordpress/${USER}/${GEN}/FEATURED.webp`, 'post-featured.webp');
    expect(image.mime).toBe('image/webp');
    expect(hashImageBytes(image.bytes)).toBe(hashImageBytes(new Uint8Array(optimized.buffer).buffer));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('optimization logs carry sizes and formats only — never keys or secrets', async () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  try {
    const { client } = fakeS3();
    await storeArticleImage(createR2MediaStorage({ publicUrl: PUBLIC }, client), {
      userId: USER,
      generationId: GEN,
      marker: 'FEATURED',
      body: ARTICLE_PNG,
    });
  } finally {
    console.log = original;
  }
  const output = lines.join('\n');
  expect(output).toMatch(/\[wordpress images\] FEATURED wordpress-article 1024x1024 \d+KB → 1024x1024 webp q85 \d+KB/);
  expect(output).not.toContain(SECRET);
  expect(output).not.toMatch(/R2_|AKIA|authorization/i);
});
