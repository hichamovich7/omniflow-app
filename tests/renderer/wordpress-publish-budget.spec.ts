import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import { exportToHtmlForWordPress } from '@/lib/wordpress/export';
import {
  createPublishBudget,
  mapWithConcurrency,
  PUBLISH_FINALIZE_RESERVE_MS,
  PUBLISH_RECONCILE_RESERVE_MS,
  PUBLISH_SAFETY_MARGIN_MS,
  withDeadline,
  type PublishBudget,
} from '@/lib/wordpress/publish-budget';
import { PUBLISH_MAX_DURATION_SECONDS } from '@/lib/wordpress/publish-lock';
import {
  applyMediaReplacements,
  FEATURED_IMAGE_FAILED_WARNING,
  internalImagesFallbackWarning,
  MEDIA_UPLOAD_CONCURRENCY,
  planInternalMedia,
  type PublishMediaPlan,
} from '@/lib/wordpress/publish-media';
import {
  FAQ_SCHEMA_TIME_LIMIT_WARNING,
  INTERNAL_LINKS_TIME_LIMIT_WARNING,
  RANK_MATH_TIME_LIMIT_WARNING,
  sendArticleToWordPress,
  TAGS_TIME_LIMIT_WARNING,
  WordPressPublishUncertainError,
  type SendArticleInput,
} from '@/lib/wordpress/publish-post';
import {
  describePublishSuccess,
  PUBLISH_UNCERTAIN_MESSAGE,
  readPublishResponse,
  requestPublish,
} from '@/lib/wordpress/publish-outcome';
import { isUncertainWordPressError, WORDPRESS_TIMEOUTS_MS, WordPressApiError, type WordPressSiteCredentials } from '@/lib/wordpress/rest-client';

/**
 * TASK-FIX-059 — WordPress publish time budget. Offline: WordPress is a
 * stubbed global fetch whose routes answer after real, abortable delays; the
 * budget is scaled down (3 s instead of 60 s) so every case runs fast. No
 * network, no database, no AI call.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const SITE: WordPressSiteCredentials = { siteUrl: 'https://blog.example.test', username: 'editor', password: 'abcd EFGH ijkl MNOP' };
const BASE = 'https://blog.example.test/wp-json';
const TITLE = 'Wohnzimmer gemütlich einrichten: 12 Ideen';
const SLUG = 'wohnzimmer-gemuetlich-einrichten';
const IMG = (n: number) => `https://storage.test/articles/a1/image-${n}.png`;
const SCRIPT = '<script type="application/ld+json">{"@type":"FAQPage"}</script>';

// Scaled budget: end 2.9 s, finish 2.7 s, post 2.4 s, preparation 1.6 s.
const SCALE = {
  maxDurationMs: 3000,
  safetyMarginMs: 100,
  finalizeReserveMs: 200,
  reconcileReserveMs: 300,
  postWriteMs: 800,
  minCallMs: 50,
  minWriteMs: 150,
};
const END_MS = SCALE.maxDurationMs - SCALE.safetyMarginMs;
const PREPARE_MS = END_MS - SCALE.finalizeReserveMs - SCALE.reconcileReserveMs - SCALE.postWriteMs;
const SLOW = 6000;

function budget(overrides: Partial<typeof SCALE> & { startedAt?: number } = {}): PublishBudget {
  return createPublishBudget({ ...SCALE, ...overrides });
}

// ---------------------------------------------------------------- fake site

interface SlowSite {
  /** Delay of the media POST per filename suffix ('featured', '1', '2', …). */
  media?: Record<string, number>;
  tagMs?: number;
  linksMs?: number;
  createMs?: number;
  rankMathMs?: number;
  lookupMs?: number;
  kses?: boolean;
  posts?: { id: number; slug: string; title: string; status: string; content: string }[];
}

