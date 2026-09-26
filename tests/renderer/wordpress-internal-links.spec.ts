import { expect, test } from 'playwright/test';
import {
  addInternalLinks,
  fetchInternalLinkCandidates,
  ignoredUrlsWarning,
  insertInternalLinks,
  INTERNAL_LINKS_FAILED_WARNING,
  INTERNAL_LINKS_PARTIAL_WARNING,
  MAX_LINKS_LONGER_ARTICLE,
  MAX_LINKS_SHORT_ARTICLE,
  maxInternalLinks,
  toAllowedInternalUrl,
  type InternalLinkCandidate,
  type InternalLinkContext,
} from '@/lib/wordpress/internal-links';
import { sendArticleToWordPress, type SendArticleInput } from '@/lib/wordpress/publish-post';
import type { WordPressSiteCredentials } from '@/lib/wordpress/rest-client';

/**
 * Automatic internal links (TASK-FIX-051). Offline: WordPress is a stubbed
 * global fetch — no network, no database, no AI call.
 */

const SITE: WordPressSiteCredentials = {
  siteUrl: 'https://blog.example.test/',
  username: 'editor',
  password: 'abcd EFGH ijkl MNOP',
};
const BASE = 'https://blog.example.test/wp-json';

interface RawPost {
  id: number;
  link: string;
  slug: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  categories: number[];
  tags: number[];
  status: string;
}

function post(id: number, title: string, extra: Partial<Omit<RawPost, 'title'>> & { excerpt?: string } = {}): RawPost {
  const slug = extra.slug ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id,
    link: extra.link ?? `https://blog.example.test/${slug}/`,
    slug,
    title: { rendered: title },
    excerpt: { rendered: `<p>${extra.excerpt ?? ''}</p>` },
    categories: extra.categories ?? [],
    tags: extra.tags ?? [],
    status: extra.status ?? 'publish',
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

interface FakeSite {
  posts?: RawPost[];
  perPage?: number;
  failPostsList?: boolean;
  failPage?: number;
  unreachable?: boolean;
}

interface Call {
  method: string;
  url: string;
  body: unknown;
}

function installFakeSite(fake: FakeSite = {}) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  const all = fake.posts ?? [];
  let nextPostId = 500;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    const path = url.replace(BASE, '');

    if (method === 'GET' && path.startsWith('/wp/v2/posts?')) {
      if (fake.unreachable) throw new TypeError('fetch failed');
      if (fake.failPostsList) return json({ code: 'rest_forbidden', message: 'Sorry' }, 500);
      const params = new URL(url).searchParams;
      const page = Number(params.get('page'));
      if (fake.failPage === page) return json({ code: 'boom', message: 'Server error' }, 500);
      const perPage = fake.perPage ?? Number(params.get('per_page'));
      const totalPages = Math.max(1, Math.ceil(all.length / perPage));
      return json(all.slice((page - 1) * perPage, page * perPage), 200, { 'X-WP-TotalPages': String(totalPages) });
    }
    if (method === 'GET' && path.startsWith('/wp/v2/tags?')) return json([]);
    if (method === 'POST' && path === '/wp/v2/tags') return json({ id: 900 + calls.length, name: (body as { name: string }).name }, 201);
    if (method === 'POST' && path.startsWith('/wp/v2/posts')) {
      const id = /\/posts\/(\d+)$/.exec(path)?.[1];
      const postId = id ? Number(id) : nextPostId++;
      return json({ id: postId, link: `https://blog.example.test/?p=${postId}`, status: (body as { status: string }).status });
    }
    if (method === 'GET' && path === '/rankmath/v1') return json({ code: 'rest_no_route', message: 'No route' }, 404);
    return json({ code: 'unexpected', message: `${method} ${path}` }, 500);
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
    listCalls: () => calls.filter((c) => c.method === 'GET' && c.url.includes('/wp/v2/posts?')),
    sentContent: () => (calls.find((c) => c.method === 'POST' && c.url.includes('/wp/v2/posts'))?.body as { content: string })?.content,
  };
}

let site: ReturnType<typeof installFakeSite> | undefined;
test.afterEach(() => {
  site?.restore();
  site = undefined;
});

