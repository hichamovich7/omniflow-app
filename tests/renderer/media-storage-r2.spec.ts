import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createMediaStorage,
  getMediaStorageProvider,
  getR2StorageIfConfigured,
  isR2MediaKey,
  mediaSourceOptions,
  MediaStorageError,
  r2KeyFromPublicUrl,
  r2MediaFolder,
  r2MediaKey,
  readR2Config,
  removeR2Folder,
  resolveMediaKey,
  type MediaStorage,
} from '@/lib/storage';
import { createR2MediaStorage } from '@/lib/storage/r2-provider';
import { createSupabaseMediaStorage } from '@/lib/storage/supabase-provider';
import { createR2S3Client, signS3Request, type FetchLike, type S3ObjectClient } from '@/lib/storage/s3-client';
import {
  getPinImageObjectKey,
  getPinImageStoragePath,
  getPinSourceStoragePath,
} from '@/lib/pinterest/pin-image-storage';
import { storeArticleImage } from '@/lib/wordpress/article-image-storage';
import { copyArticleImages } from '@/lib/wordpress/rewrite-article';
import { resolveSourceAssetKey } from '@/lib/wordpress/media-source';

/**
 * TASK-049 — Cloudflare R2 media storage behind MEDIA_STORAGE_PROVIDER.
 * Offline: the S3 client, fetch and Supabase are fakes — no network, no
 * bucket, no AI call. Credentials below are fake and must never be logged.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const USER = '99999999-9999-4999-8999-999999999999';
const GEN = '11111111-1111-4111-8111-111111111111';
const GEN2 = '33333333-3333-4333-8333-333333333333';
const PIN = '22222222-2222-4222-8222-222222222222';
const ACCESS_KEY = 'AKIAFAKEACCESSKEY0001';
const SECRET_KEY = 'fake/SECRET+key/never-log-me-0123456789';
const R2_ENV = {
  MEDIA_STORAGE_PROVIDER: 'r2',
  R2_ENDPOINT: 'https://account123.r2.cloudflarestorage.com',
  R2_BUCKET: 'omniflow-media',
  R2_PUBLIC_URL: 'https://media.n8nflow.org',
  R2_REGION: 'auto',
  R2_ACCESS_KEY_ID: ACCESS_KEY,
  R2_SECRET_ACCESS_KEY: SECRET_KEY,
};
const PUBLIC = 'https://media.n8nflow.org';
// Valid 1x1 PNG: article images are optimized (TASK-050) before they reach storage.
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const SUPABASE_PUBLIC = 'https://abcd.supabase.co/storage/v1/object/public';

// ------------------------------------------------------------------ fakes

function fakeS3(overrides: Partial<S3ObjectClient> = {}) {
  const calls: { op: string; key: string; contentType?: string; size?: number }[] = [];
  const objects = new Map<string, Buffer>();
  const client: S3ObjectClient = {
    async putObject({ key, body, contentType }) {
      calls.push({ op: 'put', key, contentType, size: body.length });
      objects.set(key, body);
    },
    async getObject(key) {
      calls.push({ op: 'get', key });
      const body = objects.get(key);
      if (!body) throw new Error('missing');
      return body;
    },
    async deleteObject(key) {
      calls.push({ op: 'delete', key });
      objects.delete(key);
    },
    async listObjects(prefix) {
      calls.push({ op: 'list', key: prefix });
      return [...objects.keys()].filter((key) => key.startsWith(prefix));
    },
    ...overrides,
  };
  return { client, calls, objects };
}

function fakeSupabase() {
  const calls: { bucket: string; op: string; args: unknown[] }[] = [];
  const bucketApi = (bucket: string) => ({
    async upload(...args: unknown[]) {
      calls.push({ bucket, op: 'upload', args });
      return { data: { path: args[0] }, error: null };
    },
    getPublicUrl(path: string) {
      calls.push({ bucket, op: 'getPublicUrl', args: [path] });
      return { data: { publicUrl: `${SUPABASE_PUBLIC}/${bucket}/${path}` } };
    },
    async remove(paths: string[]) {
      calls.push({ bucket, op: 'remove', args: [paths] });
      return { data: [], error: null };
    },
    async list(folder: string) {
      calls.push({ bucket, op: 'list', args: [folder] });
      return { data: [{ name: '1.png' }], error: null };
    },
    async download(path: string) {
      calls.push({ bucket, op: 'download', args: [path] });
      return { data: new Blob([Buffer.from('bytes')]), error: null };
    },
  });
  const client = { storage: { from: (bucket: string) => bucketApi(bucket) } } as unknown as SupabaseClient;
  return { client, calls };
}

/** Captures console output while `run` executes. */
async function captureConsole(run: () => Promise<unknown>): Promise<string> {
  const lines: string[] = [];
  const originals = { log: console.log, warn: console.warn, error: console.error };
  const capture = (...args: unknown[]) => {
    lines.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack ?? ''}` : String(a))).join(' '));
  };
  console.log = capture;
  console.warn = capture;
  console.error = capture;
  try {
    await run().catch((err: unknown) => capture(err));
  } finally {
    Object.assign(console, originals);
  }
  return lines.join('\n');
}

// ----------------------------------------------------------- configuration

test('provider defaults to supabase and accepts only supabase / r2', () => {
  expect(getMediaStorageProvider({})).toBe('supabase');
  expect(getMediaStorageProvider({ MEDIA_STORAGE_PROVIDER: '' })).toBe('supabase');
  expect(getMediaStorageProvider({ MEDIA_STORAGE_PROVIDER: 'supabase' })).toBe('supabase');
  expect(getMediaStorageProvider({ MEDIA_STORAGE_PROVIDER: ' R2 ' })).toBe('r2');
  expect(() => getMediaStorageProvider({ MEDIA_STORAGE_PROVIDER: 's3' })).toThrow(MediaStorageError);
});

test('R2 config: missing / invalid variables are named, values never echoed', () => {
  const config = readR2Config(R2_ENV);
  expect(config).toMatchObject({ bucket: 'omniflow-media', publicUrl: PUBLIC, region: 'auto' });
  expect(readR2Config({ ...R2_ENV, R2_REGION: '' }).region).toBe('auto');

  let message = '';
  try {
    readR2Config({ ...R2_ENV, R2_ACCESS_KEY_ID: '', R2_BUCKET: undefined });
  } catch (err) {
    expect(err).toBeInstanceOf(MediaStorageError);
    message = (err as Error).message;
  }
  expect(message).toContain('R2_ACCESS_KEY_ID');
  expect(message).toContain('R2_BUCKET');
  expect(message).not.toContain(SECRET_KEY);

  expect(() => readR2Config({ ...R2_ENV, R2_PUBLIC_URL: 'http://media.n8nflow.org' })).toThrow(/R2_PUBLIC_URL/);
  expect(() => readR2Config({ ...R2_ENV, R2_ENDPOINT: 'not a url' })).toThrow(/R2_ENDPOINT/);
});

test('MEDIA_STORAGE_PROVIDER=r2 without R2 config throws — no silent fallback to Supabase', () => {
  const { client, calls } = fakeSupabase();
  expect(() => createMediaStorage(client, 'generated-images', { env: { MEDIA_STORAGE_PROVIDER: 'r2' } })).toThrow(
    /R2 storage is not configured/
  );
  expect(calls).toHaveLength(0);
  expect(getR2StorageIfConfigured({ env: {} })).toBeNull();
});

test('provider selection: default → Supabase bucket, r2 → R2', () => {
  const { client } = fakeSupabase();
  expect(createMediaStorage(client, 'generated-images', { env: {} }).provider).toBe('supabase');
  expect(createMediaStorage(client, 'wordpress-images', { env: { MEDIA_STORAGE_PROVIDER: 'supabase' } }).provider).toBe('supabase');
  expect(createMediaStorage(client, 'wordpress-images', { env: R2_ENV }).provider).toBe('r2');
});

test('no R2 variable uses the NEXT_PUBLIC_ prefix and no client code imports the storage layer', () => {
  const example = read('.env.example');
  expect(example).toContain('MEDIA_STORAGE_PROVIDER=supabase');
  expect(example).not.toMatch(/NEXT_PUBLIC_R2|NEXT_PUBLIC_MEDIA/);
  expect(example).toMatch(/^R2_SECRET_ACCESS_KEY=$/m);
  expect(example).toMatch(/^R2_ACCESS_KEY_ID=$/m);
  for (const file of ['lib/storage/config.ts', 'lib/storage/index.ts', 'lib/storage/s3-client.ts', 'next.config.ts']) {
    expect(read(file)).not.toMatch(/NEXT_PUBLIC_(R2|MEDIA)/);
    expect(read(file)).not.toMatch(/env\.NEXT_PUBLIC_/);
  }
  const clientFiles = readdirSync(join(ROOT, 'components'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
  expect(clientFiles.length).toBeGreaterThan(0);
  for (const file of clientFiles) {
    expect(readFileSync(file, 'utf8'), file).not.toContain('@/lib/storage');
  }
});

// -------------------------------------------------------------------- keys

test('object keys are separated by media type and channel', () => {
  expect(r2MediaKey('pinterest', USER, GEN, `${PIN}/1.png`)).toBe(`images/pinterest/${USER}/${GEN}/${PIN}/1.png`);
  expect(r2MediaKey('wordpress', USER, GEN, 'FEATURED.png')).toBe(`images/wordpress/${USER}/${GEN}/FEATURED.png`);
  expect(r2MediaKey('facebookImage', USER, 'content-1', 'a.jpg')).toBe(`images/facebook/${USER}/content-1/a.jpg`);
  expect(r2MediaKey('reels', USER, 'content-1', 'clip.mp4')).toBe(`videos/reels/${USER}/content-1/clip.mp4`);
  expect(r2MediaKey('facebookVideo', USER, 'content-1', 'clip.mp4')).toBe(`videos/facebook/${USER}/content-1/clip.mp4`);
  expect(r2MediaKey('tiktok', USER, 'content-1', 'clip.mp4')).toBe(`videos/tiktok/${USER}/content-1/clip.mp4`);

  const keys = [
    r2MediaKey('pinterest', USER, GEN, 'x.png'),
    r2MediaKey('wordpress', USER, GEN, 'x.png'),
    r2MediaKey('reels', USER, GEN, 'x.mp4'),
    r2MediaKey('tiktok', USER, GEN, 'x.mp4'),
  ];
  const roots = ['images/pinterest/', 'images/wordpress/', 'videos/reels/', 'videos/tiktok/'];
  roots.forEach((root, i) => {
    expect(keys.filter((key) => key.startsWith(root))).toEqual([keys[i]]);
  });
});

test('object keys refuse traversal and unsafe segments', () => {
  expect(() => r2MediaKey('wordpress', '..', GEN, 'a.png')).toThrow(MediaStorageError);
  expect(() => r2MediaKey('wordpress', USER, GEN, '../a.png')).toThrow(MediaStorageError);
  expect(() => r2MediaKey('wordpress', USER, GEN, 'a b.png')).toThrow(MediaStorageError);
  expect(() => r2MediaFolder('pinterest', '', GEN)).toThrow(MediaStorageError);
});

test('Supabase keeps its historical paths; R2 keys are recognizable', () => {
  const legacy = `${USER}/${GEN}/FEATURED.png`;
  expect(resolveMediaKey('supabase', { channel: 'wordpress', ownerId: USER, groupId: GEN, fileName: 'FEATURED.png' }, legacy)).toBe(legacy);
  expect(isR2MediaKey(legacy)).toBe(false);
  expect(isR2MediaKey(`images/wordpress/${USER}/${GEN}/FEATURED.png`)).toBe(true);
  expect(isR2MediaKey(`videos/reels/${USER}/c/a.mp4`)).toBe(true);
});

// --------------------------------------------------------------- R2 provider

test('R2 provider uploads with key + content type and returns the public media URL', async () => {
  const { client, calls } = fakeS3();
  const storage = createR2MediaStorage({ publicUrl: PUBLIC }, client);
  const key = `images/pinterest/${USER}/${GEN}/${PIN}/1.jpg`;
  const stored = await storage.upload({ key, body: Buffer.from('jpeg-bytes'), contentType: 'image/jpeg' });

  expect(stored).toEqual({ provider: 'r2', key, publicUrl: `${PUBLIC}/${key}` });
  expect(calls).toEqual([{ op: 'put', key, contentType: 'image/jpeg', size: 10 }]);
  expect(storage.publicUrl('images/wordpress/u/g/a b.png')).toBe(`${PUBLIC}/images/wordpress/u/g/a%20b.png`);
});

test('R2 provider read / remove / list', async () => {
  const { client, calls } = fakeS3();
  const storage = createR2MediaStorage({ publicUrl: PUBLIC }, client);
  const folder = r2MediaFolder('wordpress', USER, GEN);
  await storage.upload({ key: `${folder}/FEATURED.png`, body: Buffer.from('a'), contentType: 'image/png' });
  await storage.upload({ key: `${folder}/IMAGE_1.png`, body: Buffer.from('b'), contentType: 'image/png' });

  expect((await storage.read(`${folder}/FEATURED.png`)).toString()).toBe('a');
  expect(await storage.list(folder)).toEqual([`${folder}/FEATURED.png`, `${folder}/IMAGE_1.png`]);
  expect(calls.find((c) => c.op === 'list')?.key).toBe(`${folder}/`);

  await storage.remove([`${folder}/FEATURED.png`]);
  expect(calls.filter((c) => c.op === 'delete').map((c) => c.key)).toEqual([`${folder}/FEATURED.png`]);
  expect(await storage.list(folder)).toEqual([`${folder}/IMAGE_1.png`]);
});

test('R2 upload failure throws a MediaStorageError and never yields a URL', async () => {
  const { client } = fakeS3({
    putObject: async () => {
      throw new Error(`boom with ${SECRET_KEY}`);
    },
  });
  const storage = createR2MediaStorage({ publicUrl: PUBLIC }, client);
  let result: unknown = 'unset';
  let error: unknown = null;
  try {
    result = await storage.upload({ key: 'images/wordpress/u/g/a.png', body: Buffer.from('x'), contentType: 'image/png' });
  } catch (err) {
    error = err;
  }
  expect(result).toBe('unset');
  expect(error).toBeInstanceOf(MediaStorageError);
  expect((error as MediaStorageError).provider).toBe('r2');
  // Only S3RequestError messages are surfaced; unknown errors are replaced.
  expect((error as Error).message).toBe('R2 upload failed');
});

// ------------------------------------------------------------ SigV4 client

test('SigV4 signature matches the AWS S3 reference vectors', () => {
  const credentials = {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  };
  const emptyHash = createHash('sha256').update('').digest('hex');
  const date = new Date('2013-05-24T00:00:00Z');

  const get = signS3Request({
    method: 'GET',
    url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
    headers: { Range: 'bytes=0-9' },
    payloadHash: emptyHash,
    region: 'us-east-1',
    credentials,
    date,
  });
  expect(get.authorization).toBe(
    'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41'
  );

  const list = signS3Request({
    method: 'GET',
    url: new URL('https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J'),
    headers: {},
    payloadHash: emptyHash,
    region: 'us-east-1',
    credentials,
    date,
  });
  expect(list.authorization).toContain('Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7');
});

test('R2 S3 client: path-style PUT with signed content type, errors without secrets', async () => {
  const requests: { url: string; init: RequestInit }[] = [];
  let status = 200;
  const fetchStub: FetchLike = async (url, init) => {
    requests.push({ url, init });
    return status === 200
      ? new Response('', { status: 200 })
      : new Response('<Error><Code>SignatureDoesNotMatch</Code><Message>x</Message></Error>', { status });
  };
  const config = readR2Config(R2_ENV);
  const client = createR2S3Client(config, { fetch: fetchStub, now: () => new Date('2026-10-11T10:00:00Z') });
  const body = Buffer.from('png-bytes');
  await client.putObject({ key: `images/wordpress/${USER}/${GEN}/FEATURED.png`, body, contentType: 'image/png' });

  const [put] = requests;
  expect(put.url).toBe(`https://account123.r2.cloudflarestorage.com/omniflow-media/images/wordpress/${USER}/${GEN}/FEATURED.png`);
  expect(put.init.method).toBe('PUT');
  const headers = put.init.headers as Record<string, string>;
  expect(headers['content-type']).toBe('image/png');
  expect(headers['x-amz-content-sha256']).toBe(createHash('sha256').update(body).digest('hex'));
  expect(headers.authorization).toContain(`Credential=${ACCESS_KEY}/20261011/auto/s3/aws4_request`);
  expect(headers.authorization).toContain('content-type');
  expect(JSON.stringify(headers)).not.toContain(SECRET_KEY);

  status = 403;
  const output = await captureConsole(async () => {
    await client.putObject({ key: 'images/wordpress/u/g/a.png', body, contentType: 'image/png' });
  });
  expect(output).toContain('R2 upload failed (HTTP 403 SignatureDoesNotMatch)');
  expect(output).not.toContain(SECRET_KEY);
  expect(output).not.toContain('Signature=');
});

