import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import {
  NO_FOCUS_KEYWORD_WARNING,
  NO_TAGS_WARNING,
  sendArticleToWordPress,
  type SendArticleInput,
} from '@/lib/wordpress/publish-post';
import { buildRankMathPayload, RANK_MATH_FAILED_WARNING, RANK_MATH_NOT_DETECTED_WARNING } from '@/lib/wordpress/seo/rank-math';
import { buildWordPressTags, MAX_WORDPRESS_TAGS, resolveFocusKeyword, type PinsSeoSource } from '@/lib/wordpress/tags';
import { getPinsSeoSource } from '@/lib/queries/wordpress';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WordPressSiteCredentials } from '@/lib/wordpress/rest-client';

/**
 * WordPress standard payload + tags + Rank Math (TASK-FIX-048). Offline: the
 * WordPress site is a stubbed global fetch — no network, no database.
 */

const SITE: WordPressSiteCredentials = {
  siteUrl: 'https://blog.example.test/',
  username: 'editor',
  password: 'abcd EFGH ijkl MNOP',
};
const BASE = 'https://blog.example.test/wp-json';

const RANK_MATH_INDEX = {
  namespace: 'rankmath/v1',
  routes: { '/rankmath/v1/updateMeta': { methods: ['POST'] } },
};

interface Call {
  method: string;
  url: string;
  body: unknown;
  headers: Record<string, string>;
}

interface FakeSite {
  tags?: { id: number; name: string }[];
  canCreateTags?: boolean;
  rankMath?: 'available' | 'absent' | 'no-route';
  updateMetaStatus?: number;
  postMissing?: boolean;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function installFakeSite(fake: FakeSite = {}) {
  const calls: Call[] = [];
  const tags = [...(fake.tags ?? [])];
  let nextTagId = 900;
  let nextPostId = 500;
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body, headers: (init?.headers ?? {}) as Record<string, string> });
    const path = url.replace(BASE, '');

    if (method === 'GET' && path.startsWith('/wp/v2/tags?')) {
      const search = decodeURIComponent(new URL(url).searchParams.get('search') ?? '').toLowerCase();
      return json(tags.filter((t) => t.name.toLowerCase().includes(search)));
    }
    if (method === 'POST' && path === '/wp/v2/tags') {
      if (fake.canCreateTags === false) return json({ code: 'rest_cannot_create', message: 'Sorry' }, 403);
      const tag = { id: nextTagId++, name: (body as { name: string }).name };
      tags.push(tag);
      return json(tag, 201);
    }
    if (method === 'POST' && path.startsWith('/wp/v2/posts')) {
      if (fake.postMissing && /\/posts\/\d+$/.test(path)) return json({ code: 'rest_post_invalid_id', message: 'Invalid post ID.' }, 404);
      const id = /\/posts\/(\d+)$/.exec(path)?.[1];
      const postId = id ? Number(id) : nextPostId++;
      return json({ id: postId, link: `https://blog.example.test/?p=${postId}`, status: (body as { status: string }).status });
    }
    if (method === 'GET' && path === '/rankmath/v1') {
      if (fake.rankMath === 'absent') return json({ code: 'rest_no_route', message: 'No route' }, 404);
      if (fake.rankMath === 'no-route') return json({ namespace: 'rankmath/v1', routes: {} });
      return json(RANK_MATH_INDEX);
    }
    if (method === 'POST' && path === '/rankmath/v1/updateMeta') {
      const status = fake.updateMetaStatus ?? 200;
      return status === 200 ? json(true) : json({ code: 'rest_forbidden', message: 'Sorry, you are not allowed.' }, status);
    }
    return json({ code: 'unexpected', message: `${method} ${path}` }, 500);
  }) as typeof fetch;

  return {
    calls,
    tags,
    restore: () => {
      globalThis.fetch = original;
    },
    postCalls: () => calls.filter((c) => c.method === 'POST' && c.url.includes('/wp/v2/posts')),
    rankMathWrites: () => calls.filter((c) => c.url.endsWith('/rankmath/v1/updateMeta')),
    tagCreates: () => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/wp/v2/tags')),
  };
}