function installSlowSite(options: SlowSite = {}) {
  const posts = (options.posts ?? []).map((p) => ({ ...p, featured_media: 0 }));
  const calls: { method: string; path: string; body?: Record<string, unknown> }[] = [];
  const pending = new Set<() => void>();
  let mediaInFlight = 0;
  let maxMediaInFlight = 0;
  let nextPostId = 700;
  let nextMediaId = 300;
  const original = globalThis.fetch;

  const sleep = (ms: number, signal?: AbortSignal | null) =>
    new Promise<void>((resolve, reject) => {
      if (!ms) return resolve();
      const abort = () => {
        clearTimeout(timer);
        pending.delete(cancel);
        reject(signal?.reason ?? new DOMException('aborted', 'AbortError'));
      };
      const cancel = () => {
        clearTimeout(timer);
        reject(new DOMException('test ended', 'AbortError'));
      };
      const timer = setTimeout(() => {
        pending.delete(cancel);
        signal?.removeEventListener('abort', abort);
        resolve();
      }, ms);
      pending.add(cancel);
      signal?.addEventListener('abort', abort, { once: true });
    });

  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  const toJson = (p: (typeof posts)[number]) => ({
    id: p.id,
    slug: p.slug,
    status: p.status,
    link: `https://blog.example.test/?p=${p.id}`,
    title: { raw: p.title, rendered: p.title },
    content: { raw: p.content },
    featured_media: p.featured_media,
  });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const signal = init?.signal;
    if (url.startsWith('https://storage.test/')) {
      return new Response(Buffer.from('png'), { headers: { 'content-type': 'image/png' } });
    }
    const path = url.replace(BASE, '');
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    calls.push({ method, path, body });

    if (method === 'POST' && path.startsWith('/wp/v2/media') && !/\/media\/\d+/.test(path)) {
      const headers = init?.headers as Record<string, string>;
      const filename = /filename="([^"]+)"/.exec(headers['Content-Disposition'])?.[1] ?? '';
      const key = /-([^-]+)\.png$/.exec(filename)?.[1] ?? '';
      mediaInFlight++;
      maxMediaInFlight = Math.max(maxMediaInFlight, mediaInFlight);
      try {
        await sleep(options.media?.[key] ?? 0, signal);
      } finally {
        mediaInFlight--;
      }
      const id = nextMediaId++;
      return json({ id, source_url: `https://blog.example.test/wp-content/uploads/${filename}`, alt_text: new URL(url).searchParams.get('alt_text') ?? '' }, 201);
    }
    if (method === 'GET' && path.startsWith('/wp/v2/posts?') && path.includes('slug=')) {
      await sleep(options.lookupMs ?? 0, signal);
      const slug = new URL(url).searchParams.get('slug');
      return json(posts.filter((p) => p.slug === slug).map(toJson));
    }
    if (method === 'GET' && path.startsWith('/wp/v2/posts?')) {
      await sleep(options.linksMs ?? 0, signal);
      return json([]);
    }
    if (method === 'GET' && path.startsWith('/wp/v2/tags?')) {
      await sleep(options.tagMs ?? 0, signal);
      return json([]);
    }
    if (method === 'POST' && path === '/wp/v2/tags') {
      await sleep(options.tagMs ?? 0, signal);
      return json({ id: 900 + calls.length, name: body?.name }, 201);
    }
    const content = (value: unknown) =>
      options.kses ? String(value).replace(/<\/?script[^>]*>/g, '') : String(value);
    if (method === 'POST' && path === '/wp/v2/posts') {
      await sleep(options.createMs ?? 0, signal);
      const post = {
        id: nextPostId++,
        slug: String(body?.slug),
        title: String(body?.title),
        status: String(body?.status),
        content: content(body?.content),
        featured_media: Number(body?.featured_media ?? 0),
      };
      posts.push(post);
      return json(toJson(post), 201);
    }
    const update = /^\/wp\/v2\/posts\/(\d+)$/.exec(path);
    if (method === 'POST' && update) {
      const post = posts.find((p) => p.id === Number(update[1]));
      if (!post) return json({ code: 'rest_post_invalid_id', message: 'Invalid post ID.' }, 404);
      post.title = String(body?.title);
      post.status = String(body?.status);
      post.content = content(body?.content);
      if (body?.featured_media !== undefined) post.featured_media = Number(body.featured_media);
      return json(toJson(post));
    }
    if (method === 'GET' && path === '/rankmath/v1') {
      await sleep(options.rankMathMs ?? 0, signal);
      return json({ routes: { '/rankmath/v1/updateMeta': { methods: ['POST'] } } });
    }
    if (method === 'POST' && path === '/rankmath/v1/updateMeta') return json(true);
    return json({ code: 'unexpected', message: `${method} ${path}` }, 500);
  }) as typeof fetch;

  return {
    posts,
    calls,
    creates: () => calls.filter((c) => c.method === 'POST' && c.path === '/wp/v2/posts'),
    updatesTo: (id: number) => calls.filter((c) => c.method === 'POST' && c.path === `/wp/v2/posts/${id}`),
    maxMediaInFlight: () => maxMediaInFlight,
    restore: () => {
      for (const cancel of pending) cancel();
      pending.clear();
      globalThis.fetch = original;
    },
  };
}