function context(overrides: Partial<InternalLinkContext> = {}): InternalLinkContext {
  return {
    primaryKeyword: 'cozy living room',
    seoKeywords: ['living room decor', 'reading nook'],
    title: 'Cozy Living Room Ideas for Small Apartments',
    categoryIds: [7],
    tagIds: [],
    articleSize: 'medium',
    excludePostId: null,
    excludeSlug: null,
    ...overrides,
  };
}

function candidate(id: number, title: string, extra: Partial<InternalLinkCandidate> = {}): InternalLinkCandidate {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id,
    url: `https://blog.example.test/${slug}/`,
    slug,
    title,
    excerpt: '',
    categories: [],
    tags: [],
    ...extra,
  };
}

const ARTICLE_HTML = [
  '<p>A cozy living room starts with warm light and soft textiles.</p>',
  '<h2>Living room decor that feels warm</h2>',
  '<p>Good living room decor mixes wood, wool and plants.</p>',
  '<p>A small reading nook near the window changes everything.</p>',
  '<p><img src="https://cdn.example.test/reading-nook.png" alt="reading nook by the window"></p>',
  '<p>Plants add life. See <a href="https://other.example.com/plants">this guide on indoor plants</a> for care tips.</p>',
  '<h2>Frequently Asked Questions</h2>',
  '<h3>How do I choose living room decor?</h3>',
  '<p>Pick living room decor that matches your light.</p>',
].join('\n');

function hrefs(html: string): string[] {
  return [...html.matchAll(/<a href="([^"]*)"/g)].map((m) => m[1]);
}

// ---------------------------------------------------------------------------

test.describe('fetching published WordPress posts', () => {
  test('requests published posts with summary fields only, never the content', async () => {
    site = installFakeSite({ posts: [post(1, 'Living Room Decor Basics')] });
    const { candidates } = await fetchInternalLinkCandidates(SITE, { postId: null, slug: null });
    const url = new URL(site.listCalls()[0].url);
    expect(url.pathname).toBe('/wp-json/wp/v2/posts');
    expect(url.searchParams.get('status')).toBe('publish');
    expect(url.searchParams.get('_fields')).toBe('id,link,slug,title,excerpt,categories,tags,status');
    expect(url.searchParams.get('_fields')).not.toContain('content');
    expect(candidates).toEqual([
      {
        id: 1,
        url: 'https://blog.example.test/living-room-decor-basics/',
        slug: 'living-room-decor-basics',
        title: 'Living Room Decor Basics',
        excerpt: '',
        categories: [],
        tags: [],
      },
    ]);
  });

  test('keeps only published posts and decodes rendered titles', async () => {
    site = installFakeSite({
      posts: [post(1, 'Tom &amp; Jerry&#8217;s Living Room'), post(2, 'Draft Living Room', { status: 'draft' })],
    });
    const { candidates } = await fetchInternalLinkCandidates(SITE, { postId: null, slug: null });
    expect(candidates.map((c) => c.id)).toEqual([1]);
    expect(candidates[0].title).toBe('Tom & Jerry’s Living Room');
  });

  test('stops paginating when a page is not full', async () => {
    const posts = Array.from({ length: 5 }, (_, i) => post(i + 1, `Post number ${i + 1}`));
    site = installFakeSite({ posts, perPage: 2 });
    // The fake serves 2 per page while 100 were asked: a short page is the last one.
    const { candidates } = await fetchInternalLinkCandidates(SITE, { postId: null, slug: null });
    expect(site.listCalls().map((c) => new URL(c.url).searchParams.get('page'))).toEqual(['1']);
    expect(candidates).toHaveLength(2);
  });

  test('fetches every page when WordPress reports several full pages', async () => {
    const posts = Array.from({ length: 250 }, (_, i) => post(i + 1, `Post number ${i + 1}`));
    site = installFakeSite({ posts });
    const { candidates, warnings } = await fetchInternalLinkCandidates(SITE, { postId: null, slug: null });
    expect(site.listCalls().map((c) => new URL(c.url).searchParams.get('page'))).toEqual(['1', '2', '3']);
    expect(candidates).toHaveLength(250);
    expect(warnings).toEqual([]);
  });

  test('keeps the loaded pages when a later page fails', async () => {
    const posts = Array.from({ length: 150 }, (_, i) => post(i + 1, `Post number ${i + 1}`));
    site = installFakeSite({ posts, failPage: 2 });
    const { candidates, warnings } = await fetchInternalLinkCandidates(SITE, { postId: null, slug: null });
    expect(candidates).toHaveLength(100);
    expect(warnings).toEqual([INTERNAL_LINKS_PARTIAL_WARNING]);
  });

  test('excludes the post being updated (by id and by slug)', async () => {
    site = installFakeSite({
      posts: [post(1, 'Living Room Decor Basics'), post(2, 'Cozy Living Room Ideas', { slug: 'current-slug' }), post(3, 'Reading Nook')],
    });
    const { candidates } = await fetchInternalLinkCandidates(SITE, { postId: 1, slug: 'current-slug' });
    expect(candidates.map((c) => c.id)).toEqual([3]);
  });

  test('filters external and invalid URLs with a warning', async () => {
    site = installFakeSite({
      posts: [
        post(1, 'Internal Post'),
        post(2, 'External Post', { link: 'https://evil.example.com/living-room/' }),
        post(3, 'Invalid Post', { link: 'not a url' }),
        post(4, 'Script Post', { link: 'javascript:alert(1)' }),
        post(5, 'Relative Post', { link: '/relative-path/' }),
      ],
    });
    const { candidates, warnings } = await fetchInternalLinkCandidates(SITE, { postId: null, slug: null });
    expect(candidates.map((c) => c.id)).toEqual([1]);
    expect(warnings).toEqual([ignoredUrlsWarning(4)]);
  });

  test('URL policy: same host (www-insensitive) and base path only', () => {
    expect(toAllowedInternalUrl('https://www.blog.example.test/a/', SITE.siteUrl)).toBe('https://www.blog.example.test/a/');
    expect(toAllowedInternalUrl('https://blog.example.test.evil.com/a/', SITE.siteUrl)).toBeNull();
    expect(toAllowedInternalUrl('https://blog.example.test:8443/a/', SITE.siteUrl)).toBeNull();
    expect(toAllowedInternalUrl('https://user:pw@blog.example.test/a/', SITE.siteUrl)).toBeNull();
    expect(toAllowedInternalUrl('https://example.test/blog/post/', 'https://example.test/blog')).toBe('https://example.test/blog/post/');
    expect(toAllowedInternalUrl('https://example.test/shop/post/', 'https://example.test/blog')).toBeNull();
  });
});