test('R2 S3 client: list follows continuation tokens and decodes keys', async () => {
  const pages = [
    '<ListBucketResult><Contents><Key>images/wordpress/u/g/a&amp;b.png</Key></Contents><IsTruncated>true</IsTruncated><NextContinuationToken>tok/1=</NextContinuationToken></ListBucketResult>',
    '<ListBucketResult><Contents><Key>images/wordpress/u/g/c.png</Key></Contents><IsTruncated>false</IsTruncated></ListBucketResult>',
  ];
  const urls: string[] = [];
  const client = createR2S3Client(readR2Config(R2_ENV), {
    fetch: async (url) => {
      urls.push(url);
      return new Response(pages[urls.length - 1], { status: 200 });
    },
  });
  expect(await client.listObjects('images/wordpress/u/g/')).toEqual([
    'images/wordpress/u/g/a&b.png',
    'images/wordpress/u/g/c.png',
  ]);
  expect(new URL(urls[0]).searchParams.get('prefix')).toBe('images/wordpress/u/g/');
  expect(new URL(urls[1]).searchParams.get('continuation-token')).toBe('tok/1=');
});

test('a full failing R2 flow never prints the access key or the secret', async () => {
  const storage = createMediaStorage(fakeSupabase().client, 'wordpress-images', {
    env: R2_ENV,
    fetch: async () => {
      throw new Error('network down');
    },
  });
  const output = await captureConsole(async () => {
    await storeArticleImage(storage, { userId: USER, generationId: GEN, marker: 'FEATURED', body: TINY_PNG });
  });
  expect(output).toContain('Storage upload failed for FEATURED: R2 upload failed (network error)');
  expect(output).not.toContain(SECRET_KEY);
  expect(output).not.toContain(ACCESS_KEY);
});