let site: ReturnType<typeof installSlowSite> | undefined;
test.afterEach(() => {
  site?.restore();
  site = undefined;
});

const MARKDOWN = [
  `# ${TITLE}`,
  '',
  'Ein gemütliches Wohnzimmer beginnt mit Licht.',
  '',
  `![Sofa](${IMG(1)})`,
  '',
  'Textilien bringen Wärme.',
  '',
  `![Decke](${IMG(2)})`,
  '',
  `![Lampe](${IMG(3)})`,
].join('\n');

/** The route's preparation: tokens in the content, HTML export, media plan. */
function prepared(options: { featured?: boolean; images?: number } = {}) {
  const count = options.images ?? 3;
  const images = Array.from({ length: count }, (_, i) => ({ url: IMG(i + 1), filename: `${SLUG}-${i + 1}.png`, altText: `Bild ${i + 1}` }));
  const plan = planInternalMedia(MARKDOWN, images);
  const media: PublishMediaPlan = {
    featured: options.featured === false ? null : { url: IMG(0), filename: `${SLUG}-featured.png`, altText: TITLE },
    internal: plan.internal,
  };
  return { html: exportToHtmlForWordPress({ content: plan.content }), media };
}

function input(overrides: Partial<SendArticleInput> = {}): SendArticleInput {
  const { html, media } = prepared();
  return {
    article: { id: 'article-1', title: TITLE, meta_title: 'Wohnzimmer – 12 Ideen', slug: SLUG, meta_description: 'So geht es.', wp_post_id: null },
    generation: {
      keyword: 'Wohnzimmer gemütlich einrichten',
      source_type: 'keyword',
      seo_keywords: 'Deko, Licht, Textilien, Sofa, Teppich, Kissen, Lampe',
      status: 'completed',
    },
    html,
    media,
    status: 'publish',
    insertInternalLinks: true,
    ...overrides,
  };
}

async function timed<T>(run: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t = Date.now();
  const value = await run();
  return { value, ms: Date.now() - t };
}

// ================================================================ budget math

test('budget: derived from maxDuration — preparation, post and finish deadlines leave the post its slot', () => {
  const start = 1_000_000;
  const b = createPublishBudget({ startedAt: start, now: () => start });
  const end = start + PUBLISH_MAX_DURATION_SECONDS * 1000 - PUBLISH_SAFETY_MARGIN_MS;
  expect(b.finishDeadline).toBe(end - PUBLISH_FINALIZE_RESERVE_MS);
  expect(b.postDeadline).toBe(b.finishDeadline - PUBLISH_RECONCILE_RESERVE_MS);
  expect(b.prepareDeadline).toBe(b.postDeadline - WORDPRESS_TIMEOUTS_MS.postWrite);
  // 60 s route: preparation ≤ 25 s, post ≤ 45 s, secondary steps ≤ 51 s.
  expect(b.prepareDeadline - start).toBe(25_000);
  expect(b.postDeadline - start).toBe(45_000);
  expect(b.finishDeadline - start).toBe(51_000);
  // The whole post write fits between the preparation and post deadlines.
  expect(b.postDeadline - b.prepareDeadline).toBeGreaterThanOrEqual(WORDPRESS_TIMEOUTS_MS.postWrite);
});