test.describe('selecting relevant posts', () => {
  test('selects by primary keyword', () => {
    const result = insertInternalLinks(ARTICLE_HTML, context({ seoKeywords: [] }), [
      candidate(1, 'The Cozy Living Room Checklist'),
      candidate(2, 'Garden Furniture Care'),
    ]);
    expect(result.links.map((l) => l.postId)).toEqual([1]);
    expect(result.links[0].anchor).toBe('cozy living room');
  });

  test('selects by SEO keywords', () => {
    const result = insertInternalLinks(ARTICLE_HTML, context({ primaryKeyword: null }), [
      candidate(3, 'How to Build a Reading Nook'),
      candidate(4, 'Tax Tips for Freelancers'),
    ]);
    expect(result.links.map((l) => l.postId)).toEqual([3]);
    expect(result.links[0].anchor).toBe('reading nook');
  });

  test('categories and tags raise a lexical match, never make one alone', () => {
    const ctx = context({ primaryKeyword: null, seoKeywords: [], tagIds: [40] });
    // Two shared topic words ("warm", "living") + shared category + shared tag → linked.
    const withTaxonomy = insertInternalLinks(ARTICLE_HTML, ctx, [
      candidate(5, 'Warm Light for Living Spaces', { categories: [7], tags: [40] }),
    ]);
    expect(withTaxonomy.links).toEqual([
      { postId: 5, url: 'https://blog.example.test/warm-light-for-living-spaces/', anchor: 'warm light' },
    ]);
    // Same post without shared taxonomy → below threshold.
    expect(insertInternalLinks(ARTICLE_HTML, ctx, [candidate(5, 'Warm Light for Living Spaces')]).links).toEqual([]);
    // Shared category and tag but no lexical signal → never linked.
    expect(
      insertInternalLinks(ARTICLE_HTML, ctx, [candidate(6, 'Quarterly Budget Review', { categories: [7], tags: [40] })]).links
    ).toEqual([]);
  });

  test('uses H2/H3 section titles as topic words', () => {
    const html = '<h2>Warm Textiles and Wool Throws</h2>\n<p>Wool throws make any sofa inviting.</p>';
    const ctx = context({ primaryKeyword: null, seoKeywords: [], title: 'Sofa ideas' });
    const result = insertInternalLinks(html, ctx, [candidate(7, 'Choosing Wool Throws', { categories: [7] })]);
    expect(result.links).toEqual([{ postId: 7, url: 'https://blog.example.test/choosing-wool-throws/', anchor: 'Wool throws' }]);
  });

  test('no relevant post leaves the HTML byte-for-byte unchanged', () => {
    const result = insertInternalLinks(ARTICLE_HTML, context(), [candidate(8, 'Tax Tips for Freelancers')]);
    expect(result.links).toEqual([]);
    expect(result.html).toBe(ARTICLE_HTML);
  });

  test('empty candidate list leaves the HTML unchanged', () => {
    expect(insertInternalLinks(ARTICLE_HTML, context(), [])).toEqual({ html: ARTICLE_HTML, links: [] });
  });

  test('never uses a generic anchor such as "click here"', () => {
    const html = '<p>To learn more, click here for details.</p>\n<p>More text about click here tips.</p>';
    const result = insertInternalLinks(html, context({ primaryKeyword: 'click here', seoKeywords: [] }), [
      candidate(9, 'Click Here', { categories: [7] }),
    ]);
    expect(result.links).toEqual([]);
  });
});

