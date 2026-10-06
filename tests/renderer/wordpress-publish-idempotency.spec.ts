import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  FAQ_SCHEMA_REMOVED_WARNING,
  sendArticleToWordPress,
  WordPressPublishUncertainError,
  type SendArticleInput,
} from '@/lib/wordpress/publish-post';
import {
  acquirePublishLock,
  displayedPublishStatus,
  isMissingPublishLockColumn,
  PUBLISH_LOCK_STALE_MS,
  PUBLISH_MAX_DURATION_SECONDS,
  publishLockRelease,
} from '@/lib/wordpress/publish-lock';
import { findReconcilablePost, isExactPostMatch } from '@/lib/wordpress/publish-reconcile';
import { createPublishLogger, formatPublishLogLine } from '@/lib/wordpress/publish-log';
import {
  PUBLISH_IN_PROGRESS_MESSAGE,
  PUBLISH_UNCERTAIN_MESSAGE,
  readPublishResponse,
  requestPublish,
} from '@/lib/wordpress/publish-outcome';
import { isWordPressPostIdClaimed } from '@/lib/queries/wordpress';
import { RANK_MATH_FAILED_WARNING } from '@/lib/wordpress/seo/rank-math';
import { WordPressApiError, type WordPressSiteCredentials } from '@/lib/wordpress/rest-client';

/**
 * TASK-FIX-058 — idempotent WordPress publish. Offline: WordPress is a
 * stateful stubbed global fetch and Supabase an in-memory stub — no network,
 * no database, no AI call.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const SITE: WordPressSiteCredentials = {
  siteUrl: 'https://blog.example.test',
  username: 'editor',
  password: 'abcd EFGH ijkl MNOP',
};
const BASE = 'https://blog.example.test/wp-json';
const TITLE = 'Wohnzimmer gemütlich einrichten: 12 Ideen';
const SLUG = 'wohnzimmer-gemuetlich-einrichten';
const SCRIPT = '<script type="application/ld+json">{"@type":"FAQPage"}</script>';

// ---------------------------------------------------------------- fake site

type Fault = 'timeout' | 'network' | 'invalid_json' | 'http500';

interface WpPost {
  id: number;
  slug: string;
  title: string;
  status: string;
  content: string;
}

interface FakeOptions {
  posts?: WpPost[];
  /** Fault on the n-th create (1-based); `commit` = the post is saved anyway. */
  createFault?: { fault: Fault; commit: boolean; commitLate?: boolean };
  /** Fault on the n-th update call (1-based). */
  updateFaults?: Record<number, Fault>;
  lookup?: 'ok' | 'http500' | 'timeout';
  kses?: boolean;
  rankMath?: 'ok' | 'timeout' | 'http403';
}

