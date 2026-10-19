import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getWordPressPost,
  searchWordPressPosts,
  WordPressReadError,
  WORDPRESS_READ_MAX_BYTES,
} from '@/lib/wordpress/post-reader';
import {
  buildWordPressPostPinterestSource,
  generationSourceColumns,
  loadOwnedWordPressSite,
  loadWordPressPostPinterestSource,
} from '@/lib/social/pinterest-from-wordpress-post';
import { buildArticlePinterestContext, SocialGenerationError, suggestBoardForArticle } from '@/lib/social/pinterest-from-article';
import { buildArticleGrounding } from '@/lib/pinterest/article-briefs';
import { encryptSecret } from '@/lib/wordpress/crypto';
import { generatePinsSchema, regeneratePinSchema } from '@/lib/validations/pinterest';
import { wordpressPostSearchSchema, wordpressPostSourceSchema } from '@/lib/validations/wordpress-post-source';
import { readPinSourceSection, wordpressPostPinterestHref } from '@/lib/social/pin-display';
import { prepareArticlePinRegeneration } from '@/lib/pinterest/pin-text';

process.env.WORDPRESS_ENCRYPTION_KEY = 'a'.repeat(64);

const USER = 'user-1';
const OTHER = 'user-2';
const SITE_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const SITE_URL = 'https://crochet.example.test';
const PASSWORD = 'abcd efgh ijkl mnop';
const PERMALINK = `${SITE_URL}/colorful-crochet-scarf-patterns/`;

const POST_HTML = `
<p>A colorful crochet scarf can change the feel of a coat. Self-striping yarns and bias construction build interest.</p>
<h2>1. On the Bias Scarf</h2><img src="${SITE_URL}/wp-content/uploads/1.jpg" alt="On the Bias Scarf"><p>Diagonal bands in double crochet.</p>
<h2>2. Waves Scarf</h2><img src="${SITE_URL}/wp-content/uploads/2.jpg" alt="Waves Scarf"><p>A double crochet repeat turns self-striping shades into waves.</p>
<h2>3. Color-Block Scarf</h2><p>Color block sections in a rectangle with a fuzzy yarn.</p>
<h2>Explore more free crochet scarf collections</h2><ul><li><a href="${SITE_URL}/cowl">Scarves and a Cozy Cowl</a></li></ul>`;

function wpPost(overrides: Record<string, unknown> = {}) {
  return {
    id: 1527,
    date: '2026-10-02T09:00:00',
    status: 'publish',
    link: PERMALINK,
    title: { rendered: '10 Free Colorful Crochet Scarf Patterns: Stripes, Ombre &amp; Waves' },
    excerpt: { rendered: '<p>Ten colorful scarves.</p>' },
    content: { rendered: POST_HTML, protected: false },
    categories: [102],
    _embedded: {
      'wp:featuredmedia': [{ source_url: `${SITE_URL}/wp-content/uploads/featured.jpg`, alt_text: 'Colorful scarves', caption: { rendered: '' } }],
      'wp:term': [
        [{ taxonomy: 'category', name: 'Crochet Scarves' }],
        [{ taxonomy: 'post_tag', name: 'scarf patterns' }],
      ],
    },
    ...overrides,
  };
}

interface Call {
  url: string;
  method: string;
  authorization: string;
}