test.describe('link limits', () => {
  const manyParagraphs = (n: number) =>
    Array.from({ length: n }, (_, i) => `<p>Paragraph ${i} about topic${i} planning basics.</p>`).join('\n');
  const manyCandidates = (n: number) =>
    Array.from({ length: n }, (_, i) => candidate(100 + i, `Topic${i} planning basics`, { categories: [7] }));

  test('maximum 3 links for a short article', () => {
    expect(maxInternalLinks('small', 5000)).toBe(MAX_LINKS_SHORT_ARTICLE);
    expect(maxInternalLinks(null, 400)).toBe(MAX_LINKS_SHORT_ARTICLE);
    const result = insertInternalLinks(manyParagraphs(10), context({ articleSize: 'small', primaryKeyword: null, seoKeywords: [], title: 'Planning basics' }), manyCandidates(10));
    expect(result.links).toHaveLength(3);
  });

  test('maximum 5 links for a medium or long article', () => {
    expect(maxInternalLinks('medium', 100)).toBe(MAX_LINKS_LONGER_ARTICLE);
    expect(maxInternalLinks('large', 100)).toBe(MAX_LINKS_LONGER_ARTICLE);
    expect(maxInternalLinks(null, 1500)).toBe(MAX_LINKS_LONGER_ARTICLE);
    const result = insertInternalLinks(manyParagraphs(10), context({ articleSize: 'large', primaryKeyword: null, seoKeywords: [], title: 'Planning basics' }), manyCandidates(10));
    expect(result.links).toHaveLength(5);
  });

  test('at most one internal link per paragraph', () => {
    const html = '<p>Our cozy living room guide covers living room decor and a reading nook.</p>';
    const result = insertInternalLinks(html, context(), [
      candidate(1, 'The Cozy Living Room Checklist'),
      candidate(2, 'Living Room Decor Basics'),
      candidate(3, 'How to Build a Reading Nook'),
    ]);
    expect(result.links).toHaveLength(1);
    expect(hrefs(result.html)).toHaveLength(1);
  });

  test('never links the same URL twice nor the same post twice', () => {
    const html = [
      '<p>A cozy living room needs light.</p>',
      '<p>Another cozy living room trick is layering.</p>',
      '<p>Every cozy living room has texture.</p>',
    ].join('\n');
    const duplicateUrl = candidate(2, 'Cozy Living Room Colors');
    duplicateUrl.url = 'https://blog.example.test/the-cozy-living-room-checklist/';
    const result = insertInternalLinks(html, context({ seoKeywords: [] }), [candidate(1, 'The Cozy Living Room Checklist'), duplicateUrl]);
    expect(result.links).toHaveLength(1);
    expect(new Set(hrefs(result.html)).size).toBe(hrefs(result.html).length);
  });

  test('does not add a link to a URL the article already links', () => {
    const html = '<p>See <a href="https://blog.example.test/the-cozy-living-room-checklist">our checklist</a>.</p>\n<p>A cozy living room needs light.</p>';
    const result = insertInternalLinks(html, context({ seoKeywords: [] }), [candidate(1, 'The Cozy Living Room Checklist')]);
    expect(result.links).toEqual([]);
  });
});