test('budget: limiter caps to the time left and refuses to start a call below the minimum', () => {
  let now = 0;
  const b = createPublishBudget({ ...SCALE, startedAt: 0, now: () => now });
  const limit = b.limiter(b.prepareDeadline);
  expect(limit(25_000)).toBe(PREPARE_MS);
  now = PREPARE_MS - 500;
  expect(limit(25_000)).toBe(500);
  expect(limit(200)).toBe(200);
  now = PREPARE_MS - 10;
  expect(limit(25_000)).toBe(0);
  // A write needs its own minimum: 810 ms left is enough at 500, not at 1000.
  expect(b.limiter(b.postDeadline, 500)(25_000)).toBe(b.postDeadline - now);
  expect(b.limiter(b.postDeadline, 1000)(25_000)).toBe(0);
});

test('helpers: concurrency is capped and order kept; withDeadline gives up without throwing', async () => {
  let inFlight = 0;
  let peak = 0;
  const results = await mapWithConcurrency([5, 1, 4, 2, 3, 0], 3, async (n, i) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, n * 10));
    inFlight--;
    if (i === 3) throw new Error('boom');
    return n * 2;
  });
  expect(peak).toBe(3);
  expect(results.map((r) => (r.status === 'fulfilled' ? r.value : 'x'))).toEqual([10, 2, 8, 'x', 6, 0]);

  const late = new Promise<string>((r) => setTimeout(() => r('late'), 300));
  expect(await withDeadline(late, Date.now() + 30)).toEqual({ timedOut: true });
  expect(await withDeadline(Promise.resolve('ok'), Date.now() + 30)).toEqual({ timedOut: false, value: 'ok' });
  expect(await withDeadline(Promise.resolve('ok'), Date.now() - 1)).toEqual({ timedOut: true });
});

test('a write never sent for lack of time is a known outcome, never "uncertain"', () => {
  expect(isUncertainWordPressError(new WordPressApiError('x', undefined, 'budget'))).toBe(false);
  expect(isUncertainWordPressError(new WordPressApiError('x', undefined, 'timeout'))).toBe(true);
});

// ================================================================ media

test('media plan: tokens replace internal image URLs, every token resolves (uploaded or original), never a prefix clash', () => {
  const images = Array.from({ length: 12 }, (_, i) => ({ url: IMG(i + 1), filename: `f-${i + 1}.png`, altText: null }));
  const content = images.map((img) => `![x](${img.url})`).join('\n') + `\n![again](${IMG(1)})\n`;
  const plan = planInternalMedia(content + '', [...images, { url: 'https://storage.test/not-in-content.png', filename: 'n.png', altText: null }]);
  expect(plan.internal).toHaveLength(12);
  for (const img of images) expect(plan.content).not.toContain(img.url);

  const html = exportToHtmlForWordPress({ content: plan.content });
  const replacements = new Map([[plan.internal[0].token, 'https://wp.test/1.png']]);
  const final = applyMediaReplacements(html, plan.internal, replacements);
  expect(final).not.toContain('omniflow-media.invalid');
  expect(final.match(/https:\/\/wp\.test\/1\.png/g)).toHaveLength(2);
  expect(final).toContain(IMG(11));
  expect(final).toContain(IMG(12));
});

test('featured image slow but within the budget: uploaded, set as featured_media, no warning', async () => {
  site = installSlowSite({ media: { featured: 700 } });
  const { value: result, ms } = await timed(() => sendArticleToWordPress(SITE, { ...input(), budget: budget() }));
  expect(site.creates()).toHaveLength(1);
  expect(site.creates()[0].body?.featured_media).toBeGreaterThan(0);
  expect(result.warnings).not.toContain(FEATURED_IMAGE_FAILED_WARNING);
  expect(ms).toBeLessThan(END_MS);
});

test('featured image times out: the post is created without featured_media, with the warning', async () => {
  site = installSlowSite({ media: { featured: SLOW } });
  const rec: number[] = [];
  const { value: result, ms } = await timed(() =>
    sendArticleToWordPress(SITE, { ...input(), budget: budget(), onPostId: async (id) => void rec.push(id) })
  );
  expect(site.creates()).toHaveLength(1);
  expect(site.creates()[0].body).not.toHaveProperty('featured_media');
  expect(result.warnings).toContain(FEATURED_IMAGE_FAILED_WARNING);
  expect(rec).toEqual([result.post.id]);
  // Bounded by the preparation deadline, not by the 25 s upload timeout.
  expect(ms).toBeLessThan(PREPARE_MS + 600);
  expect(describePublishSuccess('now', result.warnings).headline).toBe('Published, but the featured image could not be uploaded.');
});