function timeoutError(): Error {
  return new DOMException('The operation was aborted due to timeout', 'TimeoutError') as unknown as Error;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function installFakeSite(options: FakeOptions = {}) {
  const posts: WpPost[] = (options.posts ?? []).map((p) => ({ ...p }));
  const calls: { method: string; path: string }[] = [];
  const late: WpPost[] = [];
  let nextId = 700;
  let creates = 0;
  let updates = 0;
  const original = globalThis.fetch;

  const toJson = (p: WpPost) => ({
    id: p.id,
    slug: p.slug,
    status: p.status,
    link: `https://blog.example.test/?p=${p.id}`,
    title: { raw: p.title, rendered: p.title },
    content: { raw: p.content },
  });
  const fail = (fault: Fault): Response => {
    if (fault === 'timeout') throw timeoutError();
    if (fault === 'network') throw new TypeError('fetch failed');
    if (fault === 'invalid_json') return new Response('<b>Notice</b>: Undefined index {"id":', { status: 201 });
    return json({ code: 'internal_server_error', message: 'Critical error' }, 500);
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const path = url.replace(BASE, '');
    calls.push({ method, path });
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

    if (method === 'GET' && path.startsWith('/wp/v2/posts?') && path.includes('slug=')) {
      if (options.lookup === 'http500') return json({ code: 'boom', message: 'Server error' }, 500);
      if (options.lookup === 'timeout') throw timeoutError();
      // A create that timed out may land on WordPress after the first lookup.
      const visible = posts.slice();
      posts.push(...late.splice(0));
      const slug = decodeURIComponent(new URL(url).searchParams.get('slug') ?? '');
      expect(new URL(url).searchParams.get('status')).toBe('any');
      expect(new URL(url).searchParams.get('context')).toBe('edit');
      return json(visible.filter((p) => p.slug === slug && p.status !== 'trash').map(toJson));
    }
    if (method === 'GET' && path.startsWith('/wp/v2/posts?')) return json([]);
    if (method === 'GET' && path.startsWith('/wp/v2/tags?')) return json([]);
    if (method === 'POST' && path === '/wp/v2/tags') return json({ id: 900, name: body.name }, 201);
    if (method === 'POST' && path === '/wp/v2/posts') {
      creates++;
      const saved: WpPost = {
        id: nextId++,
        slug: posts.some((p) => p.slug === body.slug) ? `${body.slug}-2` : body.slug,
        title: body.title,
        status: body.status,
        content: options.kses ? String(body.content).replace(/<\/?script[^>]*>/g, '') : body.content,
      };
      if (options.createFault && creates === 1) {
        if (options.createFault.commit) (options.createFault.commitLate ? late : posts).push(saved);
        return fail(options.createFault.fault);
      }
      posts.push(saved);
      return json(toJson(saved), 201);
    }
    const update = /^\/wp\/v2\/posts\/(\d+)$/.exec(path);
    if (method === 'POST' && update) {
      updates++;
      const post = posts.find((p) => p.id === Number(update[1]));
      const fault = options.updateFaults?.[updates];
      if (fault) return fail(fault);
      if (!post) return json({ code: 'rest_post_invalid_id', message: 'Invalid post ID.' }, 404);
      post.title = body.title;
      post.status = body.status;
      post.content = options.kses ? String(body.content).replace(/<\/?script[^>]*>/g, '') : body.content;
      return json(toJson(post));
    }
    if (method === 'GET' && path === '/rankmath/v1') {
      if (options.rankMath === 'timeout') throw timeoutError();
      return json({ routes: { '/rankmath/v1/updateMeta': { methods: ['POST'] } } });
    }
    if (method === 'POST' && path === '/rankmath/v1/updateMeta') {
      return options.rankMath === 'http403' ? json({ message: 'Sorry' }, 403) : json(true);
    }
    return json({ code: 'unexpected', message: `${method} ${path}` }, 500);
  }) as typeof fetch;

  return {
    posts,
    calls,
    creates: () => calls.filter((c) => c.method === 'POST' && c.path === '/wp/v2/posts').length,
    updatesTo: (id: number) => calls.filter((c) => c.method === 'POST' && c.path === `/wp/v2/posts/${id}`).length,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

let site: ReturnType<typeof installFakeSite> | undefined;
test.afterEach(() => {
  site?.restore();
  site = undefined;
});

/** A recorder standing in for the route's immediate wp_post_id write. */
function recorder(calls?: { method: string; path: string }[]) {
  const saved: { postId: number; source: string; atCall: number }[] = [];
  return {
    saved,
    onPostId: async (postId: number, source: 'created' | 'updated' | 'adopted') => {
      saved.push({ postId, source, atCall: calls?.length ?? 0 });
    },
  };
}

function input(overrides: Partial<SendArticleInput> = {}): SendArticleInput {
  return {
    article: {
      id: 'article-1',
      title: TITLE,
      meta_title: 'Wohnzimmer gemütlich – 12 Ideen',
      slug: SLUG,
      meta_description: 'So richten Sie Ihr Wohnzimmer gemütlich ein.',
      wp_post_id: null,
    },
    generation: { keyword: 'Wohnzimmer gemütlich einrichten', source_type: 'keyword', seo_keywords: 'Deko', status: 'completed' },
    html: '<p>Inhalt</p>',
    status: 'publish',
    ...overrides,
  };
}

const withId = (id: number) => input({ article: { ...input().article, wp_post_id: id } });

// ================================================== reconciliation + saving

test('success: the created id is saved once, before Rank Math', async () => {
  site = installFakeSite();
  const rec = recorder(site.calls);
  const result = await sendArticleToWordPress(SITE, { ...input(), onPostId: rec.onPostId });
  expect(site.creates()).toBe(1);
  expect(rec.saved).toEqual([{ postId: result.post.id, source: 'created', atCall: expect.any(Number) }]);
  const firstRankMath = site.calls.findIndex((c) => c.path.startsWith('/rankmath'));
  expect(rec.saved[0].atCall).toBeLessThanOrEqual(firstRankMath);
});

test('creation succeeds then the FAQ re-send fails: the id is kept, a retry updates the same post', async () => {
  site = installFakeSite({ kses: true, updateFaults: { 1: 'http500' } });
  const rec = recorder();
  await expect(sendArticleToWordPress(SITE, { ...input({ faqSchema: SCRIPT }), onPostId: rec.onPostId })).rejects.toThrow(
    WordPressApiError
  );
  expect(site.creates()).toBe(1);
  const createdId = rec.saved[0].postId;
  expect(rec.saved[0].source).toBe('created');

  const retry = await sendArticleToWordPress(SITE, { ...withId(createdId), faqSchema: SCRIPT });
  expect(site.creates()).toBe(1);
  expect(retry.post.id).toBe(createdId);
  expect(retry.faqSchema).toBe('removed');
  expect(retry.warnings).toContain(FAQ_SCHEMA_REMOVED_WARNING);
});

test('FAQ re-send times out: uncertain, with the known post id', async () => {
  site = installFakeSite({ kses: true, updateFaults: { 1: 'timeout' } });
  const rec = recorder();
  const error = await sendArticleToWordPress(SITE, { ...input({ faqSchema: SCRIPT }), onPostId: rec.onPostId }).catch((e) => e);
  expect(error).toBeInstanceOf(WordPressPublishUncertainError);
  expect(error.postId).toBe(rec.saved[0].postId);
  expect(error.step).toBe('faq_resend');
});

test('creation succeeds then Rank Math times out or is refused: the id is kept, publish succeeds with a warning', async () => {
  for (const rankMath of ['timeout', 'http403'] as const) {
    site = installFakeSite({ rankMath });
    const rec = recorder();
    const result = await sendArticleToWordPress(SITE, { ...input(), onPostId: rec.onPostId });
    expect(rec.saved.map((s) => s.postId)).toEqual([result.post.id]);
    expect(result.rankMath.status).toBe('failed');
    expect(result.warnings).toContain(RANK_MATH_FAILED_WARNING);
    site.restore();
  }
  site = undefined;
});

for (const fault of ['timeout', 'network', 'invalid_json'] as const) {
  test(`create answer lost (${fault}) after WordPress saved the post: reconciled, adopted, one creation`, async () => {
    site = installFakeSite({ createFault: { fault, commit: true } });
    const rec = recorder();
    const result = await sendArticleToWordPress(SITE, { ...input(), onPostId: rec.onPostId });
    expect(site.creates()).toBe(1);
    expect(site.posts).toHaveLength(1);
    expect(result.post.id).toBe(site.posts[0].id);
    expect(rec.saved).toEqual([{ postId: result.post.id, source: 'adopted', atCall: 0 }]);
    // Re-sent so the adopted post holds this attempt's content and status.
    expect(site.updatesTo(result.post.id)).toBe(1);

    const retry = await sendArticleToWordPress(SITE, withId(result.post.id));
    expect(site.creates()).toBe(1);
    expect(retry.post.id).toBe(result.post.id);
  });
}

test('2xx with invalid JSON is a controlled WordPressApiError, never a raw SyntaxError', async () => {
  site = installFakeSite({ createFault: { fault: 'invalid_json', commit: false }, lookup: 'http500' });
  const error = await sendArticleToWordPress(SITE, input()).catch((e) => e);
  expect(error).toBeInstanceOf(WordPressPublishUncertainError);
  expect(error.postId).toBeNull();
});

test('timeout with nothing found yet → uncertain; the retry finds the late post and updates it (no duplicate)', async () => {
  site = installFakeSite({ createFault: { fault: 'timeout', commit: true, commitLate: true } });
  const error = await sendArticleToWordPress(SITE, input()).catch((e) => e);
  expect(error).toBeInstanceOf(WordPressPublishUncertainError);
  expect(error.postId).toBeNull();
  expect(error.message).toContain('Check WordPress before retrying');

  const rec = recorder();
  const retry = await sendArticleToWordPress(SITE, { ...input(), onPostId: rec.onPostId });
  expect(site.creates()).toBe(1);
  expect(site.posts).toHaveLength(1);
  expect(retry.post.id).toBe(site.posts[0].id);
  expect(rec.saved[0].source).toBe('adopted');
});

test('5xx with the post confirmed absent is a real failure, not uncertain', async () => {
  site = installFakeSite({ createFault: { fault: 'http500', commit: false } });
  const error = await sendArticleToWordPress(SITE, input()).catch((e) => e);
  expect(error).toBeInstanceOf(WordPressApiError);
  expect(error).not.toBeInstanceOf(WordPressPublishUncertainError);
  expect(site.posts).toHaveLength(0);
});

test('5xx after WordPress committed: reconciled and adopted', async () => {
  site = installFakeSite({ createFault: { fault: 'http500', commit: true } });
  const result = await sendArticleToWordPress(SITE, input());
  expect(site.creates()).toBe(1);
  expect(result.post.id).toBe(site.posts[0].id);
});

test('an existing post with the same slug and exact title is adopted before creating: update, no creation', async () => {
  site = installFakeSite({ posts: [{ id: 41, slug: SLUG, title: TITLE, status: 'draft', content: '<p>old</p>' }] });
  const rec = recorder();
  const result = await sendArticleToWordPress(SITE, { ...input(), onPostId: rec.onPostId });
  expect(site.creates()).toBe(0);
  expect(result.post.id).toBe(41);
  expect(site.posts[0].status).toBe('publish');
  expect(rec.saved).toEqual([{ postId: 41, source: 'adopted', atCall: 0 }]);
});

test('same slug but a different title: never adopted, a new post is created', async () => {
  site = installFakeSite({ posts: [{ id: 41, slug: SLUG, title: 'Another article', status: 'publish', content: 'x' }] });
  const result = await sendArticleToWordPress(SITE, input());
  expect(site.creates()).toBe(1);
  expect(result.post.id).not.toBe(41);
  expect(site.posts.find((p) => p.id === 41)?.content).toBe('x');
});

test('a matching post already held by another OmniFlow article is never adopted', async () => {
  site = installFakeSite({ posts: [{ id: 41, slug: SLUG, title: TITLE, status: 'publish', content: 'x' }] });
  const result = await sendArticleToWordPress(SITE, { ...input(), isPostIdClaimed: async (id) => id === 41 });
  expect(site.creates()).toBe(1);
  expect(result.post.id).not.toBe(41);
});

test('a claim check that errors means "do not adopt"', async () => {
  site = installFakeSite({ posts: [{ id: 41, slug: SLUG, title: TITLE, status: 'publish', content: 'x' }] });
  const found = await findReconcilablePost(SITE, { slug: SLUG, title: TITLE }, async () => {
    throw new Error('db down');
  });
  expect(found.outcome).toBe('none');
});

test('duplicates already on WordPress: the oldest exact match is adopted, nothing is deleted', async () => {
  site = installFakeSite({
    posts: [
      { id: 52, slug: SLUG, title: TITLE, status: 'draft', content: 'b' },
      { id: 51, slug: SLUG, title: TITLE, status: 'draft', content: 'a' },
    ],
  });
  const result = await sendArticleToWordPress(SITE, input());
  expect(result.post.id).toBe(51);
  expect(site.posts).toHaveLength(2);
  expect(site.calls.some((c) => c.method === 'DELETE')).toBe(false);
});

test('reconciliation lookup failing before creation: created normally', async () => {
  site = installFakeSite({ lookup: 'http500' });
  const result = await sendArticleToWordPress(SITE, input());
  expect(site.creates()).toBe(1);
  expect(result.post.id).toBe(site.posts[0].id);
});

test('known wp_post_id: plain update, no lookup, no creation', async () => {
  site = installFakeSite({ posts: [{ id: 41, slug: SLUG, title: TITLE, status: 'draft', content: 'x' }] });
  const result = await sendArticleToWordPress(SITE, withId(41));
  expect(result.post.id).toBe(41);
  expect(site.creates()).toBe(0);
  expect(site.calls.some((c) => c.path.includes('slug='))).toBe(false);
});

test('update times out on a known post: uncertain with that id (a retry updates it again)', async () => {
  site = installFakeSite({ posts: [{ id: 41, slug: SLUG, title: TITLE, status: 'draft', content: 'x' }], updateFaults: { 1: 'timeout' } });
  const error = await sendArticleToWordPress(SITE, withId(41)).catch((e) => e);
  expect(error).toBeInstanceOf(WordPressPublishUncertainError);
  expect(error.postId).toBe(41);
  expect(site.creates()).toBe(0);
});

test('known post deleted on WordPress (404): falls back to one fresh creation', async () => {
  site = installFakeSite();
  const rec = recorder();
  const result = await sendArticleToWordPress(SITE, { ...withId(41), onPostId: rec.onPostId });
  expect(site.creates()).toBe(1);
  expect(rec.saved).toEqual([{ postId: result.post.id, source: 'created', atCall: expect.any(Number) }]);
});

test('exact match: decoded slug, trimmed raw title; no raw title → never a match', () => {
  expect(isExactPostMatch({ slug: 'caf%c3%a9-ideen', titleRaw: ' Café ' }, 'café-ideen', 'Café')).toBe(true);
  expect(isExactPostMatch({ slug: SLUG, titleRaw: null }, SLUG, TITLE)).toBe(false);
  expect(isExactPostMatch({ slug: `${SLUG}-2`, titleRaw: TITLE }, SLUG, TITLE)).toBe(false);
});

// ========================================================== methods (non-regression)

test('Keyword, Pins and URL methods: one creation, tags and focus keyword unchanged', async () => {
  const generations: SendArticleInput['generation'][] = [
    { keyword: 'Wohnzimmer gemütlich einrichten', source_type: 'keyword', seo_keywords: 'Deko', status: 'completed' },
    { keyword: 'Pin A + Pin B', source_type: 'pins', seo_keywords: null, status: 'completed' },
    { keyword: 'Wohnzimmer Ideen', source_type: 'url', seo_keywords: 'Deko', status: 'completed' },
  ];
  const expected = ['Wohnzimmer gemütlich einrichten', 'Boho Wohnzimmer', 'Wohnzimmer Ideen'];
  for (const [i, generation] of generations.entries()) {
    site = installFakeSite();
    const pins = generation.source_type === 'pins' ? { sourceKeyword: 'Boho Wohnzimmer', pinKeywords: ['Rattan'] } : null;
    const result = await sendArticleToWordPress(SITE, { ...input({ generation, pins }), onPostId: async () => {} });
    expect(site.creates()).toBe(1);
    expect(result.focusKeyword.keyword).toBe(expected[i]);
    expect(result.rankMath.status).toBe('saved');
    site.restore();
  }
  site = undefined;
});

// ================================================================ lock

interface Row {
  id: string;
  publish_status: string;
  publish_started_at?: string | null;
  [key: string]: unknown;
}

/** Minimal PostgREST stand-in: the lock UPDATE … WHERE id AND (or-filter) is evaluated atomically. */
function fakeSupabase(rows: Row[], opts: { missingColumn?: boolean } = {}) {
  const evaluateOr = (row: Row, filter: string) =>
    filter.split(',').some((cond) => {
      const [column, op, ...rest] = cond.split('.');
      const value = rest.join('.').replace(/^"|"$/g, '');
      const actual = row[column] as string | null | undefined;
      if (op === 'neq') return actual !== value;
      if (op === 'is') return actual === null || actual === undefined;
      if (op === 'lt') return typeof actual === 'string' && actual < value;
      throw new Error(`unsupported ${cond}`);
    });

  return {
    from(table: string) {
      expect(table).toBe('wordpress_articles');
      const state: { values?: Record<string, unknown>; id?: string; or?: string } = {};
      const builder = {
        update(values: Record<string, unknown>) {
          state.values = values;
          return builder;
        },
        eq(column: string, value: string) {
          expect(column).toBe('id');
          state.id = value;
          return builder;
        },
        or(filter: string) {
          state.or = filter;
          return builder;
        },
        async select() {
          if (opts.missingColumn && state.values && 'publish_started_at' in state.values) {
            return {
              data: null,
              error: { code: 'PGRST204', message: "Could not find the 'publish_started_at' column of 'wordpress_articles' in the schema cache" },
            };
          }
          const matched = rows.filter((r) => r.id === state.id && (!state.or || evaluateOr(r, state.or)));
          for (const r of matched) Object.assign(r, state.values);
          return { data: matched.map((r) => ({ id: r.id })), error: null };
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

test('lock: two concurrent publishes — one acquires, the other is busy (→ 409), one creation only', async () => {
  site = installFakeSite();
  const rows: Row[] = [{ id: 'article-1', publish_status: 'draft', publish_started_at: null, wp_post_id: null }];
  const supabase = fakeSupabase(rows);

  async function attempt() {
    const lock = await acquirePublishLock(supabase, 'article-1');
    if (lock.status === 'busy') return 409;
    const result = await sendArticleToWordPress(SITE, {
      ...input({ article: { ...input().article, wp_post_id: (rows[0].wp_post_id as number | null) ?? null } }),
      onPostId: async (postId) => {
        rows[0].wp_post_id = postId;
      },
    });
    Object.assign(rows[0], { publish_status: 'published', ...publishLockRelease(lock) });
    return result.post.id;
  }

  const outcomes = await Promise.all([attempt(), attempt()]);
  expect(outcomes.filter((o) => o === 409)).toHaveLength(1);
  expect(site.creates()).toBe(1);
  expect(rows[0].publish_status).toBe('published');
  expect(rows[0].publish_started_at).toBeNull();
});

test('lock: an active lock is busy, a stale one (> maxDuration + margin) is taken over', async () => {
  const now = new Date('2026-10-06T10:00:00.000Z');
  const fresh = new Date(now.getTime() - 30_000).toISOString();
  const stale = new Date(now.getTime() - PUBLISH_LOCK_STALE_MS - 1000).toISOString();

  const busyRows: Row[] = [{ id: 'a', publish_status: 'publishing', publish_started_at: fresh }];
  expect(await acquirePublishLock(fakeSupabase(busyRows), 'a', now)).toEqual({ status: 'busy' });

  const staleRows: Row[] = [{ id: 'a', publish_status: 'publishing', publish_started_at: stale }];
  expect(await acquirePublishLock(fakeSupabase(staleRows), 'a', now)).toEqual({ status: 'acquired', startedAt: now.toISOString() });
  expect(staleRows[0].publish_started_at).toBe(now.toISOString());
  expect(PUBLISH_LOCK_STALE_MS).toBe((PUBLISH_MAX_DURATION_SECONDS + 30) * 1000);
});

test('lock: migration 042 absent → unavailable, nothing written, and publishing (P0-a) still works', async () => {
  const rows: Row[] = [{ id: 'a', publish_status: 'draft' }];
  const lock = await acquirePublishLock(fakeSupabase(rows, { missingColumn: true }), 'a');
  expect(lock).toEqual({ status: 'unavailable', reason: 'missing_column' });
  expect(rows[0].publish_status).toBe('draft');
  expect(publishLockRelease(lock)).toEqual({});
  expect(isMissingPublishLockColumn({ code: '42703', message: 'column "publish_started_at" does not exist' })).toBe(true);
  expect(isMissingPublishLockColumn({ code: '42703', message: 'column "other" does not exist' })).toBe(false);

  site = installFakeSite({ createFault: { fault: 'timeout', commit: true } });
  const result = await sendArticleToWordPress(SITE, input());
  expect(site.creates()).toBe(1);
  expect(result.post.id).toBe(site.posts[0].id);
});

test('display: a stale "publishing" never stays stuck — shown as uncertain', () => {
  const now = new Date('2026-10-06T10:00:00.000Z');
  const recent = new Date(now.getTime() - 5000).toISOString();
  const old = new Date(now.getTime() - PUBLISH_LOCK_STALE_MS - 1).toISOString();
  expect(displayedPublishStatus({ publish_status: 'publishing', publish_started_at: recent }, now)).toBe('publishing');
  expect(displayedPublishStatus({ publish_status: 'publishing', publish_started_at: old }, now)).toBe('uncertain');
  expect(displayedPublishStatus({ publish_status: 'publishing', publish_started_at: null }, now)).toBe('uncertain');
  expect(displayedPublishStatus({ publish_status: 'publishing' }, now)).toBe('publishing');
  expect(displayedPublishStatus({ publish_status: 'published', publish_started_at: old }, now)).toBe('published');
});

test('claimed id query: same project only, excludes the article itself', async () => {
  const seen: { table: string; filters: unknown[] }[] = [];
  const tables: Record<string, Record<string, unknown>[]> = {
    wordpress_generations: [{ id: 'g1', project_id: 'p1' }, { id: 'g2', project_id: 'p1' }, { id: 'g9', project_id: 'p9' }],
    wordpress_articles: [
      { id: 'article-1', generation_id: 'g1', wp_post_id: 41 },
      { id: 'article-2', generation_id: 'g2', wp_post_id: 42 },
      { id: 'article-9', generation_id: 'g9', wp_post_id: 43 },
    ],
  };
  const client = {
    from(table: string) {
      const filters: ((r: Record<string, unknown>) => boolean)[] = [];
      const entry = { table, filters: [] as unknown[] };
      seen.push(entry);
      const builder = {
        select: () => builder,
        eq: (c: string, v: unknown) => (entry.filters.push(['eq', c, v]), filters.push((r) => r[c] === v), builder),
        neq: (c: string, v: unknown) => (entry.filters.push(['neq', c, v]), filters.push((r) => r[c] !== v), builder),
        in: (c: string, v: unknown[]) => (entry.filters.push(['in', c, v]), filters.push((r) => v.includes(r[c])), builder),
        limit: () => builder,
        then: (resolve: (value: unknown) => void) =>
          resolve({ data: tables[table].filter((r) => filters.every((f) => f(r))), error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;

  expect(await isWordPressPostIdClaimed(client, { projectId: 'p1', postId: 42, excludeArticleId: 'article-1' })).toBe(true);
  expect(await isWordPressPostIdClaimed(client, { projectId: 'p1', postId: 41, excludeArticleId: 'article-1' })).toBe(false);
  // Same WP id on another project's site is a different post.
  expect(await isWordPressPostIdClaimed(client, { projectId: 'p1', postId: 43, excludeArticleId: 'article-1' })).toBe(false);
});

// ================================================================ client

test('client: a non-JSON 504 (platform timeout) is uncertain, never "failed"', async () => {
  const outcome = await readPublishResponse(new Response('<html>FUNCTION_INVOCATION_TIMEOUT</html>', { status: 504 }));
  expect(outcome).toEqual({ kind: 'uncertain', message: PUBLISH_UNCERTAIN_MESSAGE });
});

test('client: a network error is uncertain and never throws', async () => {
  const outcome = await requestPublish(
    (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch,
    '/api/wordpress/x/publish',
    { mode: 'draft' }
  );
  expect(outcome.kind).toBe('uncertain');
});

test('client: 409 busy, publish_uncertain, real failure and success are told apart', async () => {
  expect(await readPublishResponse(json({ data: null, error: { code: 'publish_in_progress', message: 'x' } }, 409))).toEqual({
    kind: 'busy',
    message: PUBLISH_IN_PROGRESS_MESSAGE,
  });
  expect((await readPublishResponse(json({ data: null, error: { code: 'publish_uncertain', message: 'x' } }, 504))).kind).toBe(
    'uncertain'
  );
  expect(await readPublishResponse(json({ data: null, error: { code: 'publish_failed', message: 'Bad slug' } }, 502))).toEqual({
    kind: 'failed',
    message: 'Bad slug',
  });
  expect((await readPublishResponse(new Response('Unauthorized', { status: 401 }))).kind).toBe('failed');
  const ok = await readPublishResponse(json({ data: { warnings: ['w'], internalLinks: { insertedCount: 2 } }, error: null }));
  expect(ok).toEqual({ kind: 'success', data: { warnings: ['w'], internalLinks: { insertedCount: 2 } } });
});

test('client: the button is always released and double clicks are ignored', () => {
  const control = read('components/wordpress/publish-control.tsx');
  expect(control).toContain('requestPublish(fetch,');
  expect(control).not.toContain('await res.json()');
  const finallyBlock = control.slice(control.indexOf('} finally {'));
  expect(finallyBlock).toContain('inFlight.current = false;');
  expect(finallyBlock).toContain('setLoading(false);');
  expect(finallyBlock).toContain('router.refresh();');
  expect(control.match(/if \(inFlight\.current\) return;/g)).toHaveLength(2);
});

// ================================================================ route + logs

test('route: lock, immediate id save, 409 / 504 responses, release on every end', () => {
  const route = read('app/api/wordpress/[id]/publish/route.ts');
  expect(route).toContain(`export const maxDuration = ${PUBLISH_MAX_DURATION_SECONDS};`);
  expect(route).toContain('acquirePublishLock(supabase, article.id)');
  expect(route).toContain("code: 'publish_in_progress'");
  expect(route).toContain('{ status: 409 }');
  expect(route).toContain("code: 'publish_uncertain'");
  expect(route).toContain('onPostId: persistPostId');
  expect(route).toContain('isWordPressPostIdClaimed(supabase');
  // Every terminal write releases the lock and never drops a known id.
  const updates = [...route.matchAll(/\.update\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]);
  const terminal = updates.filter((u) => /publish_status/.test(u));
  expect(terminal.length).toBe(3);
  for (const u of terminal) expect(u).toContain('...lockRelease');
  for (const u of terminal) expect(u).toMatch(/wp_post_id: (knownPostId|postResult\.id)/);
});

test('logs: attempt id, step, duration, HTTP status, post id — never credentials or content', async () => {
  const lines: string[] = [];
  const originalInfo = console.info;
  const originalWarn = console.warn;
  console.info = (...args: unknown[]) => lines.push(args.join(' '));
  console.warn = (...args: unknown[]) => lines.push(args.join(' '));
  try {
    site = installFakeSite({ createFault: { fault: 'timeout', commit: true }, rankMath: 'http403' });
    const log = createPublishLogger({ attemptId: 'attempt-1', generationId: 'gen-1', articleId: 'article-1' });
    await sendArticleToWordPress(SITE, { ...input({ html: '<p>SECRET-ARTICLE-BODY</p>' }), log });
  } finally {
    console.info = originalInfo;
    console.warn = originalWarn;
  }
  const text = lines.join('\n');
  for (const step of ['tags', 'reconcile_before_create', 'post_create', 'reconcile_after_create', 'post_update', 'rank_math']) {
    expect(text).toMatch(new RegExp(`attempt=attempt-1 generation=gen-1 article=article-1 step=${step} ms=\\d+`));
  }
  expect(text).toMatch(/step=post_create ms=\d+ result=timeout/);
  expect(text).toMatch(/step=reconcile_after_create ms=\d+ wp_post_id=\d+ count=1 result=found/);
  expect(text).toMatch(/step=rank_math ms=\d+ http=403 wp_post_id=\d+ result=failed/);
  expect(text).not.toContain(SITE.password);
  expect(text).not.toContain(Buffer.from(`${SITE.username}:${SITE.password}`).toString('base64'));
  expect(text).not.toContain('SECRET-ARTICLE-BODY');
  expect(formatPublishLogLine({ attemptId: 'a' }, 'x', { result: 'bad value\nwith <html>' })).not.toMatch(/[\n<>]/);
});

// ================================================================ migration

test('migration 042 only adds a nullable publish_started_at, and is the only 042', () => {
  const migrations = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.startsWith('042_'));
  expect(migrations).toEqual(['042_add_wordpress_publish_lock.sql']);
  const sql = read('supabase/migrations/042_add_wordpress_publish_lock.sql')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim();
  expect(sql).toBe('ALTER TABLE wordpress_articles\nADD COLUMN publish_started_at timestamptz;');
});