function fakeFetch(respond: (url: string) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, method: init?.method ?? 'GET', authorization: headers.get('Authorization') ?? '' });
    return respond(url);
  }) as typeof fetch;
  return { fn, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const credentials = { siteUrl: SITE_URL, username: 'editor', password: PASSWORD };

type Row = Record<string, unknown>;

/** Select-only fake; any write is recorded so tests can assert there is none. */
function fakeSupabase(tables: Record<string, Row[]>) {
  const writes: string[] = [];
  function from(table: string) {
    let rows = [...(tables[table] ?? [])];
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => ((rows = rows.filter((r) => r[column] === value)), builder),
      neq: (column: string, value: unknown) => ((rows = rows.filter((r) => r[column] !== value)), builder),
      in: (column: string, values: unknown[]) => ((rows = rows.filter((r) => values.includes(r[column]))), builder),
      order: () => builder,
      single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: 'no rows' } }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
      insert: () => (writes.push(`insert:${table}`), builder),
      update: () => (writes.push(`update:${table}`), builder),
      upsert: () => (writes.push(`upsert:${table}`), builder),
      delete: () => (writes.push(`delete:${table}`), builder),
    };
    return builder;
  }
  return { client: { from } as unknown as SupabaseClient, writes };
}

function db(overrides: { site?: Row; project?: Row } = {}) {
  return fakeSupabase({
    wordpress_sites: [
      { id: SITE_ID, project_id: PROJECT_ID, user_id: USER, site_url: SITE_URL, wp_username: 'editor', encrypted_application_password: encryptSecret(PASSWORD), created_at: '', ...overrides.site },
    ],
    projects: [{ id: PROJECT_ID, user_id: USER, niche: 'Crochet', description: 'Cozy crochet blog.', default_language: 'en', ...overrides.project }],
    wordpress_categories: [{ id: 'cat-1', project_id: PROJECT_ID, wp_category_id: 102 }],
    content_streams: [{ name: 'Crochet Scarves', status: 'active', user_id: USER, project_id: PROJECT_ID, wordpress_category_id: 'cat-1', created_at: '' }],
  });
}

// ---------------------------------------------------------------------------

test.describe('Search and select an existing WordPress post (GET only)', () => {
  test('search sends one authenticated GET with the search, status and embeds, and returns display fields', async () => {
    const wp = fakeFetch(() => json([wpPost(), wpPost({ id: 9, status: 'publish', _embedded: {} })]));
    const result = await searchWordPressPosts(credentials, { search: 'scarf', status: 'publish', page: 1, perPage: 10 }, { fetchImpl: wp.fn });
    expect(wp.calls).toHaveLength(1);
    const [call] = wp.calls;
    expect(call.method).toBe('GET');
    expect(call.authorization).toBe(`Basic ${Buffer.from(`editor:${PASSWORD}`).toString('base64')}`);
    const url = new URL(call.url);
    expect(url.origin + url.pathname).toBe(`${SITE_URL}/wp-json/wp/v2/posts`);
    expect(url.searchParams.get('search')).toBe('scarf');
    expect(url.searchParams.get('status')).toBe('publish');
    expect(url.searchParams.get('_embed')).toBe('wp:featuredmedia,wp:term');
    expect(result.posts[0]).toEqual({
      id: 1527,
      title: '10 Free Colorful Crochet Scarf Patterns: Stripes, Ombre & Waves',
      date: '2026-10-02T09:00:00',
      status: 'publish',
      categories: ['Crochet Scarves'],
      featuredImage: { url: `${SITE_URL}/wp-content/uploads/featured.jpg`, alt: 'Colorful scarves', caption: '' },
    });
    expect(result.posts[1].featuredImage).toBeNull();
    expect(result.totalPages).toBe(1);
  });

  test('drafts are listed when the account may; a refused draft listing reads as forbidden', async () => {
    const ok = fakeFetch(() => json([wpPost({ status: 'draft' })]));
    const drafts = await searchWordPressPosts(credentials, { search: '', status: 'draft', page: 1, perPage: 10 }, { fetchImpl: ok.fn });
    expect(new URL(ok.calls[0].url).searchParams.get('status')).toBe('draft');
    expect(drafts.posts[0].status).toBe('draft');

    const refused = fakeFetch(() => json({ code: 'rest_invalid_param', message: 'Invalid parameter(s): status' }, 400));
    const error = await searchWordPressPosts(credentials, { search: '', status: 'draft', page: 1, perPage: 10 }, { fetchImpl: refused.fn }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'forbidden' });
  });

  test('query validation: bounded search, publish by default, draft allowed', () => {
    expect(wordpressPostSearchSchema.parse({})).toEqual({ search: '', status: 'publish', page: 1 });
    expect(wordpressPostSearchSchema.safeParse({ search: 'x'.repeat(101) }).success).toBe(false);
    expect(wordpressPostSearchSchema.safeParse({ status: 'trash' }).success).toBe(false);
    expect(wordpressPostSourceSchema.parse({ siteId: SITE_ID, postId: '1527' })).toEqual({ siteId: SITE_ID, postId: 1527 });
    expect(wordpressPostSourceSchema.safeParse({ siteId: SITE_ID, postId: -1 }).success).toBe(false);
    expect(wordpressPostSourceSchema.safeParse({ siteId: 'nope', postId: 1 }).success).toBe(false);
  });
});

