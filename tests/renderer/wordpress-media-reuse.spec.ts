import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createWordPressMediaAssetStore } from '@/lib/queries/wordpress-media-assets';
import { resolveSourceAsset, resolveSourceAssetKey } from '@/lib/wordpress/media-source';
import {
  hashImageBytes,
  isMissingMediaAssetsTable,
  obtainReusableMedia,
  type MediaAssetStore,
} from '@/lib/wordpress/media-reuse';
import {
  FEATURED_IMAGE_FAILED_WARNING,
  planInternalMedia,
  uploadPublishMedia,
  type PublishMediaPlan,
} from '@/lib/wordpress/publish-media';
import { sendArticleToWordPress, type SendArticleInput } from '@/lib/wordpress/publish-post';
import { createPublishLogger, type PublishLogger } from '@/lib/wordpress/publish-log';
import { uploadMedia, type WordPressSiteCredentials } from '@/lib/wordpress/rest-client';

/**
 * TASK-FIX-060 — WordPress media reuse (migration 043). Offline: WordPress
 * (several sites) and the image storage are a stubbed global fetch,
 * Supabase an in-memory table enforcing the (site, key) unique constraint —
 * no network, no database, no AI call.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const SUPABASE = 'https://abcd.supabase.co/storage/v1/object/public';
const CDN = 'https://cdn.omniflow.test/wp';
const SITE_A: WordPressSiteCredentials = { siteUrl: 'https://blog-a.example.test/', username: 'editor', password: 'abcd EFGH ijkl MNOP' };
const SITE_B: WordPressSiteCredentials = { siteUrl: 'https://blog-b.example.test', username: 'editor', password: 'qrst UVWX yz12 3456' };
const SITE_A_ROW = { id: 'site-a', userId: 'user-1' };
const SITE_B_ROW = { id: 'site-b', userId: 'user-1' };

const img = (path: string) => `${SUPABASE}/wordpress-images/${path}`;
const FEATURED = img('user-1/gen-1/FEATURED.png');
const IMAGE_1 = img('user-1/gen-1/IMAGE_1.png');
const IMAGE_2 = img('user-1/gen-1/IMAGE_2.png');

// ------------------------------------------------------- in-memory Supabase

type DbRow = Record<string, unknown>;

interface FakeDbOptions {
  /** Migration 043 not applied: every query fails like PostgREST does. */
  missing?: boolean;
  /** Runs before an insert is applied (to simulate a concurrent insert). */
  beforeInsert?: (rows: DbRow[], payload: DbRow) => void;
}