function input(overrides: Partial<SendArticleInput> = {}): SendArticleInput {
  return {
    article: {
      id: 'article-1',
      title: 'Wohnzimmer gemütlich einrichten: 12 Ideen',
      meta_title: 'Wohnzimmer gemütlich einrichten – 12 Ideen',
      slug: 'wohnzimmer-gemuetlich-einrichten',
      meta_description: 'So richten Sie Ihr Wohnzimmer gemütlich ein: 12 einfache Ideen.',
      wp_post_id: null,
    },
    generation: {
      keyword: 'Wohnzimmer gemütlich einrichten',
      source_type: 'keyword',
      seo_keywords: 'Wohnzimmer Ideen, Deko',
      status: 'completed',
    },
    html: '<p>Inhalt</p>',
    status: 'draft',
    categoryIds: [7],
    featuredMediaId: 42,
    ...overrides,
  };
}

let site: ReturnType<typeof installFakeSite>;
test.afterEach(() => site?.restore());

test.describe('standard WordPress payload', () => {
  test('sends the H1 as title, meta_description as excerpt and the slug explicitly', async () => {
    site = installFakeSite();
    await sendArticleToWordPress(SITE, input());
    const body = site.postCalls()[0].body as Record<string, unknown>;
    expect(body.title).toBe('Wohnzimmer gemütlich einrichten: 12 Ideen');
    expect(body.title).not.toBe('Wohnzimmer gemütlich einrichten – 12 Ideen');
    expect(body.excerpt).toBe('So richten Sie Ihr Wohnzimmer gemütlich ein: 12 einfache Ideen.');
    expect(body.slug).toBe('wohnzimmer-gemuetlich-einrichten');
    expect(body.content).toBe('<p>Inhalt</p>');
  });

  test('keeps categories and the featured image', async () => {
    site = installFakeSite();
    await sendArticleToWordPress(SITE, input());
    const body = site.postCalls()[0].body as Record<string, unknown>;
    expect(body.categories).toEqual([7]);
    expect(body.featured_media).toBe(42);
  });

  for (const [status, date] of [
    ['draft', undefined],
    ['publish', undefined],
    ['future', '2026-10-01T09:00:00'],
  ] as const) {
    test(`status ${status} is sent unchanged`, async () => {
      site = installFakeSite();
      const result = await sendArticleToWordPress(SITE, input({ status, date }));
      const body = site.postCalls()[0].body as Record<string, unknown>;
      expect(body.status).toBe(status);
      expect(body.date).toBe(date);
      expect(result.post.status).toBe(status);
    });
  }

  test('updates the existing post instead of creating a duplicate', async () => {
    site = installFakeSite();
    const result = await sendArticleToWordPress(SITE, input({ article: { ...input().article, wp_post_id: 77 } }));
    expect(site.postCalls()).toHaveLength(1);
    expect(site.postCalls()[0].url).toBe(`${BASE}/wp/v2/posts/77`);
    expect(result.post.id).toBe(77);
  });

  test('falls back to a new post when the previous one was deleted on WordPress', async () => {
    site = installFakeSite({ postMissing: true });
    const result = await sendArticleToWordPress(SITE, input({ article: { ...input().article, wp_post_id: 77 } }));
    expect(site.postCalls().map((c) => c.url)).toEqual([`${BASE}/wp/v2/posts/77`, `${BASE}/wp/v2/posts`]);
    expect(site.rankMathWrites()[0].body).toMatchObject({ objectID: result.post.id });
  });
});