test('internal images: at most 3 uploads in flight; a slow one keeps its Storage URL, the others are replaced', async () => {
  site = installSlowSite({ media: { featured: 200, '1': 200, '2': SLOW, '3': 200 } });
  const result = await sendArticleToWordPress(SITE, { ...input(), budget: budget() });
  expect(site.maxMediaInFlight()).toBeLessThanOrEqual(MEDIA_UPLOAD_CONCURRENCY);
  const sent = String(site.creates()[0].body?.content);
  expect(sent).toContain(`/wp-content/uploads/${SLUG}-1.png`);
  expect(sent).toContain(IMG(2));
  expect(sent).toContain(`/wp-content/uploads/${SLUG}-3.png`);
  expect(sent).not.toContain('omniflow-media.invalid');
  expect(result.warnings).toContain(internalImagesFallbackWarning(1));
  expect(result.warnings).not.toContain(FEATURED_IMAGE_FAILED_WARNING);
});

// ================================================================ tags + links

test('tags slow: the post is still created in time, tags not tried are reported as skipped', async () => {
  site = installSlowSite({ tagMs: SLOW });
  const { value: result, ms } = await timed(() => sendArticleToWordPress(SITE, { ...input(), budget: budget() }));
  expect(site.creates()).toHaveLength(1);
  expect(site.creates()[0].body).not.toHaveProperty('tags');
  expect(result.warnings).toContain(TAGS_TIME_LIMIT_WARNING);
  expect(ms).toBeLessThan(END_MS);
});

test('internal links slow: skipped with a warning, HTML sent without new links, post created in time', async () => {
  site = installSlowSite({ linksMs: SLOW });
  const { value: result, ms } = await timed(() => sendArticleToWordPress(SITE, { ...input(), budget: budget() }));
  expect(site.creates()).toHaveLength(1);
  expect(result.internalLinks.status).toBe('skipped');
  expect(result.warnings).toContain(INTERNAL_LINKS_TIME_LIMIT_WARNING);
  expect(describePublishSuccess('now', result.warnings).headline).toBe(
    'Published, but internal links were skipped because the time limit was reached.'
  );
  expect(ms).toBeLessThan(PREPARE_MS + 600);
});

test('internal links run in parallel with the media uploads', async () => {
  site = installSlowSite({ media: { featured: 500, '1': 500, '2': 500, '3': 500 }, linksMs: 500 });
  const { ms } = await timed(() => sendArticleToWordPress(SITE, { ...input(), budget: budget() }));
  // Sequential would be ≥ 2 media waves (1 s) + 0.5 s of links.
  expect(ms).toBeLessThan(1400);
});

test('everything optional is slow: the post is still created before expiry, nothing marked failed', async () => {
  site = installSlowSite({ media: { featured: SLOW, '1': SLOW, '2': SLOW, '3': SLOW }, tagMs: SLOW, linksMs: SLOW, rankMathMs: SLOW });
  const rec: number[] = [];
  const { value: result, ms } = await timed(() =>
    sendArticleToWordPress(SITE, { ...input(), budget: budget(), onPostId: async (id) => void rec.push(id) })
  );
  expect(site.creates()).toHaveLength(1);
  expect(rec).toEqual([result.post.id]);
  expect(ms).toBeLessThan(END_MS);
  expect(result.warnings).toEqual(
    expect.arrayContaining([
      TAGS_TIME_LIMIT_WARNING,
      INTERNAL_LINKS_TIME_LIMIT_WARNING,
      RANK_MATH_TIME_LIMIT_WARNING,
      FEATURED_IMAGE_FAILED_WARNING,
      internalImagesFallbackWarning(3),
    ])
  );
  const headline = describePublishSuccess('now', result.warnings).headline;
  expect(headline).toBe(`Published to WordPress with ${result.warnings.length} warnings.`);
});