// -------------------------------------------------------- Supabase provider

test('Supabase provider makes exactly the historical calls', async () => {
  const { client, calls } = fakeSupabase();
  const storage = createSupabaseMediaStorage(client, 'generated-images');
  const body = Buffer.from('img');
  const stored = await storage.upload({ key: `${USER}/${PIN}/1.png`, body, contentType: 'image/png' });
  await storage.upload({ key: `${USER}/${PIN}/2.png`, body, contentType: 'image/png', upsert: true });

  expect(stored).toEqual({
    provider: 'supabase',
    key: `${USER}/${PIN}/1.png`,
    publicUrl: `${SUPABASE_PUBLIC}/generated-images/${USER}/${PIN}/1.png`,
  });
  const uploads = calls.filter((c) => c.op === 'upload');
  expect(uploads[0]).toEqual({ bucket: 'generated-images', op: 'upload', args: [`${USER}/${PIN}/1.png`, body, { contentType: 'image/png' }] });
  expect(uploads[1].args[2]).toEqual({ contentType: 'image/png', upsert: true });

  expect(await storage.list(`${USER}/${PIN}`)).toEqual([`${USER}/${PIN}/1.png`]);
  await storage.remove([]);
  expect(calls.filter((c) => c.op === 'remove')).toHaveLength(0);
});