test.describe('Reading a post and its errors', () => {
  test('a published post is read with one GET: content, featured image, categories and tags', async () => {
    const wp = fakeFetch(() => json(wpPost()));
    const post = await getWordPressPost(credentials, 1527, { fetchImpl: wp.fn });
    expect(wp.calls.map((c) => c.method)).toEqual(['GET']);
    expect(wp.calls[0].url).toBe(`${SITE_URL}/wp-json/wp/v2/posts/1527?_embed=wp:featuredmedia,wp:term`);
    expect(post).toMatchObject({ id: 1527, status: 'publish', categories: ['Crochet Scarves'], categoryIds: [102], tags: ['scarf patterns'], link: PERMALINK });
    expect(post.contentHtml).toContain('Waves Scarf');
  });

  test('a draft readable with the account rights is accepted', async () => {
    const wp = fakeFetch(() => json(wpPost({ status: 'draft' })));
    expect((await getWordPressPost(credentials, 1527, { fetchImpl: wp.fn })).status).toBe('draft');
  });

  const cases: Array<[string, () => Response | Promise<Response>, string]> = [
    ['401', () => json({ code: 'rest_not_logged_in' }, 401), 'unauthorized'],
    ['403', () => json({ code: 'rest_forbidden' }, 403), 'forbidden'],
    ['404', () => json({ code: 'rest_post_invalid_id' }, 404), 'not_found'],
    ['500', () => json({}, 500), 'http'],
    ['empty content', () => json(wpPost({ content: { rendered: '<p> </p>', protected: false } })), 'empty_content'],
    ['password-protected', () => json(wpPost({ content: { rendered: '', protected: true } })), 'empty_content'],
    ['not JSON', () => new Response('<html>maintenance</html>', { status: 200 }), 'invalid_response'],
    ['too large', () => new Response('x'.repeat(WORDPRESS_READ_MAX_BYTES + 1), { status: 200 }), 'invalid_response'],
    ['another post id', () => json(wpPost({ id: 1 })), 'invalid_response'],
  ];
  for (const [label, respond, code] of cases) {
    test(`${label} → ${code}, with a readable message and no credential`, async () => {
      const error = await getWordPressPost(credentials, 1527, { fetchImpl: fakeFetch(respond).fn }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(WordPressReadError);
      expect(error).toMatchObject({ code });
      const message = (error as Error).message;
      expect(message.length).toBeGreaterThan(10);
      expect(message).not.toContain(PASSWORD);
      expect(message).not.toContain('editor');
    });
  }

  test('timeout and network failures', async () => {
    const timeout = fakeFetch(() => Promise.reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' })));
    expect(await getWordPressPost(credentials, 1, { fetchImpl: timeout.fn }).catch((e: unknown) => e)).toMatchObject({ code: 'timeout', status: 504 });
    const network = fakeFetch(() => Promise.reject(new TypeError('fetch failed')));
    expect(await getWordPressPost(credentials, 1, { fetchImpl: network.fn }).catch((e: unknown) => e)).toMatchObject({ code: 'network' });
  });
});

test.describe('Ownership and the shared article source', () => {
  test('only the owner of the connection can use it', async () => {
    expect((await loadOwnedWordPressSite(db().client, USER, SITE_ID)).credentials).toEqual({ siteUrl: SITE_URL, username: 'editor', password: PASSWORD });
    expect(await loadOwnedWordPressSite(db().client, OTHER, SITE_ID).catch((e: unknown) => e)).toMatchObject({ code: 'forbidden' });
    expect(await loadOwnedWordPressSite(db().client, USER, '33333333-3333-4333-8333-333333333333').catch((e: unknown) => e)).toMatchObject({ code: 'not_found' });
  });

  test("the connection's project must be the user's too", async () => {
    const wp = fakeFetch(() => json(wpPost()));
    const error = await loadWordPressPostPinterestSource(db({ project: { user_id: OTHER } }).client, USER, { siteId: SITE_ID, postId: 1527 }, { fetchImpl: wp.fn }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SocialGenerationError);
    expect(error).toMatchObject({ code: 'forbidden' });
    expect(wp.calls).toHaveLength(0);
  });

  test('an existing post becomes the same WordPressArticleContext, without any write', async () => {
    const fake = db();
    const wp = fakeFetch(() => json(wpPost()));
    const source = await loadWordPressPostPinterestSource(fake.client, USER, { siteId: SITE_ID, postId: 1527 }, { fetchImpl: wp.fn });
    expect(fake.writes).toEqual([]);
    expect(wp.calls.every((call) => call.method === 'GET')).toBe(true);
    expect(source).toMatchObject({
      articleId: null,
      sourceType: 'external_wordpress_post',
      externalPost: { siteId: SITE_ID, postId: 1527 },
      projectId: PROJECT_ID,
      language: 'en',
      niche: 'Crochet',
      contentStreams: ['Crochet Scarves'],
    });
    expect(source.context.sourceType).toBe('external_wordpress_post');
    expect(source.context.wordpressPostId).toBe(1527);
    expect(source.context.siteId).toBe(SITE_ID);
    expect(source.context.sections.filter((s) => s.kind === 'subject').map((s) => s.subject)).toEqual(['On the Bias Scarf', 'Waves Scarf', 'Color-Block Scarf']);
    expect(source.context.objects).not.toContain('cowl');
    // The permalink is kept in the context for traceability only.
    expect(source.context.permalink).toBe(PERMALINK);
    const grounding = buildArticleGrounding(source.context, 3);
    const prompt = buildArticlePinterestContext(source, 'crochet scarf patterns', grounding);
    expect(prompt).not.toContain(PERMALINK);
    expect(prompt).not.toMatch(/https?:|example\.test/);
    expect(prompt).toContain('Pin 3 → sourceSectionId');
  });

  test('pure builder: the project language is used, the featured image alt describes it', () => {
    const source = buildWordPressPostPinterestSource(
      { ...wpPost(), id: 1527, title: 'Schals', date: '', status: 'publish', categories: [], categoryIds: [], excerpt: '', contentHtml: POST_HTML, tags: [], link: PERMALINK, featuredImage: { url: `${SITE_URL}/f.jpg`, alt: 'Bunte Schals', caption: '' } },
      { id: SITE_ID, project_id: PROJECT_ID, site_url: SITE_URL },
      { niche: null, description: null, default_language: 'de' }
    );
    expect(source.language).toBe('de');
    expect(source.featuredImagePrompt).toBe('Bunte Schals');
    expect(source.context.language).toBe('de');
  });
});

test.describe('Generation request, traceability and migration', () => {
  const base = { projectId: PROJECT_ID, keyword: 'crochet scarf patterns', language: 'en', pinsRequested: 5, generationMode: 'photo-only' };

  test('the generate request accepts an existing post, never with a destination URL or a second source', () => {
    expect(generatePinsSchema.safeParse({ ...base, wordpressPost: { siteId: SITE_ID, postId: 1527 } }).success).toBe(true);
    expect(generatePinsSchema.safeParse({ ...base, wordpressPost: { siteId: SITE_ID, postId: 1527 }, websiteUrl: PERMALINK }).success).toBe(false);
    expect(generatePinsSchema.safeParse({ ...base, wordpressPost: { siteId: SITE_ID, postId: 1527 }, pinterestUrl: 'https://pinterest.com/x' }).success).toBe(false);
    expect(
      generatePinsSchema.safeParse({ ...base, wordpressPost: { siteId: SITE_ID, postId: 1527 }, wordpressArticleId: '44444444-4444-4444-8444-444444444444' }).success
    ).toBe(false);
    expect(regeneratePinSchema.safeParse({ wordpressPost: { siteId: SITE_ID, postId: 1527 } }).success).toBe(true);
    expect(regeneratePinSchema.safeParse({ wordpressArticleId: '44444444-4444-4444-8444-444444444444' }).success).toBe(true);
    expect(regeneratePinSchema.safeParse({}).success).toBe(false);
  });

  test('source columns: OmniFlow article vs existing post, ids only', () => {
    expect(generationSourceColumns({ sourceType: 'omniflow_article', externalPost: null })).toEqual({
      source_type: 'omniflow_article',
      source_wordpress_site_id: null,
      source_wordpress_post_id: null,
    });
    expect(generationSourceColumns({ sourceType: 'external_wordpress_post', externalPost: { siteId: SITE_ID, postId: 1527 } })).toEqual({
      source_type: 'external_wordpress_post',
      source_wordpress_site_id: SITE_ID,
      source_wordpress_post_id: 1527,
    });
  });

  test('migration 044 is additive: new nullable columns, no backfill, no change to existing rows', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/044_add_generations_source_type.sql'), 'utf8');
    for (const column of ['source_type', 'source_wordpress_site_id', 'source_wordpress_post_id']) expect(sql).toContain(`ADD COLUMN ${column}`);
    expect(sql).toContain("CHECK (source_type IN ('omniflow_article', 'external_wordpress_post'))");
    expect(sql).toContain('REFERENCES wordpress_sites(id) ON DELETE SET NULL');
    const statements = sql.replace(/--.*$/gm, '');
    expect(statements).not.toMatch(/^\s*(?:UPDATE|DELETE|DROP|TRUNCATE)\b/im);
    expect(statements).not.toMatch(/DROP (?:COLUMN|TABLE|CONSTRAINT)|source_wordpress_generation_id/i);
  });

  test('regenerating a Pin of an existing post re-reads the post (GET) after the Pin ownership check', async () => {
    const tables = db();
    const wp = fakeFetch(() => json(wpPost()));
    const error = await prepareArticlePinRegeneration(tables.client, USER, '55555555-5555-4555-8555-555555555555', { wordpressPost: { siteId: SITE_ID, postId: 1527 } }, { fetchImpl: wp.fn }).catch((e: unknown) => e);
    // No such Pin: refused before WordPress is contacted.
    expect(error).toMatchObject({ code: 'not_found' });
    expect(wp.calls).toHaveLength(0);
  });
});

test('board pre-selection: topic words win over generic ones and plurals ("Free … Patterns")', () => {
  const boards = ['Crochet Cardigan Pattern', 'Crochet Cat Patterns', 'crochet scarf pattern', 'Crochet Sweater Pattern', 'crochet sweater pattern free', 'Free Crochet Cat Patterns'].map(
    (name, i) => ({ id: `b${i}`, name })
  );
  const article = { title: '10 Free Colorful Crochet Scarf Patterns: Stripes, Ombre and Waves', primaryKeyword: null, seoKeywords: [] };
  expect(suggestBoardForArticle(boards, article)).toEqual({ boardId: 'b2', suggestedName: null });
});

test.describe('Routes, page and UI (source level)', () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
  const searchRoute = read('app/api/wordpress/sites/[id]/posts/route.ts');
  const generateRoute = read('app/api/pinterest/generate/route.ts');
  const page = read('app/(dashboard)/pinterest/from-wordpress/page.tsx');
  const picker = read('components/social/wordpress-post-picker.tsx');
  const reader = read('lib/wordpress/post-reader.ts');

  test('the post reader only ever sends GET requests and imports no write helper', () => {
    expect(reader).toContain("method: 'GET'");
    expect(reader).not.toMatch(/method:\s*'(POST|PUT|PATCH|DELETE)'/);
    expect(reader).not.toMatch(/upsertPost|uploadMedia|updateMediaAltText|findOrCreateTag|console\./);
    expect(read('lib/social/pinterest-from-wordpress-post.ts')).not.toMatch(/\.(insert|update|upsert|delete)\(|upsertPost|uploadMedia/);
  });

  test('search route: GET handler, auth, ownership, validated query, no AI, no write', () => {
    expect(searchRoute).toContain('export async function GET(');
    expect(searchRoute).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(searchRoute).toContain("{ message: 'Unauthorized', code: 'unauthorized' }");
    expect(searchRoute).toContain('loadOwnedWordPressSite(supabase, user.id, id)');
    expect(searchRoute).toContain('wordpressPostSearchSchema.safeParse(');
    expect(searchRoute).not.toMatch(/lib\/ai|generateText|analyzeImage|\.insert\(|\.update\(/);
    // Errors are logged without content or credentials.
    expect(searchRoute).toContain("err instanceof Error ? err.name : 'unknown error'");
  });

  test('generate route: existing post as source, project check, no board creation, source recorded best-effort', () => {
    expect(generateRoute).toContain('loadWordPressPostPinterestSource(supabase, user.id, wordpressPost)');
    expect(generateRoute).toContain('articleSource.projectId !== projectId');
    expect(generateRoute).toContain('create: !articleSource');
    expect(generateRoute).toContain('.update(generationSourceColumns(articleSource))');
    expect(generateRoute).toContain('if (articleSource?.articleId) {');
    expect(generateRoute.match(/link_url/g)).toEqual(['link_url']); // TASK-071: only `link_url: destination.linkUrl`
    expect(generateRoute).toContain('link_url: destination.linkUrl');
  });

  test('page: picker first, nothing generated on load, public site columns only', () => {
    expect(page).toContain('<WordPressPostPicker');
    expect(page).toContain(".select('id, site_url, project_id, projects(name)')");
    expect(page).not.toContain('encrypted_application_password');
    expect(page).not.toMatch(/generateText|analyzeImage|lib\/ai\/engine/);
    expect(page).toContain('regenerateSource={{ wordpressPost: parsedSource.data }}');
    expect(picker).toContain('fetch(`/api/wordpress/sites/${siteId}/posts?');
    expect(picker).not.toMatch(/method:\s*'(POST|PUT|PATCH|DELETE)'/);
    for (const field of ['post.title', 'formatDate(post.date)', 'STATUS_LABELS[post.status]', 'post.categories', 'post.featuredImage']) expect(picker).toContain(field);
  });

  test('display helpers: post links and the source section of a Pin', () => {
    expect(wordpressPostPinterestHref({ siteId: SITE_ID })).toBe(`/pinterest/from-wordpress?siteId=${SITE_ID}`);
    expect(wordpressPostPinterestHref({ siteId: SITE_ID, postId: 1527 }, 'gen')).toBe(`/pinterest/from-wordpress?siteId=${SITE_ID}&postId=1527&generationId=gen`);
    expect(readPinSourceSection(JSON.stringify({ _articleSource: { brief: { sourceSection: '2. Waves Scarf' } } }))).toBe('2. Waves Scarf');
    expect(readPinSourceSection('{"_pinterestStrategy":{"angle":"listicle"}}')).toBeNull();
    expect(readPinSourceSection('not json')).toBeNull();
  });
});