test.describe('safe HTML insertion', () => {
  const candidates = () => [
    candidate(1, 'The Cozy Living Room Checklist'),
    candidate(2, 'Living Room Decor Basics'),
    candidate(3, 'How to Build a Reading Nook'),
  ];

  test('inserts links in body paragraphs only', () => {
    const result = insertInternalLinks(ARTICLE_HTML, context(), candidates());
    expect(result.links.map((l) => l.anchor)).toEqual(['cozy living room', 'living room decor', 'reading nook']);
    expect(result.html).toContain('<p>A <a href="https://blog.example.test/the-cozy-living-room-checklist/">cozy living room</a> starts');
    expect(result.html).toContain('<p>Good <a href="https://blog.example.test/living-room-decor-basics/">living room decor</a> mixes');
    expect(result.html).toContain('<p>A small <a href="https://blog.example.test/how-to-build-a-reading-nook/">reading nook</a> near');
  });

  test('never links inside H1/H2/H3 headings', () => {
    const result = insertInternalLinks(ARTICLE_HTML, context(), candidates());
    for (const heading of result.html.match(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/g) ?? []) {
      expect(heading).not.toContain('<a ');
    }
    const headingsOnly = '<h1>Cozy living room</h1>\n<h2>Living room decor</h2>\n<h3>Reading nook</h3>';
    expect(insertInternalLinks(headingsOnly, context(), candidates()).html).toBe(headingsOnly);
  });

  test('never links inside the FAQ section', () => {
    const result = insertInternalLinks(ARTICLE_HTML, context(), candidates());
    const faq = result.html.slice(result.html.indexOf('<h2>Frequently Asked Questions</h2>'));
    expect(faq).toBe(ARTICLE_HTML.slice(ARTICLE_HTML.indexOf('<h2>Frequently Asked Questions</h2>')));
    // FAQ rendered without H3 (plain paragraphs) is excluded too.
    const plainFaq = '<h2>Questions fréquentes</h2>\n<p>Quelle living room decor choisir ?</p>\n<p>Une living room decor sobre.</p>';
    expect(insertInternalLinks(plainFaq, context(), candidates()).html).toBe(plainFaq);
  });

  test('a later H2 after the FAQ is eligible again', () => {
    const html = '<h2>FAQ</h2>\n<p>About living room decor.</p>\n<h2>Conclusion</h2>\n<p>Enjoy your living room decor.</p>';
    const result = insertInternalLinks(html, context(), [candidate(2, 'Living Room Decor Basics')]);
    expect(result.html).toContain('<p>About living room decor.</p>');
    expect(result.html).toContain('<p>Enjoy your <a href="https://blog.example.test/living-room-decor-basics/">living room decor</a>.</p>');
  });

  test('never modifies images or their attributes', () => {
    const result = insertInternalLinks(ARTICLE_HTML, context(), candidates());
    expect(result.html).toContain('<p><img src="https://cdn.example.test/reading-nook.png" alt="reading nook by the window"></p>');
    const imageOnly = '<p><img src="/a.png" alt="cozy living room"></p>\n<figure><img src="/b.png" alt="reading nook"><figcaption>A reading nook</figcaption></figure>';
    expect(insertInternalLinks(imageOnly, context(), candidates()).html).toBe(imageOnly);
  });

  test('never modifies existing external links nor their paragraph', () => {
    const result = insertInternalLinks(ARTICLE_HTML, context(), [candidate(10, 'Indoor Plants Care Guide', { categories: [7] })]);
    expect(result.html).toContain(
      '<p>Plants add life. See <a href="https://other.example.com/plants">this guide on indoor plants</a> for care tips.</p>'
    );
    expect(result.links).toEqual([]);
  });

  test('never modifies text or URL of an existing internal link', () => {
    const html = '<p>Read <a href="https://blog.example.test/old/" title="cozy living room">our cozy living room story</a> first.</p>\n<p>Plain text.</p>';
    const result = insertInternalLinks(html, context(), candidates());
    expect(result.html).toBe(html);
  });

  test('keeps entities, inline markup and attributes intact', () => {
    const html = '<p>Tips &amp; tricks: a <strong>cozy living room</strong> for Tom&#39;s family.</p>';
    const result = insertInternalLinks(html, context({ seoKeywords: [] }), [candidate(1, 'The Cozy Living Room Checklist')]);
    expect(result.html).toBe(
      '<p>Tips &amp; tricks: a <strong><a href="https://blog.example.test/the-cozy-living-room-checklist/">cozy living room</a></strong> for Tom&#39;s family.</p>'
    );
  });

  test('matches accents and case without changing the original text', () => {
    const html = '<p>Un Salon Cosy bien pensé.</p>';
    const result = insertInternalLinks(html, context({ primaryKeyword: 'salon cosy', seoKeywords: [], title: 'Salon' }), [
      candidate(1, 'Idées pour un salon cosy'),
    ]);
    expect(result.links[0].anchor).toBe('Salon Cosy');
    expect(result.html).toBe('<p>Un <a href="https://blog.example.test/id-es-pour-un-salon-cosy/">Salon Cosy</a> bien pensé.</p>');
  });

  test('escapes the href attribute', () => {
    const html = '<p>A cozy living room.</p>';
    const c = candidate(1, 'The Cozy Living Room Checklist', { url: 'https://blog.example.test/?p=1&lang=en' });
    const result = insertInternalLinks(html, context({ seoKeywords: [] }), [c]);
    expect(result.html).toBe('<p>A <a href="https://blog.example.test/?p=1&amp;lang=en">cozy living room</a>.</p>');
  });
});