test.describe('tags', () => {
  test('reuses an existing tag and creates a missing one', async () => {
    site = installFakeSite({ tags: [{ id: 11, name: 'wohnzimmer ideen' }] });
    const result = await sendArticleToWordPress(SITE, input());
    expect(site.tagCreates().map((c) => (c.body as { name: string }).name)).toEqual(['Deko', 'Wohnzimmer gemütlich einrichten']);
    expect(result.tagIds).toContain(11);
    expect(result.tagIds).toHaveLength(3);
    expect((site.postCalls()[0].body as Record<string, unknown>).tags).toEqual(result.tagIds);
  });

  test('skips tags WordPress refuses to create, without blocking the post', async () => {
    site = installFakeSite({ tags: [{ id: 11, name: 'Deko' }], canCreateTags: false });
    const result = await sendArticleToWordPress(SITE, input());
    expect(result.tagIds).toEqual([11]);
    expect((site.postCalls()[0].body as Record<string, unknown>).tags).toEqual([11]);
  });

  test('no artificial minimum: one keyword gives one tag', () => {
    expect(buildWordPressTags({ keyword: 'Deko', source_type: 'keyword', seo_keywords: null, status: 'completed' })).toEqual(['Deko']);
  });

  test('caps at 8 tags', () => {
    const seo = Array.from({ length: 15 }, (_, i) => `keyword ${i}`).join(', ');
    const tags = buildWordPressTags({ keyword: 'main', source_type: 'keyword', seo_keywords: seo, status: 'completed' });
    expect(tags).toHaveLength(MAX_WORDPRESS_TAGS);
    // seo_keywords come first; the primary keyword is the last source.
    expect(tags[0]).toBe('keyword 0');
    expect(tags).not.toContain('main');
  });

  test('removes duplicates (case, spaces, hyphens), empty and over-long values', () => {
    const tags = buildWordPressTags({
      keyword: 'Wohnzimmer  Deko',
      source_type: 'keyword',
      seo_keywords: 'wohnzimmer deko, Wohnzimmer-Deko, , ' + 'x'.repeat(61) + ', Kissen',
      status: 'completed',
    });
    expect(tags).toEqual(['wohnzimmer deko', 'Kissen']);
  });

  test('Pins method without Pin data: the synthesized pin-title label is not a tag nor a focus keyword', () => {
    const generation = { keyword: 'Pin A + Pin B + Pin C', source_type: 'pins' as const, seo_keywords: null, status: 'completed' as const };
    expect(buildWordPressTags(generation)).toEqual([]);
    expect(resolveFocusKeyword(generation)).toEqual({ keyword: null, source: null });
  });
});