function createFakeDb(options: FakeDbOptions = {}) {
  const rows: DbRow[] = [];
  const ops: string[] = [];
  const isTime = (col: string) => col.endsWith('_at');
  const same = (col: string, a: unknown, b: unknown) =>
    isTime(col) && typeof a === 'string' && typeof b === 'string' ? Date.parse(a) === Date.parse(b) : a === b;

  class Query {
    op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    payload: DbRow = {};
    filters: ((row: DbRow) => boolean)[] = [];
    single = false;
    max = Infinity;
    returning = false;

    constructor(readonly table: string) {}
    select() {
      if (this.op !== 'select') this.returning = true;
      return this;
    }
    insert(payload: DbRow) {
      this.op = 'insert';
      this.payload = payload;
      return this;
    }
    update(payload: DbRow) {
      this.op = 'update';
      this.payload = payload;
      return this;
    }
    delete() {
      this.op = 'delete';
      return this;
    }
    eq(col: string, value: unknown) {
      this.filters.push((row) => same(col, row[col], value));
      return this;
    }
    is(col: string, value: null) {
      this.filters.push((row) => (row[col] ?? null) === value);
      return this;
    }
    not(col: string, operator: 'is', value: null) {
      expect(operator).toBe('is');
      this.filters.push((row) => (row[col] ?? null) !== value);
      return this;
    }
    or(expression: string) {
      const parts = expression.split(',').map((part) => {
        const [col, operator, ...rest] = part.split('.');
        const value = rest.join('.');
        if (operator === 'is' && value === 'null') return (row: DbRow) => (row[col] ?? null) === null;
        if (operator === 'lt') return (row: DbRow) => typeof row[col] === 'string' && Date.parse(row[col] as string) < Date.parse(value);
        throw new Error(`unsupported or(): ${part}`);
      });
      this.filters.push((row) => parts.some((match) => match(row)));
      return this;
    }
    order() {
      return this;
    }
    limit(n: number) {
      this.max = n;
      return this;
    }
    maybeSingle() {
      this.single = true;
      return this;
    }
    then<T>(resolve: (value: { data: unknown; error: { code: string; message: string } | null }) => T) {
      return Promise.resolve(this.run()).then(resolve);
    }
    run(): { data: unknown; error: { code: string; message: string } | null } {
      expect(this.table).toBe('wordpress_media_assets');
      ops.push(this.op);
      if (options.missing) {
        return { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.wordpress_media_assets' in the schema cache" } };
      }
      const matching = rows.filter((row) => this.filters.every((f) => f(row)));
      if (this.op === 'insert') {
        options.beforeInsert?.(rows, this.payload);
        const clash = rows.some(
          (row) => row.wordpress_site_id === this.payload.wordpress_site_id && row.source_asset_key === this.payload.source_asset_key
        );
        if (clash) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        rows.push({ source_hash: null, wp_media_id: null, wp_media_url: null, updated_at: new Date().toISOString(), ...this.payload });
        return { data: null, error: null };
      }
      if (this.op === 'update') {
        for (const row of matching) Object.assign(row, this.payload);
        return { data: this.returning ? matching.map((row) => ({ ...row })) : null, error: null };
      }
      if (this.op === 'delete') {
        for (const row of matching) rows.splice(rows.indexOf(row), 1);
        return { data: null, error: null };
      }
      const selected = matching.slice(0, this.max).map((row) => ({ ...row }));
      return { data: this.single ? (selected[0] ?? null) : selected, error: null };
    }
  }

  return {
    rows,
    ops,
    client: { from: (table: string) => new Query(table) } as unknown as SupabaseClient,
  };
}

// ------------------------------------------------- fake WordPress + storage

interface WpMedia {
  id: number;
  source_url: string;
  alt_text: string;
  media_type: string;
}

interface FakeWebOptions {
  /** Bytes served for an image URL; default = the URL's object path. */
  bytes?: Record<string, string>;
  /** Delay of POST /wp/v2/media, to overlap concurrent publishes. */
  uploadDelayMs?: number;
  uploadFails?: boolean;
  mediaLookup?: 'ok' | 'timeout' | 'http500';
  /** Called when a post is written (create or update). */
  onPostWrite?: () => void;
}

function timeoutError(): Error {
  return new DOMException('The operation was aborted due to timeout', 'TimeoutError') as unknown as Error;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function installFakeWeb(options: FakeWebOptions = {}) {
  const libraries = new Map<string, WpMedia[]>();
  const calls: { host: string; method: string; path: string }[] = [];
  const timeline: string[] = [];
  let nextMediaId = 500;
  let nextPostId = 900;
  const posts = new Map<number, { featured_media?: number; content: string }>();
  const original = globalThis.fetch;
  const library = (host: string) => {
    if (!libraries.has(host)) libraries.set(host, []);
    return libraries.get(host)!;
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const host = url.host;
    const path = url.pathname.replace(/^\/wp-json/, '');
    calls.push({ host, method, path });

    // Image storage (Supabase or CDN).
    if (host === 'abcd.supabase.co' || host === 'cdn.omniflow.test') {
      const body = options.bytes?.[url.href] ?? url.pathname.split('/').slice(-3).join('/');
      return new Response(body, { status: 200, headers: { 'Content-Type': 'image/png' } });
    }

    const media = library(host);
    if (method === 'POST' && path === '/wp/v2/media') {
      timeline.push(`upload:${host}`);
      if (options.uploadDelayMs) await new Promise((r) => setTimeout(r, options.uploadDelayMs));
      if (options.uploadFails) return json({ code: 'rest_upload_unknown_error', message: 'Upload failed' }, 500);
      const filename = /filename="([^"]+)"/.exec(String((init?.headers as Record<string, string>)['Content-Disposition']))?.[1];
      const item: WpMedia = {
        id: nextMediaId++,
        source_url: `https://${host}/wp-content/uploads/2026/10/${filename}`,
        alt_text: url.searchParams.get('alt_text') ?? '',
        media_type: 'image',
      };
      media.push(item);
      return json(item, 201);
    }
    const mediaItem = /^\/wp\/v2\/media\/(\d+)$/.exec(path);
    if (mediaItem && method === 'GET') {
      if (options.mediaLookup === 'timeout') throw timeoutError();
      if (options.mediaLookup === 'http500') return json({ code: 'boom', message: 'Server error' }, 500);
      const found = media.find((m) => m.id === Number(mediaItem[1]));
      return found ? json(found) : json({ code: 'rest_post_invalid_id', message: 'Invalid post ID.' }, 404);
    }
    if (mediaItem && method === 'POST') {
      const found = media.find((m) => m.id === Number(mediaItem[1]));
      if (!found) return json({ code: 'rest_post_invalid_id' }, 404);
      found.alt_text = JSON.parse(String(init?.body)).alt_text;
      return json(found);
    }
    if (method === 'GET' && path.startsWith('/wp/v2/posts')) return json([]);
    if (method === 'GET' && path.startsWith('/wp/v2/tags')) return json([]);
    if (method === 'POST' && path === '/wp/v2/tags') return json({ id: 77, name: 'tag' }, 201);
    const postWrite = /^\/wp\/v2\/posts(?:\/(\d+))?$/.exec(path);
    if (method === 'POST' && postWrite) {
      timeline.push(`post:${host}`);
      options.onPostWrite?.();
      const body = JSON.parse(String(init?.body));
      const id = postWrite[1] ? Number(postWrite[1]) : nextPostId++;
      posts.set(id, { featured_media: body.featured_media, content: body.content });
      return json({ id, link: `https://${host}/?p=${id}`, status: body.status, content: { raw: body.content } }, postWrite[1] ? 200 : 201);
    }
    if (method === 'GET' && path === '/rankmath/v1') return json({ routes: { '/rankmath/v1/updateMeta': { methods: ['POST'] } } });
    if (method === 'POST' && path === '/rankmath/v1/updateMeta') return json(true);
    return json({ code: 'unexpected', message: `${method} ${path}` }, 500);
  }) as typeof fetch;

  return {
    calls,
    timeline,
    posts,
    library,
    uploads: (host?: string) => calls.filter((c) => c.method === 'POST' && c.path === '/wp/v2/media' && (!host || c.host === host)).length,
    deletes: () => calls.filter((c) => c.method === 'DELETE').length,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

let web: ReturnType<typeof installFakeWeb> | undefined;
test.afterEach(() => {
  web?.restore();
  web = undefined;
});

const HOST_A = 'blog-a.example.test';
const HOST_B = 'blog-b.example.test';

function plan(featured: string | null, internal: string[] = [], slug = 'cozy-living-room'): { plan: PublishMediaPlan; content: string } {
  const content = internal.map((url, i) => `![Image ${i + 1}](${url})`).join('\n\n');
  const planned = planInternalMedia(
    content,
    internal.map((url, i) => ({ url, filename: `${slug}-${i + 1}.png`, altText: `Image ${i + 1}` }))
  );
  return {
    plan: { featured: featured ? { url: featured, filename: `${slug}-featured.png`, altText: 'Cozy living room' } : null, internal: planned.internal },
    content: planned.content,
  };
}

function articleInput(overrides: Partial<SendArticleInput> = {}, sourceType: 'keyword' | 'pins' | 'url' = 'keyword'): SendArticleInput {
  return {
    article: {
      id: 'article-1',
      title: 'Cozy Living Room Ideas',
      meta_title: 'Cozy Living Room Ideas',
      slug: 'cozy-living-room',
      meta_description: 'Ideas.',
      wp_post_id: null,
    },
    generation: { keyword: 'cozy living room', source_type: sourceType, seo_keywords: null, status: 'completed' },
    html: '<p>Body</p>',
    status: 'draft',
    ...overrides,
  };
}

async function publish(
  site: WordPressSiteCredentials,
  store: MediaAssetStore | null,
  urls: { featured: string | null; internal?: string[] },
  overrides: Partial<SendArticleInput> = {},
  sourceType: 'keyword' | 'pins' | 'url' = 'keyword'
) {
  const planned = plan(urls.featured, urls.internal ?? []);
  return sendArticleToWordPress(site, {
    ...articleInput(overrides, sourceType),
    html: `<p>${planned.content}</p>`,
    media: planned.plan,
    mediaStore: store,
  });
}

// ===================================================== source asset key

test('key: Supabase storage path, independent of the public URL, never the file name alone', () => {
  expect(resolveSourceAssetKey(FEATURED)).toBe('storage:wordpress-images/user-1/gen-1/FEATURED.png');
  // Signed / render / encoded variants of the same object → same key; query strings ignored.
  expect(resolveSourceAssetKey('https://abcd.supabase.co/storage/v1/object/sign/wordpress-images/user-1/gen-1/FEATURED.png?token=x')).toBe(
    'storage:wordpress-images/user-1/gen-1/FEATURED.png'
  );
  expect(resolveSourceAssetKey('https://abcd.supabase.co/storage/v1/render/image/public/wordpress-images/user-1/gen-1/FEATURED.png?width=800')).toBe(
    'storage:wordpress-images/user-1/gen-1/FEATURED.png'
  );
  expect(resolveSourceAssetKey(img('user-1/gen-1/My%20Image.png'))).toBe('storage:wordpress-images/user-1/gen-1/My Image.png');
  // Same file name, different object → different keys.
  expect(resolveSourceAssetKey(img('user-1/gen-2/IMAGE_1.png'))).not.toBe(resolveSourceAssetKey(IMAGE_1));
  // Another project's Supabase host serving the same object path is still that object.
  expect(resolveSourceAssetKey(IMAGE_1.replace('abcd', 'wxyz'))).toBe(resolveSourceAssetKey(IMAGE_1));
});

test('key: a CDN URL of the same object resolves to the same key; other URLs fall back to host + path', () => {
  const cdnOrigins = [{ baseUrl: CDN, bucket: 'wordpress-images' }];
  expect(resolveSourceAssetKey(`${CDN}/user-1/gen-1/FEATURED.png?v=3`, { cdnOrigins })).toBe(resolveSourceAssetKey(FEATURED));
  expect(resolveSourceAsset(`${CDN}/user-1/gen-1/FEATURED.png`, { cdnOrigins })).toEqual({
    key: 'storage:wordpress-images/user-1/gen-1/FEATURED.png',
    url: `${CDN}/user-1/gen-1/FEATURED.png`,
  });
  expect(resolveSourceAssetKey('https://images.example.org/a/b.png?sig=123')).toBe('url:images.example.org/a/b.png');
  expect(resolveSourceAssetKey('not a url')).toBeNull();
  expect(resolveSourceAssetKey('data:image/png;base64,AAAA')).toBeNull();
  expect(resolveSourceAssetKey(`${SUPABASE}/wordpress-images/../secret.png`)).not.toContain('..');
});

// ========================================================== first upload

test('first publish: one upload per image, the mapping saved at once (before the post is written)', async () => {
  const db = createFakeDb();
  const atPostWrite: unknown[][] = [];
  web = installFakeWeb({ onPostWrite: () => atPostWrite.push(db.rows.map((r) => r.wp_media_id)) });
  const store = createWordPressMediaAssetStore(db.client, SITE_A_ROW);
  const result = await publish(SITE_A, store, { featured: FEATURED, internal: [IMAGE_1, IMAGE_2] });

  expect(web.uploads()).toBe(3);
  // The three mappings were complete when the post was written.
  expect(atPostWrite[0]).toHaveLength(3);
  for (const id of atPostWrite[0]) expect(typeof id).toBe('number');
  expect(db.rows).toHaveLength(3);
  for (const row of db.rows) {
    expect(row.wordpress_site_id).toBe('site-a');
    expect(row.user_id).toBe('user-1');
    expect(row.wordpress_site_url).toBe('https://blog-a.example.test');
    expect(typeof row.wp_media_id).toBe('number');
    expect(String(row.wp_media_url)).toMatch(/^https:\/\/blog-a\.example\.test\/wp-content\/uploads\//);
    expect(row.source_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.upload_started_at).toBeNull();
    expect(String(row.source_asset_key)).toMatch(/^storage:wordpress-images\/user-1\/gen-1\//);
  }
  const featuredRow = db.rows.find((r) => r.source_asset_key === 'storage:wordpress-images/user-1/gen-1/FEATURED.png')!;
  expect(web.posts.get(result.post.id)?.featured_media).toBe(featuredRow.wp_media_id);
  expect(result.warnings).toEqual([]);
});

// ========================================================== reuse

test('second publish (retry / republish): no POST /wp/v2/media, same featured id, same internal URLs', async () => {
  web = installFakeWeb();
  const db = createFakeDb();
  const store = createWordPressMediaAssetStore(db.client, SITE_A_ROW);
  const first = await publish(SITE_A, store, { featured: FEATURED, internal: [IMAGE_1, IMAGE_2] });
  const firstPost = web.posts.get(first.post.id)!;
  expect(web.uploads()).toBe(3);

  const second = await publish(SITE_A, store, { featured: FEATURED, internal: [IMAGE_1, IMAGE_2] }, {
    article: { ...articleInput().article, wp_post_id: first.post.id },
  });
  expect(web.uploads()).toBe(3); // 3 uploads avoided
  expect(second.post.id).toBe(first.post.id);
  const secondPost = web.posts.get(second.post.id)!;
  expect(secondPost.featured_media).toBe(firstPost.featured_media);
  expect(secondPost.content).toBe(firstPost.content);
  expect(secondPost.content).toContain(`https://${HOST_A}/wp-content/uploads/`);
  expect(secondPost.content).not.toContain('supabase.co');
  // Each reuse was verified with GET /wp/v2/media/<id>.
  expect(web.calls.filter((c) => c.method === 'GET' && /^\/wp\/v2\/media\/\d+$/.test(c.path))).toHaveLength(3);
  expect(second.warnings).toEqual([]);
  expect(db.rows).toHaveLength(3);
});

test('featured image alone reused; internal images alone reused', async () => {
  web = installFakeWeb();
  const db = createFakeDb();
  const store = createWordPressMediaAssetStore(db.client, SITE_A_ROW);
  const log = { step: () => {}, warn: () => {} };

  const f1 = await uploadPublishMedia(SITE_A, plan(FEATURED).plan, { store, log });
  const f2 = await uploadPublishMedia(SITE_A, plan(FEATURED).plan, { store, log });
  expect(f2.featuredMediaId).toBe(f1.featuredMediaId);
  expect(f2.reusedCount).toBe(1);

  const i1 = await uploadPublishMedia(SITE_A, plan(null, [IMAGE_1, IMAGE_2]).plan, { store, log });
  const i2 = await uploadPublishMedia(SITE_A, plan(null, [IMAGE_1, IMAGE_2]).plan, { store, log });
  expect([...i2.replacements.values()]).toEqual([...i1.replacements.values()]);
  expect(i2.reusedCount).toBe(2);
  expect(i2.uploadedCount).toBe(2); // still counts internal images now served by WordPress
  expect(web.uploads()).toBe(3);
});

test('the same image used by two articles of the same site is uploaded once', async () => {
  web = installFakeWeb();
  const db = createFakeDb();
  const store = createWordPressMediaAssetStore(db.client, SITE_A_ROW);
  await publish(SITE_A, store, { featured: FEATURED, internal: [IMAGE_1] });
  const other = await publish(SITE_A, store, { featured: img('user-1/gen-9/FEATURED.png'), internal: [IMAGE_1] }, {
    article: { ...articleInput().article, id: 'article-2', slug: 'other-article', title: 'Other' },
  });
  expect(web.uploads()).toBe(3); // IMAGE_1 not uploaded again
  expect(web.posts.get(other.post.id)!.content).toContain(`https://${HOST_A}/wp-content/uploads/`);
});

test('the same image on two WordPress sites: one upload per site, one mapping per site', async () => {
  web = installFakeWeb();
  const db = createFakeDb();
  const storeA = createWordPressMediaAssetStore(db.client, SITE_A_ROW);
  const storeB = createWordPressMediaAssetStore(db.client, SITE_B_ROW);
  await publish(SITE_A, storeA, { featured: FEATURED });
  await publish(SITE_B, storeB, { featured: FEATURED });
  expect(web.uploads(HOST_A)).toBe(1);
  expect(web.uploads(HOST_B)).toBe(1);
  expect(db.rows.map((r) => r.wordpress_site_id).sort()).toEqual(['site-a', 'site-b']);
  // Site B never sees site A's attachment, even with the same bytes.
  expect(web.calls.some((c) => c.host === HOST_B && c.method === 'GET' && c.path.startsWith('/wp/v2/media/'))).toBe(false);

  await publish(SITE_A, storeA, { featured: FEATURED });
  await publish(SITE_B, storeB, { featured: FEATURED });
  expect(web.uploads()).toBe(2);
});

test('same file name but a different source key: two uploads, two mappings', async () => {
  web = installFakeWeb();
  const db = createFakeDb();
  const store = createWordPressMediaAssetStore(db.client, SITE_A_ROW);
  await publish(SITE_A, store, { featured: null, internal: [img('user-1/gen-1/IMAGE_1.png')] });
  await publish(SITE_A, store, { featured: null, internal: [img('user-1/gen-2/IMAGE_1.png')] });
  expect(web.uploads()).toBe(2);
  expect(db.rows.map((r) => r.source_asset_key).sort()).toEqual([
    'storage:wordpress-images/user-1/gen-1/IMAGE_1.png',
    'storage:wordpress-images/user-1/gen-2/IMAGE_1.png',
  ]);
});

test('rewritten version: images copied to a new path with the same bytes reuse the attachment (source_hash)', async () => {
  const copiedFeatured = img('user-1/gen-2/FEATURED.png');
  const copiedImage = img('user-1/gen-2/IMAGE_1.png');
  web = installFakeWeb({ bytes: { [copiedFeatured]: 'user-1/gen-1/FEATURED.png', [copiedImage]: 'user-1/gen-1/IMAGE_1.png' } });
  const db = createFakeDb();
  const store = createWordPressMediaAssetStore(db.client, SITE_A_ROW);
  const first = await publish(SITE_A, store, { featured: FEATURED, internal: [IMAGE_1] });
  const rewritten = await publish(SITE_A, store, { featured: copiedFeatured, internal: [copiedImage] }, {
    article: { ...articleInput().article, id: 'article-2', wp_post_id: null },
  });
  expect(web.uploads()).toBe(2);
  expect(web.posts.get(rewritten.post.id)!.featured_media).toBe(web.posts.get(first.post.id)!.featured_media);
  // The new paths are mapped too (to the same attachment): the next publish skips the download.
  expect(db.rows).toHaveLength(4);
  const ids = (key: string) => db.rows.find((r) => r.source_asset_key === key)!.wp_media_id;
  expect(ids('storage:wordpress-images/user-1/gen-2/FEATURED.png')).toBe(ids('storage:wordpress-images/user-1/gen-1/FEATURED.png'));
});

test('Keyword, Pins and URL articles all reuse the mapped media', async () => {
  web = installFakeWeb();
  const db = createFakeDb();
  const store = createWordPressMediaAssetStore(db.client, SITE_A_ROW);
  const pinImage = `${SUPABASE}/generated-images/user-1/pins/pin-7/v2.png`;
  for (const source of ['keyword', 'pins', 'url'] as const) {
    const result = await publish(SITE_A, store, { featured: FEATURED, internal: [pinImage] }, {
      generation: { keyword: 'cozy living room', source_type: source, seo_keywords: null, status: 'completed' },
      ...(source === 'pins' ? { pins: { sourceKeyword: 'cozy living room', pinKeywords: ['cozy'] } } : {}),
    }, source);
    expect(result.warnings.filter((w) => /image/i.test(w))).toEqual([]);
  }
  expect(web.uploads()).toBe(2); // 4 uploads avoided
  expect(db.rows.map((r) => r.source_asset_key)).toContain('storage:generated-images/user-1/pins/pin-7/v2.png');
});

// ========================================================== invalid media

test('mapped attachment deleted on WordPress (404): one new upload, mapping updated, old one never deleted, no warning', async () => {
  web = installFakeWeb();
  const db = createFakeDb();
  const store = createWordPressMediaAssetStore(db.client, SITE_A_ROW);
  await publish(SITE_A, store, { featured: FEATURED });
  const oldId = db.rows[0].wp_media_id as number;
  web.library(HOST_A).splice(0); // deleted in the Media Library

  const again = await publish(SITE_A, store, { featured: FEATURED });
  expect(web.uploads()).toBe(2);
  const newId = db.rows[0].wp_media_id as number;
  expect(newId).not.toBe(oldId);
  expect(db.rows).toHaveLength(1);
  expect(db.rows[0].upload_started_at).toBeNull();
  expect(web.posts.get(again.post.id)!.featured_media).toBe(newId);
  expect(again.warnings).toEqual([]);
  expect(web.deletes()).toBe(0);

  // Not an image any more → treated as invalid too.
  web.library(HOST_A)[0].media_type = 'file';
  await publish(SITE_A, store, { featured: FEATURED });
  expect(web.uploads()).toBe(3);
});

test('re-upload of an invalid attachment fails: warning only then, mapping kept for the next try', async () => {
  web = installFakeWeb();
  const db = createFakeDb();
  const store = createWordPressMediaAssetStore(db.client, SITE_A_ROW);
  await publish(SITE_A, store, { featured: FEATURED });
  web.library(HOST_A).splice(0);
  web.restore();
  web = installFakeWeb({ uploadFails: true });
  const result = await publish(SITE_A, store, { featured: FEATURED });
  expect(result.warnings).toContain(FEATURED_IMAGE_FAILED_WARNING);
  expect(web.posts.get(result.post.id)!.featured_media).toBeUndefined();
  // Claim released, row kept (no attachment deleted, nothing locked).
  expect(db.rows).toHaveLength(1);
  expect(db.rows[0].upload_started_at).toBeNull();
});

test('a first upload that fails removes its own claim row; the next publish uploads normally', async () => {
  web = installFakeWeb({ uploadFails: true });
  const db = createFakeDb();
  const store = createWordPressMediaAssetStore(db.client, SITE_A_ROW);
  const failed = await publish(SITE_A, store, { featured: FEATURED, internal: [IMAGE_1] });
  expect(failed.warnings).toContain(FEATURED_IMAGE_FAILED_WARNING);
  expect(web.posts.get(failed.post.id)!.content).toContain('supabase.co'); // Storage URL kept, as before
  expect(db.rows).toHaveLength(0);
  web.restore();
  web = installFakeWeb();
  await publish(SITE_A, store, { featured: FEATURED, internal: [IMAGE_1] });
  expect(web.uploads()).toBe(2);
  expect(db.rows).toHaveLength(2);
});

test('WordPress cannot answer the media check (timeout / 5xx): mapped attachment reused, never duplicated', async () => {
  for (const mediaLookup of ['timeout', 'http500'] as const) {
    web = installFakeWeb();
    const db = createFakeDb();
    const store = createWordPressMediaAssetStore(db.client, SITE_A_ROW);
    const first = await publish(SITE_A, store, { featured: FEATURED, internal: [IMAGE_1] });
    web.restore();
    web = installFakeWeb({ mediaLookup });
    const second = await publish(SITE_A, store, { featured: FEATURED, internal: [IMAGE_1] });
    expect(web.uploads()).toBe(0);
    expect(second.warnings).toEqual([]);
    expect(web.posts.get(second.post.id)!.featured_media).toBe(db.rows.find((r) => String(r.source_asset_key).endsWith('FEATURED.png'))!.wp_media_id);
    expect(first.post.id).toBeGreaterThan(0);
    web.restore();
  }
  web = undefined;
});

test('the connection was edited to another site URL (same site id): the old mapping is not reused', async () => {
  web = installFakeWeb();
  const db = createFakeDb();
  const store = createWordPressMediaAssetStore(db.client, SITE_A_ROW);
  await publish(SITE_A, store, { featured: FEATURED });
  await publish({ ...SITE_B }, store, { featured: FEATURED });
  expect(web.uploads(HOST_B)).toBe(1);
  expect(web.calls.some((c) => c.host === HOST_B && c.method === 'GET' && c.path.startsWith('/wp/v2/media/'))).toBe(false);
  expect(db.rows).toHaveLength(1);
  expect(db.rows[0].wordpress_site_url).toBe('https://blog-b.example.test');
});

// ========================================================== concurrency

test('two simultaneous publishes using the same image: one POST /wp/v2/media, both use the same attachment', async () => {
  web = installFakeWeb({ uploadDelayMs: 80 });
  const db = createFakeDb();
  const store = createWordPressMediaAssetStore(db.client, SITE_A_ROW);
  const [a, b] = await Promise.all([
    publish(SITE_A, store, { featured: FEATURED, internal: [IMAGE_1] }),
    publish(SITE_A, store, { featured: FEATURED, internal: [IMAGE_1] }, {
      article: { ...articleInput().article, id: 'article-2', slug: 'second' },
    }),
  ]);
  expect(web.uploads()).toBe(2);
  expect(web.posts.get(a.post.id)!.featured_media).toBe(web.posts.get(b.post.id)!.featured_media);
  expect(web.posts.get(a.post.id)!.content).toBe(web.posts.get(b.post.id)!.content);
  expect(db.rows).toHaveLength(2);
  expect(a.warnings).toEqual([]);
  expect(b.warnings).toEqual([]);
});

test('unique-constraint collision on insert: the existing mapping is read again and reused, no upload', async () => {
  web = installFakeWeb();
  const seed = createFakeDb();
  const seedStore = createWordPressMediaAssetStore(seed.client, SITE_A_ROW);
  await publish(SITE_A, seedStore, { featured: FEATURED });
  const winner = { ...seed.rows[0] };
  const uploadsBefore = web.uploads();

  // The other publish inserts its finished row between our lookup and our insert.
  const db = createFakeDb({
    beforeInsert: (rows) => {
      if (rows.length === 0) rows.push({ ...winner });
    },
  });
  const steps: string[] = [];
  const log: PublishLogger = { step: (s, f) => steps.push(`${s}:${f?.result}`), warn: (s, f) => steps.push(`${s}:${f?.result}`) };
  const result = await obtainReusableMedia(
    { site: SITE_A, store: createWordPressMediaAssetStore(db.client, SITE_A_ROW), log, plainUpload: () => Promise.reject(new Error('no plain upload')) },
    { url: FEATURED, filename: 'x-featured.png', altText: 'Cozy living room' }
  );
  expect(result.source).toBe('reused');
  expect(result.media.id).toBe(winner.wp_media_id);
  expect(web.uploads()).toBe(uploadsBefore);
  expect(steps).toContain('media_reuse_claim:collision');
  expect(db.rows).toHaveLength(1);
});

test('a fresh claim is waited for; a stale claim (killed request) is taken over', async () => {
  web = installFakeWeb();
  const db = createFakeDb();
  const store = createWordPressMediaAssetStore(db.client, SITE_A_ROW);
  const key = resolveSourceAssetKey(FEATURED)!;

  // Stale: claimed 10 minutes ago, never finished.
  db.rows.push({ wordpress_site_id: 'site-a', user_id: 'user-1', wordpress_site_url: 'https://blog-a.example.test', source_asset_key: key, source_hash: null, wp_media_id: null, wp_media_url: null, upload_started_at: new Date(Date.now() - 600_000).toISOString() });
  const taken = await obtainReusableMedia({ site: SITE_A, store, plainUpload: () => Promise.reject(new Error('unused')) }, { url: FEATURED, filename: 'f.png', altText: null });
  expect(taken.source).toBe('uploaded');
  expect(db.rows[0].upload_started_at).toBeNull();
  expect(web.uploads()).toBe(1);

  // Fresh claim that never completes: we wait (bounded), then give up without uploading a duplicate.
  db.rows[0].wp_media_id = null;
  db.rows[0].upload_started_at = new Date().toISOString();
  let clock = Date.now();
  const error = await obtainReusableMedia(
    { site: SITE_A, store, plainUpload: () => Promise.reject(new Error('unused')), now: () => clock, sleep: async (ms) => { clock += ms; }, limit: (cap) => Math.min(cap, 2_000) },
    { url: FEATURED, filename: 'f.png', altText: null }
  ).catch((e) => e);
  expect(String(error.message)).toContain('Another publish is still uploading this image');
  expect(web.uploads()).toBe(1);
});

// ========================================================== migration absent

test('migration 043 not applied: every image uploaded as before, one clear warning, the publish succeeds', async () => {
  web = installFakeWeb();
  const db = createFakeDb({ missing: true });
  const store = createWordPressMediaAssetStore(db.client, SITE_A_ROW);
  const lines: string[] = [];
  const originalWarn = console.warn;
  const originalInfo = console.info;
  console.warn = (line: string) => lines.push(line);
  console.info = () => {};
  try {
    const log = createPublishLogger({ attemptId: 'attempt-1' });
    const planned = plan(FEATURED, [IMAGE_1, IMAGE_2]);
    const result = await sendArticleToWordPress(SITE_A, {
      ...articleInput(),
      html: `<p>${planned.content}</p>`,
      media: planned.plan,
      mediaStore: store,
      log,
    });
    expect(web.uploads()).toBe(3);
    expect(result.warnings).toEqual([]);
    expect(web.posts.get(result.post.id)!.featured_media).toBeGreaterThan(0);
  } finally {
    console.warn = originalWarn;
    console.info = originalInfo;
  }
  expect(lines.filter((l) => l.includes('result=unavailable_migration_043_not_applied'))).toHaveLength(1);
  // The missing table is detected once: later images skip the lookup.
  expect(db.ops.length).toBeLessThanOrEqual(3);
  expect(isMissingMediaAssetsTable({ code: '42P01', message: 'relation "wordpress_media_assets" does not exist' })).toBe(true);
  expect(isMissingMediaAssetsTable({ code: '42P01', message: 'relation "other" does not exist' })).toBe(false);
});

test('no store (old callers) or any database error: plain upload, never a failed publish', async () => {
  web = installFakeWeb();
  const result = await publish(SITE_A, null, { featured: FEATURED, internal: [IMAGE_1] });
  expect(web.uploads()).toBe(2);
  expect(result.warnings).toEqual([]);

  const broken: MediaAssetStore = {
    find: () => Promise.reject(new (class extends Error {})('boom')),
    findByHash: async () => [],
    claim: async () => true,
    takeOver: async () => true,
    complete: async () => true,
    release: async () => {},
  };
  // A non-store error from the store is a bug, not a database failure: still never loses the post.
  const r2 = await publish(SITE_A, broken, { featured: FEATURED });
  expect(r2.post.id).toBeGreaterThan(0);
});

// ========================================================== CDN provider

test('provider switch Supabase → CDN keeps the mapping (same key), and plain CDN URLs still reuse via the content hash', async () => {
  web = installFakeWeb({ bytes: { [`${CDN}/user-1/gen-1/FEATURED.png`]: 'user-1/gen-1/FEATURED.png' } });
  const db = createFakeDb();
  const store = createWordPressMediaAssetStore(db.client, SITE_A_ROW);
  const ctx = { site: SITE_A, store, plainUpload: (r: { url: string; filename: string; altText: string | null }) => uploadMedia(SITE_A, r.url, r.filename, r.altText) };
  const supabase = await obtainReusableMedia(ctx, { url: FEATURED, filename: 'f.png', altText: null });
  expect(supabase.source).toBe('uploaded');

  // CDN declared: same key, no download, no upload.
  const cdn = await obtainReusableMedia(
    { ...ctx, sourceOptions: { cdnOrigins: [{ baseUrl: CDN, bucket: 'wordpress-images' }] } },
    { url: `${CDN}/user-1/gen-1/FEATURED.png`, filename: 'f.png', altText: null }
  );
  expect(cdn.source).toBe('reused');
  expect(cdn.media.id).toBe(supabase.media.id);
  expect(web.calls.filter((c) => c.host === 'cdn.omniflow.test')).toHaveLength(0);

  // CDN not declared: another key, but the identical bytes find the attachment.
  const undeclared = await obtainReusableMedia(ctx, { url: `${CDN}/user-1/gen-1/FEATURED.png`, filename: 'f.png', altText: null });
  expect(undeclared.source).toBe('reused_hash');
  expect(web.uploads()).toBe(1);
  // The stored Supabase row is untouched (old exported URLs are never rewritten).
  expect(db.rows.find((r) => r.source_asset_key === 'storage:wordpress-images/user-1/gen-1/FEATURED.png')!.wp_media_id).toBe(supabase.media.id);
  expect(hashImageBytes(new TextEncoder().encode('x').buffer as ArrayBuffer)).toMatch(/^[0-9a-f]{64}$/);
});

// ========================================================== logs

test('logs: steps and reuse results only — never the password, the auth header, URLs or content', async () => {
  web = installFakeWeb();
  const db = createFakeDb();
  const store = createWordPressMediaAssetStore(db.client, SITE_A_ROW);
  const lines: string[] = [];
  const originalWarn = console.warn;
  const originalInfo = console.info;
  console.warn = (line: string) => lines.push(line);
  console.info = (line: string) => lines.push(line);
  try {
    const log = createPublishLogger({ attemptId: 'attempt-9', articleId: 'article-1' });
    for (let i = 0; i < 2; i++) {
      const planned = plan(FEATURED, [IMAGE_1]);
      await sendArticleToWordPress(SITE_A, { ...articleInput(), html: `<p>${planned.content}</p>`, media: planned.plan, mediaStore: store, log });
    }
  } finally {
    console.warn = originalWarn;
    console.info = originalInfo;
  }
  const text = lines.join('\n');
  expect(text).toContain('step=media_featured');
  expect(text).toContain('result=uploaded');
  expect(text).toContain('result=reused');
  expect(text).toMatch(/step=media_reuse count=2 result=done/);
  expect(text).not.toContain(SITE_A.password);
  expect(text).not.toContain(Buffer.from(`${SITE_A.username}:${SITE_A.password}`).toString('base64'));
  expect(text).not.toMatch(/supabase\.co|wp-content|storage:|https?:\/\//);
});

// ========================================================== static checks

test('migration 043: next free number, the mapping table with its unique key and RLS, nothing else touched', () => {
  const files = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
  expect(files.filter((f) => f.startsWith('043_'))).toEqual(['043_add_wordpress_media_assets.sql']);
  expect(files.filter((f) => f.startsWith('042_'))).toEqual(['042_add_wordpress_publish_lock.sql']);
  const sql = read('supabase/migrations/043_add_wordpress_media_assets.sql');
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  expect(code).toContain('CREATE TABLE wordpress_media_assets');
  expect(code).toMatch(/UNIQUE \(wordpress_site_id, source_asset_key\)/);
  for (const column of ['wordpress_site_id', 'source_asset_key', 'source_hash', 'wp_media_id', 'wp_media_url', 'created_at', 'updated_at']) {
    expect(code).toContain(column);
  }
  expect(code).toMatch(/source_asset_key\s+text NOT NULL/);
  expect(code).toMatch(/source_hash\s+text,/);
  expect(code).toMatch(/REFERENCES wordpress_sites\(id\) ON DELETE CASCADE/);
  expect(code).toContain('ENABLE ROW LEVEL SECURITY');
  expect(code).toMatch(/WITH CHECK \(\s*user_id = auth\.uid\(\)\s*AND wordpress_site_id IN/);
  // Only the new table: no DROP, no change to an existing table, no data written.
  expect(code).not.toMatch(/\bDROP\b|\bDELETE FROM\b|\bINSERT INTO\b|^\s*UPDATE\b/m);
  expect([...code.matchAll(/ALTER TABLE (\w+)/g)].map((m) => m[1])).toEqual(['wordpress_media_assets']);
});

test('route wiring: the publish passes the site mapping store; uploads still go through publish-media', () => {
  const route = read('app/api/wordpress/[id]/publish/route.ts');
  expect(route).toContain("mediaStore: createWordPressMediaAssetStore(supabase, { id: site.id, userId: user.id })");
  expect(route).not.toMatch(/\buploadMedia\(/);
  const publishPost = read('lib/wordpress/publish-post.ts');
  expect(publishPost).toContain('store: input.mediaStore');
  // Media reuse never deletes anything on WordPress.
  const reuse = read('lib/wordpress/media-reuse.ts') + read('lib/wordpress/rest-client.ts');
  expect(reuse).not.toMatch(/method:\s*'DELETE'/);
  // No Supabase dependency in the reuse logic or the key resolver.
  expect(read('lib/wordpress/media-reuse.ts')).not.toMatch(/supabase/i);
  expect(read('lib/wordpress/media-source.ts')).not.toMatch(/@supabase|createClient/);
});