test.describe('addInternalLinks is non-blocking', () => {
  test('WordPress API error → failed, HTML unchanged, warning', async () => {
    site = installFakeSite({ failPostsList: true });
    const { html, report } = await addInternalLinks(SITE, ARTICLE_HTML, context());
    expect(html).toBe(ARTICLE_HTML);
    expect(report).toEqual({ status: 'failed', insertedCount: 0, links: [], warnings: [INTERNAL_LINKS_FAILED_WARNING] });
  });

  test('unreachable site → failed, HTML unchanged', async () => {
    site = installFakeSite({ unreachable: true });
    const { html, report } = await addInternalLinks(SITE, ARTICLE_HTML, context());
    expect(html).toBe(ARTICLE_HTML);
    expect(report.status).toBe('failed');
  });

  test('no published post → none, no warning', async () => {
    site = installFakeSite({ posts: [] });
    const { html, report } = await addInternalLinks(SITE, ARTICLE_HTML, context());
    expect(html).toBe(ARTICLE_HTML);
    expect(report).toEqual({ status: 'none', insertedCount: 0, links: [], warnings: [] });
  });

  test('never logs content or credentials', async () => {
    site = installFakeSite({ failPostsList: true });
    const logged: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => logged.push(args.map(String).join(' '));
    try {
      await addInternalLinks(SITE, ARTICLE_HTML, context());
    } finally {
      console.warn = originalWarn;
    }
    const all = logged.join('\n');
    expect(all).toContain('step=internal_links_fetch');
    expect(all).not.toContain('reading nook');
    expect(all).not.toContain(SITE.password);
    expect(all).not.toContain(Buffer.from(`${SITE.username}:${SITE.password}`).toString('base64'));
  });
});

// ---------------------------------------------------------------------------
// Publish flow — methods and publish modes
// ---------------------------------------------------------------------------

const PUBLISHED = [
  post(11, 'The Cozy Living Room Checklist', { categories: [7] }),
  post(12, 'Living Room Decor Basics'),
  post(13, 'How to Build a Reading Nook'),
];

function sendInput(overrides: Partial<SendArticleInput> = {}): SendArticleInput {
  return {
    article: {
      id: 'article-1',
      title: 'Cozy Living Room Ideas for Small Apartments',
      meta_title: 'Cozy Living Room Ideas',
      slug: 'cozy-living-room-ideas',
      meta_description: 'Ideas for a cozy living room.',
      wp_post_id: null,
    },
    generation: {
      keyword: 'cozy living room',
      source_type: 'keyword',
      seo_keywords: 'living room decor, reading nook',
      status: 'completed',
      article_size: 'medium',
    },
    html: ARTICLE_HTML,
    status: 'draft',
    categoryIds: [7],
    insertInternalLinks: true,
    ...overrides,
  };
}