// ================================================================ post + secondary

test('budget already exhausted before creation: nothing sent, a real (not uncertain) failure', async () => {
  site = installSlowSite();
  const error = await sendArticleToWordPress(SITE, { ...input(), budget: budget({ startedAt: Date.now() - END_MS }) }).catch((e) => e);
  expect(error).toBeInstanceOf(WordPressApiError);
  expect(error).not.toBeInstanceOf(WordPressPublishUncertainError);
  expect(error.kind).toBe('budget');
  expect(site.creates()).toHaveLength(0);
});

test('Rank Math slow: the id is saved first, the publish succeeds with an explicit warning', async () => {
  site = installSlowSite({ rankMathMs: SLOW });
  const rec: { id: number; at: number }[] = [];
  const result = await sendArticleToWordPress(SITE, {
    ...input(),
    budget: budget(),
    onPostId: async (id) => void rec.push({ id, at: site!.calls.length }),
  });
  expect(rec.map((r) => r.id)).toEqual([result.post.id]);
  expect(rec[0].at).toBeLessThanOrEqual(site.calls.findIndex((c) => c.path.startsWith('/rankmath')));
  expect(result.rankMath.status).toBe('failed');
  expect(result.warnings).toContain(RANK_MATH_TIME_LIMIT_WARNING);
});

test('FAQ schema filtered with no time left to re-send: post kept, id kept, explicit warning; the retry fixes it', async () => {
  // Post written by ~2.0 s (post deadline 2.4 s); ~0.7 s left before the
  // finish deadline is below the 1 s minimum for a write.
  site = installSlowSite({ kses: true, createMs: 2000 });
  const rec: number[] = [];
  const result = await sendArticleToWordPress(SITE, {
    ...input({ faqSchema: SCRIPT }),
    budget: budget({ minWriteMs: 1000 }),
    onPostId: async (id) => void rec.push(id),
  });
  expect(site.updatesTo(result.post.id)).toHaveLength(0);
  expect(result.warnings).toContain(FAQ_SCHEMA_TIME_LIMIT_WARNING);
  expect(rec).toEqual([result.post.id]);

  site.restore();
  const posts = site.posts;
  site = installSlowSite({ kses: true, posts });
  const retry = await sendArticleToWordPress(SITE, {
    ...input({ faqSchema: SCRIPT, article: { ...input().article, wp_post_id: result.post.id } }),
    budget: budget(),
  });
  expect(site.creates()).toHaveLength(0);
  expect(retry.post.id).toBe(result.post.id);
  expect(retry.faqSchema).toBe('removed');
});

test('retry after a publish without featured image: updates the same post, no duplicate, existing featured image untouched', async () => {
  site = installSlowSite({ media: { featured: SLOW } });
  const first = await sendArticleToWordPress(SITE, { ...input(), budget: budget() });
  site.restore();
  const posts = site.posts;
  posts[0].featured_media = 55; // set by hand on WordPress meanwhile
  site = installSlowSite({ posts, media: { featured: SLOW } });
  const retry = await sendArticleToWordPress(SITE, {
    ...input({ article: { ...input().article, wp_post_id: first.post.id } }),
    budget: budget(),
  });
  expect(site.creates()).toHaveLength(0);
  expect(retry.post.id).toBe(first.post.id);
  expect(site.updatesTo(first.post.id)[0].body).not.toHaveProperty('featured_media');
  expect(posts.find((p) => p.id === first.post.id)?.featured_media).toBe(55);
  expect(posts).toHaveLength(1);
});

test('a post OmniFlow already created is adopted under budget (reconciliation kept): no duplicate', async () => {
  site = installSlowSite({ posts: [{ id: 41, slug: SLUG, title: TITLE, status: 'draft', content: 'old' }], media: { featured: SLOW } });
  const result = await sendArticleToWordPress(SITE, { ...input(), budget: budget() });
  expect(site.creates()).toHaveLength(0);
  expect(result.post.id).toBe(41);
});