// ------------------------------------------------------ Pinterest pipeline

test('Pinterest image keys: Supabase unchanged, R2 grouped by generation', () => {
  const params = { userId: USER, generationId: GEN, pinId: PIN, version: 3 };
  expect(getPinImageObjectKey('supabase', params)).toBe(getPinImageStoragePath(USER, PIN, 3));
  expect(getPinImageObjectKey('supabase', { ...params, extension: 'jpg' })).toBe(`${USER}/${PIN}/3.jpg`);
  expect(getPinImageObjectKey('r2', { ...params, extension: 'jpg' })).toBe(`images/pinterest/${USER}/${GEN}/${PIN}/3.jpg`);
});

test('.source photos never go to R2: R2 image keys map to the Supabase source path', () => {
  expect(getPinSourceStoragePath(`${USER}/${PIN}/3.png`)).toBe(`${USER}/${PIN}/3.source.png`);
  expect(getPinSourceStoragePath(`images/pinterest/${USER}/${GEN}/${PIN}/3.jpg`)).toBe(`${USER}/${PIN}/3.source.png`);
  expect(isR2MediaKey(getPinSourceStoragePath(`images/pinterest/${USER}/${GEN}/${PIN}/3.jpg`))).toBe(false);

  const route = read('app/api/pinterest/generate-images/route.ts');
  expect(route).toMatch(/supabase\.storage\s*\.from\('generated-images'\)\s*\.upload\(sourcePath/);
  const recompose = read('app/api/pinterest/pin-images/recompose/route.ts');
  expect(recompose).toContain('bucket.upload(newSourcePath');
});

test('Pinterest generation resolves the storage before any paid image call', () => {
  const route = read('app/api/pinterest/generate-images/route.ts');
  const storageAt = route.indexOf("createMediaStorage(supabase, 'generated-images')");
  expect(storageAt).toBeGreaterThan(0);
  expect(storageAt).toBeLessThan(route.indexOf("image_status: 'processing'"));
  expect(storageAt).toBeLessThan(route.indexOf('generateImage({'));
  expect(route).toContain('mediaStorage.upload({ key: filePath');
  expect(route).toContain('url: stored.publicUrl');
  // The DB rows are written only after a successful upload.
  expect(route.indexOf('mediaStorage.upload(')).toBeLessThan(route.indexOf(".from('pin_images').insert"));
});

// ------------------------------------------------------ WordPress pipeline

test('WordPress article images: Supabase path unchanged, R2 under images/wordpress', async () => {
  const supa = fakeSupabase();
  const supaUrl = await storeArticleImage(createMediaStorage(supa.client, 'wordpress-images', { env: {} }), {
    userId: USER,
    generationId: GEN,
    marker: 'IMAGE_1',
    body: TINY_PNG,
  });
  expect(supaUrl).toBe(`${SUPABASE_PUBLIC}/wordpress-images/${USER}/${GEN}/IMAGE_1.webp`);
  expect(supa.calls[0]).toMatchObject({ bucket: 'wordpress-images', op: 'upload' });
  expect(supa.calls[0].args[0]).toBe(`${USER}/${GEN}/IMAGE_1.webp`);
  expect(supa.calls[0].args[2]).toEqual({ contentType: 'image/webp' });

  const { client, calls } = fakeS3();
  const r2 = createR2MediaStorage({ publicUrl: PUBLIC }, client);
  const r2Url = await storeArticleImage(r2, { userId: USER, generationId: GEN, marker: 'FEATURED', body: TINY_PNG });
  expect(r2Url).toBe(`${PUBLIC}/images/wordpress/${USER}/${GEN}/FEATURED.webp`);
  expect(calls[0]).toMatchObject({ op: 'put', contentType: 'image/webp' });
});

test('WordPress generators create the storage before any AI call and no longer write to Supabase directly', () => {
  for (const file of ['lib/wordpress/generate-article.ts', 'lib/wordpress/generate-article-from-url.ts']) {
    const source = read(file);
    expect(source).not.toContain(".from('wordpress-images')");
    expect(source).toContain('storeArticleImage(mediaStorage');
  }
  const article = read('lib/wordpress/generate-article.ts');
  const optionOne = article.slice(article.indexOf('export async function generateWordPressArticle'));
  expect(optionOne.indexOf('createArticleImageStorage(supabase)')).toBeLessThan(optionOne.indexOf('generateText('));
  const fromPins = article.slice(article.indexOf('export async function generateArticleFromPins'));
  expect(fromPins.indexOf('createArticleImageStorage(supabase)')).toBeLessThan(fromPins.indexOf('generateText('));
  const fromUrl = read('lib/wordpress/generate-article-from-url.ts');
  expect(fromUrl.indexOf('createArticleImageStorage(supabase)')).toBeLessThan(fromUrl.indexOf('generateText('));
});

test('WordPress media reuse: R2 URLs get a storage key, Supabase keys unchanged', () => {
  const options = mediaSourceOptions(R2_ENV);
  expect(resolveSourceAssetKey(`${PUBLIC}/images/wordpress/${USER}/${GEN}/FEATURED.png`, options)).toBe(
    `storage:omniflow-media/images/wordpress/${USER}/${GEN}/FEATURED.png`
  );
  expect(resolveSourceAssetKey(`${PUBLIC}/images/pinterest/${USER}/${GEN}/${PIN}/1.png?v=2`, options)).toBe(
    `storage:omniflow-media/images/pinterest/${USER}/${GEN}/${PIN}/1.png`
  );
  const legacy = `${SUPABASE_PUBLIC}/wordpress-images/${USER}/${GEN}/FEATURED.png`;
  expect(resolveSourceAssetKey(legacy, options)).toBe(`storage:wordpress-images/${USER}/${GEN}/FEATURED.png`);
  expect(resolveSourceAssetKey(legacy, mediaSourceOptions({}))).toBe(`storage:wordpress-images/${USER}/${GEN}/FEATURED.png`);
  expect(mediaSourceOptions({})).toEqual({});
  expect(read('lib/wordpress/publish-media.ts')).toContain('sourceOptions: mediaSourceOptions()');
});

test('rewrite copies R2 images inside R2 and Supabase images inside Supabase', async () => {
  const { client, calls: s3Calls } = fakeS3();
  const r2 = createR2MediaStorage({ publicUrl: PUBLIC }, client);
  const oldKey = `images/wordpress/${USER}/${GEN}/FEATURED.png`;
  await r2.upload({ key: oldKey, body: Buffer.from('feat'), contentType: 'image/png' });

  const copies: unknown[][] = [];
  const supabase = {
    storage: {
      from: () => ({
        async copy(...args: unknown[]) {
          copies.push(args);
          return { error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `${SUPABASE_PUBLIC}/wordpress-images/${path}` } }),
      }),
    },
  } as unknown as SupabaseClient;

  const r2Url = `${PUBLIC}/${oldKey}`;
  const supaUrl = `${SUPABASE_PUBLIC}/wordpress-images/${USER}/${GEN}/IMAGE_1.png`;
  const pinUrl = `${PUBLIC}/images/pinterest/${USER}/${GEN}/${PIN}/1.png`;
  const { urlMap, warnings } = await copyArticleImages(
    supabase,
    { userId: USER, fromGenerationId: GEN, toGenerationId: GEN2, urls: [r2Url, supaUrl, pinUrl] },
    { r2: () => r2, r2KeyFromUrl: (url) => r2KeyFromPublicUrl(url, R2_ENV) }
  );

  expect(warnings).toEqual([]);
  expect(urlMap.get(r2Url)).toBe(`${PUBLIC}/images/wordpress/${USER}/${GEN2}/FEATURED.png`);
  expect(urlMap.get(supaUrl)).toBe(`${SUPABASE_PUBLIC}/wordpress-images/${USER}/${GEN2}/IMAGE_1.png`);
  expect(urlMap.has(pinUrl)).toBe(false); // reused Pin images are never copied
  expect(copies).toEqual([[`${USER}/${GEN}/IMAGE_1.png`, `${USER}/${GEN2}/IMAGE_1.png`]]);
  expect(s3Calls.filter((c) => c.op === 'put').map((c) => c.key)).toEqual([oldKey, `images/wordpress/${USER}/${GEN2}/FEATURED.png`]);
});