test.describe('publish flow', () => {
  test('internal links are opt-in: skipped and content untouched without the flag', async () => {
    site = installFakeSite({ posts: PUBLISHED });
    const result = await sendArticleToWordPress(SITE, sendInput({ insertInternalLinks: false }));
    expect(result.internalLinks.status).toBe('skipped');
    expect(site.listCalls()).toHaveLength(0);
    expect(site.sentContent()).toBe(ARTICLE_HTML);
  });

  test('keyword method: links inserted in the sent content and reported', async () => {
    site = installFakeSite({ posts: PUBLISHED });
    const result = await sendArticleToWordPress(SITE, sendInput());
    expect(result.internalLinks.status).toBe('inserted');
    expect(result.internalLinks.insertedCount).toBe(3);
    expect(result.internalLinks.links.map((l) => l.postId).sort()).toEqual([11, 12, 13]);
    expect(site.sentContent()).toContain('href="https://blog.example.test/the-cozy-living-room-checklist/"');
    // Links are looked up before the post is sent.
    const listIndex = site.calls.findIndex((c) => c.url.includes('/wp/v2/posts?'));
    const postIndex = site.calls.findIndex((c) => c.method === 'POST' && c.url.includes('/wp/v2/posts'));
    expect(listIndex).toBeLessThan(postIndex);
  });

  test('pins method: primary keyword is the source Pinterest keyword, never the pin-title label', async () => {
    site = installFakeSite({ posts: [post(21, 'Pin Title One Recap'), post(22, 'Reading Nook Lighting')] });
    const result = await sendArticleToWordPress(
      SITE,
      sendInput({
        generation: { keyword: 'Pin Title One + Pin Title Two', source_type: 'pins', seo_keywords: null, status: 'completed' },
        pins: { sourceKeyword: 'reading nook', pinKeywords: [] },
        html: '<p>Pin Title One recap here.</p>\n<p>A reading nook glows at night.</p>',
      })
    );
    expect(result.internalLinks.links.map((l) => l.postId)).toEqual([22]);
  });

  test('URL method: uses the resolved keyword', async () => {
    site = installFakeSite({ posts: PUBLISHED });
    const result = await sendArticleToWordPress(
      SITE,
      sendInput({
        generation: { keyword: 'living room decor', source_type: 'url', seo_keywords: null, status: 'completed' },
        html: '<p>Good living room decor mixes wood and wool.</p>',
      })
    );
    expect(result.internalLinks.links.map((l) => l.postId)).toEqual([12]);
  });

  for (const [status, date] of [
    ['draft', undefined],
    ['publish', undefined],
    ['future', '2026-10-01T09:00:00'],
  ] as const) {
    test(`status ${status}: post sent with links, status and date unchanged`, async () => {
      site = installFakeSite({ posts: PUBLISHED });
      const result = await sendArticleToWordPress(SITE, sendInput({ status, date }));
      const body = site.calls.find((c) => c.method === 'POST' && c.url.includes('/wp/v2/posts'))?.body as Record<string, unknown>;
      expect(body.status).toBe(status);
      expect(body.date).toBe(date);
      expect(result.internalLinks.insertedCount).toBeGreaterThan(0);
    });
  }

  test('WordPress posts API failure never blocks the publish', async () => {
    site = installFakeSite({ failPostsList: true });
    const result = await sendArticleToWordPress(SITE, sendInput({ status: 'publish' }));
    expect(result.post.id).toBe(500);
    expect(site.sentContent()).toBe(ARTICLE_HTML);
    expect(result.internalLinks.status).toBe('failed');
    expect(result.warnings).toContain(INTERNAL_LINKS_FAILED_WARNING);
  });

  test('updating a post never links it to itself', async () => {
    site = installFakeSite({ posts: [post(77, 'The Cozy Living Room Checklist')] });
    const result = await sendArticleToWordPress(
      SITE,
      sendInput({ article: { ...sendInput().article, wp_post_id: 77 } })
    );
    expect(result.internalLinks.status).toBe('none');
    expect(site.sentContent()).toBe(ARTICLE_HTML);
  });
});