test('Keyword, Pins and URL methods under the budget: one creation each, focus keyword unchanged', async () => {
  const cases: [SendArticleInput['generation'], SendArticleInput['pins'], string][] = [
    [{ keyword: 'Wohnzimmer gemütlich einrichten', source_type: 'keyword', seo_keywords: 'Deko', status: 'completed' }, null, 'Wohnzimmer gemütlich einrichten'],
    [{ keyword: 'Pin A + Pin B', source_type: 'pins', seo_keywords: null, status: 'completed' }, { sourceKeyword: 'Boho Wohnzimmer', pinKeywords: ['Rattan'] }, 'Boho Wohnzimmer'],
    [{ keyword: 'Wohnzimmer Ideen', source_type: 'url', seo_keywords: 'Deko', status: 'completed' }, null, 'Wohnzimmer Ideen'],
  ];
  for (const [generation, pins, keyword] of cases) {
    site = installSlowSite({ media: { featured: SLOW } });
    const result = await sendArticleToWordPress(SITE, { ...input({ generation, pins }), budget: budget() });
    expect(site.creates()).toHaveLength(1);
    expect(result.focusKeyword.keyword).toBe(keyword);
    expect(result.rankMath.status).toBe('saved');
    site.restore();
  }
  site = undefined;
});

// ================================================================ client + route

test('client: success, success with warnings, uncertain and failure are told apart', async () => {
  expect(describePublishSuccess('now', [])).toEqual({ headline: 'Published to WordPress', details: [] });
  expect(describePublishSuccess('draft', [])).toEqual({ headline: 'Saved as draft on WordPress', details: [] });
  expect(describePublishSuccess('schedule', ['Rank Math was not detected.'])).toEqual({
    headline: 'Scheduled on WordPress with 1 warning.',
    details: ['Rank Math was not detected.'],
  });
  expect(describePublishSuccess('now', ['a', 'b']).headline).toBe('Published to WordPress with 2 warnings.');

  expect(PUBLISH_UNCERTAIN_MESSAGE).toBe('Publication status is uncertain. Check WordPress before retrying.');
  expect(await readPublishResponse(new Response('<html>FUNCTION_INVOCATION_TIMEOUT</html>', { status: 504 }))).toEqual({
    kind: 'uncertain',
    message: PUBLISH_UNCERTAIN_MESSAGE,
  });
  const network = await requestPublish(
    (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch,
    '/api/wordpress/x/publish',
    { mode: 'now' }
  );
  expect(network.kind).toBe('uncertain');
  const failed = await readPublishResponse(
    new Response(JSON.stringify({ data: null, error: { code: 'publish_failed', message: 'Not enough time left to send the post to WordPress.' } }), {
      status: 502,
    })
  );
  expect(failed).toEqual({ kind: 'failed', message: 'Not enough time left to send the post to WordPress.' });

  const control = read('components/wordpress/publish-control.tsx');
  expect(control).toContain('describePublishSuccess(mode, warnings)');
  const finallyBlock = control.slice(control.indexOf('} finally {'));
  expect(finallyBlock).toContain('setLoading(false);');
  expect(finallyBlock).toContain('router.refresh();');
});

test('route: budget from maxDuration, media planned not uploaded inline, lock released in finally, failed only before the post', () => {
  const route = read('app/api/wordpress/[id]/publish/route.ts');
  expect(route).toContain('createPublishBudget({ startedAt: requestStartedAt, maxDurationMs: maxDuration * 1000 })');
  expect(route).toContain(`export const maxDuration = ${PUBLISH_MAX_DURATION_SECONDS};`);
  expect(route).not.toMatch(/\buploadMedia\(/);
  expect(route).toContain('planInternalMedia(');
  expect(route).toMatch(/media,\s+budget,\s+insertInternalLinks: true,/);
  // No featured-image failure path any more.
  expect(route).not.toContain('Failed to upload the featured image');
  // The release-error path logs and never returns its own response.
  const finallyBlock = route.slice(route.lastIndexOf('} finally {'));
  expect(finallyBlock).not.toContain('return ');
  expect(finallyBlock).toContain("log.warn('lock_release'");
  // maxDuration unchanged (no Vercel configuration was verified for more).
  expect(PUBLISH_MAX_DURATION_SECONDS).toBe(60);
});