test.describe('Rank Math', () => {
  test('available: meta_title, meta_description and generation.keyword are written after the post', async () => {
    site = installFakeSite();
    const result = await sendArticleToWordPress(SITE, input());
    const writes = site.rankMathWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toEqual({
      objectType: 'post',
      objectID: result.post.id,
      meta: {
        rank_math_title: 'Wohnzimmer gemütlich einrichten – 12 Ideen',
        rank_math_description: 'So richten Sie Ihr Wohnzimmer gemütlich ein: 12 einfache Ideen.',
        rank_math_focus_keyword: 'Wohnzimmer gemütlich einrichten',
      },
    });
    const order = site.calls.map((c) => c.url);
    expect(order.indexOf(`${BASE}/rankmath/v1/updateMeta`)).toBeGreaterThan(order.indexOf(`${BASE}/wp/v2/posts`));
    expect(result.rankMath).toEqual({ status: 'saved' });
    expect(result.warnings).toEqual([]);
  });

  test('focus keyword never falls back to the title; canonical only when explicit', () => {
    expect(buildRankMathPayload(1, { title: 'T', description: 'D', focusKeyword: null }).meta).toEqual({
      rank_math_title: 'T',
      rank_math_description: 'D',
    });
    expect(
      buildRankMathPayload(1, { title: null, description: null, focusKeyword: null, canonicalUrl: 'https://x.test/a' }).meta
    ).toEqual({ rank_math_canonical_url: 'https://x.test/a' });
  });

  test('absent: the post is published with a "not detected" warning and no write attempt', async () => {
    site = installFakeSite({ rankMath: 'absent' });
    const result = await sendArticleToWordPress(SITE, input());
    expect(site.postCalls()).toHaveLength(1);
    expect(site.rankMathWrites()).toHaveLength(0);
    expect(result.rankMath.status).toBe('not_detected');
    expect(result.warnings).toEqual([RANK_MATH_NOT_DETECTED_WARNING]);
  });

  test('endpoint unavailable: non-blocking failure, no write attempt', async () => {
    site = installFakeSite({ rankMath: 'no-route' });
    const result = await sendArticleToWordPress(SITE, input());
    expect(site.rankMathWrites()).toHaveLength(0);
    expect(result.post.id).toBeGreaterThan(0);
    expect(result.warnings).toEqual([RANK_MATH_FAILED_WARNING]);
  });

  test('write error: the post, slug and tags are kept, warning returned', async () => {
    site = installFakeSite({ updateMetaStatus: 403 });
    const result = await sendArticleToWordPress(SITE, input());
    expect(result.rankMath).toMatchObject({ status: 'failed', httpStatus: 403 });
    expect(result.warnings).toEqual([RANK_MATH_FAILED_WARNING]);
    const body = site.postCalls()[0].body as Record<string, unknown>;
    expect(body.slug).toBe('wohnzimmer-gemuetlich-einrichten');
    expect(body.tags).toEqual(result.tagIds);
    // Nothing is deleted after a failure.
    expect(site.calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  test('retry after an error updates the same post and reuses tags — no duplicates', async () => {
    site = installFakeSite({ updateMetaStatus: 500 });
    const first = await sendArticleToWordPress(SITE, input());
    site.restore();
    // The second attempt sees the tags the first one created.
    const names = ['Wohnzimmer Ideen', 'Deko', 'Wohnzimmer gemütlich einrichten'];
    site = installFakeSite({ tags: first.tagIds.map((id, i) => ({ id, name: names[i] })) });
    const second = await sendArticleToWordPress(SITE, input({ article: { ...input().article, wp_post_id: first.post.id } }));
    expect(site.postCalls().map((c) => c.url)).toEqual([`${BASE}/wp/v2/posts/${first.post.id}`]);
    expect(site.tagCreates()).toHaveLength(0);
    expect(second.tagIds).toEqual(first.tagIds);
    expect(second.rankMath.status).toBe('saved');
  });

  test('logs contain no secrets and no article content', async () => {
    site = installFakeSite({ updateMetaStatus: 401 });
    const logged: string[] = [];
    const originals = { warn: console.warn, error: console.error, log: console.log };
    console.warn = console.error = console.log = (...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    };
    try {
      await sendArticleToWordPress(SITE, input({ html: '<p>SECRET-ARTICLE-BODY</p>' }));
    } finally {
      Object.assign(console, originals);
    }
    const text = logged.join('\n');
    expect(text).toContain('step=rank_math_update_meta');
    expect(text).toContain('http=401');
    expect(text).not.toContain(SITE.password);
    expect(text).not.toContain(Buffer.from(`${SITE.username}:${SITE.password}`).toString('base64'));
    expect(text).not.toContain('SECRET-ARTICLE-BODY');
  });
});

test.describe('publish route wiring', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/wordpress/[id]/publish/route.ts'), 'utf8');

  test('delegates to sendArticleToWordPress and no longer sends meta_title as the post title', () => {
    expect(route).toContain('sendArticleToWordPress(credentials');
    expect(route).not.toContain('getMetaTitle');
    expect(route).toContain('warnings: sent.warnings');
  });
});

// ---------------------------------------------------------------------------
// TASK-FIX-050 — focus keyword and tags resolved per generation method.
// ---------------------------------------------------------------------------

const PINS_GENERATION = {
  keyword: 'Boho Wohnzimmer mit Rattan + Kleines Schlafzimmer hell + Balkon Ideen',
  source_type: 'pins' as const,
  seo_keywords: null,
  status: 'completed' as const,
};

const PINS_SOURCE: PinsSeoSource = {
  sourceKeyword: 'boho wohnzimmer',
  pinKeywords: ['boho deko, rattan möbel, Boho Deko', 'kleines schlafzimmer, helle farben', 'balkon ideen'],
};

test.describe('focus keyword per method', () => {
  test('Keyword method: the user keyword', () => {
    expect(
      resolveFocusKeyword({ keyword: ' Wohnzimmer  Ideen ', source_type: 'keyword', seo_keywords: null, status: 'completed' })
    ).toEqual({ keyword: 'Wohnzimmer Ideen', source: 'wordpress_generation.keyword' });
  });

  test('Pins method: the source Pinterest generation keyword, never the pin-title concatenation', () => {
    const focus = resolveFocusKeyword(PINS_GENERATION, PINS_SOURCE);
    expect(focus).toEqual({ keyword: 'boho wohnzimmer', source: 'pinterest_generation.keyword' });
    expect(focus.keyword).not.toContain(' + ');
  });

  test('Pins method: no reliable source keyword → empty, not invented', () => {
    for (const sourceKeyword of [null, '', '   ', 'https://example.com/pin', PINS_GENERATION.keyword]) {
      expect(resolveFocusKeyword(PINS_GENERATION, { ...PINS_SOURCE, sourceKeyword })).toEqual({ keyword: null, source: null });
    }
  });

  test('URL method: the resolved keyword; placeholders, URLs and unfinished generations are ignored', () => {
    const url = { source_type: 'url' as const, seo_keywords: null, status: 'completed' as const };
    expect(resolveFocusKeyword({ ...url, keyword: 'Boho Schlafzimmer' })).toEqual({
      keyword: 'Boho Schlafzimmer',
      source: 'wordpress_generation.keyword',
    });
    expect(resolveFocusKeyword({ ...url, keyword: 'https://example.com/a' }).keyword).toBeNull();
    expect(resolveFocusKeyword({ ...url, keyword: 'Pasted content' }).keyword).toBeNull();
    expect(resolveFocusKeyword({ ...url, keyword: 'Boho Schlafzimmer', status: 'processing' }).keyword).toBeNull();
  });
});

test.describe('tags from every source', () => {
  test('Pins keywords become tags, deduplicated, with the source keyword last', () => {
    expect(buildWordPressTags(PINS_GENERATION, PINS_SOURCE)).toEqual([
      'boho deko',
      'rattan möbel',
      'kleines schlafzimmer',
      'helle farben',
      'balkon ideen',
      'boho wohnzimmer',
    ]);
  });

  test('seo_keywords come first, then Pin keywords, capped at 8', () => {
    const tags = buildWordPressTags({ ...PINS_GENERATION, seo_keywords: 'a1, a2, a3, a4, a5, a6' }, PINS_SOURCE);
    expect(tags).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'boho deko', 'rattan möbel']);
  });

  test('an empty source is skipped, the others still count', () => {
    expect(buildWordPressTags(PINS_GENERATION, { sourceKeyword: 'boho wohnzimmer', pinKeywords: [] })).toEqual([
      'boho wohnzimmer',
    ]);
    expect(buildWordPressTags({ ...PINS_GENERATION, seo_keywords: '' }, { sourceKeyword: null, pinKeywords: ['deko'] })).toEqual([
      'deko',
    ]);
  });

  test('no tag from a placeholder or the pin-title label', () => {
    expect(buildWordPressTags({ keyword: 'https://example.com/a', source_type: 'url', seo_keywords: null, status: 'completed' })).toEqual([]);
    expect(buildWordPressTags({ keyword: 'Pasted content', source_type: 'url', seo_keywords: null, status: 'completed' })).toEqual([]);
    expect(
      buildWordPressTags({ ...PINS_GENERATION, keyword: 'Pin A + Pin B' }, { sourceKeyword: null, pinKeywords: ['Pin A + Pin B'] })
    ).toEqual([]);
  });
});