// ----------------------------------------------------------------- cleanup

test('delete routes clean R2 folders best-effort, after the unchanged Supabase cleanup', async () => {
  const wordpress = read('app/api/wordpress/[id]/route.ts');
  expect(wordpress).toContain("removeR2Folder(r2MediaFolder('wordpress', user.id, id))");
  expect(wordpress).toMatch(/\.from\('wordpress-images'\)\s*\.list\(folderPath\)/);
  expect(wordpress.indexOf('.list(folderPath)')).toBeLessThan(wordpress.indexOf('removeR2Folder('));
  const generations = read('app/api/generations/[id]/route.ts');
  expect(generations).toContain("removeR2Folder(r2MediaFolder('pinterest', user.id, id))");
  const pinImage = read('app/api/pinterest/pin-images/[id]/route.ts');
  expect(pinImage).toContain('isR2MediaKey(image.storage_path)');
  expect(pinImage).toContain('.remove([image.storage_path, getPinSourceStoragePath(image.storage_path)])');

  // No R2 config → no-op, no network.
  expect(await removeR2Folder(r2MediaFolder('wordpress', USER, GEN), { env: {} })).toBe(0);
});

test('removeR2Folder deletes only the given folder', async () => {
  const deleted: string[] = [];
  const listed: string[] = [];
  const fetchStub: FetchLike = async (url, init) => {
    const parsed = new URL(url);
    if (init.method === 'GET') {
      listed.push(parsed.searchParams.get('prefix') ?? '');
      return new Response(
        `<ListBucketResult><Contents><Key>images/wordpress/${USER}/${GEN}/FEATURED.png</Key></Contents><IsTruncated>false</IsTruncated></ListBucketResult>`,
        { status: 200 }
      );
    }
    deleted.push(parsed.pathname);
    return new Response(null, { status: 204 });
  };
  expect(await removeR2Folder(r2MediaFolder('wordpress', USER, GEN), { env: R2_ENV, fetch: fetchStub })).toBe(1);
  expect(listed).toEqual([`images/wordpress/${USER}/${GEN}/`]);
  expect(deleted).toEqual([`/omniflow-media/images/wordpress/${USER}/${GEN}/FEATURED.png`]);
});

test('next/image allows the R2 public domain; Supabase pattern kept', () => {
  const config = read('next.config.ts');
  expect(config).toContain('hostname: "*.supabase.co"');
  expect(config).toContain('hostname: "media.n8nflow.org"');
});

test('type guard: MediaStorage is the only surface routes use for new public media', () => {
  const storage: MediaStorage = createR2MediaStorage({ publicUrl: PUBLIC }, fakeS3().client);
  expect(Object.keys(storage).sort()).toEqual(['list', 'provider', 'publicUrl', 'read', 'remove', 'upload']);
});