test.describe('publish with Pins sources', () => {
  const pinsInput = (pins: PinsSeoSource | null) => input({ generation: PINS_GENERATION, pins });

  test('Rank Math receives the Pinterest source keyword; Pin keywords are sent as tag ids', async () => {
    site = installFakeSite({ tags: [{ id: 21, name: 'Boho Deko' }] });
    const result = await sendArticleToWordPress(SITE, pinsInput(PINS_SOURCE));
    const meta = (site.rankMathWrites()[0].body as { meta: Record<string, string> }).meta;
    expect(meta.rank_math_focus_keyword).toBe('boho wohnzimmer');
    expect(result.focusKeyword.source).toBe('pinterest_generation.keyword');
    expect(result.tagIds).toHaveLength(6);
    expect(result.tagIds[0]).toBe(21);
    expect(site.tagCreates()).toHaveLength(5);
    expect((site.postCalls()[0].body as Record<string, unknown>).tags).toEqual(result.tagIds);
    expect(result.warnings).toEqual([]);
  });

  test('no reliable source: published without tags and without focus keyword, with warnings', async () => {
    site = installFakeSite();
    const result = await sendArticleToWordPress(SITE, pinsInput({ sourceKeyword: null, pinKeywords: [] }));
    expect(site.postCalls()).toHaveLength(1);
    expect((site.postCalls()[0].body as Record<string, unknown>).tags).toBeUndefined();
    expect(site.tagCreates()).toHaveLength(0);
    const meta = (site.rankMathWrites()[0].body as { meta: Record<string, string> }).meta;
    expect(meta).not.toHaveProperty('rank_math_focus_keyword');
    expect(result.warnings).toEqual([NO_TAGS_WARNING, NO_FOCUS_KEYWORD_WARNING]);
  });

  test('retry: same post updated, tags reused, no duplicate', async () => {
    site = installFakeSite({ updateMetaStatus: 500 });
    const first = await sendArticleToWordPress(SITE, pinsInput(PINS_SOURCE));
    const created = [...site.tags];
    site.restore();
    site = installFakeSite({ tags: created });
    const second = await sendArticleToWordPress(SITE, {
      ...pinsInput(PINS_SOURCE),
      article: { ...input().article, wp_post_id: first.post.id },
    });
    expect(site.postCalls().map((c) => c.url)).toEqual([`${BASE}/wp/v2/posts/${first.post.id}`]);
    expect(site.tagCreates()).toHaveLength(0);
    expect(second.tagIds).toEqual(first.tagIds);
    const meta = (site.rankMathWrites()[0].body as { meta: Record<string, string> }).meta;
    expect(meta.rank_math_focus_keyword).toBe('boho wohnzimmer');
  });
});

test.describe('getPinsSeoSource', () => {
  function stubSupabase(rows: unknown[]) {
    const seen: { table?: string; ids?: string[] } = {};
    const client = {
      from(table: string) {
        seen.table = table;
        return {
          select() {
            return {
              in(_column: string, ids: string[]) {
                seen.ids = ids;
                return Promise.resolve({ data: rows, error: null });
              },
            };
          },
        };
      },
    } as unknown as SupabaseClient;
    return { client, seen };
  }

  test('reads Pin keywords in selection order and the shared Pinterest generation keyword', async () => {
    const { client, seen } = stubSupabase([
      { id: 'p2', keywords: 'rattan', generation_id: 'g1', generations: { keyword: 'boho wohnzimmer' } },
      { id: 'p1', keywords: 'boho deko', generation_id: 'g1', generations: [{ keyword: 'boho wohnzimmer' }] },
      { id: 'p3', keywords: '  ', generation_id: 'g1', generations: { keyword: 'boho wohnzimmer' } },
    ]);
    const source = await getPinsSeoSource(client, ['p1', 'p2', 'p3']);
    expect(seen).toEqual({ table: 'pins', ids: ['p1', 'p2', 'p3'] });
    expect(source).toEqual({ sourceKeyword: 'boho wohnzimmer', pinKeywords: ['boho deko', 'rattan'] });
  });

  test('Pins from generations with different keywords → no single source keyword', async () => {
    const { client } = stubSupabase([
      { id: 'p1', keywords: 'a', generation_id: 'g1', generations: { keyword: 'boho' } },
      { id: 'p2', keywords: 'b', generation_id: 'g2', generations: { keyword: 'skandi' } },
    ]);
    expect((await getPinsSeoSource(client, ['p1', 'p2'])).sourceKeyword).toBeNull();
  });

  test('no Pin ids → empty source without a query', async () => {
    const { client, seen } = stubSupabase([]);
    expect(await getPinsSeoSource(client, [])).toEqual({ sourceKeyword: null, pinKeywords: [] });
    expect(seen.table).toBeUndefined();
  });
});

test('publish route loads the Pins SEO source for the Pins method only', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/wordpress/[id]/publish/route.ts'), 'utf8');
  expect(route).toContain(
    "generation.source_type === 'pins' ? await getPinsSeoSource(supabase, generation.source_pin_ids ?? [])"
  );
  expect(route).toMatch(/sendArticleToWordPress\(credentials, \{\s+article,\s+generation,\s+pins,/);
});
